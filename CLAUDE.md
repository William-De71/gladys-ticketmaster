# CLAUDE.md

Project rules for coding assistants (Claude Code reads this file) and for human
contributors.

## What this is

A Gladys Assistant **external integration** for the concerts, shows and
matches listed by Ticketmaster: a Node.js service (Node 22+, ESM, no build
step) that runs in its own sandboxed Docker container and talks to Gladys
through
[`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js),
its only runtime dependency. The events come from the official
[Discovery API](https://developer.ticketmaster.com/products-and-docs/apis/discovery-api/v2/)
(version 2, JSON), read with the free key of each user; the pictures from
Ticketmaster's image servers (`ticketm.net`). Transport: cloud only.

A **calendar integration** (`type: "calendar"`, Gladys 5.3.0+): up to three
calendars for every user who enabled it in "My calendars" (followed artists
and teams, followed venues, around the house), three dashboard widgets, four
scene triggers, one scene action and six configuration buttons. No devices:
Gladys does not let one manifest be both. `location: true` reads the position
of the house (`getHouses()`).

The integration was written **without a real key**: the tests fake the API
with answers built from its documentation. Check the pitfalls below against
real answers when a key is available.

## Commands

```bash
npm install
npm test                                  # node --test, never touches the network
node --test test/app.test.js              # one file
DEBUG=gladys-integration-sdk npm test     # with the SDK debug logs
npm run lint                              # ESLint
npm run format:check                      # Prettier, as the CI runs it
npm run format                            # Prettier, fix in place
npx github:GladysAssistant/integration-store . --skip-image-check   # store checks
scripts/build-cover.sh                    # cover.jpg from docs/assets/cover.svg
docs/illustrations/render.sh              # docs/assets/widgets.<lang>.png
node .github/scripts/release.mjs next     # the version the next release would get
```

## Architecture

```
index.js                SDK wiring only (new GladysIntegration + createApp + shutdown)
src/app.js              every handler, registered before connect(); the one-minute tick
src/ticketmaster.js     HTTP client of the Discovery API: key, spacing, quota pause, spike retries, paging
src/follows.js          artists/teams and venues of the buttons (registries in the Gladys config), name -> entry
src/scan.js             the reading: one search per source, merge, what changed, canceled look-ups
src/shows.js            raw event -> show; categories, sources, filters, order of the lists
src/geo.js              geohash of the house (7 characters), choice of the house
src/calendar.js         up to three calendars per user, timed / all-day events, windows of 500
src/events.js           scene trigger payloads, reminders, sale openings, scene action outputs
src/widgets.js          `upcoming`, `next_event`, `onsale` (pure, reused by docs/illustrations/gen.mjs)
src/images.js           pictures of ticketm.net: keys, checks, cache
src/store.js            /data/state.json: shows, ids seen, sources read, pictures, events sent
src/config.js           configuration (key, house, radius, categories, country, interval, hour, language)
src/i18n.js             runtime texts, en / fr / de / es
src/time.js             calendar dates and times in the timezone of the instance (TZ)
gladys-assistant-integration.json   manifest
docs/{en,fr,de,es}.md   user documentation, re-hosted by the store
docs/illustrations/     generated widget images (render.sh, gen.mjs, render.js)
.github/scripts/release.mjs         version, changelog, bump (tested in test/)
```

## Rules

- **Keys are forever**: the categories (`music`, `sports`, `arts`, `film`,
  `misc`), the sources (`artist`, `venue`, `nearby`), the statuses, the
  changes (`canceled`, `postponed`, `rescheduled`, `date_changed`), the
  calendar ids `ext:<selector>:<user>:artists|venues|nearby`, the event ids
  `ext:<selector>:<user>:ev-<Ticketmaster id>`, the keys of `config_schema`,
  of the buttons (`actions`), of the widgets and their settings, of the scene
  triggers (fields, options, variables, the `lead` values) and of the scene
  action (fields, outputs), and the internal config keys `attractions`,
  `venues` and `last_language`. `test/manifest.test.js` and
  `test/app.test.js` tie the manifest to the code.
- **Be gentle with the key**: one request at a time, at least 250 ms apart
  (the limit is 5 a second); one search per source per reading, paged up to
  the 1,000th event (`size * page < 1000`); a reading every 6 to 24 hours.
  HTTP 401 marks the key as refused: nothing goes out with it until it
  changes. HTTP 429 "quota" pauses everything until `Rate-Limit-Reset` (one
  hour when missing); 429 "spike arrest" is tried again twice. Never a retry
  in a loop. `locale=*` on every request (the default `en` drops most
  European events).
- **Secrets.** The API key is a `secret` field, only sent to Ticketmaster in
  the `apikey` parameter, never logged nor written to /data nor put in an
  error message (the labels of the errors are built without it; a 429 fault
  quotes the key and is never copied).
- **Privacy.** The position of the house only goes out as a geohash of 7
  characters (about 150 m), never the coordinates nor the address.
- **One show, one calendar**: the most personal source wins (artist, then
  venue, then nearby). A calendar whose source is no longer used is deleted.
  Timed events when the time is known, all-day otherwise; no event without a
  date. More than 500 events: consecutive windows cut between days, the days
  around a boundary in both requests.
- **Complete readings replace, failed sources keep.** A source that failed
  keeps the shows it had found. A show gone before its date is looked up once
  (10 per reading): canceled, it stays with its status until its date; a show
  that took place stays a week.
- **Events once, on transitions.** `event_announced` only for a show never
  seen (`seen`), found by a source already read with the same settings (the
  first reading of a source, or of a changed one, is a baseline), not
  canceled nor past, 20 at most per reading; `event_status_changed` for
  canceled, postponed, rescheduled or another day/time; `event_reminder` once
  per show, date and lead, from `notify_hour` on; `sale_opening` once per
  show, opening and lead, at most two hours late and never after the moment
  it announces. `fired` in /data survives restarts. A scene action, a widget
  or a button never fires an event.
- **What is followed is configuration**, not state: the artists, teams and
  venues of the buttons are saved with `setConfig` (they follow the Gladys
  backups); /data only holds what can be read again. A name keeps only an
  answer of exactly that name (without case nor accents); Ticketmaster gives
  no score, so nothing is guessed: the nearest answers are suggested with
  their identifiers, namesakes are listed.
- **Pictures.** Only `https://*.ticketm.net` is fetched, 300 KB at most,
  checked by magic number; image keys are `img-` + 20 hex characters of the
  SHA-256 of the address (Gladys keys are lower case), the address kept in
  /data. The repository ships no real picture: the illustrations draw their
  own.
- **The container rootfs is read-only.** Write only under `/data`.
- **Four languages.** Every user-facing text (manifest, runtime messages in
  `src/i18n.js`, `docs/*.md`, README) exists in English, French, German and
  Spanish. `test/i18n.test.js` checks it, and the same heading structure in
  the four docs. Event, artist and venue names stay as Ticketmaster writes
  them; scene variables carry keys, plus `date_text`, `onsale_text` and
  `text` in the language of the configuration. Counts are written "Venues
  followed: 3", never "3 venues". Badge texts fit 16 characters. Use the
  words of the Gladys UI (My calendars, Enable for me, Share with the
  household…).
- **Widget images.** After any change to the content of a widget, run
  `docs/illustrations/render.sh` again and look at the four PNG files.
- **Versions belong to the Release workflow**: never edit `version` in
  `package.json`, the lockfile or the manifest, nor the `docker_image` tag.
  The version stays below 1.0.0 until the maintainer runs the Release workflow
  with `release-as: 1.0.0`.
- **Changelog.** Never edit CHANGELOG.md by hand, it is generated at the
  release. Write the PR title as the line the user will read.
- **Commits and PR titles** follow Conventional Commits, in English: `feat` ->
  minor, `fix` / `perf` -> patch, `!` or `BREAKING CHANGE:` -> major (minor
  below 1.0.0); `docs`, `chore`, `ci`, `test`, `style`, `refactor`, `build`
  release nothing.
- **Manifest.** Texts are objects `{ "en", "fr", "de", "es" }`; the catalog
  `description` holds 10 to 100 characters per language; the file stays under
  100 KB (about 94 KB now: the variables are repeated in the four triggers,
  mind it when adding some; 20 variables at most per trigger). Transport:
  `["cloud"]`. Permission: `location` only.
- **Forum drafts** (`.github/forum-*.md`) are never committed.
- **Style.** Prettier formats, ESLint catches mistakes. Comments explain why,
  in English. Tests never touch the network (`test/helpers.js` fakes
  Ticketmaster).

## Pitfalls (from the documentation, not yet seen on real answers)

- Invalid key: HTTP 401 `{"fault":{"faultstring":"Invalid ApiKey",…}}`.
  Daily quota: HTTP 429 `Rate limit quota violation…` with the key in the
  text; headers `Rate-Limit`, `Rate-Limit-Available`, `Rate-Limit-Reset`
  (ms since the epoch).
- An empty search has no `_embedded`; `page.totalElements` /
  `page.totalPages` give the size. Deep paging stops at the 1,000th item.
- `startDateTime` / `endDateTime` without milliseconds
  (`2026-11-23T08:00:00Z`). `latlong` is deprecated: `geoPoint` (geohash).
- `dates.start`: `localDate`, `localTime` (venue time), `dateTime` (UTC);
  `dateTBA`, `dateTBD`, `timeTBA`, `noSpecificTime`. A canceled event may
  leave the searches instead of turning `canceled`: hence the look-ups.
- Segment ids (stable): music `KZFzniwnSyZfZ7v7nJ`, sports
  `KZFzniwnSyZfZ7v7nE`, arts & theatre `KZFzniwnSyZfZ7v7na`, film
  `KZFzniwnSyZfZ7v7nn`, miscellaneous `KZFzniwnSyZfZ7v7n1`.
- The coverage of France and of other European countries is not documented
  precisely ("other European countries"): to check with a real key.
- Inside a card-list, the list display shows the date OR the subtitle: the
  day goes in the subtitle, never in `date`.
- The timers of the integration are `unref`ed: a script that drives the app
  without the SDK websocket must keep the process alive itself.
