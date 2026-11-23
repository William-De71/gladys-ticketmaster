// What a typed name or identifier means, and the registries kept in the
// configuration of Gladys.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';

import {
  KINDS,
  MAX_FOLLOWED,
  createRegistry,
  parseStored,
  readTmId,
  resolveEntry,
} from '../src/follows.js';
import { ARENA, MUSE, ZENITH, fakeTm, rawAttraction, rawVenue } from './helpers.js';

const tm = () =>
  fakeTm({
    searchAttractions: {
      Muse: [rawAttraction('K8vZ9171ob7', 'Muse Tribute'), rawAttraction(MUSE, 'Muse')],
      muse: [rawAttraction(MUSE, 'Muse')],
      Mus: [rawAttraction(MUSE, 'Muse'), rawAttraction('K8vZ9171ob7', 'Muse Tribute')],
      Blink182: [rawAttraction('K8vZ9171ooV', 'Blink-182', 'Punk')],
    },
    searchVenues: {
      Zénith: [
        rawVenue(ZENITH, 'Zénith', 'Lille'),
        rawVenue('Z598xZG2ZeF7e', 'Zenith', 'Nantes'),
        rawVenue('Z598xZG2ZeF7a', 'Zénith Arena', 'Lille'),
      ],
      'Accor Arena': [rawVenue(ARENA, 'Accor Arena', 'Paris')],
    },
  });

test('identifiers: bare, or at the end of an address; names stay names', () => {
  assert.equal(readTmId('K8vZ917Gku7'), 'K8vZ917Gku7');
  assert.equal(
    readTmId(' https://www.ticketmaster.com/muse-tickets/artist/K8vZ917Gku7 '),
    'K8vZ917Gku7',
  );
  assert.equal(readTmId('KovZpZA7AAEA'), 'KovZpZA7AAEA');
  assert.equal(readTmId('Muse'), '');
  assert.equal(readTmId('Blink182'), '', 'one word with digits is still a name');
  assert.equal(readTmId('Kraftwerk'), '', 'no digit: a name');
});

test('a name: the answer of exactly that name, without case nor accents', async () => {
  const client = tm();
  const { entry, namesakes } = await resolveEntry(client, KINDS.ATTRACTION, 'muse');
  assert.deepEqual(entry, { id: MUSE, name: 'Muse', info: 'Rock' });
  assert.deepEqual(namesakes, []);
  const venue = await resolveEntry(client, KINDS.VENUE, 'Zénith', { countryCode: 'FR' });
  assert.equal(venue.entry.id, ZENITH);
  assert.equal(venue.entry.info, 'Lille, FR');
  assert.deepEqual(
    venue.namesakes.map((other) => other.id),
    ['Z598xZG2ZeF7e'],
    'namesakes are listed',
  );
  assert.ok(client.calls.includes('search-venues Zénith FR'));
});

test('no exact name: nothing guessed, the nearest answers with their identifiers', async () => {
  await assert.rejects(resolveEntry(tm(), KINDS.ATTRACTION, 'Mus'), (error) => {
    assert.equal(error.key, 'followNotFoundSuggest');
    assert.match(error.params.suggestions, /Muse \(Rock\): K8vZ917Gku7/);
    return true;
  });
  await assert.rejects(resolveEntry(tm(), KINDS.ATTRACTION, 'Nobody'), { key: 'followNotFound' });
  await assert.rejects(resolveEntry(tm(), KINDS.ATTRACTION, '  '), { key: 'followMissing' });
});

test('an identifier is looked up; unknown in an address: an error, bare: searched as a name', async () => {
  const client = tm();
  const { entry } = await resolveEntry(client, KINDS.ATTRACTION, MUSE);
  assert.equal(entry.name, 'Muse');
  assert.deepEqual(client.calls, [`attraction ${MUSE}`]);
  await assert.rejects(
    resolveEntry(client, KINDS.VENUE, 'https://www.ticketmaster.fr/venue/KovZpZA7XXX9'),
    { key: 'followUnknownId' },
  );
  await assert.rejects(resolveEntry(client, KINDS.VENUE, 'KovZpZA7XXX9'), {
    key: 'followNotFound',
  });
  assert.deepEqual(client.calls.slice(-2), ['venue KovZpZA7XXX9', 'search-venues KovZpZA7XXX9']);
});

test('registries: saved in the configuration, no duplicate, a limit, removal by name or id', async () => {
  const gladys = createFakeGladys({ config: {} });
  await gladys.connect();
  const registry = createRegistry(gladys, KINDS.VENUE);
  registry.load({});
  await registry.add({ id: ARENA, name: 'Accor Arena', info: 'Paris, FR' });
  await registry.add({ id: ZENITH, name: 'Zénith', info: 'Lille, FR' });
  await registry.add({ id: 'Z598xZG2ZeF7e', name: 'Zenith', info: 'Nantes, FR' });
  assert.deepEqual(JSON.parse(gladys.fake.config.venues).length, 3);
  await assert.rejects(registry.add({ id: ARENA, name: 'Accor Arena', info: '' }), {
    key: 'followAlready',
  });
  await assert.rejects(registry.remove('zenith'), (error) => {
    assert.equal(error.key, 'followAmbiguous');
    assert.match(error.params.list, /Zénith \(Lille, FR\): Z598xZG2ZeF7k/);
    return true;
  });
  assert.equal((await registry.remove(ZENITH)).name, 'Zénith');
  assert.equal((await registry.remove('accor arena')).id, ARENA);
  await assert.rejects(registry.remove('Olympia'), { key: 'followNotFollowed' });
  assert.deepEqual(
    registry.list().map((entry) => entry.id),
    ['Z598xZG2ZeF7e'],
  );
});

test('stored lists: invalid entries and duplicates dropped, bounded', () => {
  assert.deepEqual(
    parseStored(
      JSON.stringify([
        { id: MUSE, name: 'Muse', info: 'Rock' },
        { id: MUSE, name: 'Muse again' },
        { id: 'a b', name: 'Bad' },
        { name: 'No id' },
      ]),
      MAX_FOLLOWED.attraction,
    ),
    [{ id: MUSE, name: 'Muse', info: 'Rock' }],
  );
  assert.deepEqual(parseStored('not json', 10), []);
  const many = Array.from({ length: 120 }, (_, i) => ({
    id: `K8vZ91${String(i).padStart(5, '0')}`,
    name: `A${i}`,
  }));
  assert.equal(parseStored(many, MAX_FOLLOWED.attraction).length, 100);
});
