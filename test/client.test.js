// The HTTP client of the Discovery API against a fake fetch: the key never
// shows in an error, a refused key is not sent again, the daily quota pauses
// everything, the per-second limit is tried again, paging stops at 1,000.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  MAX_ITEMS,
  PAGE_SIZE,
  createTicketmasterClient,
  isTmId,
  tmDateTime,
} from '../src/ticketmaster.js';

const KEY = 'SeCrEtKeY1234567890abcdefABCDEF';

/**
 * @description A fake fetch answering from a function.
 * @param {Function} answer - `(url) => { status, body, headers }`.
 * @returns {Function} The fetch, with `urls`.
 */
function fakeFetch(answer) {
  const urls = [];
  const fetch = async (url) => {
    urls.push(url);
    const { status = 200, body = {}, headers = {} } = answer(new URL(url), urls.length);
    return {
      status,
      ok: status >= 200 && status < 300,
      headers: new Headers(headers),
      text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
    };
  };
  fetch.urls = urls;
  return fetch;
}

const client = (fetch, extra = {}) => {
  let clock = Date.parse('2026-11-23T08:00:00Z');
  return createTicketmasterClient({
    apiKey: () => KEY,
    fetch,
    now: () => clock,
    sleep: async (ms) => {
      clock += ms;
    },
    ...extra,
  });
};

test('every request: the key as apikey, locale=*, sorted by date, and the quota headers read', async () => {
  const fetch = fakeFetch(() => ({
    body: { _embedded: { events: [{ id: 'e1' }] }, page: { totalElements: 1, totalPages: 1 } },
    headers: { 'rate-limit': '5000', 'rate-limit-available': '4999' },
  }));
  const tm = client(fetch);
  const answer = await tm.events({ geoPoint: 'u09tvw0', radius: '25', unit: 'km' });
  assert.deepEqual(answer, { items: [{ id: 'e1' }], total: 1, truncated: false });
  const url = new URL(fetch.urls[0]);
  assert.equal(url.origin + url.pathname, 'https://app.ticketmaster.com/discovery/v2/events.json');
  assert.equal(url.searchParams.get('apikey'), KEY);
  assert.equal(url.searchParams.get('locale'), '*');
  assert.equal(url.searchParams.get('sort'), 'date,asc');
  assert.equal(url.searchParams.get('size'), String(PAGE_SIZE));
  assert.deepEqual([tm.quota.limit, tm.quota.available], [5000, 4999]);
});

test('paging: every page up to the 1,000th event, truncated beyond', async () => {
  const fetch = fakeFetch((url) => {
    const page = Number(url.searchParams.get('page'));
    return {
      body: {
        _embedded: {
          events: Array.from({ length: PAGE_SIZE }, (_, i) => ({ id: `${page}-${i}` })),
        },
        page: { totalElements: 1500, totalPages: 8 },
      },
    };
  });
  const answer = await client(fetch).events({});
  assert.equal(fetch.urls.length, MAX_ITEMS / PAGE_SIZE);
  assert.equal(answer.items.length, MAX_ITEMS);
  assert.equal(answer.truncated, true);
});

test('an empty answer has no _embedded', async () => {
  const fetch = fakeFetch(() => ({ body: { page: { totalElements: 0, totalPages: 0 } } }));
  assert.deepEqual(await client(fetch).events({}), { items: [], total: 0, truncated: false });
});

test('401: the key is refused, never in the message, and not sent again', async () => {
  const fetch = fakeFetch(() => ({
    status: 401,
    body: {
      fault: { faultstring: 'Invalid ApiKey', detail: { errorcode: 'oauth.v2.InvalidApiKey' } },
    },
  }));
  const tm = client(fetch);
  await assert.rejects(tm.events({}), (error) => {
    assert.equal(error.kind, 'auth');
    assert.doesNotMatch(error.message, new RegExp(KEY));
    return true;
  });
  assert.equal(tm.keyRefused, true);
  await assert.rejects(tm.searchAttractions('Muse'), { kind: 'auth' });
  assert.equal(fetch.urls.length, 1, 'nothing goes out with a refused key');
});

test('a new key is tried again', async () => {
  let key = 'bad';
  const fetch = fakeFetch((url) =>
    url.searchParams.get('apikey') === 'bad'
      ? { status: 401, body: { fault: { faultstring: 'Invalid ApiKey' } } }
      : { body: { _embedded: { attractions: [] } } },
  );
  const tm = client(fetch, { apiKey: () => key });
  await assert.rejects(tm.searchAttractions('Muse'), { kind: 'auth' });
  key = 'good';
  assert.equal(tm.keyRefused, false);
  assert.deepEqual(await tm.searchAttractions('Muse'), []);
});

