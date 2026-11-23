// The whole integration against the fake Gladys of the SDK
// (`@gladysassistant/integration-sdk/testing`, which checks the calendars,
// the scene events and the widgets like the host API), a fake Ticketmaster
// and a clock moved by hand, in Europe/Paris.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';

import { ACTIONS, SCENE_ACTIONS, TRIGGERS, createApp } from '../src/app.js';
import { SHOW_OUTPUTS } from '../src/events.js';
import { WIDGETS } from '../src/widgets.js';
import {
  ARENA,
  HOUSES,
  MUSE,
  PSG,
  TZ,
  fakeClock,
  fakeTm,
  rawAttraction,
  rawEvent,
  rawVenue,
  silentLogger,
  tempStore,
  tmError,
} from './helpers.js';

const MANIFEST = JSON.parse(
  readFileSync(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);

const KEY = 'aKeyOfTicketmaster0123456789abc';
const ATTRACTIONS = JSON.stringify([{ id: MUSE, name: 'Muse', info: 'Rock' }]);
const CONFIG = { api_key: KEY, attractions: ATTRACTIONS, language: 'fr' };

// A user who enabled the integration in "My calendars".
const JOHN = { user: { selector: 'john', first_name: 'John', language: 'fr' }, config: {} };

const MUSE_ARENA = 'vvG1zZ9KdMuse1';
const OPERA = 'vvG1zZ9KdOpera';
const MATCH = 'vvG1zZ9KdMatch';

const tables = () => ({
  attractions: {
    [MUSE]: [
      rawEvent({ id: MUSE_ARENA }),
      rawEvent({
        id: 'vvG1zZ9KdMuse2',
        date: '2026-12-14',
        dateTime: '2026-12-14T19:00:00Z',
        venue: { id: 'KovZpZ1kk7lA', name: 'Stade Vélodrome', city: 'Marseille', country: 'FR' },
        onsale: '2026-11-25T09:00:00Z',
      }),
    ],
  },
  nearby: [
    rawEvent({ id: MUSE_ARENA }),
    rawEvent({
      id: OPERA,
      name: 'La Traviata',
      date: '2026-11-28',
      time: undefined,
      dateTime: undefined,
      start: { timeTBA: true },
      segment: { id: 'KZFzniwnSyZfZ7v7na', name: 'Arts & Theatre' },
      genre: 'Opera',
      attractions: [],
      onsale: '2026-09-01T08:00:00Z',
    }),
    rawEvent({
      id: MATCH,
      name: 'PSG – OM',
      date: '2026-12-06',
      time: '21:00:00',
      dateTime: '2026-12-06T20:00:00Z',
      segment: { id: 'KZFzniwnSyZfZ7v7nE', name: 'Sports' },
      genre: 'Football',
      venue: { id: 'KovZpZAFkvEA', name: 'Parc des Princes', city: 'Paris', country: 'FR' },
      attractions: [{ id: PSG, name: 'Paris Saint-Germain' }],
    }),
  ],
});

/**
 * @description An integration wired to the fake Gladys, its first reading done.
 * @param {object} [options] - `{ config, tm, start, fake }`.
 * @returns {Promise<object>} `{ gladys, app, tm, clock, store, cleanup }`.
 */
async function setup({
  config = CONFIG,
  tm = fakeTm(tables()),
  start = '2026-11-23T08:00:00Z',
  fake = {},
} = {}) {
  const gladys = createFakeGladys({ config, calendarAccounts: [JOHN], houses: HOUSES, ...fake });
  const clock = fakeClock(start);
  const { store, cleanup } = tempStore();
  const images = {
    keyOf: (show) =>
      show.image
        ? `img-${show.id
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '')
            .padEnd(20, '0')
            .slice(0, 20)}`
        : null,
    get: async () => 'iVBORw0KGgo=',
    prune: () => {},
  };
  const app = createApp(gladys, {
    tm,
    store,
    images,
    now: clock.now,
    timeZone: TZ,
    sleep: async () => {},
    logger: silentLogger,
  });
  await gladys.connect();
  await app.tick();
  await app.idle();
  return { gladys: gladys.fake, app, tm, clock, store, cleanup };
}

const eventsOf = (gladys, key) => gladys.sceneEvents.filter((event) => event.key === key);
const lastEvents = (gladys, suffix) =>
  gladys.publishedCalendarEvents
    .filter((batch) => batch.calendar_external_id.endsWith(suffix))
    .at(-1);
const later = async (app, clock, hours) => {
  clock.advance(hours * 3600 * 1000);
  await app.tick();
  await app.idle();
};

test('the manifest and the code agree on every key', () => {
  assert.deepEqual(
    MANIFEST.actions.map((action) => action.key).sort(),
    Object.values(ACTIONS).sort(),
  );
  assert.deepEqual(
    MANIFEST.scene_actions.map((action) => action.key).sort(),
    Object.values(SCENE_ACTIONS).sort(),
  );
  assert.deepEqual(
    MANIFEST.scene_triggers.map((trigger) => trigger.key).sort(),
    Object.values(TRIGGERS).sort(),
  );
  assert.deepEqual(
    MANIFEST.widgets.map((widget) => widget.key).sort(),
    Object.values(WIDGETS).sort(),
  );
  for (const action of MANIFEST.scene_actions) {
    assert.deepEqual(action.outputs.map((output) => output.key).sort(), [...SHOW_OUTPUTS].sort());
  }
});

test('first reading: a calendar per source in use, each show in the most personal one, no event', async () => {
  const { gladys, tm, cleanup } = await setup();
  try {
    const nearbyQuery = JSON.parse(tm.calls.find((call) => call.includes('geoPoint')).slice(7));
    assert.equal(nearbyQuery.geoPoint, 'u09tvw0', 'a geohash of 7 characters of the house');
    assert.deepEqual(
      [nearbyQuery.radius, nearbyQuery.unit, nearbyQuery.segmentId],
      ['25', 'km', 'KZFzniwnSyZfZ7v7nJ,KZFzniwnSyZfZ7v7na'],
    );
    assert.equal(nearbyQuery.startDateTime, '2026-11-23T08:00:00Z');
    assert.equal(nearbyQuery.endDateTime, '2027-02-21T08:00:00Z', '90 days');
    const museQuery = JSON.parse(tm.calls.find((call) => call.includes('attractionId')).slice(7));
    assert.deepEqual([museQuery.attractionId, museQuery.countryCode], [MUSE, 'FR']);

    const calendars = gladys.publishedCalendars.at(-1);
    assert.equal(calendars.user, 'john');
    assert.deepEqual(
      calendars.calendars.map((calendar) => [
        calendar.external_id.split(':').at(-1),
        calendar.name,
      ]),
      [
        ['artists', 'Mes artistes et équipes'],
        ['nearby', 'Sorties autour de la maison'],
      ],
      'no venue followed: no venue calendar',
    );
    const artists = lastEvents(gladys, ':john:artists');
    assert.deepEqual(
      artists.events.map((event) => [event.name, event.start, event.location]),
      [
        ['Muse', '2026-12-12T19:00:00.000Z', 'Accor Arena, Paris'],
        ['Muse', '2026-12-14T19:00:00.000Z', 'Stade Vélodrome, Marseille'],
      ],
    );
    assert.deepEqual(artists.window, { from: '2026-11-16', to: '2028-11-22' });
    const nearby = lastEvents(gladys, ':john:nearby');
    assert.deepEqual(
      nearby.events.map((event) => [event.name, event.start, event.end, event.full_day ?? false]),
      [
        ['La Traviata', '2026-11-28', '2026-11-29', true],
        ['PSG – OM', '2026-12-06T20:00:00.000Z', undefined, false],
      ],
      'the concert of Muse is in the artists calendar only',
    );
    assert.equal(nearby.events[0].url, `https://www.ticketmaster.fr/fr/manifestation/${OPERA}`);
    assert.equal(gladys.sceneEvents.length, 0, 'a baseline announces nothing');
    assert.equal(gladys.connectionStatus.connected, true);
    assert.equal(
      gladys.connectionStatus.message.fr,
      'Sorties à venir : 4 · mises en vente à venir : 1.',
    );
  } finally {
    cleanup();
  }
});

test('a new date is announced once; a moved one and a canceled one are told', async () => {
  const { gladys, app, tm, clock, cleanup } = await setup();
  try {
    tm.tables.attractions[MUSE].push(
      rawEvent({
        id: 'vvG1zZ9KdMuse3',
        date: '2027-06-20',
        time: '20:30:00',
        dateTime: '2027-06-20T18:30:00Z',
        venue: { id: 'KovZpZ1kk7lB', name: 'Stade de France', city: 'Saint-Denis', country: 'FR' },
        onsale: '2026-12-01T09:00:00Z',
      }),
    );
    tm.tables.attractions[MUSE][1].dates.start.dateTime = '2026-12-15T19:00:00Z';
    tm.tables.attractions[MUSE][1].dates.start.localDate = '2026-12-15';
    // The match leaves the answers: Ticketmaster says it is canceled.
    const match = tm.tables.nearby.pop();
    tm.tables.details[MATCH] = {
      ...structuredClone(match),
      dates: { ...match.dates, status: { code: 'canceled' } },
    };
    await later(app, clock, 13);

    const announced = eventsOf(gladys, TRIGGERS.ANNOUNCED);
    assert.equal(announced.length, 1);
    assert.deepEqual(
      [
        announced[0].data.event_id,
        announced[0].data.place,
        announced[0].data.attraction,
        announced[0].data.source,
      ],
      ['vvG1zZ9KdMuse3', 'Stade de France, Saint-Denis', 'Muse', 'artist'],
    );
    assert.equal(
      announced[0].data.text,
      'Nouvelle date : Muse, dimanche 20 juin 2027 à 20:30, Stade de France, Saint-Denis.',
    );
    const changed = eventsOf(gladys, TRIGGERS.CHANGED);
    assert.deepEqual(
      changed.map((event) => [event.data.event_id, event.data.change, event.data.previous_date]),
      [
        ['vvG1zZ9KdMuse2', 'date_changed', '2026-12-14'],
        [MATCH, 'canceled', '2026-12-06'],
      ],
    );
    // The canceled match stays in the calendar, its name says so.
    const nearby = lastEvents(gladys, ':john:nearby');
    assert.ok(nearby.events.some((event) => event.name === 'Annulé · PSG – OM'));
    for (const event of gladys.sceneEvents) {
      assert.ok(Object.keys(event.data).length <= 20, event.key);
      for (const value of Object.values(event.data)) {
        assert.ok(value === null || ['string', 'number', 'boolean'].includes(typeof value));
      }
    }

    // Gone from an answer, then back: not announced twice.
    const third = tm.tables.attractions[MUSE].pop();
    await later(app, clock, 13);
    tm.tables.attractions[MUSE].push(third);
    await later(app, clock, 13);
    assert.equal(eventsOf(gladys, TRIGGERS.ANNOUNCED).length, 1);
  } finally {
    cleanup();
  }
});

test('reminders at the hour of the configuration; sale openings at their minute', async () => {
  const { gladys, app, clock, cleanup } = await setup({
    config: { ...CONFIG, notify_hour: 9 },
    start: '2026-11-21T06:00:00Z', // 07:00 in Paris, a week before the opera
  });
  try {
    clock.set('2026-11-21T08:05:00Z'); // 09:05
    await app.tick();
    await app.tick();
    let reminders = eventsOf(gladys, TRIGGERS.REMINDER);
    assert.deepEqual(
      reminders.map((event) => [event.data.name, event.data.lead, event.data.time]),
      [['La Traviata', '7', '']],
    );
    assert.equal(
      reminders[0].data.text,
      'La Traviata : dans 7 jours, samedi 28 novembre 2026, Accor Arena, Paris.',
    );

    // The sale of the second concert of Muse: the day before, an hour before, at the opening.
    clock.set('2026-11-24T09:00:00Z');
    await app.tick();
    clock.set('2026-11-25T08:00:00Z');
    await app.tick();
    clock.set('2026-11-25T09:00:30Z');
    await app.tick();
    await app.tick();
    const sales = eventsOf(gladys, TRIGGERS.SALE);
    assert.deepEqual(
      sales.map((event) => [event.data.event_id, event.data.lead]),
      [
        ['vvG1zZ9KdMuse2', '1440'],
        ['vvG1zZ9KdMuse2', '60'],
        ['vvG1zZ9KdMuse2', '0'],
      ],
    );
    assert.equal(
      sales[0].data.text,
      'Mise en vente demain à 10:00 : Muse, lundi 14 décembre 2026 à 20:00.',
    );
    assert.equal(sales[2].data.text, 'Billetterie ouverte : Muse, lundi 14 décembre 2026 à 20:00.');
    reminders = eventsOf(gladys, TRIGGERS.REMINDER);
    assert.equal(reminders.length, 1, 'nothing else due');
  } finally {
    cleanup();
  }
});

test('configuration buttons: follow, namesakes, list, stop following', async () => {
  const tm = fakeTm({
    ...tables(),
    searchAttractions: {
      'Paris Saint-Germain': [rawAttraction(PSG, 'Paris Saint-Germain', 'Football')],
      Mus: [rawAttraction(MUSE, 'Muse')],
    },
    searchVenues: {
      'Accor Arena': [rawVenue(ARENA, 'Accor Arena', 'Paris')],
    },
    venues: {
      [ARENA]: [
        rawEvent({ id: MUSE_ARENA }),
        rawEvent({ id: 'vvG1zZ9KdArena2', name: 'Mylène Farmer', attractions: [] }),
      ],
    },
  });
  const { gladys, app, cleanup } = await setup({ tm });
  try {
    let ack = await gladys.action(ACTIONS.FOLLOW_ATTRACTION, { name: 'Paris Saint-Germain' });
    assert.equal(ack.success, true, ack.error);
    assert.equal(
      ack.data.message.fr,
      'Suivi : Paris Saint-Germain (Football). Ses dates arrivent avec la lecture en cours.',
    );
    ack = await gladys.action(ACTIONS.FOLLOW_VENUE, { name: 'Accor Arena' });
    assert.equal(ack.success, true, ack.error);
    assert.ok(tm.calls.includes('search-venues Accor Arena FR'));
    await app.idle();
    const calendars = gladys.publishedCalendars.at(-1).calendars.map((calendar) => calendar.name);
    assert.deepEqual(calendars, [
      'Mes artistes et équipes',
      'Mes salles',
      'Sorties autour de la maison',
    ]);
    assert.ok(
      lastEvents(gladys, ':john:venues').events.some((event) => event.name === 'Mylène Farmer'),
    );

    ack = await gladys.action(ACTIONS.FOLLOW_ATTRACTION, { name: 'Mus' });
    assert.equal(ack.success, false);
    ack = await gladys.action(ACTIONS.FOLLOW_ATTRACTION, { name: 'Muse' });
    assert.equal(ack.success, false, 'already followed');

    ack = await gladys.action(ACTIONS.LIST, {});
    assert.equal(
      ack.data.message.fr,
      [
        'Autour de la maison : 25 km, Musique, Spectacles, 90 jours à l’avance.',
        'Artistes et équipes suivis : 2',
        `• Muse (Rock) — ${MUSE}`,
        `• Paris Saint-Germain (Football) — ${PSG}`,
        'Dates des artistes et équipes suivis : FR.',
        'Salles suivies : 1',
        `• Accor Arena (Paris, FR) — ${ARENA}`,
      ].join('\n'),
    );

    ack = await gladys.action(ACTIONS.UNFOLLOW_VENUE, { name: 'accor arena' });
    assert.equal(ack.data.message.en, 'No longer followed: Accor Arena (Paris, FR).');
    await app.idle();
    assert.ok(
      gladys.deletedCalendars.some((id) => id.endsWith(':john:venues')),
      'its calendar goes',
    );
    ack = await gladys.action(ACTIONS.UNFOLLOW_ATTRACTION, { name: 'Olympia' });
    assert.equal(ack.success, false);
  } finally {
    cleanup();
  }
});

test('read again: the counts; a refused key, the daily quota', async () => {
  const { gladys, app, tm, clock, cleanup } = await setup();
  try {
    let ack = await gladys.action(ACTIONS.REFRESH, {});
    assert.equal(
      ack.data.message.fr,
      'Ticketmaster relu. Sorties à venir : 4 · mises en vente à venir : 1.',
    );

    tm.tables.nearby = tmError('quota', { resetAt: Date.parse('2026-11-23T23:00:00Z') });
    tm.pausedUntil = Date.parse('2026-11-23T23:00:00Z');
    ack = await gladys.action(ACTIONS.REFRESH, {});
    assert.equal(
      ack.data.message.fr,
      'Le quota quotidien de la clé est épuisé : réessayez après 00:00.',
    );
    assert.equal(
      gladys.connectionStatus.message.fr,
      'Quota quotidien de la clé épuisé : prochaine lecture à 00:00.',
    );
    // Nothing was lost.
    assert.equal(lastEvents(gladys, ':john:nearby').events.length, 2);

    tm.pausedUntil = 0;
    tm.tables.nearby = tables().nearby;
    tm.tables.attractions[MUSE] = tmError('auth', { status: 401 });
    tm.keyRefused = true;
    await later(app, clock, 2);
    ack = await gladys.action(ACTIONS.REFRESH, {});
    assert.equal(ack.data.message.fr, 'Ticketmaster refuse la clé d’API de la configuration.');
    assert.equal(gladys.connectionStatus.connected, false);
    assert.match(gladys.connectionStatus.message.fr, /^Ticketmaster refuse la clé d’API/);
  } finally {
    cleanup();
  }
});

test('no key: nothing is read, the status and the widgets say so', async () => {
  const tm = fakeTm(tables());
  const { gladys, cleanup } = await setup({ config: { attractions: ATTRACTIONS }, tm });
  try {
    assert.deepEqual(tm.calls, []);
    assert.equal(gladys.connectionStatus.connected, false);
    assert.match(gladys.connectionStatus.message.en, /^Enter your Ticketmaster API key/);
    const { content } = (await gladys.widgetGet(WIDGETS.UPCOMING)).data;
    assert.match(content.components[1].text.en, /^Enter your Ticketmaster API key/);
    const ack = await gladys.action(ACTIONS.FOLLOW_ATTRACTION, { name: 'Muse' });
    assert.equal(ack.success, false);
    assert.match(ack.error, /clé d’API|API key/);
  } finally {
    cleanup();
  }
});

test('a house without a position: "Around the house" is off and the status tells why', async () => {
  const tm = fakeTm(tables());
  const { gladys, cleanup } = await setup({ config: { ...CONFIG, house: 'cabin' }, tm });
  try {
    assert.ok(!tm.calls.some((call) => call.includes('geoPoint')));
    assert.match(
      gladys.connectionStatus.message.fr,
      /« Autour de la maison » est inactif : la maison n’a pas de position/,
    );
  } finally {
    cleanup();
  }
});

test('radius 0 and nothing followed: no request, no calendar, the widgets say what to do', async () => {
  const tm = fakeTm(tables());
  const { gladys, cleanup } = await setup({ config: { api_key: KEY, radius_km: '0' }, tm });
  try {
    assert.deepEqual(tm.calls, []);
    assert.equal(gladys.publishedCalendars.length, 0);
    assert.match(gladys.connectionStatus.message.en, /^Nothing followed/);
    const { content } = (await gladys.widgetGet(WIDGETS.NEXT)).data;
    assert.match(content.components[1].text.en, /^Nothing followed yet/);
  } finally {
    cleanup();
  }
});

test('widgets: valid contents in the four languages, filters, pictures by key', async () => {
  const { gladys, cleanup } = await setup();
  try {
    for (const key of Object.values(WIDGETS)) {
      for (const language of ['en', 'fr', 'de', 'es']) {
        const ack = await gladys.widgetGet(key, { language });
        assert.equal(ack.success, true, ack.error);
        const report = validateWidgetContent(ack.data.content);
        assert.deepEqual(report.errors ?? [], [], `${key} ${language}`);
        assert.deepEqual(report.warnings ?? [], [], `${key} ${language}`);
      }
    }
    let { content } = (await gladys.widgetGet(WIDGETS.UPCOMING, { language: 'fr' })).data;
    const list = content.components.find((component) => component.type === 'card-list');
    assert.deepEqual(
      list.items.map((item) => [item.title, item.subtitle.fr, item.badge.text.fr]),
      [
        ['La Traviata', 'sam 28 nov · Accor Arena', 'Spectacles'],
        ['PSG – OM', 'dim 6 déc · 21:00 · Parc des Princes', 'Sport'],
        ['Muse', 'sam 12 déc · 20:00 · Accor Arena', 'Musique'],
        ['Muse', 'lun 14 déc · 20:00 · Stade Vélodrome', 'Musique'],
      ],
    );
    assert.match(content.components[0].text.fr, /^Ticketmaster · lu à 09:00$/);
    assert.ok(list.items.every((item) => /^img-[a-z0-9]{20}$/.test(item.image)));
    ({ content } = (
      await gladys.widgetGet(WIDGETS.UPCOMING, { settings: { sources: ['artist'], count: '3' } })
    ).data);
    assert.deepEqual(
      content.components[1].items.map((item) => item.title),
      ['Muse', 'Muse'],
    );
    ({ content } = (await gladys.widgetGet(WIDGETS.NEXT, { language: 'fr' })).data);
    assert.equal(content.components[0].text, 'La Traviata');
    assert.equal(content.components[1].value.fr, '5 j');
    assert.equal(content.components[3].value, '—', 'no time announced');
    ({ content } = (await gladys.widgetGet(WIDGETS.ONSALE, { language: 'fr' })).data);
    assert.deepEqual(
      content.components[1].items.map((item) => [item.subtitle.fr]),
      [['Mise en vente : mer 25 nov à 10:00']],
    );
    const image = await gladys.widgetGetImage(list.items[0].image);
    assert.equal(image.data.image, 'iVBORw0KGgo=');
  } finally {
    cleanup();
  }
});

test('scene action: the next event, filtered, exactly the declared outputs', async () => {
  const { gladys, cleanup } = await setup();
  try {
    let ack = await gladys.sceneAction(SCENE_ACTIONS.NEXT, {});
    assert.equal(ack.success, true, ack.error);
    assert.deepEqual(Object.keys(ack.data.outputs).sort(), [...SHOW_OUTPUTS].sort());
    assert.equal(ack.data.outputs.name, 'La Traviata');
    ack = await gladys.sceneAction(SCENE_ACTIONS.NEXT, { segment: ['sports'] });
    assert.deepEqual([ack.data.outputs.name, ack.data.outputs.days], ['PSG – OM', 13]);
    ack = await gladys.sceneAction(SCENE_ACTIONS.NEXT, { source: ['artist'], attraction: 'Muse' });
    assert.equal(ack.data.outputs.place, 'Accor Arena, Paris');
    assert.equal(
      ack.data.outputs.text,
      'Muse : dans 19 jours, samedi 12 décembre 2026 à 20:00, Accor Arena, Paris.',
    );
    ack = await gladys.sceneAction(SCENE_ACTIONS.NEXT, { segment: ['film'] });
    assert.deepEqual([ack.data.outputs.found, ack.data.outputs.days], [false, -1]);
  } finally {
    cleanup();
  }
});

test('the state survives a restart: no new baseline, nothing announced twice', async () => {
  const { gladys, app, tm, clock, store, cleanup } = await setup();
  try {
    store.flush();
    app.stop();
    const restarted = createApp(
      createFakeGladys({ config: CONFIG, calendarAccounts: [JOHN], houses: HOUSES }),
      {
        tm,
        store,
        images: { keyOf: () => null, get: async () => '', prune: () => {} },
        now: clock.now,
        timeZone: TZ,
        sleep: async () => {},
        logger: silentLogger,
      },
    );
    assert.equal(Object.keys(restarted.store.data.shows).length, 4);
    assert.equal(gladys.sceneEvents.length, 0);
  } finally {
    cleanup();
  }
});
