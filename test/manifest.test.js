// The manifest against the code: the keys it declares are the ones the code
// handles, the store limits hold, the transport and permissions are right.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';

import { ACTIONS, SCENE_ACTIONS } from '../src/app.js';
import {
  AUTO_LANGUAGE,
  COUNTRIES,
  DEFAULT_COUNTRY,
  DEFAULT_INTERVAL,
  DEFAULT_NEARBY_DAYS,
  DEFAULT_NOTIFY_HOUR,
  DEFAULT_RADIUS,
  INTERNAL_KEYS,
  INTERVALS,
  NEARBY_DAYS,
  RADII,
  normalizeConfig,
} from '../src/config.js';
import { CHANGES, REMINDER_LEADS, SALE_LEADS, SHOW_OUTPUTS, TRIGGERS } from '../src/events.js';
import { LANGUAGES } from '../src/i18n.js';
import { DEFAULT_SEGMENTS, SEGMENTS, SOURCES } from '../src/shows.js';
import { COUNTS, DEFAULT_COUNT, WIDGETS } from '../src/widgets.js';

const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const manifest = read('../gladys-assistant-integration.json');
const pkg = read('../package.json');
const byKey = (list) => new Map(list.map((entry) => [entry.key, entry]));
const values = (field) => field.options.map((option) => option.value);
const source = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('a calendar integration, in lockstep with package.json, at 0.x until 1.0.0 is decided', () => {
  assert.equal(manifest.type, 'calendar');
  assert.equal(manifest.name, 'Ticketmaster');
  assert.equal(manifest.version, pkg.version);
  assert.equal(manifest.docker_image, `ghcr.io/william-de71/gladys-ticketmaster:${pkg.version}`);
  assert.equal(
    manifest.cover_image,
    'https://raw.githubusercontent.com/William-De71/gladys-ticketmaster/main/cover.jpg',
  );
  assert.equal(pkg.license, 'Apache-2.0');
  assert.equal(pkg.name, 'gladys-ticketmaster');
  assert.deepEqual(Object.keys(pkg.dependencies), ['@gladysassistant/integration-sdk']);
});

test('the cloud transport only: the Discovery API and its image servers', () => {
  assert.deepEqual(manifest.transports, ['cloud']);
  assert.doesNotMatch(source('../src/app.js'), /publishTransports|GLADYS_PREFER_LOCAL/);
  assert.match(
    source('../src/ticketmaster.js'),
    /'https:\/\/app\.ticketmaster\.com\/discovery\/v2'/,
  );
  assert.match(source('../src/images.js'), /ticketm\\\.net/);
});

test('Gladys 5.3.0; the location of the houses and nothing else', () => {
  assert.equal(manifest.gladys_version, '>=5.3.0');
  assert.equal(manifest.location, true, 'getHouses() needs it');
  assert.match(source('../src/app.js'), /getHouses\(\)/);
  for (const key of [
    'network_wake',
    'containers',
    'network_discovery',
    'webhooks',
    'account_schema',
    'music',
  ]) {
    assert.equal(manifest[key], undefined, key);
  }
  assert.doesNotMatch(source('../src/app.js'), /publishDiscoveredDevices|onSetValue|onPoll/);
});

test('declares exactly the buttons, scene triggers, actions and widgets the code handles', () => {
  assert.deepEqual(
    manifest.actions.map((action) => action.key).sort(),
    Object.values(ACTIONS).sort(),
  );
  assert.deepEqual(
    manifest.scene_triggers.map((trigger) => trigger.key).sort(),
    Object.values(TRIGGERS).sort(),
  );
  assert.deepEqual(
    manifest.scene_actions.map((action) => action.key).sort(),
    Object.values(SCENE_ACTIONS).sort(),
  );
  assert.deepEqual(
    manifest.widgets.map((widget) => widget.key).sort(),
    Object.values(WIDGETS).sort(),
  );
  const app = source('../src/app.js');
  for (const key of Object.keys(WIDGETS)) {
    assert.match(app, new RegExp(`widget\\(WIDGETS\\.${key},`), key);
  }
  for (const key of Object.keys(SCENE_ACTIONS)) {
    assert.match(app, new RegExp(`onSceneAction\\(SCENE_ACTIONS\\.${key}`), key);
  }
  for (const key of Object.keys(ACTIONS)) {
    assert.match(app, new RegExp(`onAction\\(ACTIONS\\.${key}`), key);
  }
  for (const action of manifest.actions) {
    assert.ok(action.timeout_seconds >= 5 && action.timeout_seconds <= 120, action.key);
  }
});

