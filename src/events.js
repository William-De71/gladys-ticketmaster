// -----------------------------------------------------------------------------
// Scene triggers and scene action outputs.
//
// Triggers (one event per transition, never a periodic snapshot):
//   - `event_announced`       a new show appeared (never at the first reading
//                             of a source, never for a canceled or past one),
//                             20 at most per reading;
//   - `event_reminder`        a show takes place today, tomorrow or in a week
//                             (`lead` 0, 1 or 7), once per show, date and
//                             lead, from `notify_hour` on;
//   - `sale_opening`          the public ticket sale of a show opens now, in
//                             an hour or tomorrow (`lead` 0, 60 or 1440
//                             minutes), once per show, opening and lead;
//   - `event_status_changed`  a show was canceled, postponed, rescheduled or
//                             moved to another date or time (`change`).
// Filters (equality / membership): `source` (the most personal one: artist,
// venue, nearby), `segment`, `attraction` (the followed artist or team, as
// Ticketmaster writes it), `lead`, `change`. The data is flat and scalar;
// `text` is a ready sentence in the language of the configuration.
//
// No event ever follows a scene action (they only read).
// -----------------------------------------------------------------------------

import { saleText, showDateText, statusName, t, truncate } from './i18n.js';
import { mainSource, placeText } from './shows.js';
import { DAY_MS, MINUTE_MS, addDays, daysBetween, formatTime, localClock } from './time.js';

const TRIGGERS = {
  ANNOUNCED: 'event_announced',
  REMINDER: 'event_reminder',
  SALE: 'sale_opening',
  CHANGED: 'event_status_changed',
};

const REMINDER_LEADS = ['0', '1', '7'];
const SALE_LEADS = ['0', '60', '1440'];
const CHANGES = ['canceled', 'postponed', 'rescheduled', 'date_changed'];
const MAX_ANNOUNCED = 20;
// A sale opening is announced up to two hours late (a restart, a slow reading).
const SALE_GRACE_MS = 2 * 60 * MINUTE_MS;

const SHOW_OUTPUTS = [
  'found',
  'name',
  'date',
  'time',
  'date_text',
  'days',
  'place',
  'city',
  'attraction',
  'segment',
  'source',
  'status',
  'url',
  'image_url',
  'onsale_text',
  'text',
];

/**
 * @description The data of a show, as the scenes see it.
 * @param {object} show - A show.
 * @param {object} context - `{ today, language, timeZone, followed }`:
 * `followed` is the set of followed attraction ids.
 * @returns {object} Flat, scalar data.
 */
function showData(show, { today, language, timeZone, followed }) {
  const attraction =
    show.attractions.find((entry) => followed?.has(entry.id)) ?? show.attractions[0];
  return {
    event_id: show.id,
    name: truncate(show.name, 200),
    date: show.date ?? '',
    time: show.time ?? '',
    date_text: showDateText(show, language),
    days: show.date ? daysBetween(today, show.date) : null,
    place: truncate(placeText(show), 200),
    city: show.venue?.city ?? '',
    attraction: truncate(attraction?.name ?? '', 200),
    segment: show.segment,
    source: mainSource(show),
    status: show.status,
    url: show.url,
    image_url: show.image,
    onsale: show.onsale ?? '',
    onsale_text: show.onsale ? saleText(show.onsale, language, timeZone) : '',
  };
}

/**
 * @description The sentence about a show, by how far its date is.
 * @param {object} show - A show.
 * @param {object} context - `{ today, language }`.
 * @returns {string} "Muse: tomorrow at 20:00, Accor Arena, Paris."
 */
function showSentence(show, { today, language }) {
  const values = {
    name: show.name,
    date: showDateText(show, language),
    time: show.time ?? '',
    place: placeText(show) || '—',
    status: statusName(show.status, language),
  };
  if (show.status === 'canceled') {
    return t('textCanceled', language, values);
  }
  if (!show.date) {
    return t('textDateUnknown', language, values);
  }
  const days = daysBetween(today, show.date);
  if (days < 0) {
    return t('textPast', language, values);
  }
  let key = 'textInDays';
  if (days === 0) {
    key = show.time ? 'textTodayAt' : 'textToday';
  } else if (days === 1) {
    key = show.time ? 'textTomorrowAt' : 'textTomorrow';
  }
  return t(key, language, { ...values, days });
}

/**
 * @description What a change of a show is, for `event_status_changed`.
 * @param {object} before - The show kept.
 * @param {object} after - The show read.
 * @returns {string|null} A key of CHANGES, null when it is not one.
 */
function changeOf(before, after) {
  if (after.status !== before.status && ['canceled', 'postponed'].includes(after.status)) {
    return after.status;
  }
  if (after.status === 'rescheduled' && before.status !== 'rescheduled') {
    return 'rescheduled';
  }
  if (after.status !== 'canceled' && (after.date !== before.date || after.start !== before.start)) {
    return after.date ? 'date_changed' : 'postponed';
  }
  return null;
}

/**
 * @description The events of what a reading changed.
 * @param {object} result - `{ added, updated }` of the scanner.
 * @param {object} context - `{ today, language, timeZone, followed }`.
 * @returns {{ trigger: string, data: object }[]} The events.
 */
