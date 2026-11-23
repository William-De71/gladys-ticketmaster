// Shared test doubles: a fake Ticketmaster client answering from tables, raw
// events shaped like the Discovery API documents them (no real answer: the
// integration was written without a key), a state file in a temporary folder
// and a clock the tests move by hand. Nothing here touches the network.

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createStore } from '../src/store.js';

export const TZ = 'Europe/Paris';

export const MUSE = 'K8vZ917Gku7';
export const PSG = 'K8vZ9171o-7';
export const ARENA = 'KovZpZA7AAEA';
export const ZENITH = 'Z598xZG2ZeF7k';

// The houses of Gladys (getHouses): Paris, and a house without a position.
export const HOUSES = [
  { id: 'h1', name: 'Home', selector: 'home', latitude: 48.8566, longitude: 2.3522 },
  { id: 'h2', name: 'Cabin', selector: 'cabin', latitude: null, longitude: null },
];

let counter = 0;

/**
 * @description A raw event of the Discovery API, the fields read.
 * @param {object} [fields] - What differs from a concert of Muse at the Accor
 * Arena on 2026-12-12 at 20:00 (Paris), public sale on 2026-11-20 at 10:00.
 * @returns {object} The raw event.
 */
export function rawEvent(fields = {}) {
  counter += 1;
  const {
    id = `vvG1zZ9Kd${String(counter).padStart(5, '0')}`,
    name = 'Muse',
    date = '2026-12-12',
    time = '20:00:00',
    dateTime = '2026-12-12T19:00:00Z',
    status = 'onsale',
    segment = { id: 'KZFzniwnSyZfZ7v7nJ', name: 'Music' },
    genre = 'Rock',
    venue = { id: ARENA, name: 'Accor Arena', city: 'Paris', country: 'FR' },
    attractions = [{ id: MUSE, name: 'Muse' }],
    onsale = '2026-11-20T09:00:00Z',
    start = {},
    ...rest
  } = fields;
  return {
    name,
    type: 'event',
    id,
    test: false,
    url: `https://www.ticketmaster.fr/fr/manifestation/${id}`,
    locale: 'fr-fr',
    images: [
      {
        ratio: '3_2',
        url: `https://s1.ticketm.net/dam/a/${id}_ARTIST_PAGE_3_2.jpg`,
        width: 305,
        height: 203,
        fallback: false,
      },
      {
        ratio: '16_9',
        url: `https://s1.ticketm.net/dam/a/${id}_RETINA_PORTRAIT_16_9.jpg`,
        width: 640,
        height: 360,
        fallback: false,
      },
      {
        ratio: '16_9',
        url: `https://s1.ticketm.net/dam/a/${id}_TABLET_LANDSCAPE_LARGE_16_9.jpg`,
        width: 2048,
        height: 1152,
        fallback: false,
      },
    ],
    sales: { public: { startDateTime: onsale, startTBD: false, startTBA: false } },
    dates: {
      start: {
        localDate: date,
        localTime: time,
        dateTime,
        dateTBD: false,
        dateTBA: false,
        timeTBA: false,
        noSpecificTime: false,
        ...start,
      },
      timezone: 'Europe/Paris',
      status: { code: status },
    },
    classifications: [{ primary: true, segment, genre: { id: 'KnvZfZ7vAeA', name: genre } }],
    priceRanges: [{ type: 'standard', currency: 'EUR', min: 45, max: 89 }],
    _embedded: {
      venues: venue
        ? [
            {
              name: venue.name,
              type: 'venue',
              id: venue.id,
              city: { name: venue.city },
              country: { name: 'France', countryCode: venue.country },
              location: { longitude: '2.378', latitude: '48.838' },
            },
          ]
        : [],
      attractions: attractions.map((attraction) => ({ ...attraction, type: 'attraction' })),
    },
    ...rest,
  };
}

/**
 * @description A raw attraction.
 * @param {string} id - Its id.
 * @param {string} name - Its name.
 * @param {string} [genre] - Its genre.
 * @returns {object} The raw attraction.
 */
export function rawAttraction(id, name, genre = 'Rock') {
  return {
    id,
    name,
    type: 'attraction',
    classifications: [{ primary: true, segment: { name: 'Music' }, genre: { name: genre } }],
  };
}

