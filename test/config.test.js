// The raw configuration of Gladys -> the normalized one, and the pictures.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { normalizeConfig, readKeys, textLanguage } from '../src/config.js';
import { createImages, imageKeyOf, isAllowedUrl, isImage } from '../src/images.js';
import { tempStore } from './helpers.js';

test('defaults: no key, first house, 25 km, music and arts, 3 months, France, 12 h, 9:00', () => {
  assert.deepEqual(normalizeConfig({}), {
    apiKey: '',
    house: '',
    radiusKm: 25,
    segments: ['music', 'arts'],
    nearbyDays: 90,
    followedCountry: 'FR',
    intervalHours: 12,
    notifyHour: 9,
    language: 'auto',
    lastLanguage: 'en',
  });
});

test('values from the UI (strings), invalid ones fall back', () => {
  const config = normalizeConfig({
    api_key: '  abc  ',
    house: 'home',
    radius_km: '0',
    segments: ['sports', 'nope'],
    nearby_days: '365',
    followed_country: 'all',
    interval_hours: '6',
    notify_hour: 0,
    language: 'de',
    last_language: 'fr',
  });
  assert.deepEqual(
    [config.apiKey, config.radiusKm, config.segments, config.nearbyDays, config.followedCountry],
    ['abc', 0, ['sports'], 365, 'all'],
  );
  assert.deepEqual([config.intervalHours, config.notifyHour, textLanguage(config)], [6, 0, 'de']);
  const bad = normalizeConfig({
    radius_km: '7',
    followed_country: 'XX',
    notify_hour: '',
    interval_hours: '',
  });
  assert.deepEqual(
    [bad.radiusKm, bad.followedCountry, bad.notifyHour, bad.intervalHours],
    [25, 'FR', 9, 12],
  );
  assert.equal(textLanguage(normalizeConfig({ last_language: 'es' })), 'es');
  assert.deepEqual(readKeys('["film","music"]', ['music', 'film'], []), ['music', 'film']);
  assert.deepEqual(readKeys('film, sports', ['music', 'film', 'sports'], []), ['film', 'sports']);
});

test('pictures: lower-case keys, ticketm.net only, checked bytes, a key known after a restart', async () => {
  const url = 'https://s1.ticketm.net/dam/a/abc/RETINA_PORTRAIT_16_9.jpg';
  assert.match(imageKeyOf(url), /^img-[0-9a-f]{20}$/);
  assert.ok(isAllowedUrl(url));
  assert.ok(!isAllowedUrl('http://s1.ticketm.net/a.jpg'));
  assert.ok(!isAllowedUrl('https://evil.example/ticketm.net.jpg'));
  assert.ok(!isAllowedUrl('https://ticketm.net.evil.example/a.jpg'));
  const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(20)]);
  assert.ok(isImage(jpeg));
  assert.ok(!isImage(Buffer.from('<html>not an image</html>')));

  const { store, cleanup } = tempStore();
  try {
    let fetched = 0;
    const fetch = async (address) => {
      fetched += 1;
      return {
        ok: true,
        status: 200,
        url: address,
        arrayBuffer: async () => jpeg,
      };
    };
    const images = createImages({ store, fetch });
    const key = images.keyOf({ image: url });
    assert.equal(key, imageKeyOf(url));
    assert.equal(images.keyOf({ image: 'https://elsewhere.example/a.jpg' }), null);
    assert.equal(await images.get(key), jpeg.toString('base64'));
    await images.get(key);
    assert.equal(fetched, 1, 'kept in memory');
    await assert.rejects(images.get('img-00000000000000000000'), /unknown image/);
    await assert.rejects(images.get('../../etc/passwd'), /unknown image/);
    // Another process with the same state file knows the key.
    const again = createImages({ store, fetch });
    assert.equal(await again.get(key), jpeg.toString('base64'));
    images.prune([]);
    await assert.rejects(images.get(key), /unknown image/);
  } finally {
    cleanup();
  }
});

test('pictures: a redirect elsewhere or a page instead of an image is refused', async () => {
  const { store, cleanup } = tempStore();
  try {
    const url = 'https://s1.ticketm.net/dam/a/x.jpg';
    const redirected = createImages({
      store,
      fetch: async () => ({
        ok: true,
        status: 200,
        url: 'https://evil.example/x.jpg',
        arrayBuffer: async () => Buffer.alloc(0),
      }),
    });
    await assert.rejects(redirected.get(redirected.keyOf({ image: url })), /unexpected host/);
    const html = createImages({
      store,
      fetch: async () => ({
        ok: true,
        status: 200,
        url,
        arrayBuffer: async () => Buffer.from('<html></html>'),
      }),
    });
    await assert.rejects(html.get(html.keyOf({ image: url })), /not a usable image/);
  } finally {
    cleanup();
  }
});
