// -----------------------------------------------------------------------------
// Dashboard widgets (pure: also used by docs/illustrations/gen.mjs).
//
//   - `upcoming`     the next shows, as a list (day, time, place, category
//                    badge, picture);
//   - `next_event`   the next show: countdown, day, time, place, large picture;
//   - `onsale`       the next public ticket sales to open, as a list.
// Settings: `sources` and `segments` (empty: all) for the three, `count` for
// the lists. Every text is multi-language: Gladys caches the content per
// language. Pictures are served by onWidgetGetImage (src/images.js).
// -----------------------------------------------------------------------------

import { readKeys } from './config.js';
import {
  all,
  each,
  priceText,
  saleText,
  segmentName,
  showDateText,
  statusName,
  t,
  truncate,
} from './i18n.js';
import { SEGMENTS, SOURCES, onsaleShows, placeText, upcomingShows } from './shows.js';
import { dayMonth, daysBetween, formatTime, localClock, shortDate } from './time.js';

const WIDGETS = { UPCOMING: 'upcoming', NEXT: 'next_event', ONSALE: 'onsale' };
const COUNTS = [3, 5, 8];
const DEFAULT_COUNT = 5;
const SEGMENT_COLORS = {
  music: 'primary',
  sports: 'success',
  arts: 'warning',
  film: 'info',
  misc: 'neutral',
  '': 'neutral',
};
// The contents change with a reading or at midnight, and a refresh is asked
// for then: the cache only bounds what a missed refresh costs.
const TTL_SECONDS = 900;

const choice = (raw, allowed, fallback) => (allowed.includes(Number(raw)) ? Number(raw) : fallback);

/**
 * @description The filters of a widget instance.
 * @param {object} settings - The widget settings.
 * @returns {{ sources: string[], segments: string[] }} Empty lists: all.
 */
function widgetFilters(settings) {
  return {
    sources: readKeys(settings?.sources, SOURCES, []),
    segments: readKeys(settings?.segments, SEGMENTS, []),
  };
}

/** The caption under the title: the source and the last reading. */
const sourceCaption = ({ fetchedAt, timeZone }) => ({
  type: 'text',
  variant: 'caption',
  text: fetchedAt
    ? all('sourceCaption', { time: formatTime(fetchedAt, timeZone) })
    : all('sourceCaptionNever'),
});

/**
 * @description The body shown when a widget has nothing to list.
 * @param {object} data - `{ hasKey, followed, ready }`.
 * @param {object} nothing - The text when Ticketmaster was read and nothing matches.
 * @returns {object} A text component.
 */
function emptyBody({ hasKey, followed, ready }, nothing) {
  let text = nothing;
  if (!hasKey) {
    text = all('noKey');
  } else if (!followed) {
    text = all('nothingFollowed');
  } else if (!ready) {
    text = all('reading');
  }
  return { type: 'text', variant: 'body', text };
}

/**
 * @description "Sat 13 Jun · 20:00 · Accor Arena".
 * @param {object} show - A show.
 * @param {string} language - The language.
 * @returns {string} When and where.
 */
function whenWhere(show, language) {
  const when = show.date
    ? [shortDate(show.date, language), show.time].filter(Boolean).join(' · ')
    : t('dateUnknown', language);
  return [when, show.venue?.name].filter(Boolean).join(' · ');
}

/**
 * @description When the public sale opens: "Wed 25 Nov, 10:00".
 * @param {string} onsale - ISO instant.
 * @param {string} language - The language.
 * @param {string} [timeZone] - Timezone of the instance.
 * @returns {string} The day and the time.
 */
function saleWhen(onsale, language, timeZone) {
  const instant = Date.parse(onsale);
  return t('dateAt', language, {
    date: shortDate(localClock(instant, timeZone).date, language),
    time: formatTime(instant, timeZone),
  });
}

/**
 * @description The detail panel of a show.
 * @param {object} show - A show.
 * @param {string} language - The language.
 * @param {string} [timeZone] - Timezone of the instance.
 * @returns {string} Date, place, category, sale, price, status.
 */
function details(show, language, timeZone) {
  return truncate(
    [
      showDateText(show, language),
      placeText(show),
      [segmentName(show.segment, language), show.genre].filter(Boolean).join(' · '),
      show.attractions.length > 1 ? show.attractions.map((entry) => entry.name).join(', ') : '',
      show.onsale ? saleText(show.onsale, language, timeZone) : '',
      show.price ? priceText(show.price, language) : '',
      show.status === 'onsale' ? '' : statusName(show.status, language),
    ]
      .filter(Boolean)
      .join('\n'),
    2000,
  );
}

/**
 * @description One card of a list.
 * @param {object} show - A show.
 * @param {object} options - `{ subtitle, imageKey, timeZone }`.
 * @returns {object} The card-list item.
 */
function cardItem(show, { subtitle, imageKey, timeZone }) {
  const item = {
    title: truncate(show.name, 60),
    // A list shows the date OR the subtitle: the day goes in the subtitle.
    subtitle: each((language) => truncate(subtitle(language), 60)),
    badge: {
      text: each((language) =>
        truncate(
          show.status === 'onsale' || show.status === 'offsale'
            ? segmentName(show.segment, language)
            : statusName(show.status, language),
          16,
        ),
      ),
      color:
        show.status === 'onsale' || show.status === 'offsale'
          ? SEGMENT_COLORS[show.segment]
          : 'danger',
    },
    description: each((language) => details(show, language, timeZone)),
  };
  if (show.url) {
    item.links = [{ url: show.url, label: all('linkTicketmaster') }];
  }
  const key = imageKey?.(show);
  if (key) {
    item.image = key;
  }
  return item;
}

