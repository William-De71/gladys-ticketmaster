// -----------------------------------------------------------------------------
// Entry point of the Ticketmaster external integration.
//
// Brings concerts, shows and matches into Gladys, from the official Discovery
// API of Ticketmaster (a free key per user):
//   - calendars: "My artists and teams", "My venues", "Events around the
//     house", for every user who enabled the integration in "My calendars"
//     (src/calendar.js);
//   - scene triggers: a new date is announced, a reminder (today, tomorrow,
//     in a week), the ticket sale opens, a show is canceled or moved;
//   - scene action: the next event;
//   - dashboard widgets: the next events, the next event, the ticket sales
//     to open;
//   - configuration buttons: follow / stop following an artist or a team, a
//     venue, list what is followed, read again.
//
// This file only wires the SDK client: the handlers are in src/app.js.
//
// Environment variables provided by the Gladys supervisor:
//   GLADYS_HOST_API_URL / GLADYS_INTEGRATION_TOKEN / GLADYS_INTEGRATION_SELECTOR, TZ
// The SDK reads them automatically: `new GladysIntegration()` is enough.
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import { createApp } from './src/app.js';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

const gladys = new GladysIntegration();
const app = createApp(gladys, {
  userAgent: `gladys-ticketmaster/${version} (+https://github.com/William-De71/gladys-ticketmaster)`,
});

gladys.handleShutdown(async (signal) => {
  logger.info(`Received ${signal} -> graceful shutdown`);
  app.stop();
});

// --- Startup -----------------------------------------------------------------------
logger.info(`Starting the Ticketmaster integration ${version}...`);
gladys
  .connect()
  .then(() => app.start())
  .catch((err) => {
    logger.error('Initial connection failed', err);
    process.exit(1);
  });
