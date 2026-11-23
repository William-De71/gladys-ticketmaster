// -----------------------------------------------------------------------------
// The reading of Ticketmaster: every `interval_hours`, at a configuration
// change and with the "Read again now" button.
//
// Three kinds of sources, one search each (paged up to the 1,000th event):
//   - `nearby`           the events within `radius_km` of the house, in the
//                        chosen categories, for `nearby_days`;
//   - `a:<attraction>`   the events of a followed artist or team, in
//                        `followed_country` (or everywhere), two years ahead;
//   - `v:<venue>`        the events of a followed venue, two years ahead.
// A show found by several sources is kept once, with all of them.
//
// What changed: shows added (never seen, from a source already read once:
// the first reading of a source is a baseline), shows whose date, time or
// status changed, shows gone. A complete reading replaces what was kept; a
// source that failed keeps the shows it had found. A show Ticketmaster no
// longer lists because it took place stays a week (the calendar shows it).
// -----------------------------------------------------------------------------

import { geohash, pickHouse } from './geo.js';
import { SEGMENT_IDS, SOURCES, toShow } from './shows.js';
import { tmDateTime } from './ticketmaster.js';
import { DAY_MS, HOUR_MS, addDays } from './time.js';

const FOLLOWED_DAYS = 730;
const HISTORY_DAYS = 7;
const SEEN_DAYS = 400;
const MAX_SHOWS = 3000;
const MAX_LOOKUPS = 10;
const RETRY_AFTER_ERROR_MS = HOUR_MS;

/**
 * @description The sources of a reading.
 * @param {object} options - `{ config, house, attractions, venues }`.
 * @returns {object[]} `[{ key, kind, sig, query }]`; `query` without dates.
 */
function plannedSources({ config, house, attractions, venues }) {
  const sources = [];
  if (config.radiusKm > 0 && house) {
    const point = geohash(house.latitude, house.longitude);
    if (point) {
      const query = {
        geoPoint: point,
        radius: String(config.radiusKm),
        unit: 'km',
        segmentId: config.segments.map((segment) => SEGMENT_IDS[segment]).join(','),
      };
      sources.push({
        key: 'nearby',
        kind: 'nearby',
        sig: JSON.stringify([point, config.radiusKm, config.segments]),
        days: config.nearbyDays,
        query,
      });
    }
  }
  const country = config.followedCountry === 'all' ? null : config.followedCountry;
  for (const attraction of attractions) {
    sources.push({
      key: `a:${attraction.id}`,
      kind: 'artist',
      sig: country ?? 'all',
      days: FOLLOWED_DAYS,
      query: { attractionId: attraction.id, ...(country ? { countryCode: country } : {}) },
    });
  }
  for (const venue of venues) {
    sources.push({
      key: `v:${venue.id}`,
      kind: 'venue',
      sig: '',
      days: FOLLOWED_DAYS,
      query: { venueId: venue.id },
    });
  }
  return sources;
}

/**
 * @description Create the scanner.
 * @param {object} deps - Dependencies.
 * @param {object} deps.tm - Ticketmaster client.
 * @param {object} deps.store - The store.
 * @param {object} deps.attractions - Registry of the followed artists and teams.
 * @param {object} deps.venues - Registry of the followed venues.
 * @param {Function} deps.houses - `() => Promise<houses>` (getHouses).
 * @param {Function} deps.config - `() => normalized config`.
 * @param {Function} deps.today - `() => 'YYYY-MM-DD'`.
 * @param {Function} deps.now - Clock, in ms.
 * @param {object} [deps.logger] - SDK logger.
 * @returns {object} `{ due, run, status, sources }`.
 */
