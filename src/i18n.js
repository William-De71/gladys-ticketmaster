// -----------------------------------------------------------------------------
// Texts of the integration, in English, French, German and Spanish (English
// fallback).
//
// The manifest carries its own labels; these are the texts the code writes at
// runtime: the calendars, widget contents, connection status, results of the
// configuration buttons, scene data. Vocabulary of the Gladys interface
// (calendrier / Kalender / calendario, scène / Szene / escena). Event, artist
// and venue names stay as Ticketmaster writes them.
// -----------------------------------------------------------------------------

import { daysBetween, formatTime, localClock, longDate, shortDate } from './time.js';

const LANGUAGES = ['en', 'fr', 'de', 'es'];
const LOCALES = { en: 'en-GB', fr: 'fr-FR', de: 'de-DE', es: 'es-ES' };

const SEGMENT_NAMES = {
  music: { en: 'Music', fr: 'Musique', de: 'Musik', es: 'Música' },
  sports: { en: 'Sport', fr: 'Sport', de: 'Sport', es: 'Deporte' },
  arts: {
    en: 'Arts & theatre',
    fr: 'Spectacles',
    de: 'Kunst & Theater',
    es: 'Artes y teatro',
  },
  film: { en: 'Film', fr: 'Cinéma', de: 'Film', es: 'Cine' },
  misc: { en: 'Other', fr: 'Divers', de: 'Sonstiges', es: 'Otros' },
  '': { en: 'Event', fr: 'Événement', de: 'Veranstaltung', es: 'Evento' },
};

const STATUS_NAMES = {
  onsale: { en: 'On sale', fr: 'En vente', de: 'Im Verkauf', es: 'A la venta' },
  offsale: { en: 'Off sale', fr: 'Hors vente', de: 'Nicht im Verkauf', es: 'Sin venta' },
  canceled: { en: 'Canceled', fr: 'Annulé', de: 'Abgesagt', es: 'Cancelado' },
  postponed: { en: 'Postponed', fr: 'Reporté', de: 'Verschoben', es: 'Aplazado' },
  rescheduled: { en: 'New date', fr: 'Nouvelle date', de: 'Neuer Termin', es: 'Nueva fecha' },
};

const SOURCE_NAMES = {
  artist: {
    en: 'artists and teams',
    fr: 'artistes et équipes',
    de: 'Künstler und Teams',
    es: 'artistas y equipos',
  },
  venue: { en: 'venues', fr: 'salles', de: 'Veranstaltungsorte', es: 'recintos' },
  nearby: {
    en: 'around the house',
    fr: 'autour de la maison',
    de: 'rund ums Haus',
    es: 'alrededor de la casa',
  },
};