test('the configuration of the code: key, house, radius, categories, country, reading, hour, language', () => {
  const config = byKey(manifest.config_schema);
  assert.deepEqual([config.get('api_key').type, config.get('api_key').required], ['secret', true]);
  assert.deepEqual([config.get('house').type, config.get('house').source], ['select', 'houses']);
  assert.deepEqual(values(config.get('radius_km')), RADII.map(String));
  assert.equal(config.get('radius_km').default, String(DEFAULT_RADIUS));
  assert.deepEqual(values(config.get('segments')), SEGMENTS);
  assert.deepEqual(config.get('segments').default, DEFAULT_SEGMENTS);
  assert.deepEqual(values(config.get('nearby_days')), NEARBY_DAYS.map(String));
  assert.equal(config.get('nearby_days').default, String(DEFAULT_NEARBY_DAYS));
  assert.deepEqual(values(config.get('followed_country')), ['all', ...COUNTRIES]);
  assert.equal(config.get('followed_country').default, DEFAULT_COUNTRY);
  assert.deepEqual(values(config.get('interval_hours')), INTERVALS.map(String));
  assert.equal(config.get('interval_hours').default, String(DEFAULT_INTERVAL));
  const hour = config.get('notify_hour');
  assert.deepEqual(
    [hour.type, hour.min, hour.max, hour.default],
    ['number', 0, 23, DEFAULT_NOTIFY_HOUR],
  );
  for (const key of Object.values(INTERNAL_KEYS)) {
    assert.equal(config.get(key), undefined, `${key}: internal key, never shown`);
  }
  for (const field of manifest.config_schema) {
    assert.ok(!['text', 'password'].includes(field.type), `${field.key}: ${field.type}`);
    if (field.placeholder) {
      assert.deepEqual(Object.keys(field.placeholder).sort(), [...LANGUAGES].sort(), field.key);
    }
  }
  // The defaults of the manifest are the defaults of the code.
  const defaults = normalizeConfig({});
  assert.equal(String(defaults.radiusKm), config.get('radius_km').default);
  assert.deepEqual(defaults.segments, config.get('segments').default);
  assert.equal(String(defaults.nearbyDays), config.get('nearby_days').default);
  assert.equal(defaults.followedCountry, config.get('followed_country').default);
  assert.equal(String(defaults.intervalHours), config.get('interval_hours').default);
  assert.equal(defaults.notifyHour, hour.default);
  // Every key the code reads is declared.
  for (const [, key] of source('../src/config.js').matchAll(/\braw\.([a-z_]+)\b(?!\()/g)) {
    assert.ok(config.has(key), `raw.${key} is a field of the config_schema`);
  }
});

test('every filter is a key of its event; the options are the keys of the code', () => {
  const triggers = byKey(manifest.scene_triggers);
  for (const trigger of manifest.scene_triggers) {
    const fields = byKey(trigger.fields);
    assert.deepEqual(values(fields.get('source')), SOURCES, trigger.key);
    assert.deepEqual(values(fields.get('segment')), SEGMENTS, trigger.key);
    assert.equal(fields.get('attraction').type, 'string', trigger.key);
    for (const key of fields.keys()) {
      assert.ok(
        byKey(trigger.variables).has(key),
        `${trigger.key}: the filter ${key} is a key of the event`,
      );
    }
    assert.ok(trigger.variables.length <= 20, trigger.key);
  }
  const reminder = byKey(triggers.get(TRIGGERS.REMINDER).fields).get('lead');
  assert.deepEqual(values(reminder), REMINDER_LEADS);
  assert.deepEqual([reminder.required, reminder.default], [true, '0']);
  const sale = byKey(triggers.get(TRIGGERS.SALE).fields).get('lead');
  assert.deepEqual(values(sale), SALE_LEADS);
  assert.deepEqual([sale.required, sale.default], [true, '0']);
  assert.deepEqual(values(byKey(triggers.get(TRIGGERS.CHANGED).fields).get('change')), CHANGES);
  for (const action of manifest.scene_actions) {
    assert.deepEqual(action.outputs.map((output) => output.key).sort(), [...SHOW_OUTPUTS].sort());
    assert.deepEqual(values(byKey(action.fields).get('source')), SOURCES);
    assert.deepEqual(values(byKey(action.fields).get('segment')), SEGMENTS);
  }
  for (const widget of manifest.widgets) {
    const settings = byKey(widget.settings);
    assert.deepEqual(values(settings.get('sources')), SOURCES, widget.key);
    assert.deepEqual(values(settings.get('segments')), SEGMENTS, widget.key);
    if (settings.has('count')) {
      assert.deepEqual(values(settings.get('count')), COUNTS.map(String));
      assert.equal(settings.get('count').default, String(DEFAULT_COUNT));
    }
  }
});

test('the scene variables the code sends are the ones declared', async () => {
  const { showData } = await import('../src/events.js');
  const { toShow } = await import('../src/shows.js');
  const { rawEvent } = await import('./helpers.js');
  const data = showData(
    { ...toShow(rawEvent()), sources: ['nearby'] },
    {
      today: '2026-11-23',
      language: 'en',
      followed: new Set(),
    },
  );
  const base = [...Object.keys(data), 'text'].sort();
  const extra = {
    [TRIGGERS.ANNOUNCED]: [],
    [TRIGGERS.REMINDER]: ['lead'],
    [TRIGGERS.SALE]: ['lead'],
    [TRIGGERS.CHANGED]: ['change', 'previous_date'],
  };
  for (const trigger of manifest.scene_triggers) {
    assert.deepEqual(
      trigger.variables.map((variable) => variable.key).sort(),
      [...base, ...extra[trigger.key]].sort(),
      trigger.key,
    );
  }
});

test('limits of the store: counts, timeouts, sizes, no secret in widget settings', () => {
  assert.ok(manifest.widgets.length >= 1 && manifest.widgets.length <= 5);
  assert.ok(manifest.actions.length <= 10);
  for (const action of manifest.scene_actions) {
    assert.ok(action.timeout_seconds >= 5 && action.timeout_seconds <= 120, action.key);
    assert.ok(
      (action.fields ?? []).length <= 10 && (action.outputs ?? []).length <= 20,
      action.key,
    );
  }
  for (const widget of manifest.widgets) {
    assert.ok((widget.settings ?? []).length <= 10);
    for (const setting of widget.settings ?? []) {
      assert.ok(!['secret', 'oauth2', 'account_link'].includes(setting.type));
    }
  }
  const size = statSync(new URL('../gladys-assistant-integration.json', import.meta.url)).size;
  assert.ok(size < 100 * 1024, `${size} bytes`);
  const cover = readFileSync(new URL('../cover.jpg', import.meta.url));
  assert.ok(cover.length < 150 * 1024, `cover.jpg: ${cover.length} bytes`);
  assert.equal(cover.readUInt16BE(0), 0xffd8, 'cover.jpg is a JPEG');
});

test('offers the languages of the code, automatic by default', () => {
  const field = byKey(manifest.config_schema).get('language');
  assert.deepEqual(values(field), [AUTO_LANGUAGE, ...LANGUAGES]);
  assert.equal(field.default, AUTO_LANGUAGE);
});

test('catalog fields of Gladys 5.3: search keywords, available worldwide', () => {
  assert.ok(manifest.keywords.length >= 1 && manifest.keywords.length <= 10);
  for (const keyword of manifest.keywords) {
    assert.ok(keyword.length <= 30 && keyword.trim().length >= 2, keyword);
  }
  const normalized = manifest.keywords.map((keyword) => keyword.trim().toLowerCase());
  assert.equal(new Set(normalized).size, normalized.length);
  assert.ok(!normalized.includes(manifest.name.toLowerCase()));
  assert.equal(manifest.countries, undefined);
});