/**
 * @description A raw venue.
 * @param {string} id - Its id.
 * @param {string} name - Its name.
 * @param {string} city - Its city.
 * @returns {object} The raw venue.
 */
export function rawVenue(id, name, city) {
  return { id, name, type: 'venue', city: { name: city }, country: { countryCode: 'FR' } };
}

/**
 * @description A fake client with the interface of src/ticketmaster.js.
 * @param {object} [tables] - `{ nearby, attractions, venues, events, searchAttractions,
 * searchVenues, details }`: raw events per source (`attractions` and `venues`
 * by id), search answers by keyword, details by event id; any of them can be
 * an Error.
 * @returns {object} The client, with `calls` and the tables (changed in place).
 */
export function fakeTm(tables = {}) {
  const calls = [];
  const client = {
    calls,
    tables: {
      nearby: [],
      attractions: {},
      venues: {},
      searchAttractions: {},
      searchVenues: {},
      details: {},
      ...tables,
    },
    pausedUntil: 0,
    keyRefused: false,
    quota: { limit: 5000, available: 4990, at: 0 },
    async events(query) {
      calls.push(`events ${JSON.stringify(query)}`);
      let answer;
      if (query.attractionId) {
        answer = client.tables.attractions[query.attractionId] ?? [];
      } else if (query.venueId) {
        answer = client.tables.venues[query.venueId] ?? [];
      } else {
        answer = client.tables.nearby;
      }
      if (answer instanceof Error) {
        throw answer;
      }
      return { items: structuredClone(answer), total: answer.length, truncated: false };
    },
    async event(id) {
      calls.push(`event ${id}`);
      const answer = client.tables.details[id];
      if (!answer) {
        throw Object.assign(new Error('not found'), {
          name: 'TicketmasterError',
          kind: 'not_found',
        });
      }
      return structuredClone(answer);
    },
    async searchAttractions(keyword) {
      calls.push(`search-attractions ${keyword}`);
      const answer = client.tables.searchAttractions[keyword] ?? [];
      if (answer instanceof Error) {
        throw answer;
      }
      return structuredClone(answer);
    },
    async attraction(id) {
      calls.push(`attraction ${id}`);
      const found = Object.values(client.tables.searchAttractions)
        .flat()
        .find((entry) => entry.id === id);
      if (!found) {
        throw Object.assign(new Error('not found'), {
          name: 'TicketmasterError',
          kind: 'not_found',
        });
      }
      return structuredClone(found);
    },
    async searchVenues(keyword, countryCode) {
      calls.push(`search-venues ${keyword} ${countryCode ?? ''}`.trim());
      return structuredClone(client.tables.searchVenues[keyword] ?? []);
    },
    async venue(id) {
      calls.push(`venue ${id}`);
      const found = Object.values(client.tables.searchVenues)
        .flat()
        .find((entry) => entry.id === id);
      if (!found) {
        throw Object.assign(new Error('not found'), {
          name: 'TicketmasterError',
          kind: 'not_found',
        });
      }
      return structuredClone(found);
    },
  };
  return client;
}

/**
 * @description A Ticketmaster error, as src/ticketmaster.js throws them.
 * @param {string} kind - auth, quota, busy, http, network…
 * @param {object} [extra] - More fields (`resetAt`, `status`).
 * @returns {Error} The error.
 */
export function tmError(kind, extra = {}) {
  return Object.assign(new Error(`${kind} error`), { name: 'TicketmasterError', kind, ...extra });
}

/**
 * @description A store in a fresh temporary folder.
 * @returns {{ store: object, path: string, cleanup: Function }} The store.
 */
export function tempStore() {
  const dir = mkdtempSync(join(tmpdir(), 'ticketmaster-test-'));
  const path = join(dir, 'state.json');
  return {
    store: createStore({ path, flushDelay: 0 }),
    path,
    dir,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

/**
 * @description A clock moved by hand.
 * @param {string} iso - Start instant.
 * @returns {{ now: Function, set: Function, advance: Function }} The clock.
 */
export function fakeClock(iso) {
  let current = Date.parse(iso);
  return {
    now: () => current,
    set: (value) => {
      current = Date.parse(value);
    },
    advance: (ms) => {
      current += ms;
    },
  };
}

export const silentLogger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
};
