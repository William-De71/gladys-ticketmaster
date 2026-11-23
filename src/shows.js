// -----------------------------------------------------------------------------
// A raw event of the Discovery API -> a "show", what the integration keeps
// and shows (src/store.js holds them by Ticketmaster id).
//
//   { id, name, url, date, time, start, end, status, segment, genre,
//     venue: { id, name, city, country } | null,
//     attractions: [{ id, name }], image, onsale, price, sources, from }
//
//   - `date` is the local calendar date of the event ('YYYY-MM-DD'), null
//     when Ticketmaster has none yet (date to be announced);
//   - `time` the local time ('20:30') and `start` the instant (ISO, UTC),
//     both null when the time is not announced: such a show is an all-day
//     event of the calendar;
//   - `status`: onsale, offsale, canceled, postponed or rescheduled;
//   - `segment`: music, sports, arts, film or misc ('' when unknown);
//   - `onsale`: the start of the public sale (ISO), null when unknown;
//   - `sources` and `from` are set by the reading (src/scan.js): the kinds of
//     sources and the source keys that found the show.
//
// Also: the filters and the order of the widgets, the scenes and the calendar.
// -----------------------------------------------------------------------------

import { addDays } from './time.js';

const SEGMENTS = ['music', 'sports', 'arts', 'film', 'misc'];
const DEFAULT_SEGMENTS = ['music', 'arts'];
// The segment ids of the Discovery classifications (stable across markets).
const SEGMENT_IDS = {
  music: 'KZFzniwnSyZfZ7v7nJ',
  sports: 'KZFzniwnSyZfZ7v7nE',
  arts: 'KZFzniwnSyZfZ7v7na',
  film: 'KZFzniwnSyZfZ7v7nn',
  misc: 'KZFzniwnSyZfZ7v7n1',
};
const SEGMENT_NAMES = {
  music: /^music/i,
  sports: /^sport/i,
  arts: /^arts/i,
  film: /^film/i,
  misc: /^misc/i,
};
const SOURCES = ['artist', 'venue', 'nearby'];
const STATUSES = ['onsale', 'offsale', 'canceled', 'postponed', 'rescheduled'];
const NAME_MAX = 200;
const MAX_ATTRACTIONS = 5;
const IMAGE_MIN_WIDTH = 500;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const TIME_REGEX = /^(\d{2}):(\d{2})/;
const URL_REGEX = /^https?:\/\/\S+$/i;

const text = (value, max = NAME_MAX) =>
  typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';

const instant = (value) => {
  const ms = Date.parse(String(value ?? ''));
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
};

/**
 * @description The segment key of a classification list.
 * @param {object[]} classifications - Raw classifications.
 * @returns {{ segment: string, genre: string }} The keys ('' when unknown).
 */
function classify(classifications) {
  const list = Array.isArray(classifications) ? classifications : [];
  const main = list.find((entry) => entry?.primary) ?? list[0];
  const id = main?.segment?.id;
  const name = String(main?.segment?.name ?? '');
  const segment =
    SEGMENTS.find((key) => SEGMENT_IDS[key] === id) ??
    SEGMENTS.find((key) => SEGMENT_NAMES[key].test(name)) ??
    '';
  const genre = text(main?.genre?.name, 60);
  return { segment, genre: /^undefined$/i.test(genre) ? '' : genre };
}

/**
 * @description The image a widget shows: 16:9, the smallest at least 500 px
 * wide (the largest when none is).
 * @param {object[]} images - Raw images.
 * @returns {string} Its address, '' when none.
 */
function pickImage(images) {
  const list = (Array.isArray(images) ? images : []).filter(
    (image) => typeof image?.url === 'string' && /^https:\/\//.test(image.url),
  );
  const wide = list.filter((image) => image.ratio === '16_9' && !image.fallback);
  const pool = wide.length ? wide : list;
  const sorted = [...pool].sort((a, b) => Number(a.width ?? 0) - Number(b.width ?? 0));
  const best = sorted.find((image) => Number(image.width ?? 0) >= IMAGE_MIN_WIDTH) ?? sorted.at(-1);
  return best?.url ?? '';
}

/**
 * @description A raw venue -> `{ id, name, city, country }`.
 * @param {object} raw - A raw venue.
 * @returns {object|null} The venue, null without id or name.
 */
function toVenue(raw) {
  const id = text(raw?.id, 40);
  const name = text(raw?.name);
  if (!id || !name) {
    return null;
  }
  return {
    id,
    name,
    city: text(raw.city?.name, 80),
    country: text(raw.country?.countryCode, 2).toUpperCase(),
  };
}

/**
 * @description A raw event of the Discovery API -> a show.
 * @param {object} raw - A raw event.
 * @returns {object|null} The show, null without id or name, or for a test event.
 */