const TEXTS = {
  // Calendars
  calendarArtists: {
    en: 'My artists and teams',
    fr: 'Mes artistes et équipes',
    de: 'Meine Künstler und Teams',
    es: 'Mis artistas y equipos',
  },
  calendarArtistsDescription: {
    en: 'The shows and matches of the artists and teams you follow, from Ticketmaster.',
    fr: 'Les concerts, spectacles et matchs des artistes et équipes que vous suivez, d’après Ticketmaster.',
    de: 'Konzerte, Shows und Spiele der Künstler und Teams, denen Sie folgen, laut Ticketmaster.',
    es: 'Conciertos, espectáculos y partidos de los artistas y equipos que sigue, según Ticketmaster.',
  },
  calendarVenues: {
    en: 'My venues',
    fr: 'Mes salles',
    de: 'Meine Veranstaltungsorte',
    es: 'Mis recintos',
  },
  calendarVenuesDescription: {
    en: 'The programme of the venues you follow, from Ticketmaster.',
    fr: 'La programmation des salles que vous suivez, d’après Ticketmaster.',
    de: 'Das Programm der Veranstaltungsorte, denen Sie folgen, laut Ticketmaster.',
    es: 'La programación de los recintos que sigue, según Ticketmaster.',
  },
  calendarNearby: {
    en: 'Events around the house',
    fr: 'Sorties autour de la maison',
    de: 'Veranstaltungen rund ums Haus',
    es: 'Eventos alrededor de casa',
  },
  calendarNearbyDescription: {
    en: 'Concerts, shows and matches near the house, from Ticketmaster.',
    fr: 'Concerts, spectacles et matchs près de la maison, d’après Ticketmaster.',
    de: 'Konzerte, Shows und Spiele in der Nähe des Hauses, laut Ticketmaster.',
    es: 'Conciertos, espectáculos y partidos cerca de casa, según Ticketmaster.',
  },
  eventFooter: {
    en: 'Source: Ticketmaster',
    fr: 'Source : Ticketmaster',
    de: 'Quelle: Ticketmaster',
    es: 'Fuente: Ticketmaster',
  },
  saleAt: {
    en: 'Public sale: {date}, {time}',
    fr: 'Mise en vente : {date} à {time}',
    de: 'Vorverkauf: {date}, {time} Uhr',
    es: 'Venta general: {date}, {time}',
  },
  priceRange: {
    en: 'Prices: {min} to {max}',
    fr: 'Prix : de {min} à {max}',
    de: 'Preise: {min} bis {max}',
    es: 'Precios: de {min} a {max}',
  },
  priceOne: { en: 'Price: {min}', fr: 'Prix : {min}', de: 'Preis: {min}', es: 'Precio: {min}' },

  // Dates
  today: { en: 'Today', fr: 'Aujourd’hui', de: 'Heute', es: 'Hoy' },
  tomorrow: { en: 'Tomorrow', fr: 'Demain', de: 'Morgen', es: 'Mañana' },
  yesterday: { en: 'Yesterday', fr: 'Hier', de: 'Gestern', es: 'Ayer' },
  inDays: {
    en: 'in {days} days',
    fr: 'dans {days} j',
    de: 'in {days} Tagen',
    es: 'en {days} días',
  },
  daysAgo: {
    en: '{days} days ago',
    fr: 'il y a {days} j',
    de: 'vor {days} Tagen',
    es: 'hace {days} días',
  },
  daysShort: { en: '{days} d', fr: '{days} j', de: '{days} T', es: '{days} d' },
  dateUnknown: {
    en: 'Date to be announced',
    fr: 'Date à venir',
    de: 'Termin folgt',
    es: 'Fecha por anunciar',
  },
  dateAt: {
    en: '{date}, {time}',
    fr: '{date} à {time}',
    de: '{date}, {time} Uhr',
    es: '{date}, {time}',
  },

  // Widgets
  sourceCaption: {
    en: 'Ticketmaster · read at {time}',
    fr: 'Ticketmaster · lu à {time}',
    de: 'Ticketmaster · gelesen um {time}',
    es: 'Ticketmaster · leído a las {time}',
  },
  sourceCaptionNever: {
    en: 'Ticketmaster · not read yet',
    fr: 'Ticketmaster · pas encore lu',
    de: 'Ticketmaster · noch nicht gelesen',
    es: 'Ticketmaster · aún no leído',
  },
  noKey: {
    en: 'Enter your Ticketmaster API key in the configuration of the integration.',
    fr: 'Saisissez votre clé d’API Ticketmaster dans la configuration de l’intégration.',
    de: 'Geben Sie Ihren Ticketmaster-API-Schlüssel in der Konfiguration der Integration ein.',
    es: 'Introduzca su clave de API de Ticketmaster en la configuración de la integración.',
  },
  nothingFollowed: {
    en: 'Nothing followed yet: choose a radius around the house, or follow an artist, a team or a venue in the configuration.',
    fr: 'Rien n’est suivi : choisissez un rayon autour de la maison, ou suivez un artiste, une équipe ou une salle dans la configuration.',
    de: 'Noch nichts verfolgt: Wählen Sie einen Umkreis ums Haus oder folgen Sie in der Konfiguration einem Künstler, Team oder Veranstaltungsort.',
    es: 'Aún no se sigue nada: elija un radio alrededor de la casa, o siga a un artista, un equipo o un recinto en la configuración.',
  },
  reading: {
    en: 'Reading Ticketmaster…',
    fr: 'Lecture de Ticketmaster…',
    de: 'Ticketmaster wird gelesen…',
    es: 'Leyendo Ticketmaster…',
  },
  noUpcoming: {
    en: 'No event to come.',
    fr: 'Aucune sortie à venir.',
    de: 'Keine kommende Veranstaltung.',
    es: 'Ningún evento próximo.',
  },
  noOnsale: {
    en: 'No ticket sale announced.',
    fr: 'Aucune mise en vente annoncée.',
    de: 'Kein angekündigter Vorverkauf.',
    es: 'Ninguna venta anunciada.',
  },
  linkTicketmaster: {
    en: 'On Ticketmaster',
    fr: 'Sur Ticketmaster',
    de: 'Auf Ticketmaster',
    es: 'En Ticketmaster',
  },
  imageAlt: {
    en: 'Picture of {name}',
    fr: 'Image de {name}',
    de: 'Bild von {name}',
    es: 'Imagen de {name}',
  },
  tileIn: { en: 'Countdown', fr: 'Dans', de: 'Noch', es: 'Faltan' },
  tileTime: { en: 'Time', fr: 'Heure', de: 'Uhrzeit', es: 'Hora' },
  statusPlace: { en: 'Venue', fr: 'Lieu', de: 'Ort', es: 'Lugar' },
  statusCategory: { en: 'Category', fr: 'Catégorie', de: 'Kategorie', es: 'Categoría' },
  statusSale: { en: 'Tickets', fr: 'Billetterie', de: 'Tickets', es: 'Entradas' },
  buttonTickets: {
    en: 'Tickets on Ticketmaster',
    fr: 'Billets sur Ticketmaster',
    de: 'Tickets auf Ticketmaster',
    es: 'Entradas en Ticketmaster',
  },

  // Connection status
  statusOk: {
    en: 'Events to come: {shows} · ticket sales to open: {sales}.',
    fr: 'Sorties à venir : {shows} · mises en vente à venir : {sales}.',
    de: 'Kommende Veranstaltungen: {shows} · kommende Vorverkäufe: {sales}.',
    es: 'Próximos eventos: {shows} · próximas ventas: {sales}.',
  },
  statusReading: {
    en: 'Reading Ticketmaster…',
    fr: 'Lecture de Ticketmaster…',
    de: 'Ticketmaster wird gelesen…',
    es: 'Leyendo Ticketmaster…',
  },
  statusNoKey: {
    en: 'Enter your Ticketmaster API key (free) in the configuration.',
    fr: 'Saisissez votre clé d’API Ticketmaster (gratuite) dans la configuration.',
    de: 'Geben Sie Ihren Ticketmaster-API-Schlüssel (kostenlos) in der Konfiguration ein.',
    es: 'Introduzca su clave de API de Ticketmaster (gratuita) en la configuración.',
  },
  statusKeyRefused: {
    en: 'Ticketmaster refuses the API key: check it in the configuration (the “Consumer Key” of your app).',
    fr: 'Ticketmaster refuse la clé d’API : vérifiez-la dans la configuration (la « Consumer Key » de votre application).',
    de: 'Ticketmaster lehnt den API-Schlüssel ab: Prüfen Sie ihn in der Konfiguration (der „Consumer Key“ Ihrer App).',
    es: 'Ticketmaster rechaza la clave de API: revísela en la configuración (la «Consumer Key» de su aplicación).',
  },
  statusQuota: {
    en: 'Daily quota of the key spent: next reading at {time}.',
    fr: 'Quota quotidien de la clé épuisé : prochaine lecture à {time}.',
    de: 'Tageskontingent des Schlüssels verbraucht: nächstes Lesen um {time}.',
    es: 'Cuota diaria de la clave agotada: próxima lectura a las {time}.',
  },
  statusUnreachable: {
    en: 'Ticketmaster unreachable: {error}',
    fr: 'Ticketmaster injoignable : {error}',
    de: 'Ticketmaster nicht erreichbar: {error}',
    es: 'Ticketmaster no disponible: {error}',
  },
  statusNothing: {
    en: 'Nothing followed: choose a radius around the house, or follow an artist, a team or a venue.',
    fr: 'Rien n’est suivi : choisissez un rayon autour de la maison, ou suivez un artiste, une équipe ou une salle.',
    de: 'Nichts verfolgt: Wählen Sie einen Umkreis ums Haus oder folgen Sie einem Künstler, Team oder Veranstaltungsort.',
    es: 'Nada seguido: elija un radio alrededor de la casa, o siga a un artista, un equipo o un recinto.',
  },
  statusHouse_noLocation: {
    en: '{status} “Around the house” is off: the house has no position (Settings → Houses).',
    fr: '{status} « Autour de la maison » est inactif : la maison n’a pas de position (Paramètres → Maisons).',
    de: '{status} „Rund ums Haus“ ist aus: Das Haus hat keine Position (Einstellungen → Häuser).',
    es: '{status} «Alrededor de la casa» está inactivo: la casa no tiene posición (Ajustes → Casas).',
  },
  statusHouse_houseUnreadable: {
    en: '{status} “Around the house” is off: the houses of Gladys cannot be read.',
    fr: '{status} « Autour de la maison » est inactif : les maisons de Gladys ne peuvent pas être lues.',
    de: '{status} „Rund ums Haus“ ist aus: Die Häuser von Gladys können nicht gelesen werden.',
    es: '{status} «Alrededor de la casa» está inactivo: no se pueden leer las casas de Gladys.',
  },

  // Configuration buttons
  followed: {
    en: 'Followed: {name}. Its events arrive with the reading under way.',
    fr: 'Suivi : {name}. Ses dates arrivent avec la lecture en cours.',
    de: 'Verfolgt: {name}. Die Termine kommen mit dem laufenden Lesevorgang.',
    es: 'Seguido: {name}. Sus fechas llegan con la lectura en curso.',
  },
  followedNamesakes: {
    en: '\nOther answers of the same name (to follow one of them instead, stop following this one and paste its identifier):\n{list}',
    fr: '\nAutres réponses du même nom (pour suivre l’une d’elles à la place, ne suivez plus celle-ci et collez son identifiant) :\n{list}',
    de: '\nWeitere Treffer gleichen Namens (um stattdessen einem davon zu folgen, diesen entfernen und dessen Kennung einfügen):\n{list}',
    es: '\nOtras respuestas con el mismo nombre (para seguir una de ellas, deje de seguir esta y pegue su identificador):\n{list}',
  },
  unfollowed: {
    en: 'No longer followed: {name}.',
    fr: 'N’est plus suivi : {name}.',
    de: 'Nicht mehr verfolgt: {name}.',
    es: 'Ya no se sigue: {name}.',
  },
  listAttractions: {
    en: 'Artists and teams followed: {count}',
    fr: 'Artistes et équipes suivis : {count}',
    de: 'Verfolgte Künstler und Teams: {count}',
    es: 'Artistas y equipos seguidos: {count}',
  },
  listVenues: {
    en: 'Venues followed: {count}',
    fr: 'Salles suivies : {count}',
    de: 'Verfolgte Veranstaltungsorte: {count}',
    es: 'Recintos seguidos: {count}',
  },
  listNearby: {
    en: 'Around the house: {radius} km, {segments}, {days} days ahead.',
    fr: 'Autour de la maison : {radius} km, {segments}, {days} jours à l’avance.',
    de: 'Rund ums Haus: {radius} km, {segments}, {days} Tage im Voraus.',
    es: 'Alrededor de la casa: {radius} km, {segments}, {days} días por delante.',
  },
  listNearbyOff: {
    en: 'Around the house: off.',
    fr: 'Autour de la maison : désactivé.',
    de: 'Rund ums Haus: aus.',
    es: 'Alrededor de la casa: desactivado.',
  },
  listCountry: {
    en: 'Dates of the followed artists and teams: {country}.',
    fr: 'Dates des artistes et équipes suivis : {country}.',
    de: 'Termine der verfolgten Künstler und Teams: {country}.',
    es: 'Fechas de los artistas y equipos seguidos: {country}.',
  },
  countryAll: {
    en: 'every country',
    fr: 'tous les pays',
    de: 'alle Länder',
    es: 'todos los países',
  },
  listTruncated: {
    en: 'Around the house: more than 1,000 events, only the nearest dates are kept (choose a smaller radius or fewer days).',
    fr: 'Autour de la maison : plus de 1 000 sorties, seules les dates les plus proches sont gardées (choisissez un rayon ou une durée plus petits).',
    de: 'Rund ums Haus: mehr als 1.000 Veranstaltungen, nur die nächsten Termine bleiben (kleineren Umkreis oder weniger Tage wählen).',
    es: 'Alrededor de la casa: más de 1.000 eventos, solo se guardan las fechas más cercanas (elija un radio o un periodo menor).',
  },
  refreshRunning: {
    en: 'A reading is already under way.',
    fr: 'Une lecture est déjà en cours.',
    de: 'Ein Lesevorgang läuft bereits.',
    es: 'Ya hay una lectura en curso.',
  },
  refreshed: {
    en: 'Ticketmaster read. Events to come: {shows} · ticket sales to open: {sales}.',
    fr: 'Ticketmaster relu. Sorties à venir : {shows} · mises en vente à venir : {sales}.',
    de: 'Ticketmaster gelesen. Kommende Veranstaltungen: {shows} · kommende Vorverkäufe: {sales}.',
    es: 'Ticketmaster leído. Próximos eventos: {shows} · próximas ventas: {sales}.',
  },
  refreshFailed: {
    en: 'The reading failed: {error}',
    fr: 'La lecture a échoué : {error}',
    de: 'Der Lesevorgang ist fehlgeschlagen: {error}',
    es: 'La lectura falló: {error}',
  },
  tmNoKey: {
    en: 'Enter your Ticketmaster API key in the configuration first (and save).',
    fr: 'Saisissez d’abord votre clé d’API Ticketmaster dans la configuration (et enregistrez).',
    de: 'Geben Sie zuerst Ihren Ticketmaster-API-Schlüssel in der Konfiguration ein (und speichern Sie).',
    es: 'Introduzca primero su clave de API de Ticketmaster en la configuración (y guarde).',
  },
  tmKeyRefused: {
    en: 'Ticketmaster refuses the API key of the configuration.',
    fr: 'Ticketmaster refuse la clé d’API de la configuration.',
    de: 'Ticketmaster lehnt den API-Schlüssel der Konfiguration ab.',
    es: 'Ticketmaster rechaza la clave de API de la configuración.',
  },
  tmQuota: {
    en: 'The daily quota of the key is spent: try again after {time}.',
    fr: 'Le quota quotidien de la clé est épuisé : réessayez après {time}.',
    de: 'Das Tageskontingent des Schlüssels ist verbraucht: nach {time} erneut versuchen.',
    es: 'La cuota diaria de la clave está agotada: inténtelo después de las {time}.',
  },
  tmUnreachable: {
    en: 'Ticketmaster did not answer: {error}',
    fr: 'Ticketmaster n’a pas répondu : {error}',
    de: 'Ticketmaster hat nicht geantwortet: {error}',
    es: 'Ticketmaster no respondió: {error}',
  },
  followMissing: {
    en: 'Type a name or an identifier.',
    fr: 'Saisissez un nom ou un identifiant.',
    de: 'Geben Sie einen Namen oder eine Kennung ein.',
    es: 'Escriba un nombre o un identificador.',
  },
  followUnknownId: {
    en: 'Ticketmaster knows no {id}.',
    fr: 'Ticketmaster ne connaît pas {id}.',
    de: 'Ticketmaster kennt {id} nicht.',
    es: 'Ticketmaster no conoce {id}.',
  },
  followNotFound: {
    en: 'Nothing called “{name}” on Ticketmaster.',
    fr: 'Rien ne s’appelle « {name} » sur Ticketmaster.',
    de: 'Nichts namens „{name}“ auf Ticketmaster.',
    es: 'Nada se llama «{name}» en Ticketmaster.',
  },
  followNotFoundSuggest: {
    en: 'Nothing called exactly “{name}” on Ticketmaster. Nearest answers (type the exact name, or paste the identifier):\n{suggestions}',
    fr: 'Rien ne s’appelle exactement « {name} » sur Ticketmaster. Réponses les plus proches (saisissez le nom exact, ou collez l’identifiant) :\n{suggestions}',
    de: 'Nichts heißt genau „{name}“ auf Ticketmaster. Nächste Treffer (genauen Namen eingeben oder Kennung einfügen):\n{suggestions}',
    es: 'Nada se llama exactamente «{name}» en Ticketmaster. Respuestas más cercanas (escriba el nombre exacto, o pegue el identificador):\n{suggestions}',
  },
  followAlready: {
    en: 'Already followed: {name}.',
    fr: 'Déjà suivi : {name}.',
    de: 'Wird bereits verfolgt: {name}.',
    es: 'Ya se sigue: {name}.',
  },
  followTooMany: {
    en: 'At most {max} can be followed.',
    fr: 'On peut en suivre {max} au maximum.',
    de: 'Höchstens {max} können verfolgt werden.',
    es: 'Se pueden seguir {max} como máximo.',
  },
  followNotFollowed: {
    en: '“{name}” is not followed (see “List what is followed”).',
    fr: '« {name} » n’est pas suivi (voir « Lister ce qui est suivi »).',
    de: '„{name}“ wird nicht verfolgt (siehe „Verfolgtes auflisten“).',
    es: '«{name}» no se sigue (vea «Listar lo que se sigue»).',
  },
  followAmbiguous: {
    en: 'Several followed entries are called “{name}”: paste the identifier of the one to remove.\n{list}',
    fr: 'Plusieurs entrées suivies s’appellent « {name} » : collez l’identifiant de celle à retirer.\n{list}',
    de: 'Mehrere verfolgte Einträge heißen „{name}“: Fügen Sie die Kennung des zu entfernenden ein.\n{list}',
    es: 'Varias entradas seguidas se llaman «{name}»: pegue el identificador de la que quiere quitar.\n{list}',
  },

  // Scenes
  textAnnounced: {
    en: 'New date: {name}, {date}, {place}.',
    fr: 'Nouvelle date : {name}, {date}, {place}.',
    de: 'Neuer Termin: {name}, {date}, {place}.',
    es: 'Nueva fecha: {name}, {date}, {place}.',
  },
  textAnnouncedNoDate: {
    en: 'New event announced: {name} (date to be announced), {place}.',
    fr: 'Nouvelle sortie annoncée : {name} (date à venir), {place}.',
    de: 'Neue Veranstaltung angekündigt: {name} (Termin folgt), {place}.',
    es: 'Nuevo evento anunciado: {name} (fecha por anunciar), {place}.',
  },
  textToday: {
    en: '{name}: today, {place}.',
    fr: '{name} : aujourd’hui, {place}.',
    de: '{name}: heute, {place}.',
    es: '{name}: hoy, {place}.',
  },
  textTodayAt: {
    en: '{name}: today at {time}, {place}.',
    fr: '{name} : aujourd’hui à {time}, {place}.',
    de: '{name}: heute um {time} Uhr, {place}.',
    es: '{name}: hoy a las {time}, {place}.',
  },
  textTomorrow: {
    en: '{name}: tomorrow, {place}.',
    fr: '{name} : demain, {place}.',
    de: '{name}: morgen, {place}.',
    es: '{name}: mañana, {place}.',
  },
  textTomorrowAt: {
    en: '{name}: tomorrow at {time}, {place}.',
    fr: '{name} : demain à {time}, {place}.',
    de: '{name}: morgen um {time} Uhr, {place}.',
    es: '{name}: mañana a las {time}, {place}.',
  },
  textInDays: {
    en: '{name}: in {days} days, {date}, {place}.',
    fr: '{name} : dans {days} jours, {date}, {place}.',
    de: '{name}: in {days} Tagen, {date}, {place}.',
    es: '{name}: dentro de {days} días, {date}, {place}.',
  },
  textPast: {
    en: '{name} took place {date}, {place}.',
    fr: '{name} a eu lieu {date}, {place}.',
    de: '{name} fand am {date} statt, {place}.',
    es: '{name} tuvo lugar el {date}, {place}.',
  },
  textDateUnknown: {
    en: '{name}: date to be announced, {place}.',
    fr: '{name} : date à venir, {place}.',
    de: '{name}: Termin folgt, {place}.',
    es: '{name}: fecha por anunciar, {place}.',
  },
  textCanceled: {
    en: '{name} ({date}) is canceled.',
    fr: '{name} ({date}) est annulé.',
    de: '{name} ({date}) ist abgesagt.',
    es: '{name} ({date}) está cancelado.',
  },
  textChange_canceled: {
    en: 'Canceled: {name}, {date}, {place}.',
    fr: 'Annulé : {name}, {date}, {place}.',
    de: 'Abgesagt: {name}, {date}, {place}.',
    es: 'Cancelado: {name}, {date}, {place}.',
  },
  textChange_postponed: {
    en: 'Postponed: {name} (was {previous}), new date to be announced.',
    fr: 'Reporté : {name} (prévu {previous}), nouvelle date à venir.',
    de: 'Verschoben: {name} (geplant {previous}), neuer Termin folgt.',
    es: 'Aplazado: {name} (previsto {previous}), nueva fecha por anunciar.',
  },
  textChange_rescheduled: {
    en: 'New date for {name}: {date} (instead of {previous}).',
    fr: 'Nouvelle date pour {name} : {date} (au lieu de {previous}).',
    de: 'Neuer Termin für {name}: {date} (statt {previous}).',
    es: 'Nueva fecha para {name}: {date} (en lugar de {previous}).',
  },
  textChange_date_changed: {
    en: '{name} moves: {date} (instead of {previous}).',
    fr: '{name} change de date : {date} (au lieu de {previous}).',
    de: '{name} wird verlegt: {date} (statt {previous}).',
    es: '{name} cambia de fecha: {date} (en lugar de {previous}).',
  },
  textSaleOpen: {
    en: 'Tickets on sale now: {name}, {date}.',
    fr: 'Billetterie ouverte : {name}, {date}.',
    de: 'Vorverkauf gestartet: {name}, {date}.',
    es: 'Entradas a la venta: {name}, {date}.',
  },
  textSaleTodayAt: {
    en: 'Tickets on sale today at {time}: {name}, {date}.',
    fr: 'Mise en vente aujourd’hui à {time} : {name}, {date}.',
    de: 'Vorverkauf heute um {time} Uhr: {name}, {date}.',
    es: 'Venta hoy a las {time}: {name}, {date}.',
  },
  textSaleTomorrowAt: {
    en: 'Tickets on sale tomorrow at {time}: {name}, {date}.',
    fr: 'Mise en vente demain à {time} : {name}, {date}.',
    de: 'Vorverkauf morgen um {time} Uhr: {name}, {date}.',
    es: 'Venta mañana a las {time}: {name}, {date}.',
  },
  textNone: {
    en: 'No event to come.',
    fr: 'Aucune sortie à venir.',
    de: 'Keine kommende Veranstaltung.',
    es: 'Ningún evento próximo.',
  },
};