function createScanner({ tm, store, attractions, venues, houses, config, today, now, logger }) {
  const state = store.data;
  let running = false;
  // The house of the last reading: null when none is located (or readable).
  let house = null;
  let houseProblem = null;

  const sources = () =>
    plannedSources({
      config: config(),
      house,
      attractions: attractions.list(),
      venues: venues.list(),
    });

  /** The sources never read with their current settings. */
  const unread = () => sources().filter((source) => state.read[source.key]?.sig !== source.sig);

  const readHouse = async () => {
    const { radiusKm, house: chosen } = config();
    if (radiusKm === 0) {
      house = null;
      houseProblem = null;
      return;
    }
    try {
      house = pickHouse(await houses(), chosen);
      houseProblem = house ? null : 'noLocation';
    } catch (error) {
      house = null;
      houseProblem = 'houseUnreadable';
      logger?.warn(`unable to read the houses: ${error.message}`);
    }
  };

  /**
   * @description Read every source.
   * @param {object[]} list - The planned sources.
   * @returns {Promise<{ found: Map, okKeys: Set, errors: Error[], truncated: string[] }>} What was answered.
   */
  const readAll = async (list) => {
    const found = new Map();
    const okKeys = new Set();
    const errors = [];
    const truncated = [];
    const start = now();
    for (const source of list) {
      try {
        const { items, truncated: cut } = await tm.events({
          ...source.query,
          startDateTime: tmDateTime(start),
          endDateTime: tmDateTime(start + source.days * DAY_MS),
        });
        for (const raw of items) {
          const show = toShow(raw);
          if (!show) {
            continue;
          }
          const kept = found.get(show.id) ?? show;
          if (!kept.from.includes(source.key)) {
            kept.from.push(source.key);
          }
          if (!kept.sources.includes(source.kind)) {
            kept.sources.push(source.kind);
          }
          found.set(show.id, kept);
        }
        if (cut) {
          truncated.push(source.key);
        }
        okKeys.add(source.key);
      } catch (error) {
        errors.push(error);
        // The key is refused or the quota spent: the next searches would fail the same way.
        if (['auth', 'quota'].includes(error.kind)) {
          break;
        }
      }
    }
    return { found, okKeys, errors, truncated };
  };

  /**
   * @description What became of a show no longer listed: canceled (kept, with
   * its new status), or gone (null).
   * @param {object} show - The show kept.
   * @returns {Promise<object|null>} The canceled show, null otherwise.
   */
  const lookUp = async (show) => {
    try {
      const after = toShow(await tm.event(show.id));
      if (after?.status === 'canceled') {
        return { ...after, sources: [...show.sources], from: [...show.from] };
      }
    } catch (error) {
      if (error.kind !== 'not_found') {
        logger?.debug?.(`event ${show.id}: ${error.message}`);
      }
    }
    return null;
  };

  return {
    sources,
    /** @returns {string|null} Why "Around the house" cannot be read (noLocation, houseUnreadable). */
    get houseProblem() {
      return houseProblem;
    },
    /** @returns {boolean} Whether a reading is due. */
    due() {
      if (running || tm.pausedUntil || tm.keyRefused || !config().apiKey) {
        return false;
      }
      const last = state.scan.at ?? 0;
      if (state.scan.error) {
        return now() - last >= RETRY_AFTER_ERROR_MS;
      }
      return now() - last >= config().intervalHours * HOUR_MS || unread().length > 0;
    },
    /** @returns {boolean} Whether a reading is running. */
    get running() {
      return running;
    },
    /**
     * @description Read the sources and keep what changed.
     * @returns {Promise<object>} `{ ok, added, updated, removed }`: `added` are
     * `{ show, baseline }`, `updated` are `{ before, after }`.
     */
    async run() {
      const result = { ok: false, added: [], updated: [], removed: [] };
      if (running) {
        return result;
      }
      running = true;
      try {
        const day = today();
        await readHouse();
        const list = sources();
        const { found, okKeys, errors, truncated } = await readAll(list);
        const planned = new Map(list.map((source) => [source.key, source]));
        // A source is "known" when it was read before with the same settings.
        const known = (key) => state.read[key]?.sig === planned.get(key)?.sig;

        // A source that failed keeps the shows it had found.
        for (const show of Object.values(state.shows)) {
          const failedFrom = show.from.filter((key) => planned.has(key) && !okKeys.has(key));
          if (failedFrom.length === 0) {
            continue;
          }
          const kept = found.get(show.id) ?? { ...show, from: [], sources: [] };
          for (const key of failedFrom) {
            if (!kept.from.includes(key)) {
              kept.from.push(key);
            }
            const { kind } = planned.get(key);
            if (!kept.sources.includes(kind)) {
              kept.sources.push(kind);
            }
          }
          found.set(show.id, kept);
        }

        for (const show of found.values()) {
          show.sources.sort((a, b) => SOURCES.indexOf(a) - SOURCES.indexOf(b));
          show.from.sort();
          const before = state.shows[show.id];
          if (!before) {
            const baseline = !show.from.some((key) => okKeys.has(key) && known(key));
            if (!(show.id in state.seen)) {
              result.added.push({ show, baseline });
            }
          } else if (
            before.date !== show.date ||
            before.start !== show.start ||
            before.status !== show.status
          ) {
            result.updated.push({ before, after: show });
          }
          state.shows[show.id] = show;
          state.seen[show.id] = day;
        }

        const oldest = addDays(day, -HISTORY_DAYS);
        let lookups = 0;
        for (const show of Object.values(state.shows)) {
          if (found.has(show.id)) {
            continue;
          }
          const stillFollowed = show.from.some((key) => planned.has(key));
          // Gone from the answers because it took place (today's shows that
          // started too): kept a week, sources unchanged. A canceled show
          // stays until its date, the calendar tells it.
          if (
            stillFollowed &&
            show.date &&
            show.date >= oldest &&
            (show.date <= day || show.status === 'canceled')
          ) {
            continue;
          }
          // A show to come that left the answers: Ticketmaster may only list
          // it no more because it was canceled. Asked once, a few per reading.
          if (stillFollowed && show.status !== 'canceled' && lookups < MAX_LOOKUPS) {
            lookups += 1;
            const after = await lookUp(show);
            if (after) {
              result.updated.push({ before: show, after });
              state.shows[show.id] = after;
              continue;
            }
          }
          delete state.shows[show.id];
          result.removed.push(show);
        }
        // A bounded state: the farthest shows go first.
        const all = Object.values(state.shows);
        if (all.length > MAX_SHOWS) {
          all
            .sort((a, b) => (b.date ?? '9999').localeCompare(a.date ?? '9999'))
            .slice(0, all.length - MAX_SHOWS)
            .forEach((show) => delete state.shows[show.id]);
        }

        for (const key of okKeys) {
          state.read[key] = { sig: planned.get(key).sig, day };
        }
        for (const key of Object.keys(state.read)) {
          if (!planned.has(key)) {
            delete state.read[key];
          }
        }
        const oldestSeen = addDays(day, -SEEN_DAYS);
        for (const [id, seenDay] of Object.entries(state.seen)) {
          if (seenDay < oldestSeen && !state.shows[id]) {
            delete state.seen[id];
          }
        }
        const [error] = errors;
        const complete = errors.length === 0;
        state.scan = {
          at: now(),
          okAt: complete ? now() : (state.scan.okAt ?? 0),
          error: error
            ? { kind: error.kind ?? 'unknown', message: String(error.message).slice(0, 200) }
            : null,
          truncated,
        };
        store.changed();
        result.ok = complete;
        if (error) {
          logger?.warn(`reading Ticketmaster: ${error.message}`);
        }
        return result;
      } finally {
        running = false;
      }
    },
    /** @returns {object} `{ at, okAt, error, truncated, pausedUntil, keyRefused, shows }`. */
    status: () => ({
      at: state.scan.at ?? 0,
      okAt: state.scan.okAt ?? 0,
      error: state.scan.error ?? null,
      truncated: state.scan.truncated ?? [],
      pausedUntil: tm.pausedUntil,
      keyRefused: tm.keyRefused,
    }),
  };
}

export { FOLLOWED_DAYS, HISTORY_DAYS, SEEN_DAYS, MAX_SHOWS, plannedSources, createScanner };
