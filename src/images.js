// -----------------------------------------------------------------------------
// The images of the widgets: the pictures Ticketmaster gives with each event
// (16:9, about 640 px wide), shown for that event only.
//
// The browser never loads a third-party URL: a widget refers to an image by a
// key, Gladys asks the integration for its bytes and caches them one hour. A
// key is `img-` and 20 hexadecimal characters of the SHA-256 of the address
// (the keys of Gladys are lower case, the Ticketmaster ids are not); the
// address behind each key is kept in /data (`images`) for the images of the
// shows kept, so a key still works after a restart.
//
// Checked before it goes out: an address of Ticketmaster's image servers
// (ticketm.net), a JPEG, PNG or WebP by its magic number, 300 KB at most.
// The last 60 images stay in memory.
// -----------------------------------------------------------------------------

import { createHash } from 'node:crypto';

const MAX_BYTES = 300 * 1024;
const CACHE_SIZE = 60;
const TIMEOUT_MS = 20 * 1000;
const KEY_REGEX = /^img-[0-9a-f]{20}$/;
const HOSTS = /(^|\.)ticketm\.net$/;

/**
 * @description The widget image key of an address.
 * @param {string} url - The address of the image.
 * @returns {string} The key.
 */
const imageKeyOf = (url) =>
  `img-${createHash('sha256').update(String(url)).digest('hex').slice(0, 20)}`;

/**
 * @description Whether an address may be fetched.
 * @param {unknown} url - An address.
 * @returns {boolean} True for an https address of ticketm.net.
 */
function isAllowedUrl(url) {
  try {
    const parsed = new URL(String(url));
    return parsed.protocol === 'https:' && HOSTS.test(parsed.hostname);
  } catch {
    return false;
  }
}

/**
 * @description Whether some bytes are a JPEG, PNG or WebP image.
 * @param {Buffer} bytes - The bytes.
 * @returns {boolean} True for one of the three.
 */
function isImage(bytes) {
  if (bytes.length < 12) {
    return false;
  }
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const png = bytes
    .subarray(0, 8)
    .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const webp =
    bytes.subarray(0, 4).toString('latin1') === 'RIFF' &&
    bytes.subarray(8, 12).toString('latin1') === 'WEBP';
  return jpeg || png || webp;
}

/**
 * @description Create the image provider.
 * @param {object} options - `{ store, fetch, userAgent }`.
 * @returns {{ keyOf: Function, get: Function, prune: Function }} The provider.
 */
function createImages({
  store,
  fetch = globalThis.fetch,
  userAgent = 'gladys-ticketmaster (+https://github.com/William-De71/gladys-ticketmaster)',
}) {
  const cache = new Map();
  const known = store.data.images;

  const remember = (key, value) => {
    cache.delete(key);
    cache.set(key, value);
    if (cache.size > CACHE_SIZE) {
      cache.delete(cache.keys().next().value);
    }
  };

  return {
    /**
     * @description The key of the image of a show, remembered for `get`.
     * @param {object} show - A show.
     * @returns {string|null} The key, null without a usable image.
     */
    keyOf(show) {
      if (!isAllowedUrl(show?.image)) {
        return null;
      }
      const key = imageKeyOf(show.image);
      if (known[key] !== show.image) {
        known[key] = show.image;
        store.changed();
      }
      return key;
    },
    /**
     * @param {string} key - A widget image key.
     * @returns {Promise<string>} The raw base64 of the image.
     */
    async get(key) {
      const url = KEY_REGEX.test(String(key)) ? known[key] : undefined;
      if (!url || !isAllowedUrl(url)) {
        throw new Error(`unknown image ${key}`);
      }
      if (cache.has(key)) {
        const value = cache.get(key);
        remember(key, value);
        return value;
      }
      const response = await fetch(url, {
        headers: { 'user-agent': userAgent },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!response.ok) {
        throw new Error(`image ${key}: HTTP ${response.status}`);
      }
      if (response.url && !isAllowedUrl(response.url)) {
        throw new Error(`image ${key}: unexpected host`);
      }
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length > MAX_BYTES || !isImage(bytes)) {
        throw new Error(`image ${key}: not a usable image (${bytes.length} bytes)`);
      }
      const value = bytes.toString('base64');
      remember(key, value);
      return value;
    },
    /**
     * @description Forget the images of the shows no longer kept.
     * @param {object[]} shows - Every show kept.
     */
    prune(shows) {
      const used = new Set(shows.filter((show) => show.image).map((show) => show.image));
      for (const [key, url] of Object.entries(known)) {
        if (!used.has(url)) {
          delete known[key];
          cache.delete(key);
          store.changed();
        }
      }
    },
  };
}

export { MAX_BYTES, KEY_REGEX, imageKeyOf, isAllowedUrl, isImage, createImages };
