// -----------------------------------------------------------------------------
// The artists, teams and venues followed with the configuration buttons
// ("Follow an artist or a team", "Follow a venue"…): no JSON to type, a name
// is enough.
//
// A name is searched on Ticketmaster; the entry kept is the answer whose name
// is the one typed (without case nor accents). Ticketmaster gives no score:
// when no name is exactly the one typed, nothing is guessed and the nearest
// answers are suggested with their identifier. Namesakes (two venues called
// "Zénith", two teams of the same name) are told apart by pasting the
// identifier instead of the name; the first one found is kept and the others
// are listed in the answer of the button.
//
// Stored through setConfig() under INTERNAL_KEYS.attractions / .venues, keys
// outside the config_schema: the configuration lives in the Gladys database,
// so the lists follow the Gladys backups (/data does not). A change is applied
// in memory only once Gladys saved it, and changes run one after the other.
// -----------------------------------------------------------------------------

import { INTERNAL_KEYS } from './config.js';
import { isTmId } from './ticketmaster.js';
import { classify, normalizeName, toVenue } from './shows.js';

const KINDS = { ATTRACTION: 'attraction', VENUE: 'venue' };
const MAX_FOLLOWED = { attraction: 100, venue: 50 };
const NAME_MAX = 200;
const INFO_MAX = 80;
const MAX_NAMESAKES = 4;

class FollowError extends Error {
  /**
   * @param {string} key - The TEXTS key of the message.
   * @param {object} [params] - Its substitutions.
   */
  constructor(key, params = {}) {
    super(key);
    this.name = 'FollowError';
    this.key = key;
    this.params = params;
  }
}

/**
 * @description A raw attraction -> `{ id, name, info }` (info: its genre).
 * @param {object} raw - A raw attraction.
 * @returns {object|null} The entry, null without id or name.
 */
function toAttraction(raw) {
  const id = typeof raw?.id === 'string' ? raw.id.trim() : '';
  const name = typeof raw?.name === 'string' ? raw.name.trim().slice(0, NAME_MAX) : '';
  if (!isTmId(id) || !name) {
    return null;
  }
  const { genre } = classify(raw.classifications);
  return { id, name, info: genre.slice(0, INFO_MAX) };
}

/**
 * @description A raw venue -> `{ id, name, info }` (info: its city and country).
 * @param {object} raw - A raw venue.
 * @returns {object|null} The entry, null without id or name.
 */
function toFollowedVenue(raw) {
  const venue = toVenue(raw);
  if (!venue || !isTmId(venue.id)) {
    return null;
  }
  const info = [venue.city, venue.country].filter(Boolean).join(', ');
  return { id: venue.id, name: venue.name, info: info.slice(0, INFO_MAX) };
}

const CONVERT = { attraction: toAttraction, venue: toFollowedVenue };

/**
 * @description "Accor Arena (Paris, FR)".
 * @param {object} entry - A followed entry.
 * @returns {string} The name, with what tells it apart.
 */
const entryLabel = (entry) => (entry.info ? `${entry.name} (${entry.info})` : entry.name);

/**
 * @description The identifier inside what the user typed: a bare identifier,
 * or the end of a Ticketmaster address ("…/artist/K8vZ917Gku7").
 * @param {unknown} text - What the user typed.
 * @returns {string} The identifier, '' when the text is a name.
 */