function changeEvents(result, context) {
  const { today, language } = context;
  const events = [];
  let announced = 0;
  for (const { show, baseline } of result.added ?? []) {
    if (
      baseline ||
      show.status === 'canceled' ||
      (show.date && show.date < today) ||
      announced >= MAX_ANNOUNCED
    ) {
      continue;
    }
    announced += 1;
    events.push({
      trigger: TRIGGERS.ANNOUNCED,
      data: {
        ...showData(show, context),
        text: truncate(
          t(show.date ? 'textAnnounced' : 'textAnnouncedNoDate', language, {
            name: show.name,
            date: showDateText(show, language),
            place: placeText(show) || '—',
          }),
          1000,
        ),
      },
    });
  }
  for (const { before, after } of result.updated ?? []) {
    const change = changeOf(before, after);
    if (!change || (after.date && after.date < today && change !== 'canceled')) {
      continue;
    }
    const values = {
      name: after.name,
      date: showDateText(after, language),
      previous: showDateText(before, language),
      place: placeText(after) || '—',
    };
    events.push({
      trigger: TRIGGERS.CHANGED,
      data: {
        ...showData(after, context),
        change,
        previous_date: before.date ?? '',
        text: truncate(t(`textChange_${change}`, language, values), 1000),
      },
    });
  }
  return events;
}

/**
 * @description The reminders due now.
 * @param {object} options - `{ shows, hour, wasFired, config, today, language, timeZone, followed }`:
 * `hour` is the local hour (0–23).
 * @returns {{ trigger: string, data: object, key: string, until: number }[]}
 * The events; `key` and `until` go to the store once sent.
 */
function dueReminders({ shows, hour, wasFired, ...context }) {
  const { config, today } = context;
  if (hour < config.notifyHour) {
    return [];
  }
  const due = [];
  for (const show of shows) {
    if (!show.date || show.status === 'canceled' || show.date < today) {
      continue;
    }
    for (const lead of REMINDER_LEADS) {
      if (addDays(show.date, -Number(lead)) !== today) {
        continue;
      }
      const key = `${show.id}|r${lead}|${show.date}`;
      if (wasFired(key)) {
        continue;
      }
      due.push({
        trigger: TRIGGERS.REMINDER,
        data: {
          ...showData(show, context),
          lead,
          text: truncate(showSentence(show, context), 1000),
        },
        key,
        until: Date.parse(`${show.date}T00:00:00Z`) + 3 * DAY_MS,
      });
    }
  }
  return due.sort((a, b) => a.data.name.localeCompare(b.data.name));
}

/**
 * @description The sale openings due now.
 * @param {object} options - `{ shows, now, wasFired, today, language, timeZone, followed }`.
 * @returns {{ trigger: string, data: object, key: string, until: number }[]} The events.
 */
function dueSales({ shows, now, wasFired, ...context }) {
  const { language, timeZone, today } = context;
  const due = [];
  for (const show of shows) {
    if (!show.onsale || show.status === 'canceled' || (show.date && show.date < today)) {
      continue;
    }
    const opening = Date.parse(show.onsale);
    for (const lead of SALE_LEADS) {
      const at = opening - Number(lead) * MINUTE_MS;
      // Late, but never once the moment it announces has passed.
      const end = lead === '0' ? at + SALE_GRACE_MS : Math.min(at + SALE_GRACE_MS, opening);
      if (now < at || now >= end) {
        continue;
      }
      const key = `${show.id}|s${lead}|${show.onsale}`;
      if (wasFired(key)) {
        continue;
      }
      const clock = localClock(opening, timeZone);
      let sentence = 'textSaleOpen';
      if (lead !== '0') {
        sentence = clock.date === today ? 'textSaleTodayAt' : 'textSaleTomorrowAt';
      }
      due.push({
        trigger: TRIGGERS.SALE,
        data: {
          ...showData(show, context),
          lead,
          text: truncate(
            t(sentence, language, {
              name: show.name,
              date: showDateText(show, language),
              time: formatTime(opening, timeZone),
            }),
            1000,
          ),
        },
        key,
        until: opening + 2 * DAY_MS,
      });
    }
  }
  return due.sort((a, b) => a.data.name.localeCompare(b.data.name));
}

/**
 * @description The outputs of the `get_next_event` scene action.
 * @param {object|null} show - The show found.
 * @param {object} context - `{ today, language, timeZone, followed }`.
 * @returns {object} Exactly SHOW_OUTPUTS.
 */
function showOutputs(show, context) {
  if (!show) {
    return {
      found: false,
      name: '',
      date: '',
      time: '',
      date_text: '',
      days: -1,
      place: '',
      city: '',
      attraction: '',
      segment: '',
      source: '',
      status: '',
      url: '',
      image_url: '',
      onsale_text: '',
      text: t('textNone', context.language),
    };
  }
  const data = showData(show, context);
  return {
    found: true,
    name: data.name,
    date: data.date,
    time: data.time,
    date_text: data.date_text,
    days: data.days ?? -1,
    place: data.place,
    city: data.city,
    attraction: data.attraction,
    segment: data.segment,
    source: data.source,
    status: data.status,
    url: data.url,
    image_url: data.image_url,
    onsale_text: data.onsale_text,
    text: truncate(showSentence(show, context), 1000),
  };
}

export {
  TRIGGERS,
  REMINDER_LEADS,
  SALE_LEADS,
  CHANGES,
  MAX_ANNOUNCED,
  SHOW_OUTPUTS,
  showData,
  showSentence,
  changeOf,
  changeEvents,
  dueReminders,
  dueSales,
  showOutputs,
};
