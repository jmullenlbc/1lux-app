/**
 * Turning a calendar provider's event into the neutral shape the rules read.
 *
 * This is the ONE file that changes when the Microsoft calendar is connected —
 * the twin of src/lib/email/normalize.js. Everything downstream (the title and
 * location reading in inPerson.js, the classifier, the note that gets created)
 * works off the neutral shape and never learns that Microsoft exists.
 *
 * The neutral shape:
 *   {
 *     externalId       string?   the provider's own id for this event
 *     seriesId         string?   the id shared by every instance of a recurring meeting
 *     iCalUid          string?   the id that survives across mailboxes
 *     title            string
 *     location         string?
 *     body             string?
 *     attendees        [{ email, name, isOrganizer, isOptional }]
 *     attendeeCount    number
 *     organizerEmail   string?
 *     organizerName    string?
 *     startAt          Date?
 *     endAt            Date?
 *     durationMinutes  number?
 *     onlineMeetingUrl string?
 *     isCancelled      boolean
 *     isAllDay         boolean
 *     webUrl           string?
 *   }
 */

/** Graph writes addresses as { emailAddress: { address, name } }. */
function graphAddress(entry) {
  return String(entry?.emailAddress?.address || entry?.address || '').trim().toLowerCase();
}

function graphName(entry) {
  return entry?.emailAddress?.name || entry?.name || null;
}

/** Graph sends "2026-09-07T15:00:00.0000000" with the zone in a sibling field. */
function graphDate(slot) {
  const raw = slot?.dateTime || slot;
  if (!raw) return null;
  // A bare Graph dateTime carries no offset; treat it as UTC so it parses the
  // same way everywhere. The sync passes real timezone handling in later.
  const text = typeof raw === 'string' && !/[Zz]|[+-]\d{2}:?\d{2}$/.test(raw)
    ? `${raw}Z`
    : raw;
  const d = new Date(text);
  return Number.isNaN(d.getTime()) ? null : d;
}

function minutesBetween(start, end) {
  if (!start || !end) return null;
  const mins = Math.round((end.getTime() - start.getTime()) / 60000);
  return mins > 0 ? mins : null;
}

/** Strip HTML down to something the keyword and AI layers can read. */
function plainBody(msg) {
  if (msg?.bodyPreview) return String(msg.bodyPreview);
  const html = msg?.body?.content;
  if (!html) return '';
  return String(html).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Microsoft Graph event → neutral shape.
 *
 * `mailboxAddress` is the calendar we synced from; it is used to tell our own
 * people apart from the outside guests.
 */
export function fromGraphEvent(ev, mailboxAddress = '') {
  const mailbox   = String(mailboxAddress || '').trim().toLowerCase();
  const attendees = (Array.isArray(ev?.attendees) ? ev.attendees : [])
    .map(a => ({
      email:       graphAddress(a),
      name:        graphName(a),
      isOptional:  a?.type === 'optional',
      isOrganizer: false,
    }))
    .filter(a => a.email);

  const organizerEmail = graphAddress(ev?.organizer);
  for (const a of attendees) {
    if (organizerEmail && a.email === organizerEmail) a.isOrganizer = true;
  }
  // Graph often leaves the organizer out of the attendee list. They were in the
  // room, so they belong in the count.
  if (organizerEmail && !attendees.some(a => a.email === organizerEmail)) {
    attendees.unshift({
      email: organizerEmail, name: graphName(ev?.organizer),
      isOptional: false, isOrganizer: true,
    });
  }

  const startAt = graphDate(ev?.start);
  const endAt   = graphDate(ev?.end);

  // A location can arrive as one displayName or as a list of rooms.
  const location = ev?.location?.displayName
    || (Array.isArray(ev?.locations)
        ? ev.locations.map(l => l?.displayName).filter(Boolean).join(', ')
        : '')
    || '';

  return {
    externalId:       ev?.id || null,
    seriesId:         ev?.seriesMasterId || null,
    iCalUid:          ev?.iCalUId || null,
    title:            ev?.subject || '',
    location:         String(location).trim(),
    body:             plainBody(ev),
    attendees,
    attendeeCount:    attendees.length,
    organizerEmail:   organizerEmail || mailbox || null,
    organizerName:    graphName(ev?.organizer),
    startAt,
    endAt,
    durationMinutes:  minutesBetween(startAt, endAt),
    onlineMeetingUrl: ev?.onlineMeeting?.joinUrl || ev?.onlineMeetingUrl
                        || (ev?.isOnlineMeeting ? 'online' : null),
    isCancelled:      Boolean(ev?.isCancelled),
    isAllDay:         Boolean(ev?.isAllDay),
    webUrl:           ev?.webLink || null,
  };
}

/**
 * Anything else → neutral shape.
 *
 * The Test panel, the .ics import and our own API all post events in loose,
 * slightly different shapes. This accepts the common spellings of each field so
 * the rest of the pipeline only ever sees one shape.
 */
export function fromLooseEvent(raw = {}) {
  const attendees = (Array.isArray(raw.attendees) ? raw.attendees : [])
    .map(a => (typeof a === 'string'
      ? { email: a.trim().toLowerCase(), name: null, isOptional: false, isOrganizer: false }
      : {
          email:       String(a?.email || a?.address || '').trim().toLowerCase(),
          name:        a?.name || null,
          isOptional:  Boolean(a?.isOptional),
          isOrganizer: Boolean(a?.isOrganizer),
        }))
    .filter(a => a.email);

  const startAt = graphDate(raw.startAt || raw.start || raw.meetingDate || null);
  const endAt   = graphDate(raw.endAt || raw.end || null);

  return {
    externalId:       raw.externalId || raw.eventId || raw.id || null,
    seriesId:         raw.seriesId || null,
    iCalUid:          raw.iCalUid || raw.iCalUId || null,
    title:            raw.title || raw.subject || '',
    location:         String(raw.location || '').trim(),
    body:             raw.body || raw.bodyPreview || raw.description || '',
    attendees,
    attendeeCount:    attendees.length || Number(raw.attendeeCount) || 0,
    organizerEmail:   String(raw.organizerEmail || raw.organizer || '').trim().toLowerCase() || null,
    organizerName:    raw.organizerName || null,
    startAt,
    endAt,
    durationMinutes:  minutesBetween(startAt, endAt) ?? (Number(raw.durationMinutes) || null),
    onlineMeetingUrl: raw.onlineMeetingUrl || raw.joinUrl || null,
    isCancelled:      Boolean(raw.isCancelled),
    isAllDay:         Boolean(raw.isAllDay),
    webUrl:           raw.webUrl || raw.webLink || null,
  };
}

/**
 * Take whatever a caller sent and hand back the neutral shape.
 * `format: 'graph'` forces the Microsoft reading; otherwise we sniff for the
 * Graph-only fields and fall back to the loose reader.
 */
export function normalizeEvent(raw = {}, { format = 'auto', mailboxAddress = '' } = {}) {
  const looksLikeGraph = raw?.['@odata.etag'] !== undefined
    || raw?.iCalUId !== undefined
    || raw?.start?.dateTime !== undefined
    || raw?.organizer?.emailAddress !== undefined;

  return (format === 'graph' || (format === 'auto' && looksLikeGraph))
    ? fromGraphEvent(raw, mailboxAddress)
    : fromLooseEvent(raw);
}
