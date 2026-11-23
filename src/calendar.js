// -----------------------------------------------------------------------------
// The shows in the Gladys calendar (manifest `type: "calendar"`).
//
// Every user who enabled the integration in "My calendars" gets up to three
// calendars, one per kind of source in use:
//   - `artists`  "My artists and teams"  the shows of the followed artists and teams;
//   - `venues`   "My venues"             the programme of the followed venues;
//   - `nearby`   "Around the house"      the shows around the house.
// A show lives in one calendar only, the most personal one (artists, then
// venues, then around the house). A show whose time is known is a timed event
// (its end when Ticketmaster gives one), else an all-day event; a show whose
// day is not announced is not in the calendar. A canceled or postponed show
// stays, its name says so. A calendar whose source is no longer used is
// deleted. The calendars are private when created: the user shares them with
// the household (and the scenes) from "My calendars".
//
// Limits of the core: 500 events per request (a window of more is split into
// consecutive sub-windows by day, the days around a boundary going in both
// requests), 30 calendar writes per minute per integration (spaced by 2.1 s).
//
// External ids: ext:<selector>:<user>:artists|venues|nearby   (calendars)
//               ext:<selector>:<user>:ev-<Ticketmaster id>      (events)
// -----------------------------------------------------------------------------

import { priceText, saleText, segmentName, statusName, t, truncate } from './i18n.js';
import { mainSource, placeText } from './shows.js';
import { addDays } from './time.js';

export const CALENDARS = { artist: 'artists', venue: 'venues', nearby: 'nearby' };
export const CALENDAR_COLORS = { artists: '#d6336c', venues: '#7048e8', nearby: '#1c7ed6' };
export const HISTORY_DAYS = 7;
export const AHEAD_DAYS = 730;
export const MAX_EVENTS_PER_REQUEST = 500;
export const WRITE_SPACING_MS = 2100;

const CALENDAR_TEXTS = {
  artists: ['calendarArtists', 'calendarArtistsDescription'],
  venues: ['calendarVenues', 'calendarVenuesDescription'],
  nearby: ['calendarNearby', 'calendarNearbyDescription'],
};

/**
 * @description The external id of a calendar of a user.
 * @param {object} gladys - SDK client.
 * @param {string} user - User selector.
 * @param {string} key - artists, venues or nearby.
 * @returns {string} The external id.
 */
export function calendarId(gladys, user, key) {
  return gladys.externalId(`${user}:${key}`);
}

/**
 * @description The name of a show in the calendar: its status first when it
 * is not an ordinary one.
 * @param {object} show - A show.
 * @param {string} language - The user's language.
 * @returns {string} "Canceled · Muse".
 */
export function eventName(show, language) {
  return ['canceled', 'postponed', 'rescheduled'].includes(show.status)
    ? `${statusName(show.status, language)} · ${show.name}`
    : show.name;
}

/**
 * @description The calendar event of a show.
 * @param {object} gladys - SDK client.
 * @param {string} user - User selector.
 * @param {object} show - A show with a date.
 * @param {string} language - The user's language.
 * @returns {object} A timed or all-day event (an all-day end is exclusive).
 */
export function buildEvent(gladys, user, show, language) {
  const lines = [
    [segmentName(show.segment, language), show.genre].filter(Boolean).join(' · '),
    show.attractions.length > 1
      ? show.attractions.map((attraction) => attraction.name).join(', ')
      : '',
    show.onsale ? saleText(show.onsale, language) : '',
    show.price ? priceText(show.price, language) : '',
    t('eventFooter', language),
  ].filter(Boolean);
  const event = {
    external_id: gladys.externalId(`${user}:ev-${show.id}`),
    name: truncate(eventName(show, language), 200),
    description: truncate(lines.join('\n'), 1000),
  };
  if (show.start) {
    event.start = show.start;
    if (show.end) {
      event.end = show.end;
    }
  } else {
    event.start = show.date;
    event.end = addDays(show.date, 1);
    event.full_day = true;
  }
  const place = placeText(show);
  if (place) {
    event.location = truncate(place, 500);
  }
  if (show.url) {
    event.url = show.url;
  }
  return event;
}

/**
 * @description Split the shows of a window into requests of 500 events at
 * most: consecutive sub-windows cut between two days, each request also
 * holding the shows of the day before and after its sub-window (a show near
 * midnight, or an all-day one stored at the midnights of the instance
 * timezone, can straddle the boundary).
 * @param {object[]} shows - Shows with a date in [from, to), sorted by date.
 * @param {string} from - `YYYY-MM-DD`.
 * @param {string} to - `YYYY-MM-DD`.
 * @returns {{ from: string, to: string, shows: object[] }[]} The requests (one when it fits).
 */
export function splitWindow(shows, from, to) {
  if (shows.length <= MAX_EVENTS_PER_REQUEST) {
    return [{ from, to, shows }];
  }
  const days = [];
  for (const show of shows) {
    const last = days.at(-1);
    if (last?.date === show.date) {
      last.shows.push(show);
    } else {
      days.push({ date: show.date, shows: [show] });
    }
  }
  const size = (i, j) =>
    days.slice(Math.max(0, i - 1), j + 2).reduce((sum, day) => sum + day.shows.length, 0);
  const requests = [];
  let first = 0;
  while (first < days.length) {
    let last = first;
    while (last + 1 < days.length && size(first, last + 1) <= MAX_EVENTS_PER_REQUEST) {
      last += 1;
    }
    requests.push({
      from: first === 0 ? from : days[first].date,
      to: last === days.length - 1 ? to : days[last + 1].date,
      shows: days
        .slice(Math.max(0, first - 1), last + 2)
        .flatMap((day) => day.shows)
        .slice(0, MAX_EVENTS_PER_REQUEST),
    });
    first = last + 1;
  }
  return requests;
}