function readTmId(text) {
  const input = String(text ?? '').trim();
  // A name can be one word: the identifiers of attractions and venues start
  // with K or Z and mix letters and digits ("K8vZ917Gku7", "KovZpZA7AAEA").
  const looksLikeId = (value) =>
    isTmId(value) && /^[KZ][A-Za-z0-9]{7,}$/.test(value) && /\d/.test(value);
  if (looksLikeId(input)) {
    return input;
  }
  const match = /^https?:\/\/\S+\/([A-Za-z0-9_-]{6,40})\/?(?:[?#].*)?$/.exec(input);
  return match && looksLikeId(match[1]) ? match[1] : '';
}

/**
 * @description Choose the entry a typed name means among search answers.
 * @param {object[]} entries - Converted answers, the most relevant first.
 * @param {string} name - The name typed.
 * @returns {{ entry: object|null, namesakes: object[], suggestions: object[] }}
 * The entry kept, the other entries of the same name and — when nothing is
 * kept — the nearest answers.
 */
function pickEntry(entries, name) {
  const wanted = normalizeName(name);
  const same = entries.filter((entry) => normalizeName(entry.name) === wanted);
  if (same.length) {
    return { entry: same[0], namesakes: same.slice(1, 1 + MAX_NAMESAKES), suggestions: [] };
  }
  return { entry: null, namesakes: [], suggestions: entries.slice(0, 3) };
}

/**
 * @description Find what a text means: an identifier, an address, or a name.
 * @param {object} client - Ticketmaster client.
 * @param {string} kind - attraction or venue.
 * @param {unknown} text - What the user typed.
 * @param {object} [options] - `{ countryCode }`: narrows a venue search.
 * @returns {Promise<{ entry: object, namesakes: object[] }>} The entry.
 */
async function resolveEntry(client, kind, text, { countryCode } = {}) {
  const input = String(text ?? '').trim();
  if (!input) {
    throw new FollowError('followMissing');
  }
  const convert = CONVERT[kind];
  const id = readTmId(input);
  if (id) {
    let raw = null;
    try {
      raw = await (kind === KINDS.VENUE ? client.venue(id) : client.attraction(id));
    } catch (error) {
      if (error.kind !== 'not_found') {
        throw error;
      }
    }
    const entry = raw ? convert(raw) : null;
    if (entry) {
      return { entry, namesakes: [] };
    }
    // A bare word that only looked like an identifier is searched as a name.
    if (input !== id) {
      throw new FollowError('followUnknownId', { id });
    }
  }
  const answers =
    kind === KINDS.VENUE
      ? await client.searchVenues(input, countryCode)
      : await client.searchAttractions(input);
  const entries = answers.map(convert).filter(Boolean);
  const { entry, namesakes, suggestions } = pickEntry(entries, input);
  if (!entry) {
    throw new FollowError(suggestions.length ? 'followNotFoundSuggest' : 'followNotFound', {
      name: input.slice(0, 80),
      suggestions: suggestions.map((other) => `${entryLabel(other)}: ${other.id}`).join('\n'),
    });
  }
  return { entry, namesakes };
}

/**
 * @description Read a stored list.
 * @param {unknown} stored - The JSON kept in the configuration.
 * @param {number} max - Entries kept at most.
 * @returns {object[]} Valid entries, without duplicates.
 */
function parseStored(stored, max) {
  let list = stored;
  if (typeof stored === 'string') {
    try {
      list = JSON.parse(stored);
    } catch {
      list = [];
    }
  }
  const entries = [];
  for (const raw of Array.isArray(list) ? list : []) {
    const id = typeof raw?.id === 'string' ? raw.id : '';
    const name = typeof raw?.name === 'string' ? raw.name.trim().slice(0, NAME_MAX) : '';
    if (isTmId(id) && name && !entries.some((other) => other.id === id)) {
      entries.push({
        id,
        name,
        info: typeof raw.info === 'string' ? raw.info.slice(0, INFO_MAX) : '',
      });
    }
  }
  return entries.slice(0, max);
}

/**
 * @description The registry of what is followed with the buttons, one per kind.
 * @param {object} gladys - SDK client (setConfig).
 * @param {string} kind - attraction or venue.
 * @param {object} [options] - `{ logger }`.
 * @returns {object} `{ load, list, add, remove }`.
 */
function createRegistry(gladys, kind, { logger } = {}) {
  const configKey = kind === KINDS.VENUE ? INTERNAL_KEYS.venues : INTERNAL_KEYS.attractions;
  const max = MAX_FOLLOWED[kind];
  let entries = [];
  let queue = Promise.resolve();

  const save = async (next) => {
    await gladys.setConfig({ [configKey]: JSON.stringify(next) });
    entries = next;
  };

  const enqueue = (job) => {
    const result = queue.then(job);
    queue = result.catch((error) => logger?.debug?.(`registry ${kind}: ${error.message}`));
    return result;
  };

  return {
    kind,
    /** @param {object} config - The raw configuration of Gladys. */
    load(config) {
      entries = parseStored(config?.[configKey], max);
    },
    /** @returns {object[]} The entries, in the order they were followed. */
    list: () => entries.map((entry) => ({ ...entry })),
    /**
     * @param {object} entry - `{ id, name, info }`.
     * @returns {Promise<object>} The entry, once saved.
     */
    add: (entry) =>
      enqueue(async () => {
        if (entries.some((other) => other.id === entry.id)) {
          throw new FollowError('followAlready', { name: entryLabel(entry) });
        }
        if (entries.length >= max) {
          throw new FollowError('followTooMany', { max });
        }
        await save([...entries, entry]);
        return entry;
      }),
    /**
     * @param {unknown} text - A name or an identifier.
     * @returns {Promise<object>} The entry removed.
     */
    remove: (text) =>
      enqueue(async () => {
        const input = String(text ?? '').trim();
        if (!input) {
          throw new FollowError('followMissing');
        }
        const id = readTmId(input);
        const wanted = normalizeName(input);
        const found = entries.filter((entry) =>
          id ? entry.id === id : normalizeName(entry.name) === wanted,
        );
        if (found.length === 0) {
          throw new FollowError('followNotFollowed', { name: input.slice(0, 80) });
        }
        if (found.length > 1) {
          throw new FollowError('followAmbiguous', {
            name: input.slice(0, 80),
            list: found.map((entry) => `${entryLabel(entry)}: ${entry.id}`).join('\n'),
          });
        }
        await save(entries.filter((entry) => entry.id !== found[0].id));
        return found[0];
      }),
  };
}

export {
  KINDS,
  MAX_FOLLOWED,
  FollowError,
  toAttraction,
  toFollowedVenue,
  entryLabel,
  readTmId,
  pickEntry,
  resolveEntry,
  parseStored,
  createRegistry,
};
