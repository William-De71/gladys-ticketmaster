// -----------------------------------------------------------------------------
// What the integration keeps across restarts, in /data/state.json (the only
// writable place of the container):
//   - `shows`   the shows read, by Ticketmaster id (src/shows.js);
//   - `seen`    every show id ever read -> the last day it was: a show that
//               leaves the answers and comes back is not "announced" twice;
//   - `read`    every source read at least once -> `{ sig, day }`: the first
//               reading of a source (or of a changed one: another radius,
//               other categories…) is a baseline, it announces nothing;
//   - `images`  the widget image keys -> the address of the image;
//   - `fired`   the reminders and sale openings already sent -> when to forget;
//   - `scan`    the last reading: `{ at, okAt, error, truncated }`.
// The followed artists and venues are not here: they live in the
// configuration of Gladys, which is backed up. The API key never comes here.
// Writes are atomic (a temporary file, then a rename) and grouped.
// -----------------------------------------------------------------------------

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const DEFAULT_PATH = '/data/state.json';
const FLUSH_DELAY_MS = 5000;

const EMPTY = () => ({
  shows: {},
  seen: {},
  read: {},
  images: {},
  fired: {},
  scan: {},
});

/**
 * @description The store.
 * @param {object} [options] - `{ path, logger, flushDelay }`.
 * @returns {object} The store: `data` (the state, changed in place), `changed()` and `flush()`.
 */
function createStore({ path = DEFAULT_PATH, logger, flushDelay = FLUSH_DELAY_MS } = {}) {
  const data = EMPTY();
  let timer = null;

  try {
    const raw = JSON.parse(readFileSync(path, 'utf8'));
    for (const part of Object.keys(data)) {
      if (raw?.[part] && typeof raw[part] === 'object' && !Array.isArray(raw[part])) {
        data[part] = raw[part];
      }
    }
  } catch (error) {
    if (error.code !== 'ENOENT') {
      logger?.warn(`unable to read ${path}: ${error.message}`);
    }
  }

  const flush = () => {
    clearTimeout(timer);
    timer = null;
    try {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(`${path}.tmp`, JSON.stringify(data));
      renameSync(`${path}.tmp`, path);
    } catch (error) {
      logger?.warn(`unable to write ${path}: ${error.message}`);
    }
  };

  return {
    data,
    /** @returns {object[]} Every show kept. */
    shows: () => Object.values(data.shows),
    /** Schedule a write. */
    changed() {
      if (!timer) {
        timer = setTimeout(flush, flushDelay);
        timer.unref?.();
      }
    },
    /**
     * @param {string} key - The key of a reminder or of a sale opening.
     * @returns {boolean} Whether this event was sent.
     */
    wasFired: (key) => key in data.fired,
    /**
     * @param {string} key - The key of the event.
     * @param {number} until - When the entry can be forgotten, in ms.
     */
    markFired(key, until) {
      data.fired[key] = until;
      this.changed();
    },
    /** @param {number} now - Forget the events long past. */
    pruneFired(now) {
      for (const [key, until] of Object.entries(data.fired)) {
        if (until < now) {
          delete data.fired[key];
          this.changed();
        }
      }
    },
    flush,
  };
}

export { DEFAULT_PATH, createStore };