/**
 * @description Whether a value is a language of the integration.
 * @param {unknown} value - A value.
 * @returns {boolean} True for en, fr, de, es.
 */
const isLanguage = (value) => LANGUAGES.includes(value);

/**
 * @description A text in a language, with its values.
 * @param {string} key - A TEXTS key.
 * @param {string} language - The language (English when unknown).
 * @param {object} [values] - The substitutions.
 * @returns {string} The text, the key itself when unknown.
 */
function t(key, language, values = {}) {
  const entry = TEXTS[key];
  if (!entry) {
    return key;
  }
  const template = entry[isLanguage(language) ? language : 'en'] ?? entry.en;
  return template.replace(/\{(\w+)\}/g, (whole, name) =>
    values[name] === undefined || values[name] === null ? '' : String(values[name]),
  );
}

/**
 * @description A text in the four languages.
 * @param {string} key - A TEXTS key.
 * @param {object|Function} [values] - The values, or `(language) => values`.
 * @returns {object} `{ en, fr, de, es }`.
 */
function all(key, values = {}) {
  return Object.fromEntries(
    LANGUAGES.map((language) => [
      language,
      t(key, language, typeof values === 'function' ? values(language) : values),
    ]),
  );
}

/**
 * @description A text built per language.
 * @param {Function} build - `(language) => string`.
 * @returns {object} `{ en, fr, de, es }`.
 */
