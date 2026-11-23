// Builds the widget contents of the illustrations with the integration's own
// code: node gen.mjs <repo> <out.json> (run by render.sh)
//
// Monday 23 November 2026, 09:00 in Paris, around a house in Paris, following
// Muse and the Accor Arena: the events are built by hand in the shape of the
// Discovery API (the integration was written without a key), read through the
// real parser (src/shows.js) and the real widget builders (src/widgets.js).
// The pictures are drawn here, never the real artwork.
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const [repo, out] = process.argv.slice(2);
const load = (path) => import(pathToFileURL(`${repo}/${path}`).href);
const { buildUpcomingWidget, buildNextEventWidget, buildOnsaleWidget } =
  await load('src/widgets.js');
const { toShow } = await load('src/shows.js');
const { LANGUAGES } = await load('src/i18n.js');
const manifest = JSON.parse(readFileSync(`${repo}/gladys-assistant-integration.json`, 'utf8'));

const NOW = Date.parse('2026-11-23T08:00:00Z');
const TZ = 'Europe/Paris';
const TODAY = '2026-11-23';

const SEGMENTS = {
  music: { id: 'KZFzniwnSyZfZ7v7nJ', name: 'Music' },
  sports: { id: 'KZFzniwnSyZfZ7v7nE', name: 'Sports' },
  arts: { id: 'KZFzniwnSyZfZ7v7na', name: 'Arts & Theatre' },
};

/** A raw event of the Discovery API, the fields the integration reads. */
const raw = ({
  id,
  name,
  date,
  time,
  utc,
  segment,
  genre,
  venue,
  city,
  attractions = [],
  onsale,
  min,
  max,
  status = 'onsale',
}) => ({
  id,
  name,
  url: `https://www.ticketmaster.fr/fr/manifestation/${id}`,
  images: [
    {
      ratio: '16_9',
      url: `https://s1.ticketm.net/dam/illustration/${id}.jpg`,
      width: 640,
      height: 360,
    },
  ],
  sales: { public: { startDateTime: onsale } },
  dates: {
    start: { localDate: date, localTime: time, dateTime: utc, timeTBA: !time },
    status: { code: status },
  },
  classifications: [{ primary: true, segment: SEGMENTS[segment], genre: { name: genre } }],
  priceRanges: min ? [{ type: 'standard', currency: 'EUR', min, max }] : [],
  _embedded: {
    venues: [
      { id: `KovZ${id}`, name: venue, city: { name: city }, country: { countryCode: 'FR' } },
    ],
    attractions,
  },
});

const events = [
  raw({
    id: 'vvG1zZ9KdA1',
    name: 'La Traviata',
    date: '2026-11-28',
    segment: 'arts',
    genre: 'Opera',
    venue: 'Opéra Bastille',
    city: 'Paris',
    onsale: '2026-09-01T08:00:00Z',
    min: 15,
    max: 230,
  }),
  raw({
    id: 'vvG1zZ9KdA2',
    name: 'PSG – OM',
    date: '2026-12-06',
    time: '21:00:00',
    utc: '2026-12-06T20:00:00Z',
    segment: 'sports',
    genre: 'Football',
    venue: 'Parc des Princes',
    city: 'Paris',
    attractions: [{ id: 'K8vZ9171o-7', name: 'Paris Saint-Germain' }],
    onsale: '2026-11-10T09:00:00Z',
    min: 35,
    max: 160,
  }),
  raw({
    id: 'vvG1zZ9KdA3',
    name: 'Muse',
    date: '2026-12-12',
    time: '20:00:00',
    utc: '2026-12-12T19:00:00Z',
    segment: 'music',
    genre: 'Rock',
    venue: 'Accor Arena',
    city: 'Paris',
    attractions: [{ id: 'K8vZ917Gku7', name: 'Muse' }],
    onsale: '2026-11-20T09:00:00Z',
    min: 45,
    max: 89,
  }),
  raw({
    id: 'vvG1zZ9KdA4',
    name: 'Muse',
    date: '2026-12-14',
    time: '20:00:00',
    utc: '2026-12-14T19:00:00Z',
    segment: 'music',
    genre: 'Rock',
    venue: 'Orange Vélodrome',
    city: 'Marseille',
    attractions: [{ id: 'K8vZ917Gku7', name: 'Muse' }],
    onsale: '2026-11-25T09:00:00Z',
    min: 49,
    max: 95,
  }),
  raw({
    id: 'vvG1zZ9KdA5',
    name: 'Mylène Farmer',
    date: '2027-06-19',
    time: '20:30:00',
    utc: '2027-06-19T18:30:00Z',
    segment: 'music',
    genre: 'Pop',
    venue: 'Stade de France',
    city: 'Saint-Denis',
    onsale: '2026-11-27T09:00:00Z',
    min: 55,
    max: 180,
  }),
  raw({
    id: 'vvG1zZ9KdA6',
    name: 'Le Lac des cygnes',
    date: '2027-01-15',
    time: '19:30:00',
    utc: '2027-01-15T18:30:00Z',
    segment: 'arts',
    genre: 'Ballet',
    venue: 'Palais des Congrès',
    city: 'Paris',
    onsale: '2026-12-02T09:00:00Z',
    min: 39,
    max: 99,
  }),
];
const SOURCES = {
  vvG1zZ9KdA3: ['artist', 'venue'],
  vvG1zZ9KdA4: ['artist'],
  vvG1zZ9KdA5: ['nearby'],
};
const shows = events.map((event) => ({
  ...toShow(event),
  sources: SOURCES[event.id] ?? ['nearby'],
}));

// Drawn pictures: a gradient and a pattern per event, never the real artwork.
const PATTERNS = [
  (h) =>
    `<circle cx="320" cy="180" r="120" fill="none" stroke="hsl(${h},70%,85%)" stroke-width="16"/><circle cx="320" cy="180" r="28" fill="hsl(${h},70%,85%)"/>`,
  (h) => `<path d="M0 300 L320 60 L640 300 Z" fill="hsl(${h},60%,78%)"/>`,
  (h) =>
    `<path d="M0 180 Q 160 60 320 180 T 640 180" fill="none" stroke="hsl(${h},70%,88%)" stroke-width="18"/>`,
  (h) =>
    `<circle cx="230" cy="170" r="90" fill="hsl(${h},60%,82%)"/><circle cx="410" cy="200" r="90" fill="hsl(${h},60%,68%)"/>`,
];
const images = {};
const keys = new Map();
shows.forEach((show, index) => {
  const hue = (index * 67 + 200) % 360;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360"><rect width="640" height="360" fill="hsl(${hue},45%,34%)"/>${PATTERNS[index % PATTERNS.length](hue)}</svg>`;
  const key = `img-${String(index).padStart(20, '0')}`;
  keys.set(show.id, key);
  images[key] = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
});

const data = {
  shows,
  today: TODAY,
  now: NOW,
  timeZone: TZ,
  hasKey: true,
  followed: true,
  ready: true,
  fetchedAt: NOW - 18 * 60 * 1000,
  imageKey: (show) => keys.get(show.id) ?? null,
};
const contents = {};
for (const language of LANGUAGES) {
  contents[language] = {
    upcoming: buildUpcomingWidget({ ...data, settings: { count: '5' } }),
    next_event: buildNextEventWidget({ ...data, settings: { sources: ['artist'] } }),
    onsale: buildOnsaleWidget({ ...data, settings: { count: '3' } }),
  };
}

const cards = Object.fromEntries(
  manifest.widgets.map((widget) => [widget.key, { icon: widget.icon, label: widget.label }]),
);
writeFileSync(out, JSON.stringify({ contents, images, cards }));