test('no key: nothing goes out', async () => {
  const fetch = fakeFetch(() => ({}));
  const tm = client(fetch, { apiKey: () => '  ' });
  await assert.rejects(tm.events({}), { kind: 'auth' });
  assert.equal(fetch.urls.length, 0);
});

test('429 quota: a pause until Rate-Limit-Reset, no request meanwhile', async () => {
  const reset = Date.parse('2026-11-23T23:00:00Z');
  const fetch = fakeFetch(() => ({
    status: 429,
    body: {
      fault: {
        faultstring: `Rate limit quota violation. Quota limit exceeded. Identifier : ${KEY}`,
        detail: { errorcode: 'policies.ratelimit.QuotaViolation' },
      },
    },
    headers: { 'rate-limit-reset': String(reset) },
  }));
  const tm = client(fetch);
  await assert.rejects(tm.events({}), (error) => {
    assert.equal(error.kind, 'quota');
    assert.doesNotMatch(error.message, new RegExp(KEY), 'the fault quotes the key: never copied');
    return true;
  });
  assert.equal(tm.pausedUntil, reset);
  await assert.rejects(tm.events({}), { kind: 'quota' });
  assert.equal(fetch.urls.length, 1);
});

test('429 without a usable reset: a one-hour pause', async () => {
  const fetch = fakeFetch(() => ({
    status: 429,
    body: { fault: { faultstring: 'Rate limit quota violation.' } },
  }));
  const tm = client(fetch);
  await assert.rejects(tm.events({}), { kind: 'quota' });
  assert.equal(tm.pausedUntil, Date.parse('2026-11-23T09:00:00Z'));
});

test('429 spike arrest: tried again twice, then given up', async () => {
  let calls = 0;
  const fetch = fakeFetch(() => {
    calls += 1;
    return calls < 3
      ? { status: 429, body: { fault: { faultstring: 'Spike arrest violation.' } } }
      : { body: { _embedded: { venues: [{ id: 'KovZpZA7AAEA' }] } } };
  });
  assert.deepEqual(await client(fetch).searchVenues('Accor Arena', 'FR'), [{ id: 'KovZpZA7AAEA' }]);
  assert.equal(new URL(fetch.urls[0]).searchParams.get('countryCode'), 'FR');
  const always = fakeFetch(() => ({
    status: 429,
    body: { fault: { faultstring: 'Spike arrest' } },
  }));
  await assert.rejects(client(always).events({}), { kind: 'busy' });
  assert.equal(always.urls.length, 3);
});

test('404, other errors, a network failure, not JSON', async () => {
  await assert.rejects(client(fakeFetch(() => ({ status: 404 }))).event('x123456'), {
    kind: 'not_found',
  });
  await assert.rejects(client(fakeFetch(() => ({ status: 500, body: 'oops' }))).events({}), {
    kind: 'http',
  });
  await assert.rejects(client(fakeFetch(() => ({ body: 'not json' }))).events({}), {
    kind: 'invalid',
  });
  const failing = async () => {
    throw Object.assign(new Error('fetch failed'), { cause: { code: 'ENOTFOUND' } });
  };
  await assert.rejects(client(failing).events({}), (error) => {
    assert.equal(error.kind, 'network');
    assert.match(error.message, /ENOTFOUND/);
    return true;
  });
});

test('requests go one at a time, 250 ms apart', async () => {
  const sleeps = [];
  let clock = 1e12;
  const fetch = fakeFetch(() => ({ body: {} }));
  const tm = createTicketmasterClient({
    apiKey: () => KEY,
    fetch,
    now: () => clock,
    sleep: async (ms) => {
      sleeps.push(ms);
      clock += ms;
    },
  });
  await Promise.all([tm.attraction('K8vZ917Gku7'), tm.venue('KovZpZA7AAEA')]);
  assert.deepEqual(sleeps, [250]);
  assert.match(fetch.urls[0], /\/attractions\/K8vZ917Gku7\.json\?/);
  assert.match(fetch.urls[1], /\/venues\/KovZpZA7AAEA\.json\?/);
});

test('identifiers and dates', () => {
  assert.ok(isTmId('K8vZ917Gku7'));
  assert.ok(isTmId('vvG1zZ9Kd-tuvk'));
  assert.ok(!isTmId('a b'));
  assert.equal(tmDateTime(Date.parse('2026-11-23T08:00:00.123Z')), '2026-11-23T08:00:00Z');
});
