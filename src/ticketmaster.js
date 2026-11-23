// -----------------------------------------------------------------------------
// HTTP client of the Ticketmaster Discovery API (version 2, JSON):
// https://developer.ticketmaster.com/products-and-docs/apis/discovery-api/v2/
//
// Every user brings a free key of their own (created at once on
// developer.ticketmaster.com): 5,000 calls a day and 5 requests a second.
// The key goes in the `apikey` query parameter; it never appears in a log nor
// in an error message (the labels are built without it).
//
// Rules followed here:
//   - one request at a time, at least 250 ms apart (4 a second at most);
//   - HTTP 401 is a key Ticketmaster refuses: nothing is tried again until the
//     key changes;
//   - HTTP 429 is either the daily quota ("Rate limit quota violation"): no
//     request until `Rate-Limit-Reset`, or the per-second limit ("spike
//     arrest"): tried again after a second, twice at most;
//   - `locale=*` everywhere: the default (`en`) leaves out events published
//     in another language (most of the European ones);
//   - deep paging stops at the 1,000th item (`size * page < 1000`).
//
// Endpoints used:
//   - `events`        events near a point, of an attraction or of a venue;
//                     one event by id (what became of a show no longer listed);
//   - `attractions`   search an artist or a team by name; one by id;
//   - `venues`        search a venue by name; one by id.
// -----------------------------------------------------------------------------

const BASE_URL = 'https://app.ticketmaster.com/discovery/v2';
const SPACING_MS = 250;
const SPIKE_RETRY_MS = 1000;
const SPIKE_RETRIES = 2;
const QUOTA_PAUSE_MS = 60 * 60 * 1000;
const QUOTA_PAUSE_MAX_MS = 24 * 60 * 60 * 1000;
const TIMEOUT_MS = 30 * 1000;
const PAGE_SIZE = 200;
const MAX_ITEMS = 1000;
const ID_REGEX = /^[A-Za-z0-9_-]{6,40}$/;

class TicketmasterError extends Error {
  /**
   * @param {string} kind - `auth` (key refused or missing), `quota` (daily
   * quota spent), `busy` (per-second limit), `not_found`, `http`, `network`
   * or `invalid`.
   * @param {string} message - Details, never the key.
   * @param {number} [status] - HTTP status.
   */
  constructor(kind, message, status) {
    super(message);
    this.name = 'TicketmasterError';
    this.kind = kind;
    this.status = status;
  }
}

/**
 * @description Whether a text is shaped like a Discovery identifier.
 * @param {unknown} value - The text.
 * @returns {boolean} True for "K8vZ917Gku7", "KovZpZA7AAEA", "vvG1zZ9Kd-tuvk"…
 */
const isTmId = (value) => typeof value === 'string' && ID_REGEX.test(value);

/**
 * @description An instant as Ticketmaster wants it: no milliseconds.
 * @param {number} instant - In ms.
 * @returns {string} "2026-11-23T08:00:00Z".
 */
const tmDateTime = (instant) => new Date(instant).toISOString().replace(/\.\d{3}Z$/, 'Z');

/**
 * @description Read the fault of an Apigee error body.
 * @param {string} body - The raw body.
 * @returns {string} `faultstring`, '' when none.
 */
function faultOf(body) {
  try {
    const json = JSON.parse(body);
    return String(json?.fault?.faultstring ?? json?.errors?.[0]?.detail ?? '');
  } catch {
    return '';
  }
}

/**
 * @description Create the client.
 * @param {object} options - Dependencies and settings.
 * @param {Function} options.apiKey - `() => string`: the key of the configuration.
 * @param {Function} [options.fetch] - `fetch`, replaced in the tests.
 * @param {Function} [options.now] - Clock, in ms.
 * @param {Function} [options.sleep] - Delay between two requests.
 * @param {string} [options.userAgent] - Names the integration and its version.
 * @returns {object} The client.
 */
