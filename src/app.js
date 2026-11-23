// -----------------------------------------------------------------------------
// The integration: every Gladys handler, registered before connect().
//
// A calendar integration (manifest `type: "calendar"`): up to three calendars
// for every user who enabled it (src/calendar.js), three widgets, four scene
// triggers, one scene action and six configuration buttons (follow / stop
// following an artist or a team, a venue, list, read again).
//
// A one-minute tick drives everything: it sends the reminders and sale
// openings that are due, slides the calendar window at midnight and starts a
// reading of Ticketmaster when one is due (src/scan.js). A reading runs in
// the background; its changes fire the scene triggers, then the calendars and
// the widgets follow. The tests drive it with the fake Gladys of the SDK, a
// fake Ticketmaster and a clock moved by hand (test/app.test.js).
// -----------------------------------------------------------------------------

import { logger as sdkLogger } from '@gladysassistant/integration-sdk';
import { createCalendarSync } from './calendar.js';
import { ALL_COUNTRIES, INTERNAL_KEYS, normalizeConfig, readKeys, textLanguage } from './config.js';
import { TRIGGERS, changeEvents, dueReminders, dueSales, showOutputs } from './events.js';
import { FollowError, KINDS, createRegistry, entryLabel, resolveEntry } from './follows.js';
import { all, each, segmentName, t, truncate } from './i18n.js';
import { createImages } from './images.js';
import { createScanner } from './scan.js';
import { SEGMENTS, SOURCES, onsaleShows, upcomingShows } from './shows.js';
import { createStore } from './store.js';
import { createTicketmasterClient } from './ticketmaster.js';
import { MINUTE_MS, formatTime, localClock } from './time.js';
import {
  WIDGETS,
  buildNextEventWidget,
  buildOnsaleWidget,
  buildUpcomingWidget,
} from './widgets.js';

const ACTIONS = {
  FOLLOW_ATTRACTION: 'follow_attraction',
  UNFOLLOW_ATTRACTION: 'unfollow_attraction',
  FOLLOW_VENUE: 'follow_venue',
  UNFOLLOW_VENUE: 'unfollow_venue',
  LIST: 'list_followed',
  REFRESH: 'refresh',
};
const SCENE_ACTIONS = { NEXT: 'get_next_event' };
const TICK_MS = MINUTE_MS;
const WIDGET_REFRESH_SPACING_MS = 11 * 1000;
const LIST_MAX_LINES = 60;

/**
 * @description Wire the integration.
 * @param {object} gladys - SDK client (or the fake one of the tests).
 * @param {object} [deps] - Dependencies, replaced in the tests.
 * @param {object} [deps.tm] - Ticketmaster client (src/ticketmaster.js).
 * @param {object} [deps.store] - State file (src/store.js).
 * @param {object} [deps.images] - Pictures (src/images.js).
 * @param {Function} [deps.now] - Clock, in ms.
 * @param {string} [deps.timeZone] - Timezone of the instance (TZ by default).
 * @param {Function} [deps.sleep] - Delay between calendar writes.
 * @param {string} [deps.userAgent] - Sent to Ticketmaster.
 * @param {object} [deps.logger] - SDK logger.
 * @returns {object} `{ start, stop, tick, scan, idle, attractions, venues, store }`.
 */