/**
 * @description The `upcoming` widget.
 * @param {object} data - `{ shows, today, now, timeZone, hasKey, followed, ready, fetchedAt, imageKey, settings }`.
 * @returns {object} The widget content.
 */
function buildUpcomingWidget(data) {
  const { shows, today, now, timeZone, imageKey, settings = {} } = data;
  const count = choice(settings.count, COUNTS, DEFAULT_COUNT);
  const list = upcomingShows(shows, { today, now, ...widgetFilters(settings) }).slice(0, count);
  const caption = sourceCaption(data);
  if (list.length === 0) {
    return { ttl_seconds: TTL_SECONDS, components: [caption, emptyBody(data, all('noUpcoming'))] };
  }
  return {
    ttl_seconds: TTL_SECONDS,
    components: [
      caption,
      {
        type: 'card-list',
        display: 'list',
        items: list.map((show) =>
          cardItem(show, {
            subtitle: (language) => whenWhere(show, language),
            imageKey,
            timeZone,
          }),
        ),
      },
    ],
  };
}

/**
 * @description The `onsale` widget.
 * @param {object} data - Same as `buildUpcomingWidget`.
 * @returns {object} The widget content.
 */
function buildOnsaleWidget(data) {
  const { shows, now, timeZone, imageKey, settings = {} } = data;
  const count = choice(settings.count, COUNTS, DEFAULT_COUNT);
  const list = onsaleShows(shows, { now, ...widgetFilters(settings) }).slice(0, count);
  const caption = sourceCaption(data);
  if (list.length === 0) {
    return { ttl_seconds: TTL_SECONDS, components: [caption, emptyBody(data, all('noOnsale'))] };
  }
  return {
    ttl_seconds: TTL_SECONDS,
    components: [
      caption,
      {
        type: 'card-list',
        display: 'list',
        items: list.map((show) =>
          cardItem(show, {
            subtitle: (language) => saleText(show.onsale, language, timeZone),
            imageKey,
            timeZone,
          }),
        ),
      },
    ],
  };
}

/**
 * @description The countdown tile: "Today", "Tomorrow", "6 d".
 * @param {object} show - A show with a date.
 * @param {string} today - `YYYY-MM-DD`.
 * @param {string} language - The language.
 * @returns {string} At most 12 characters.
 */
function countdown(show, today, language) {
  const days = daysBetween(today, show.date);
  if (days <= 0) {
    return t('today', language);
  }
  return days === 1 ? t('tomorrow', language) : t('daysShort', language, { days });
}

/**
 * @description The `next_event` widget.
 * @param {object} data - Same as `buildUpcomingWidget`.
 * @returns {object} The widget content.
 */
function buildNextEventWidget(data) {
  const { shows, today, now, timeZone, imageKey, settings = {} } = data;
  const [show] = upcomingShows(shows, { today, now, ...widgetFilters(settings) });
  if (!show) {
    return {
      ttl_seconds: TTL_SECONDS,
      components: [sourceCaption(data), emptyBody(data, all('noUpcoming'))],
    };
  }
  const components = [
    { type: 'text', variant: 'heading', text: truncate(show.name, 60) },
    {
      type: 'value',
      value: each((language) => truncate(countdown(show, today, language), 12)),
      label: all('tileIn'),
      icon: 'clock',
      color: show.date === today ? 'success' : 'primary',
    },
    {
      type: 'value',
      value: each((language) => truncate(dayMonth(show.date, language), 12)),
      label: show.date.slice(0, 4),
      icon: 'calendar',
    },
    {
      type: 'value',
      value: show.time ?? '—',
      label: all('tileTime'),
      icon: 'watch',
    },
  ];
  const key = imageKey?.(show);
  if (key) {
    components.push({
      type: 'image',
      key,
      alt: each((language) => truncate(t('imageAlt', language, { name: show.name }), 100)),
      fit: 'cover',
    });
  }
  const status = [];
  if (show.venue) {
    status.push({
      label: all('statusPlace'),
      value: truncate(placeText(show), 40),
      color: 'primary',
    });
  }
  status.push({
    label: all('statusCategory'),
    value: each((language) =>
      truncate([segmentName(show.segment, language), show.genre].filter(Boolean).join(' · '), 40),
    ),
    color: 'neutral',
  });
  if (show.onsale) {
    status.push({
      label: all('statusSale'),
      value: each((language) =>
        truncate(
          Date.parse(show.onsale) > now
            ? saleWhen(show.onsale, language, timeZone)
            : statusName('onsale', language),
          40,
        ),
      ),
      color: Date.parse(show.onsale) > now ? 'warning' : 'success',
    });
  }
  components.push({ type: 'status', items: status });
  if (show.url) {
    components.push({
      type: 'button',
      label: all('buttonTickets'),
      icon: 'external-link',
      style: 'secondary',
      link: { url: show.url },
    });
  }
  return { ttl_seconds: TTL_SECONDS, components };
}

export {
  WIDGETS,
  COUNTS,
  DEFAULT_COUNT,
  SEGMENT_COLORS,
  widgetFilters,
  countdown,
  whenWhere,
  buildUpcomingWidget,
  buildOnsaleWidget,
  buildNextEventWidget,
};