const each = (build) =>
  Object.fromEntries(LANGUAGES.map((language) => [language, build(language)]));

const named = (table) => (key, language) => {
  const entry = table[key];
  if (!entry) {
    return String(key ?? '');
  }
  return entry[isLanguage(language) ? language : 'en'] ?? entry.en;
};

/** The name of a category: `segmentName('arts', 'fr')`. */
const segmentName = named(SEGMENT_NAMES);
/** The name of a status: `statusName('canceled', 'fr')`. */
const statusName = named(STATUS_NAMES);
/** The name of a kind of source: `sourceName('venue', 'fr')`. */
const sourceName = named(SOURCE_NAMES);

/**
 * @description When a show takes place: "Saturday 13 June 2026, 20:00", or
 * "Date to be announced".
 * @param {object} show - A show.
 * @param {string} language - The language.
 * @returns {string} The text.
 */
function showDateText(show, language) {
  if (!show?.date) {
    return t('dateUnknown', language);
  }
  const date = `${longDate(show.date, language)} ${show.date.slice(0, 4)}`;
  return show.time ? t('dateAt', language, { date, time: show.time }) : date;
}

/**
 * @description The opening of the public sale: "Public sale: Mon 24 Nov, 10:00".
 * @param {string} onsale - ISO instant.
 * @param {string} language - The language.
 * @param {string} [timeZone] - Timezone of the instance.
 * @returns {string} The text, '' when invalid.
 */
