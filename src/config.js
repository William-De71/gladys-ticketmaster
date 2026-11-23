// -----------------------------------------------------------------------------
// Configuration of the integration.
//
// Fields of the config_schema:
//   - `api_key`           the Ticketmaster key of the user (secret);
//   - `house`             the house of "Around the house" (a houses select,
//                         empty: the first house with coordinates);
//   - `radius_km`         radius around the house, 0 to turn it off;
//   - `segments`          the categories around the house (src/shows.js);
//   - `nearby_days`       how far ahead around the house;
//   - `followed_country`  where the dates of the followed artists are
//                         looked for (`all`: everywhere);
//   - `interval_hours`    hours between two readings;
//   - `notify_hour`       local hour of the "reminder" trigger;
//   - `language`          language of the texts Gladys does not ask for in a
//                         language (scene data, action outputs): `auto`
//                         follows the last widget request.
//
// Internal keys, outside the config_schema (never shown in the UI):
//   - `attractions`     the artists and teams followed with the buttons, as JSON;
//   - `venues`          the venues followed with the buttons, as JSON;
//   - `last_language`   language of the last widget request.
// -----------------------------------------------------------------------------

import { isLanguage } from './i18n.js';
import { DEFAULT_SEGMENTS, SEGMENTS } from './shows.js';

const AUTO_LANGUAGE = 'auto';
const INTERNAL_KEYS = { attractions: 'attractions', venues: 'venues', language: 'last_language' };
const RADII = [0, 5, 10, 25, 50, 100];
const DEFAULT_RADIUS = 25;
const NEARBY_DAYS = [30, 90, 180, 365];
const DEFAULT_NEARBY_DAYS = 90;
const ALL_COUNTRIES = 'all';
// Countries where Ticketmaster sells (or lists) tickets, by ISO code.
const COUNTRIES = [
  'FR',
  'BE',
  'CH',
  'LU',
  'DE',
  'AT',
  'NL',
  'ES',
  'IT',
  'PT',
  'GB',
  'IE',
  'DK',
  'SE',
  'NO',
  'FI',
  'PL',
  'CZ',
  'US',
  'CA',
  'MX',
  'AU',
  'NZ',
];
const DEFAULT_COUNTRY = 'FR';
const INTERVALS = [6, 12, 24];
const DEFAULT_INTERVAL = 12;
const DEFAULT_NOTIFY_HOUR = 9;

/**
 * @description Read a list of keys.
 * @param {unknown} raw - An array (multi_select), a JSON array or "a, b".
 * @param {string[]} allowed - The known keys.
 * @param {string[]} fallback - The default when none is valid.
 * @returns {string[]} Known keys, in the order of `allowed`.
 * @example
 * readKeys(['sports', 'nope', 'music'], ['music', 'sports'], ['music']); // -> ['music', 'sports']
 */
function readKeys(raw, allowed, fallback) {
  let list = raw;
  if (typeof raw === 'string') {
    try {
      list = JSON.parse(raw);
    } catch {
      list = raw.split(/[,;\s]+/);
    }
  }
  const given = new Set((Array.isArray(list) ? list : []).map((value) => String(value).trim()));
  const keys = allowed.filter((key) => given.has(key));
  return keys.length ? keys : [...fallback];
}

const readText = (raw, max = 100) => (typeof raw === 'string' ? raw.trim().slice(0, max) : '');

const readChoice = (raw, allowed, fallback) =>
  raw !== '' && raw !== null && raw !== undefined && allowed.includes(Number(raw))
    ? Number(raw)
    : fallback;

/**
 * @description Normalize the raw config object from the host API.
 * @param {object} [rawConfig] - The raw config values.
 * @returns {object} The normalized configuration.
 */
function normalizeConfig(rawConfig = {}) {
  const raw = rawConfig && typeof rawConfig === 'object' ? rawConfig : {};
  const hour = Number(raw.notify_hour);
  const country = readText(raw.followed_country, 3);
  return {
    apiKey: readText(raw.api_key, 200),
    house: readText(raw.house, 200),
    radiusKm: readChoice(raw.radius_km, RADII, DEFAULT_RADIUS),
    segments: readKeys(raw.segments, SEGMENTS, DEFAULT_SEGMENTS),
    nearbyDays: readChoice(raw.nearby_days, NEARBY_DAYS, DEFAULT_NEARBY_DAYS),
    followedCountry:
      country === ALL_COUNTRIES || COUNTRIES.includes(country) ? country : DEFAULT_COUNTRY,
    intervalHours: readChoice(raw.interval_hours, INTERVALS, DEFAULT_INTERVAL),
    notifyHour:
      raw.notify_hour !== '' &&
      raw.notify_hour !== null &&
      Number.isInteger(hour) &&
      hour >= 0 &&
      hour <= 23
        ? hour
        : DEFAULT_NOTIFY_HOUR,
    language: isLanguage(raw.language) ? raw.language : AUTO_LANGUAGE,
    lastLanguage: isLanguage(raw[INTERNAL_KEYS.language]) ? raw[INTERNAL_KEYS.language] : 'en',
  };
}

/**
 * @description The language of the texts no Gladys request gives one for.
 * @param {object} config - Normalized config.
 * @returns {string} en, fr, de or es.
 */
function textLanguage(config) {
  return config.language === AUTO_LANGUAGE ? config.lastLanguage : config.language;
}

export {
  AUTO_LANGUAGE,
  INTERNAL_KEYS,
  RADII,
  DEFAULT_RADIUS,
  NEARBY_DAYS,
  DEFAULT_NEARBY_DAYS,
  ALL_COUNTRIES,
  COUNTRIES,
  DEFAULT_COUNTRY,
  INTERVALS,
  DEFAULT_INTERVAL,
  DEFAULT_NOTIFY_HOUR,
  readKeys,
  normalizeConfig,
  textLanguage,
};
