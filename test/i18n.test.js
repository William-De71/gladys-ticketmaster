// Four languages everywhere: the manifest, the runtime texts, the docs.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

import {
  LANGUAGES,
  SEGMENT_NAMES,
  SOURCE_NAMES,
  STATUS_NAMES,
  TEXTS,
  all,
  priceText,
  saleText,
  showDateText,
  t,
} from '../src/i18n.js';
import { SEGMENTS, SOURCES, STATUSES } from '../src/shows.js';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const manifest = JSON.parse(read('../gladys-assistant-integration.json'));

/**
 * @description Every multi-language object of the manifest, with its path.
 * @param {unknown} node - A manifest node.
 * @param {string} path - Its path.
 * @returns {Array<[string, object]>} The texts.
 */
function texts(node, path = '') {
  if (Array.isArray(node)) {
    return node.flatMap((child, i) => texts(child, `${path}[${i}]`));
  }
  if (node && typeof node === 'object') {
    if (typeof node.en === 'string') {
      return [[path, node]];
    }
    return Object.entries(node).flatMap(([key, child]) => texts(child, `${path}.${key}`));
  }
  return [];
}

test('every manifest text has 4 languages', () => {
  const found = texts(manifest);
  assert.ok(found.length > 100);
  for (const [path, text] of found) {
    assert.deepEqual(Object.keys(text).sort(), [...LANGUAGES].sort(), path);
    for (const language of LANGUAGES) {
      assert.ok(text[language]?.trim(), `${path}.${language} is missing`);
    }
  }
});

test('catalog description: 10 to 100 characters per language', () => {
  for (const language of LANGUAGES) {
    const { length } = manifest.description[language];
    assert.ok(length >= 10 && length <= 100, `description.${language}: ${length}`);
  }
});

test('widget labels: 3 to 30 characters, descriptions: 100 at most, per language', () => {
  for (const widget of manifest.widgets) {
    for (const language of LANGUAGES) {
      const { length } = widget.label[language];
      assert.ok(length >= 3 && length <= 30, `${widget.key}.label.${language}: ${length}`);
      const size = widget.description[language].length;
      assert.ok(size <= 100, `${widget.key}.description.${language}: ${size}`);
    }
  }
});

test('every runtime text exists in the four languages, with the same placeholders', () => {
  const placeholders = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
  for (const [key, entry] of Object.entries(TEXTS)) {
    for (const language of LANGUAGES) {
      assert.ok(entry[language], `${key}.${language} is missing`);
      assert.deepEqual(placeholders(entry[language]), placeholders(entry.en), `${key}.${language}`);
    }
  }
  assert.equal(t('tileTime', 'it'), 'Time', 'English fallback');
  for (const language of LANGUAGES) {
    for (const segment of SEGMENTS) {
      assert.ok(SEGMENT_NAMES[segment]?.[language], `segment ${segment}.${language}`);
      assert.ok(SEGMENT_NAMES[segment][language].length <= 16, 'fits a badge');
    }
    for (const status of STATUSES) {
      assert.ok(STATUS_NAMES[status]?.[language], `status ${status}.${language}`);
      assert.ok(STATUS_NAMES[status][language].length <= 16, 'fits a badge');
    }
    for (const source of SOURCES) {
      assert.ok(SOURCE_NAMES[source]?.[language], `source ${source}.${language}`);
    }
  }
});

test('connection messages stay within the 200 characters of the core', () => {
  const values = { shows: 1234, sales: 99, time: '23:00', error: 'x'.repeat(80) };
  for (const key of Object.keys(TEXTS).filter((name) => name.startsWith('status'))) {
    for (const [language, text] of Object.entries(
      all(key, { ...values, status: 'y'.repeat(60) }),
    )) {
      assert.ok(text.length <= 200, `${key}.${language}: ${text.length}`);
    }
  }
});

test('dates, sales and prices in each language', () => {
  const show = { date: '2026-12-12', time: '20:00' };
  assert.equal(showDateText(show, 'en'), 'Saturday 12 December 2026, 20:00');
  assert.equal(showDateText(show, 'fr'), 'samedi 12 décembre 2026 à 20:00');
  assert.equal(showDateText(show, 'de'), 'Samstag 12. Dezember 2026, 20:00 Uhr');
  assert.equal(showDateText({ date: null }, 'es'), 'Fecha por anunciar');
  assert.equal(
    saleText('2026-11-20T09:00:00Z', 'en', 'Europe/Paris'),
    'Public sale: Fri 20 Nov, 10:00',
  );
  assert.equal(saleText('nope', 'en'), '');
  assert.match(
    priceText({ min: 45, max: 89, currency: 'EUR' }, 'en'),
    /^Prices: €45\.00 to €89\.00$/,
  );
  assert.match(priceText({ min: 30, max: 30, currency: 'GBP' }, 'fr'), /^Prix : 30,00\s£GB$/);
  assert.equal(priceText({ min: 30, max: 30, currency: 'bad' }, 'fr'), '');
});

test('the documentation and the readmes exist in the four languages', () => {
  for (const language of LANGUAGES) {
    assert.ok(
      existsSync(new URL(`../docs/${language}.md`, import.meta.url)),
      `docs/${language}.md`,
    );
    const readme = language === 'en' ? '../README.md' : `../README.${language}.md`;
    assert.ok(existsSync(new URL(readme, import.meta.url)), readme);
  }
});

test('the four docs share their structure; docs and readmes show the widgets of their language', () => {
  const levels = (text) => [...text.matchAll(/^(#+) /gm)].map((match) => match[1].length);
  const english = levels(read('../docs/en.md'));
  for (const language of LANGUAGES) {
    const doc = read(`../docs/${language}.md`);
    assert.ok(doc.length > 300, `docs/${language}.md`);
    assert.deepEqual(levels(doc), english, `docs/${language}.md: same headings`);
    assert.ok(
      doc.includes(
        `https://raw.githubusercontent.com/William-De71/gladys-ticketmaster/main/docs/assets/widgets.${language}.png`,
      ),
      `docs/${language}.md shows its widgets`,
    );
    assert.doesNotMatch(doc, /cover\.jpg/, 'the store already shows the cover');
    const readme = read(language === 'en' ? '../README.md' : `../README.${language}.md`);
    assert.ok(readme.includes(`(docs/assets/widgets.${language}.png)`), `README ${language}`);
    assert.match(readme, /^!\[Ticketmaster (for|pour|für|para) Gladys Assistant\]\(cover\.jpg\)$/m);
    assert.ok(existsSync(new URL(`../docs/assets/widgets.${language}.png`, import.meta.url)));
  }
});