function saleText(onsale, language, timeZone) {
  const instant = Date.parse(String(onsale ?? ''));
  if (!Number.isFinite(instant)) {
    return '';
  }
  return t('saleAt', language, {
    date: shortDate(localClock(instant, timeZone).date, language),
    time: formatTime(instant, timeZone),
  });
}

/**
 * @description A price range: "Prices: €45.00 to €89.00".
 * @param {object} price - `{ min, max, currency }`.
 * @param {string} language - The language.
 * @returns {string} The text, '' when invalid.
 */
function priceText(price, language) {
  if (!price || !Number.isFinite(price.min) || !/^[A-Z]{3}$/.test(price.currency ?? '')) {
    return '';
  }
  const format = (value) =>
    new Intl.NumberFormat(LOCALES[language] ?? LOCALES.en, {
      style: 'currency',
      currency: price.currency,
    }).format(value);
  return price.max > price.min
    ? t('priceRange', language, { min: format(price.min), max: format(price.max) })
    : t('priceOne', language, { min: format(price.min) });
}

/**
 * @description How far a date is: "Today", "in 6 days", "3 days ago".
 * @param {string} date - `YYYY-MM-DD`.
 * @param {string} today - `YYYY-MM-DD`.
 * @param {string} language - The language.
 * @returns {string} The text.
 */
function distanceText(date, today, language) {
  const days = daysBetween(today, date);
  if (days === null) {
    return '';
  }
  if (days === 0) {
    return t('today', language);
  }
  if (days === 1) {
    return t('tomorrow', language);
  }
  if (days === -1) {
    return t('yesterday', language);
  }
  return days > 0 ? t('inDays', language, { days }) : t('daysAgo', language, { days: -days });
}

/**
 * @description Cut a text to a length, with an ellipsis.
 * @param {unknown} value - The text.
 * @param {number} max - The maximum length.
 * @returns {string} The text, at most `max` characters.
 */
function truncate(value, max) {
  const text = String(value ?? '');
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

export {
  LANGUAGES,
  SEGMENT_NAMES,
  STATUS_NAMES,
  SOURCE_NAMES,
  TEXTS,
  isLanguage,
  t,
  all,
  each,
  segmentName,
  statusName,
  sourceName,
  showDateText,
  saleText,
  priceText,
  distanceText,
  truncate,
};