function toShow(raw) {
  const id = text(raw?.id, 40);
  const name = text(raw?.name);
  if (!id || !name || raw.test === true) {
    return null;
  }
  const start = raw.dates?.start ?? {};
  const dateKnown = DATE_REGEX.test(start.localDate ?? '') && !start.dateTBA && !start.dateTBD;
  const date = dateKnown ? start.localDate : null;
  const timeMatch = TIME_REGEX.exec(String(start.localTime ?? ''));
  const timeKnown = Boolean(date && timeMatch && !start.timeTBA && !start.noSpecificTime);
  const begin = timeKnown ? instant(start.dateTime) : null;
  const endRaw = timeKnown ? instant(raw.dates?.end?.dateTime) : null;
  const status = STATUSES.includes(raw.dates?.status?.code) ? raw.dates.status.code : 'onsale';
  const { segment, genre } = classify(raw.classifications);
  const embedded = raw._embedded ?? {};
  const venue = toVenue(Array.isArray(embedded.venues) ? embedded.venues[0] : null);
  const attractions = (Array.isArray(embedded.attractions) ? embedded.attractions : [])
    .map((attraction) => ({ id: text(attraction?.id, 40), name: text(attraction?.name) }))
    .filter((attraction) => attraction.id && attraction.name)
    .slice(0, MAX_ATTRACTIONS);
  const sale = raw.sales?.public ?? {};
  const range = (Array.isArray(raw.priceRanges) ? raw.priceRanges : []).find(
    (entry) => Number.isFinite(Number(entry?.min)) && typeof entry?.currency === 'string',
  );
  const url = typeof raw.url === 'string' && URL_REGEX.test(raw.url) ? raw.url.slice(0, 500) : '';
  return {
    id,
    name,
    url,
    date,
    time: begin ? `${timeMatch[1]}:${timeMatch[2]}` : null,
    start: begin,
    end: begin && endRaw && endRaw > begin ? endRaw : null,
    status,
    segment,
    genre,
    venue,
    attractions,
    image: pickImage(raw.images),
    onsale: sale.startTBD || sale.startTBA ? null : instant(sale.startDateTime),
    price: range
      ? {
          min: Number(range.min),
          max: Number.isFinite(Number(range.max)) ? Number(range.max) : Number(range.min),
          currency: text(range.currency, 3).toUpperCase(),
        }
      : null,
    sources: [],
    from: [],
  };
}

/**
 * @description The source kind that matters most for a show (its calendar).
 * @param {object} show - A show.
 * @returns {string} artist, venue or nearby.
 */
const mainSource = (show) =>
  SOURCES.find((source) => show.sources?.includes(source)) ?? SOURCES.at(-1);

/**
 * @description "Muse · Accor Arena, Paris".
 * @param {object} show - A show.
 * @returns {string} Where it takes place, '' when unknown.
 */
function placeText(show) {
  if (!show.venue) {
    return '';
  }
  const { name, city } = show.venue;
  return city && !name.toLowerCase().includes(city.toLowerCase()) ? `${name}, ${city}` : name;
}

/**
 * @description Whether a show matches some filters.
 * @param {object} show - A show.
 * @param {object} filters - `{ sources, segments, attraction }`: lists of
 * keys (empty: any) and a name (an attraction of the show, or a word of its
 * title, without case nor accents).
 * @returns {boolean} True when every filter holds.
 */
function matches(show, { sources = [], segments = [], attraction = '' } = {}) {
  if (sources.length && !show.sources.some((source) => sources.includes(source))) {
    return false;
  }
  if (segments.length && !segments.includes(show.segment)) {
    return false;
  }
  if (attraction) {
    const wanted = normalizeName(attraction);
    const names = [show.name, ...show.attractions.map((entry) => entry.name)].map(normalizeName);
    if (!names.some((name) => name === wanted || name.includes(wanted))) {
      return false;
    }
  }
  return true;
}

/**
 * @description The order of the lists: date, then time, then name.
 * @param {object} a - A show.
 * @param {object} b - Another show.
 * @returns {number} Negative when `a` comes first.
 */
const byDate = (a, b) =>
  (a.date ?? '9999').localeCompare(b.date ?? '9999') ||
  (a.start ?? '').localeCompare(b.start ?? '') ||
  a.name.localeCompare(b.name) ||
  a.id.localeCompare(b.id);

/**
 * @description The shows to come, the nearest first (canceled ones left out).
 * @param {object[]} shows - Every show kept.
 * @param {object} options - `{ today, now, ...filters }`.
 * @returns {object[]} The shows with a date, today included.
 */
function upcomingShows(shows, { today, now, ...filters }) {
  return shows
    .filter(
      (show) =>
        show.date &&
        show.date >= today &&
        show.status !== 'canceled' &&
        // Today's show that already started is no longer "to come".
        !(show.date === today && show.start && now !== undefined && Date.parse(show.start) < now) &&
        matches(show, filters),
    )
    .sort(byDate);
}

/**
 * @description The public sales to open, the nearest first.
 * @param {object[]} shows - Every show kept.
 * @param {object} options - `{ now, ...filters }`.
 * @returns {object[]} Shows whose public sale starts after `now`.
 */
function onsaleShows(shows, { now, ...filters }) {
  return shows
    .filter(
      (show) =>
        show.onsale &&
        Date.parse(show.onsale) > now &&
        show.status !== 'canceled' &&
        matches(show, filters),
    )
    .sort((a, b) => a.onsale.localeCompare(b.onsale) || byDate(a, b));
}

/**
 * @description A name without case, accents nor punctuation.
 * @param {unknown} name - A name.
 * @returns {string} The normalized name.
 */
function normalizeName(name) {
  return String(name ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/**
 * @description The last day a show is kept after it took place.
 * @param {string} today - `YYYY-MM-DD`.
 * @param {number} days - Days of history.
 * @returns {string} `YYYY-MM-DD`.
 */
const keptSince = (today, days) => addDays(today, -days);

export {
  SEGMENTS,
  DEFAULT_SEGMENTS,
  SEGMENT_IDS,
  SOURCES,
  STATUSES,
  classify,
  pickImage,
  toVenue,
  toShow,
  mainSource,
  placeText,
  matches,
  byDate,
  upcomingShows,
  onsaleShows,
  normalizeName,
  keptSince,
};
