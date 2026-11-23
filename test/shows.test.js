// A raw event -> a show, the filters and orders of the lists, the geohash.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { geohash, pickHouse } from '../src/geo.js';
import {
  classify,
  matches,
  onsaleShows,
  pickImage,
  placeText,
  toShow,
  upcomingShows,
} from '../src/shows.js';
import { HOUSES, MUSE, rawEvent } from './helpers.js';

test('a dated, timed event: local date and time, instant, venue, picture, sale, price', () => {
  const show = toShow(rawEvent({ id: 'vvG1zZ9Kd-tuvk' }));
  assert.deepEqual(
    {
      id: show.id,
      date: show.date,
      time: show.time,
      start: show.start,
      end: show.end,
      status: show.status,
      segment: show.segment,
      genre: show.genre,
      onsale: show.onsale,
    },
    {
      id: 'vvG1zZ9Kd-tuvk',
      date: '2026-12-12',
      time: '20:00',
      start: '2026-12-12T19:00:00.000Z',
      end: null,
      status: 'onsale',
      segment: 'music',
      genre: 'Rock',
      onsale: '2026-11-20T09:00:00.000Z',
    },
  );
  assert.deepEqual(show.venue, {
    id: 'KovZpZA7AAEA',
    name: 'Accor Arena',
    city: 'Paris',
    country: 'FR',
  });
  assert.deepEqual(show.attractions, [{ id: MUSE, name: 'Muse' }]);
  assert.match(show.image, /RETINA_PORTRAIT_16_9\.jpg$/, 'the smallest 16:9 at least 500 px wide');
  assert.deepEqual(show.price, { min: 45, max: 89, currency: 'EUR' });
  assert.equal(placeText(show), 'Accor Arena, Paris');
});

test('time to be announced: an all-day show; date to be announced: no date at all', () => {
  const allDay = toShow(rawEvent({ time: undefined, start: { timeTBA: true } }));
  assert.deepEqual([allDay.date, allDay.time, allDay.start], ['2026-12-12', null, null]);
  const noSpecific = toShow(rawEvent({ start: { noSpecificTime: true } }));
  assert.equal(noSpecific.start, null);
  const tba = toShow(rawEvent({ date: undefined, start: { dateTBA: true } }));
  assert.deepEqual([tba.date, tba.time, tba.start], [null, null, null]);
});

test('unknown status, test events, missing names and bad addresses', () => {
  assert.equal(toShow(rawEvent({ status: 'weird' })).status, 'onsale');
  assert.equal(toShow(rawEvent({ test: true })), null);
  assert.equal(toShow({ id: 'x' }), null);
  assert.equal(toShow(rawEvent({ url: 'javascript:alert(1)' })).url, '');
  const noSale = toShow(rawEvent({ sales: { public: { startTBD: true } } }));
  assert.equal(noSale.onsale, null);
});

test('categories by segment id, else by name; "Undefined" genres are dropped', () => {
  assert.deepEqual(
    classify([{ segment: { id: 'KZFzniwnSyZfZ7v7nE' }, genre: { name: 'Football' } }]),
    {
      segment: 'sports',
      genre: 'Football',
    },
  );
  assert.deepEqual(
    classify([{ segment: { name: 'Arts & Theatre' }, genre: { name: 'Undefined' } }]),
    {
      segment: 'arts',
      genre: '',
    },
  );
  assert.deepEqual(classify([]), { segment: '', genre: '' });
});

test('pictures: https only, 16:9 first, the largest when none is wide enough', () => {
  assert.equal(pickImage([{ url: 'http://x/a.jpg', ratio: '16_9', width: 640 }]), '');
  assert.equal(
    pickImage([
      { url: 'https://s1.ticketm.net/a.jpg', ratio: '16_9', width: 205 },
      { url: 'https://s1.ticketm.net/b.jpg', ratio: '16_9', width: 305 },
    ]),
    'https://s1.ticketm.net/b.jpg',
  );
});

test('lists: canceled and started shows left out, filters by source, category and name', () => {
  const shows = [
    { ...toShow(rawEvent({ id: 'a1', name: 'Muse' })), sources: ['artist'] },
    { ...toShow(rawEvent({ id: 'a2', name: 'Opera', status: 'canceled' })), sources: ['nearby'] },
    {
      ...toShow(
        rawEvent({
          id: 'a3',
          name: 'PSG – OM',
          date: '2026-12-01',
          dateTime: '2026-12-01T20:00:00Z',
        }),
      ),
      segment: 'sports',
      sources: ['nearby'],
    },
  ];
  const now = Date.parse('2026-11-23T08:00:00Z');
  assert.deepEqual(
    upcomingShows(shows, { today: '2026-11-23', now }).map((show) => show.id),
    ['a3', 'a1'],
  );
  assert.deepEqual(
    upcomingShows(shows, { today: '2026-12-01', now: Date.parse('2026-12-01T21:00:00Z') }).map(
      (show) => show.id,
    ),
    ['a1'],
    'a show of today that started is no longer to come',
  );
  assert.ok(matches(shows[0], { sources: ['artist'], segments: ['music'], attraction: 'muse' }));
  assert.ok(!matches(shows[0], { sources: ['nearby'] }));
  assert.ok(matches(shows[2], { attraction: 'psg' }), 'a word of the title');
  assert.deepEqual(
    onsaleShows(shows, { now: Date.parse('2026-11-19T00:00:00Z') }).map((show) => show.id),
    ['a3', 'a1'],
    'the canceled one has no sale to open; same opening: the nearest date first',
  );
  assert.deepEqual(onsaleShows(shows, { now }), [], 'the sales opened on 2026-11-20');
});

test('geohash: the reference values', () => {
  assert.equal(geohash(57.64911, 10.40744, 11), 'u4pruydqqvj');
  assert.equal(geohash(48.8584, 2.2945, 7), 'u09tunq');
  assert.equal(geohash(91, 0), '');
  assert.equal(geohash(null, 2), '');
});

test('the house: the chosen one, else the first located; none when the chosen one has no position', () => {
  assert.equal(pickHouse(HOUSES, '').selector, 'home');
  assert.equal(pickHouse(HOUSES, 'home').selector, 'home');
  assert.equal(pickHouse(HOUSES, 'cabin'), null);
  assert.equal(pickHouse([], ''), null);
});
