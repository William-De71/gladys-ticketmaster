# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions
follow [Semantic Versioning](https://semver.org/). This file is generated at
each release from the Conventional Commits: do not edit it by hand.

## [0.1.0] - unreleased

### Added

- Concerts, shows, matches and festivals from the official Discovery API of Ticketmaster, with your own free key (5,000 requests a day; the integration uses a few hundred at most).
- Three ways to choose what to follow, added together: the events around the house (radius from 5 to 100 km, categories, 30 days to a year ahead, the position of the house comes from Gladys), artists and teams, and venues, followed with configuration buttons (a name is enough, namesakes are told apart by their identifier).
- Up to three calendars for every user who enables the integration in "My calendars": "My artists and teams", "My venues" and "Events around the house"; each event lives in the most personal one, with its time, venue, category, ticket sale and prices; canceled and postponed events stay, their name says so.
- Scene triggers: new date, reminder (the day itself, the day before or a week before, at the hour you choose), ticket sale opening (at the opening, an hour before or the day before) and canceled or moved, each with filters by source, category and artist and a ready-made sentence.
- Scene action: the next event, with filters, its date, time, venue, sale and a ready-made sentence.
- Dashboard widgets: the upcoming events (list with pictures), the next event (countdown and large picture) and the ticket sales to open.
- Configuration buttons: follow or stop following an artist or a team, a venue, list what is followed, read again now.
- The daily quota and a refused key are told in the status of the integration; a reading that fails keeps what was already known.
- Cloud transport: the Discovery API and the image servers of Ticketmaster only; the position of the house goes out rounded to about 150 m.
- English, French, German and Spanish everywhere: settings, calendars, widgets, scenes and documentation.