export function createApp(gladys, deps = {}) {
  const {
    now = () => Date.now(),
    timeZone = process.env.TZ || undefined,
    sleep,
    userAgent,
    logger = sdkLogger,
  } = deps;
  let config = normalizeConfig(gladys.config ?? {});
  const tm = deps.tm ?? createTicketmasterClient({ apiKey: () => config.apiKey, now, userAgent });
  const store = deps.store ?? createStore({ logger });
  const images = deps.images ?? createImages({ store, userAgent });
  const attractions = createRegistry(gladys, KINDS.ATTRACTION, { logger });
  const venues = createRegistry(gladys, KINDS.VENUE, { logger });
  attractions.load(gladys.config ?? {});
  venues.load(gladys.config ?? {});

  let timer = null;
  let stopped = false;
  let today = null;
  let ticking = null;
  let scanning = null;
  let rescan = false;
  let lastConnection = null;
  let signature = null;
  const lastWidgetRefresh = new Map();
  const pendingWidgetRefresh = new Map();

  const currentDay = () => localClock(now(), timeZone).date;
  const language = () => textLanguage(config);

  const scanner = createScanner({
    tm,
    store,
    attractions,
    venues,
    houses: () => gladys.getHouses(),
    config: () => config,
    today: currentDay,
    now,
    logger,
  });

  /** The calendars in use: one per kind of source configured. */
  const usedCalendars = () => [
    ...(attractions.list().length ? ['artists'] : []),
    ...(venues.list().length ? ['venues'] : []),
    ...(config.radiusKm > 0 ? ['nearby'] : []),
  ];
  const followsSomething = () => usedCalendars().length > 0;

  const calendarSync = createCalendarSync(gladys, {
    shows: () => store.shows(),
    used: usedCalendars,
    ready: () => Boolean(store.data.scan.at),
    today: currentDay,
    sleep,
    logger,
  });

  const safely = async (call) => {
    try {
      return await call();
    } catch (error) {
      logger.warn(error.message);
      return undefined;
    }
  };

  const upcoming = (filters = {}) =>
    upcomingShows(store.shows(), { today: currentDay(), now: now(), ...filters });
  const sales = (filters = {}) => onsaleShows(store.shows(), { now: now(), ...filters });

  /** What the scene data needs besides the show. */
  const context = () => ({
    config,
    today: currentDay(),
    language: language(),
    timeZone,
    followed: new Set(attractions.list().map((entry) => entry.id)),
  });

  // --- Publications ------------------------------------------------------------

  const refreshWidget = (key) => {
    const wait = (lastWidgetRefresh.get(key) ?? 0) + WIDGET_REFRESH_SPACING_MS - Date.now();
    if (wait <= 0) {
      lastWidgetRefresh.set(key, Date.now());
      safely(() => gladys.requestWidgetRefresh(key));
      return;
    }
    if (!pendingWidgetRefresh.has(key)) {
      const pending = setTimeout(() => {
        pendingWidgetRefresh.delete(key);
        refreshWidget(key);
      }, wait);
      pending.unref?.();
      pendingWidgetRefresh.set(key, pending);
    }
  };

  const connectionStatus = () => {
    const status = scanner.status();
    let connected = true;
    let message;
    if (!config.apiKey) {
      connected = false;
      message = all('statusNoKey');
    } else if (status.keyRefused || status.error?.kind === 'auth') {
      connected = false;
      message = all('statusKeyRefused');
    } else if (status.pausedUntil) {
      message = all('statusQuota', { time: formatTime(status.pausedUntil, timeZone) });
    } else if (status.error && !['busy', 'quota'].includes(status.error.kind)) {
      connected = false;
      message = all('statusUnreachable', { error: truncate(status.error.message, 80) });
    } else if (!followsSomething()) {
      message = all('statusNothing');
    } else if (!status.at) {
      message = all('statusReading');
    } else {
      message = all('statusOk', { shows: upcoming().length, sales: sales().length });
    }
    const problem = scanner.houseProblem;
    if (problem && config.radiusKm > 0 && config.apiKey) {
      message = each((lang) => t(`statusHouse_${problem}`, lang, { status: message[lang] }));
    }
    return { connected, message };
  };

  const publishConnection = async () => {
    const status = connectionStatus();
    const message = Object.fromEntries(
      Object.entries(status.message).map(([lang, text]) => [lang, truncate(text, 200)]),
    );
    const key = JSON.stringify([status.connected, message]);
    if (key !== lastConnection) {
      await gladys.setConnectionStatus(status.connected, message);
      lastConnection = key;
    }
  };

  const refreshWidgets = () => Object.values(WIDGETS).forEach(refreshWidget);

  const publishAll = async () => {
    if (!gladys.connected) {
      return;
    }
    await safely(() => calendarSync.syncAll());
    await safely(() => publishConnection());
    refreshWidgets();
  };

  // --- Reading -------------------------------------------------------------------

  /**
   * @description Read Ticketmaster in the background, one reading at a time.
   * @returns {Promise<object|undefined>} The result of the scanner.
   */
  const scan = () => {
    if (scanning) {
      // Something changed during the reading (a button): read again after it.
      rescan = true;
      return scanning;
    }
    scanning = (async () => {
      if (gladys.connected) {
        await safely(() => publishConnection());
      }
      const result = await scanner.run();
      images.prune(store.shows());
      if (gladys.connected) {
        for (const event of changeEvents(result, context())) {
          await safely(() => gladys.publishSceneEvent(event.trigger, event.data));
        }
      }
      await publishAll();
      return result;
    })()
      .catch((error) => {
        logger.warn(`reading failed: ${error.message}`);
        return undefined;
      })
      .finally(() => {
        scanning = null;
        if (rescan && !stopped) {
          rescan = false;
          scan();
        }
      });
    return scanning;
  };

  // --- The tick ------------------------------------------------------------------

  const runTick = async () => {
    const clock = localClock(now(), timeZone);
    const dayChanged = today !== null && clock.date !== today;
    today = clock.date;
    if (gladys.connected && store.data.scan.at) {
      const shared = {
        shows: store.shows(),
        wasFired: (key) => store.wasFired(key),
        ...context(),
      };
      const due = [
        ...dueReminders({ ...shared, hour: Math.floor(clock.minutes / 60) }),
        ...dueSales({ ...shared, now: now() }),
      ];
      for (const event of due) {
        await safely(() => gladys.publishSceneEvent(event.trigger, event.data));
        store.markFired(event.key, event.until);
      }
      store.pruneFired(now());
      if (due.some((event) => event.trigger === TRIGGERS.SALE)) {
        refreshWidget(WIDGETS.ONSALE);
      }
    }
    if (dayChanged) {
      await publishAll();
    } else if (gladys.connected) {
      await safely(() => publishConnection());
    }
    if (scanner.due()) {
      scan();
    }
  };

  /** One tick at a time. */
  const tick = () => {
    if (!ticking) {
      ticking = runTick()
        .catch((error) => logger.warn(`tick failed: ${error.message}`))
        .finally(() => {
          ticking = null;
        });
    }
    return ticking;
  };

  // --- Language ----------------------------------------------------------------

  const rememberLanguage = (lang) => {
    if (typeof lang !== 'string' || !/^[a-z]{2}$/.test(lang) || lang === config.lastLanguage) {
      return;
    }
    config = { ...config, lastLanguage: lang };
    gladys
      .setConfig({ [INTERNAL_KEYS.language]: lang })
      .catch((error) => logger.warn(`unable to store the language: ${error.message}`));
  };

  // --- Configuration ---------------------------------------------------------------

  /** What makes a new reading necessary when it changes. */
  const readingSignature = () =>
    JSON.stringify([
      config.apiKey,
      config.house,
      config.radiusKm,
      config.segments,
      config.nearbyDays,
      config.followedCountry,
      attractions.list().map((entry) => entry.id),
      venues.list().map((entry) => entry.id),
    ]);

  const applyConfig = async (raw) => {
    config = normalizeConfig(raw ?? {});
    attractions.load(raw ?? {});
    venues.load(raw ?? {});
    lastConnection = null;
    const next = readingSignature();
    const changed = signature !== null && signature !== next;
    signature = next;
    await publishAll();
    if (changed && config.apiKey && !scanner.status().keyRefused) {
      scan();
    } else {
      tick();
    }
  };

  gladys.on('connected', async () => {
    // Calendars may have changed while disconnected: push everything again.
    calendarSync.forget();
    await applyConfig(gladys.config ?? {});
    logger.info(
      `connected: ${attractions.list().length} artist(s)/team(s), ${venues.list().length} venue(s), radius ${config.radiusKm} km`,
    );
  });

  gladys.onConfigUpdated(async (raw) => {
    await applyConfig(raw);
  });

  gladys.onCalendarAccountUpdated(async (userSelector) => {
    await calendarSync.syncUser(userSelector);
  });

  // --- Configuration buttons ---------------------------------------------------------

  /**
   * @description Run a button, turning the known errors into a message in
   * the language of the texts (the core shows the message of a thrown error as is).
   * @param {Function} call - The work.
   * @returns {Promise<unknown>} Its result.
   */
  const guarded = async (call) => {
    try {
      return await call();
    } catch (error) {
      if (error instanceof FollowError) {
        throw new Error(t(error.key, language(), error.params), { cause: error });
      }
      if (error?.name === 'TicketmasterError') {
        const messages = {
          auth: () => t(config.apiKey ? 'tmKeyRefused' : 'tmNoKey', language()),
          quota: () =>
            t('tmQuota', language(), { time: formatTime(tm.pausedUntil || now(), timeZone) }),
        };
        throw new Error(
          (
            messages[error.kind] ??
            (() => t('tmUnreachable', language(), { error: truncate(error.message, 100) }))
          )(),
          { cause: error },
        );
      }
      throw error;
    }
  };

  const followButton =
    (registry) =>
    async (fields = {}) => {
      if (!config.apiKey) {
        throw new Error(t('tmNoKey', language()));
      }
      const { entry, namesakes } = await guarded(async () => {
        const found = await resolveEntry(tm, registry.kind, fields.name, {
          countryCode:
            config.followedCountry === ALL_COUNTRIES ? undefined : config.followedCountry,
        });
        await registry.add(found.entry);
        return found;
      });
      signature = readingSignature();
      scan();
      const list = namesakes.map((other) => `${entryLabel(other)}: ${other.id}`).join('\n');
      return each(
        (lang) =>
          t('followed', lang, { name: entryLabel(entry) }) +
          (list ? t('followedNamesakes', lang, { list }) : ''),
      );
    };

  const unfollowButton =
    (registry) =>
    async (fields = {}) => {
      const entry = await guarded(() => registry.remove(fields.name));
      signature = readingSignature();
      scan();
      return all('unfollowed', { name: entryLabel(entry) });
    };

  gladys.onAction(ACTIONS.FOLLOW_ATTRACTION, followButton(attractions));
  gladys.onAction(ACTIONS.UNFOLLOW_ATTRACTION, unfollowButton(attractions));
  gladys.onAction(ACTIONS.FOLLOW_VENUE, followButton(venues));
  gladys.onAction(ACTIONS.UNFOLLOW_VENUE, unfollowButton(venues));

  gladys.onAction(ACTIONS.LIST, async () =>
    each((lang) => {
      const lines = [];
      const section = (key, entries) => {
        lines.push(t(key, lang, { count: entries.length }));
        const sorted = [...entries].sort((a, b) => a.name.localeCompare(b.name));
        for (const entry of sorted.slice(0, LIST_MAX_LINES)) {
          lines.push(`• ${entryLabel(entry)} — ${entry.id}`);
        }
      };
      if (config.radiusKm > 0) {
        lines.push(
          t('listNearby', lang, {
            radius: config.radiusKm,
            segments: config.segments.map((segment) => segmentName(segment, lang)).join(', '),
            days: config.nearbyDays,
          }),
        );
        if ((store.data.scan.truncated ?? []).includes('nearby')) {
          lines.push(t('listTruncated', lang));
        }
      } else {
        lines.push(t('listNearbyOff', lang));
      }
      section('listAttractions', attractions.list());
      lines.push(
        t('listCountry', lang, {
          country:
            config.followedCountry === ALL_COUNTRIES
              ? t('countryAll', lang)
              : config.followedCountry,
        }),
      );
      section('listVenues', venues.list());
      return lines.join('\n');
    }),
  );

  gladys.onAction(ACTIONS.REFRESH, async () => {
    if (!config.apiKey) {
      return all('tmNoKey');
    }
    if (scanner.running || scanning) {
      return all('refreshRunning');
    }
    const result = await scan();
    const error = store.data.scan.error;
    if (!result?.ok && error) {
      if (error.kind === 'auth') {
        return all('tmKeyRefused');
      }
      if (error.kind === 'quota') {
        return all('tmQuota', { time: formatTime(tm.pausedUntil || now(), timeZone) });
      }
      return all('refreshFailed', { error: truncate(error.message, 100) });
    }
    return all('refreshed', { shows: upcoming().length, sales: sales().length });
  });

  // --- Widgets -------------------------------------------------------------------

  const widgetData = (settings) => ({
    shows: store.shows(),
    today: currentDay(),
    now: now(),
    timeZone,
    hasKey: Boolean(config.apiKey),
    followed: followsSomething(),
    ready: Boolean(store.data.scan.at),
    fetchedAt: store.data.scan.okAt || store.data.scan.at || 0,
    imageKey: images.keyOf,
    settings: settings ?? {},
  });

  const widget = (key, build) =>
    gladys.onWidgetGet(key, async ({ settings, language: lang }) => {
      rememberLanguage(lang);
      return build(widgetData(settings));
    });
  widget(WIDGETS.UPCOMING, buildUpcomingWidget);
  widget(WIDGETS.NEXT, buildNextEventWidget);
  widget(WIDGETS.ONSALE, buildOnsaleWidget);

  gladys.onWidgetGetImage(async (key) => images.get(key));

  // --- Scene actions ---------------------------------------------------------------

  /** The filters of a scene action. */
  const filtersOf = (fields = {}) => ({
    sources: readKeys(fields.source, SOURCES, []),
    segments: readKeys(fields.segment, SEGMENTS, []),
    attraction: typeof fields.attraction === 'string' ? fields.attraction.trim() : '',
  });

  gladys.onSceneAction(SCENE_ACTIONS.NEXT, async (fields) =>
    showOutputs(upcoming(filtersOf(fields ?? {}))[0] ?? null, context()),
  );

  return {
    /** Start the one-minute tick (after connect). */
    start() {
      timer ??= setInterval(tick, TICK_MS);
      timer.unref?.();
    },
    /** Stop the timers and write the state (shutdown). */
    stop() {
      stopped = true;
      clearInterval(timer);
      timer = null;
      for (const pending of pendingWidgetRefresh.values()) {
        clearTimeout(pending);
      }
      pendingWidgetRefresh.clear();
      store.flush();
    },
    tick,
    scan,
    /** @returns {Promise<void>} Resolved when no reading is running. */
    idle: async () => {
      await ticking;
      while (scanning) {
        await scanning;
      }
    },
    /** @returns {boolean} Whether stop() was called. */
    get stopped() {
      return stopped;
    },
    attractions,
    venues,
    scanner,
    store,
  };
}

export { ACTIONS, SCENE_ACTIONS, TRIGGERS };