/**
 * @description Create the calendar synchronizer.
 * @param {object} gladys - SDK client.
 * @param {object} options - Dependencies.
 * @param {Function} options.shows - `() => every show kept`.
 * @param {Function} options.used - `() => the calendar keys in use` (artists, venues, nearby).
 * @param {Function} options.ready - `() => boolean`: Ticketmaster was read at
 * least once (an empty calendar would otherwise erase the events of a restart).
 * @param {Function} options.today - `() => 'YYYY-MM-DD'`.
 * @param {Function} [options.sleep] - Delay between two writes.
 * @param {object} [options.logger] - SDK logger.
 * @returns {{ syncAll: Function, syncUser: Function, forget: Function }} The synchronizer.
 */
export function createCalendarSync(
  gladys,
  { shows, used, ready, today, sleep = defaultSleep, logger },
) {
  // Last content pushed per calendar: an unchanged calendar is not pushed again.
  const pushed = new Map();
  let lastWrite = 0;
  let queue = Promise.resolve();

  const write = async (call) => {
    const wait = lastWrite + WRITE_SPACING_MS - Date.now();
    if (wait > 0) {
      await sleep(wait);
    }
    lastWrite = Date.now();
    return call();
  };

  const syncAccount = async (account, { force = false } = {}) => {
    const user = account.user.selector;
    const language = account.user.language;
    const keys = Object.values(CALENDARS).filter((key) => used().includes(key));
    const calendars = keys.map((key) => ({
      external_id: calendarId(gladys, user, key),
      name: t(CALENDAR_TEXTS[key][0], language),
      description: t(CALENDAR_TEXTS[key][1], language),
      color: CALENDAR_COLORS[key],
    }));
    const calendarsKey = JSON.stringify(calendars);
    if (calendars.length && (force || pushed.get(`calendars:${user}`) !== calendarsKey)) {
      await write(() => gladys.publishCalendars(user, calendars));
      pushed.set(`calendars:${user}`, calendarsKey);
    }
    const existing = await gladys.getCalendars(user);
    // A source no longer used: its calendar goes.
    for (const key of Object.values(CALENDARS)) {
      const id = calendarId(gladys, user, key);
      if (!keys.includes(key) && existing.some((calendar) => calendar.external_id === id)) {
        await write(() => gladys.deleteCalendar(id));
        pushed.delete(id);
        pushed.delete(`calendars:${user}`);
      }
    }
    if (!ready()) {
      return;
    }
    const from = addDays(today(), -HISTORY_DAYS);
    const to = addDays(today(), AHEAD_DAYS);
    const dated = shows()
      .filter((show) => show.date && show.date >= from && show.date < to)
      .sort(
        (a, b) =>
          a.date.localeCompare(b.date) ||
          (a.start ?? '').localeCompare(b.start ?? '') ||
          a.id.localeCompare(b.id),
      );
    for (const key of keys) {
      const id = calendarId(gladys, user, key);
      const mine = existing.find((calendar) => calendar.external_id === id);
      if (mine && !mine.sync) {
        continue;
      }
      const list = dated.filter((show) => CALENDARS[mainSource(show)] === key);
      const requests = splitWindow(list, from, to).map((request) => ({
        window: { from: request.from, to: request.to },
        events: request.shows.map((show) => buildEvent(gladys, user, show, language)),
      }));
      const content = JSON.stringify(requests);
      if (!force && pushed.get(id) === content) {
        continue;
      }
      try {
        for (const request of requests) {
          await write(() => gladys.publishCalendarEvents(id, request.events, request.window));
        }
        pushed.set(id, content);
      } catch (error) {
        // The user turned the sync of this calendar off meanwhile.
        if (error?.status === 403) {
          logger?.info(`calendar ${key} of ${user} not synchronized: ${error.message}`);
          continue;
        }
        throw error;
      }
    }
  };

  const enqueue = (job) => {
    const result = queue.then(job);
    queue = result.catch((error) => logger?.warn(`calendar sync failed: ${error.message}`));
    return result;
  };

  return {
    /**
     * @param {object} [options] - `{ force }`: push even what did not change.
     * @returns {Promise<void>} Every enabled user synchronized.
     */
    syncAll: (options) =>
      enqueue(async () => {
        for (const account of await gladys.getCalendarAccounts()) {
          await syncAccount(account, options);
        }
      }),
    /**
     * @param {string} userSelector - The user whose account changed.
     * @returns {Promise<void>} That user synchronized (nothing if disabled).
     */
    syncUser: (userSelector) =>
      enqueue(async () => {
        const account = (await gladys.getCalendarAccounts()).find(
          (candidate) => candidate.user.selector === userSelector,
        );
        if (account) {
          await syncAccount(account, { force: true });
        } else {
          // Disabled: the core already deleted the calendars.
          for (const key of Object.values(CALENDARS)) {
            pushed.delete(calendarId(gladys, userSelector, key));
          }
          pushed.delete(`calendars:${userSelector}`);
        }
      }),
    /** Forget what was pushed (reconnection: the core may have changed meanwhile). */
    forget: () => pushed.clear(),
  };
}

/**
 * @param {number} ms - Delay.
 * @returns {Promise<void>} Resolved after the delay.
 */
function defaultSleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms).unref?.();
  });
}