function createTicketmasterClient({
  apiKey,
  fetch = globalThis.fetch,
  now = () => Date.now(),
  sleep = defaultSleep,
  userAgent = 'gladys-ticketmaster (+https://github.com/William-De71/gladys-ticketmaster)',
}) {
  let lastRequest = 0;
  let pausedUntil = 0;
  // The key Ticketmaster refused: nothing goes out with it again.
  let refusedKey = null;
  let chain = Promise.resolve();
  const quota = { limit: null, available: null, at: 0 };

  const once = async (path, params, key) => {
    const wait = lastRequest + SPACING_MS - now();
    if (wait > 0) {
      await sleep(wait);
    }
    lastRequest = now();
    const query = new URLSearchParams({ ...params, locale: '*' });
    const label = `${path}?${query.toString()}`.slice(0, 160);
    query.set('apikey', key);
    let response;
    try {
      response = await fetch(`${BASE_URL}/${path}.json?${query.toString()}`, {
        headers: { accept: 'application/json', 'user-agent': userAgent },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      throw new TicketmasterError('network', `${label}: ${error.cause?.code ?? error.message}`);
    }
    const header = (name) => response.headers?.get?.(name) ?? null;
    const limit = Number(header('rate-limit'));
    const available = Number(header('rate-limit-available'));
    if (header('rate-limit-available') !== null && Number.isFinite(available)) {
      quota.limit = Number.isFinite(limit) && limit > 0 ? limit : quota.limit;
      quota.available = available;
      quota.at = now();
    }
    const body = await response.text();
    if (response.status === 401 || response.status === 403) {
      throw new TicketmasterError('auth', `${label}: key refused`, response.status);
    }
    if (response.status === 429) {
      const fault = faultOf(body);
      if (/quota/i.test(fault)) {
        const reset = Number(header('rate-limit-reset'));
        const error = new TicketmasterError('quota', `${label}: daily quota spent`, 429);
        error.resetAt =
          Number.isFinite(reset) && reset > now() && reset - now() <= QUOTA_PAUSE_MAX_MS
            ? reset
            : now() + QUOTA_PAUSE_MS;
        throw error;
      }
      throw new TicketmasterError('busy', `${label}: too many requests`, 429);
    }
    if (response.status === 404) {
      throw new TicketmasterError('not_found', `${label}: not found`, 404);
    }
    if (!response.ok) {
      const fault = faultOf(body).slice(0, 120);
      throw new TicketmasterError(
        'http',
        `${label}: HTTP ${response.status}${fault ? ` ${fault}` : ''}`,
        response.status,
      );
    }
    try {
      const json = JSON.parse(body);
      if (json && typeof json === 'object') {
        return json;
      }
    } catch {
      // Falls through.
    }
    throw new TicketmasterError('invalid', `${label}: not JSON`, response.status);
  };

  const request = async (path, params) => {
    const key = String(apiKey() ?? '').trim();
    if (!key) {
      throw new TicketmasterError('auth', 'no API key in the configuration');
    }
    if (key === refusedKey) {
      throw new TicketmasterError('auth', 'the API key was refused by Ticketmaster', 401);
    }
    if (now() < pausedUntil) {
      throw Object.assign(new TicketmasterError('quota', 'daily quota spent', 429), {
        resetAt: pausedUntil,
      });
    }
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await once(path, params, key);
      } catch (error) {
        if (error.kind === 'auth' && error.status === 401) {
          refusedKey = key;
        }
        if (error.kind === 'quota') {
          pausedUntil = error.resetAt;
        }
        if (error.kind !== 'busy' || attempt >= SPIKE_RETRIES) {
          throw error;
        }
        await sleep(SPIKE_RETRY_MS * (attempt + 1));
      }
    }
  };

  // One request at a time, whoever asks (the reading, a configuration button).
  const queued = (path, params) => {
    const run = chain.then(() => request(path, params));
    chain = run.catch(() => {});
    return run;
  };

  /**
   * @description Every page of a search, up to the 1,000th item.
   * @param {string} path - `events`, `attractions` or `venues`.
   * @param {object} params - The query.
   * @param {string} listKey - The key of the list in `_embedded`.
   * @returns {Promise<{ items: object[], total: number, truncated: boolean }>} The items.
   */
  const paged = async (path, params, listKey) => {
    const items = [];
    let total = 0;
    for (let page = 0; page * PAGE_SIZE < MAX_ITEMS; page += 1) {
      const json = await queued(path, { ...params, size: PAGE_SIZE, page });
      const list = json?._embedded?.[listKey];
      items.push(...(Array.isArray(list) ? list : []));
      total = Number(json?.page?.totalElements ?? items.length) || items.length;
      const pages = Number(json?.page?.totalPages ?? 0);
      if (!Array.isArray(list) || list.length < PAGE_SIZE || page + 1 >= pages) {
        break;
      }
    }
    return { items, total, truncated: total > items.length };
  };

  return {
    /** @returns {number} The end of the pause after the daily quota, in ms (0 when none). */
    get pausedUntil() {
      return pausedUntil > now() ? pausedUntil : 0;
    },
    /** @returns {boolean} Whether the key of the configuration was refused. */
    get keyRefused() {
      const key = String(apiKey() ?? '').trim();
      return Boolean(key) && key === refusedKey;
    },
    /** @returns {object} The last quota Ticketmaster announced: `{ limit, available, at }`. */
    get quota() {
      return { ...quota };
    },
    /**
     * @description Events, the nearest date first.
     * @param {object} query - Discovery parameters: `geoPoint`, `radius`,
     * `unit`, `segmentId`, `attractionId`, `venueId`, `countryCode`,
     * `startDateTime`, `endDateTime`.
     * @returns {Promise<{ items: object[], total: number, truncated: boolean }>} Raw events.
     */
    events: (query) => paged('events', { sort: 'date,asc', ...query }, 'events'),
    /**
     * @param {string} id - Event id.
     * @returns {Promise<object>} The raw event (404 when Ticketmaster removed it).
     */
    event: (id) => queued(`events/${encodeURIComponent(id)}`, {}),
    /**
     * @param {string} keyword - A name.
     * @returns {Promise<object[]>} Raw attractions, the most relevant first.
     */
    async searchAttractions(keyword) {
      const json = await queued('attractions', { keyword, size: 10, sort: 'relevance,desc' });
      const list = json?._embedded?.attractions;
      return Array.isArray(list) ? list : [];
    },
    /**
     * @param {string} id - Attraction id.
     * @returns {Promise<object>} The raw attraction.
     */
    attraction: (id) => queued(`attractions/${encodeURIComponent(id)}`, {}),
    /**
     * @param {string} keyword - A name.
     * @param {string} [countryCode] - Two letters, to narrow the search.
     * @returns {Promise<object[]>} Raw venues, the most relevant first.
     */
    async searchVenues(keyword, countryCode) {
      const json = await queued('venues', {
        keyword,
        size: 10,
        sort: 'relevance,desc',
        ...(countryCode ? { countryCode } : {}),
      });
      const list = json?._embedded?.venues;
      return Array.isArray(list) ? list : [];
    },
    /**
     * @param {string} id - Venue id.
     * @returns {Promise<object>} The raw venue.
     */
    venue: (id) => queued(`venues/${encodeURIComponent(id)}`, {}),
  };
}

/**
 * @param {number} ms - Delay.
 * @returns {Promise<void>} Resolved after the delay.
 */
function defaultSleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms).unref?.();
  });
}

export {
  BASE_URL,
  SPACING_MS,
  SPIKE_RETRIES,
  QUOTA_PAUSE_MS,
  PAGE_SIZE,
  MAX_ITEMS,
  TicketmasterError,
  isTmId,
  tmDateTime,
  createTicketmasterClient,
};
