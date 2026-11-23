// Scene events (announced, reminders, sale openings, changes), scene action
// outputs and the calendar events, as pure functions.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';

import { MAX_EVENTS_PER_REQUEST, buildEvent, eventName, splitWindow } from '../src/calendar.js';
import { normalizeConfig } from '../src/config.js';
import {
  SHOW_OUTPUTS,
  TRIGGERS,
  changeEvents,
  changeOf,
  dueReminders,
  dueSales,
  showOutputs,
} from '../src/events.js';
import { toShow } from '../src/shows.js';
import { addDays } from '../src/time.js';
import { MUSE, TZ, rawEvent } from './helpers.js';

const show = (fields = {}, sources = ['artist']) => ({ ...toShow(rawEvent(fields)), sources });
const context = (extra = {}) => ({
  config: normalizeConfig({}),
  today: '2026-11-23',
  language: 'fr',
  timeZone: TZ,
  followed: new Set([MUSE]),
  ...extra,
});

test('announced: never a baseline, a canceled or a past show; a sentence in the language', () => {
  const events = changeEvents(
    {
      added: [
        { show: show({ id: 'n1' }), baseline: false },
        { show: show({ id: 'n2' }), baseline: true },
        { show: show({ id: 'n3', status: 'canceled' }), baseline: false },
        { show: show({ id: 'n4', date: '2026-11-01' }), baseline: false },
        { show: show({ id: 'n5', date: undefined, start: { dateTBA: true } }), baseline: false },
      ],
    },
    context(),
  );
  assert.deepEqual(
    events.map((event) => [event.trigger, event.data.event_id]),
    [
      [TRIGGERS.ANNOUNCED, 'n1'],
      [TRIGGERS.ANNOUNCED, 'n5'],
    ],
  );
  const [first, second] = events;
  assert.equal(
    first.data.text,
    'Nouvelle date : Muse, samedi 12 décembre 2026 à 20:00, Accor Arena, Paris.',
  );
  assert.deepEqual(
    [
      first.data.attraction,
      first.data.source,
      first.data.segment,
      first.data.days,
      first.data.city,
    ],
    ['Muse', 'artist', 'music', 19, 'Paris'],
  );
  assert.match(first.data.onsale_text, /^Mise en vente : ven\.? 20 nov\.? à 10:00$/);
  assert.equal(second.data.date, '');
  assert.equal(second.data.days, null);
  for (const event of events) {
    for (const value of Object.values(event.data)) {
      assert.ok(value === null || ['string', 'number', 'boolean'].includes(typeof value));
    }
  }
});

test('changes: canceled, postponed, rescheduled, moved; nothing for a sale status', () => {
  const before = show({ id: 'c1' });
  assert.equal(changeOf(before, show({ id: 'c1', status: 'canceled' })), 'canceled');
  assert.equal(changeOf(before, show({ id: 'c1', status: 'postponed' })), 'postponed');
  assert.equal(
    changeOf(
      before,
      show({
        id: 'c1',
        status: 'rescheduled',
        date: '2027-01-10',
        dateTime: '2027-01-10T19:00:00Z',
      }),
    ),
    'rescheduled',
  );
  assert.equal(
    changeOf(before, show({ id: 'c1', dateTime: '2026-12-12T20:00:00Z', time: '21:00:00' })),
    'date_changed',
  );
  assert.equal(changeOf(before, show({ id: 'c1', status: 'offsale' })), null);
  const [event] = changeEvents(
    {
      updated: [
        { before, after: show({ id: 'c1', date: '2027-01-10', dateTime: '2027-01-10T19:00:00Z' }) },
      ],
    },
    context(),
  );
  assert.equal(event.trigger, TRIGGERS.CHANGED);
  assert.deepEqual(
    [event.data.change, event.data.previous_date, event.data.date],
    ['date_changed', '2026-12-12', '2027-01-10'],
  );
  assert.equal(
    event.data.text,
    'Muse change de date : dimanche 10 janvier 2027 à 20:00 (au lieu de samedi 12 décembre 2026 à 20:00).',
  );
});

test('reminders: from the hour of the configuration, the day, the day before, a week before', () => {
  const shows = [
    show({ id: 'r1', date: '2026-11-23', dateTime: '2026-11-23T19:00:00Z' }),
    show({ id: 'r2', date: '2026-11-24', dateTime: '2026-11-24T19:00:00Z' }),
    show({ id: 'r3', date: '2026-11-30', dateTime: '2026-11-30T19:00:00Z', status: 'canceled' }),
  ];
  const base = { shows, wasFired: () => false, ...context() };
  assert.deepEqual(dueReminders({ ...base, hour: 8 }), []);
  const due = dueReminders({ ...base, hour: 9 });
  assert.deepEqual(
    due.map((event) => [event.data.event_id, event.data.lead, event.key]),
    [
      ['r1', '0', 'r1|r0|2026-11-23'],
      ['r2', '1', 'r2|r1|2026-11-24'],
    ],
  );
  assert.equal(due[0].data.text, 'Muse : aujourd’hui à 20:00, Accor Arena, Paris.');
  assert.equal(due[1].data.text, 'Muse : demain à 20:00, Accor Arena, Paris.');
  assert.deepEqual(dueReminders({ ...base, hour: 10, wasFired: () => true }), []);
});

test('sale openings: at the opening, an hour or a day before, two hours of grace', () => {
  const shows = [show({ id: 's1', onsale: '2026-11-24T09:00:00Z' })];
  const due = (iso) =>
    dueSales({ shows, now: Date.parse(iso), wasFired: () => false, ...context() }).map(
      (event) => event.data.lead,
    );
  assert.deepEqual(due('2026-11-23T08:59:00Z'), []);
  assert.deepEqual(due('2026-11-23T09:00:00Z'), ['1440']);
  assert.deepEqual(due('2026-11-24T08:00:00Z'), ['60']);
  assert.deepEqual(due('2026-11-24T09:00:00Z'), ['0']);
  assert.deepEqual(due('2026-11-24T11:00:00Z'), [], 'too late');
  const [event] = dueSales({
    shows,
    now: Date.parse('2026-11-23T09:30:00Z'),
    wasFired: () => false,
    ...context(),
  });
  assert.equal(event.key, 's1|s1440|2026-11-24T09:00:00.000Z');
  assert.equal(
    event.data.text,
    'Mise en vente demain à 10:00 : Muse, samedi 12 décembre 2026 à 20:00.',
  );
});

test('scene action outputs: exactly the declared keys, found or not', () => {
  assert.deepEqual(Object.keys(showOutputs(null, context())).sort(), [...SHOW_OUTPUTS].sort());
  const outputs = showOutputs(show({ id: 'o1' }), context());
  assert.deepEqual(Object.keys(outputs).sort(), [...SHOW_OUTPUTS].sort());
  assert.equal(outputs.found, true);
  assert.equal(outputs.days, 19);
  assert.equal(showOutputs(null, context()).days, -1);
});

test('calendar events: timed, all-day, canceled in the name, place and link', async () => {
  const gladys = createFakeGladys({});
  const timed = buildEvent(gladys, 'john', show({ id: 'k1' }), 'fr');
  assert.equal(timed.external_id, 'ext:test-integration:john:ev-k1');
  assert.deepEqual(
    [timed.start, timed.end, timed.full_day],
    ['2026-12-12T19:00:00.000Z', undefined, undefined],
  );
  assert.equal(timed.location, 'Accor Arena, Paris');
  assert.match(
    timed.description,
    /^Musique · Rock\nMise en vente : .*\nPrix : de 45,00\s€ à 89,00\s€\nSource : Ticketmaster$/,
  );
  const allDay = buildEvent(gladys, 'john', show({ id: 'k2', start: { timeTBA: true } }), 'en');
  assert.deepEqual([allDay.start, allDay.end, allDay.full_day], ['2026-12-12', '2026-12-13', true]);
  assert.equal(eventName(show({ status: 'canceled' }), 'fr'), 'Annulé · Muse');
  assert.equal(eventName(show({ status: 'postponed' }), 'en'), 'Postponed · Muse');
});

test('calendar windows: one request up to 500 events, else consecutive sub-windows by day', () => {
  const few = [show({ id: 'w1' })];
  assert.deepEqual(splitWindow(few, '2026-11-16', '2028-11-22'), [
    { from: '2026-11-16', to: '2028-11-22', shows: few },
  ]);
  // 1,200 shows over 60 days: 20 a day.
  const many = [];
  for (let day = 0; day < 60; day += 1) {
    for (let i = 0; i < 20; i += 1) {
      many.push({ id: `m${day}-${i}`, date: addDays('2026-12-01', day) });
    }
  }
  const requests = splitWindow(many, '2026-11-16', '2028-11-22');
  assert.ok(requests.length >= 3);
  assert.equal(requests[0].from, '2026-11-16');
  assert.equal(requests.at(-1).to, '2028-11-22');
  for (let i = 1; i < requests.length; i += 1) {
    assert.equal(requests[i].from, requests[i - 1].to, 'consecutive windows');
  }
  for (const request of requests) {
    assert.ok(request.shows.length <= MAX_EVENTS_PER_REQUEST);
    // Every show of the window, and those of the days around its boundaries.
    const inside = many.filter((one) => one.date >= request.from && one.date < request.to);
    for (const one of inside) {
      assert.ok(request.shows.includes(one), one.id);
    }
    const before = addDays(request.from, -1);
    if (request.from !== '2026-11-16') {
      assert.ok(
        request.shows.some((one) => one.date === before),
        'the day before',
      );
    }
  }
});
