/**
 * Reading a calendar export (.ics) into plain events.
 *
 * Shared by the dry run (scripts/calendar/icsDryRun.mjs) and Admin > Calendar
 * Upload, which reads the file in the browser: a Takeout export runs past 16 MB,
 * well over what prod accepts in one request, so the file never leaves the
 * person's machine whole.
 *
 * Pure: no database, no network, no imports. Safe in the browser and in tests.
 */

/**
 * An .ics file wraps long lines: a line starting with a space or tab is a
 * continuation of the one before it. Undo that before anything else, or half the
 * long meeting titles come out chopped.
 */
export function unfold(text) {
  return String(text || '').replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '');
}

/** Calendar files escape commas, semicolons and newlines. Put them back. */
export function unescapeText(value) {
  return String(value || '')
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\')
    .trim();
}

/** Split "NAME;PARAM=x;PARAM=y:value" into its three parts. */
export function parseLine(line) {
  const colon = line.indexOf(':');
  if (colon === -1) return null;
  const head  = line.slice(0, colon);
  const value = line.slice(colon + 1);
  const parts = head.split(';');
  const name  = parts[0].toUpperCase();
  const params = {};
  for (const p of parts.slice(1)) {
    const eq = p.indexOf('=');
    if (eq === -1) continue;
    params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, '');
  }
  return { name, params, value };
}

export function mailtoAddress(value) {
  return String(value || '').replace(/^mailto:/i, '').trim().toLowerCase();
}

// One formatter per time zone; building them is the slow part.
const zoneFormatters = new Map();
function zoneFormatter(tz) {
  if (!zoneFormatters.has(tz)) {
    let f = null;
    try {
      f = new Intl.DateTimeFormat('en-US', {
        timeZone: tz, hourCycle: 'h23',
        year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
      });
    } catch { f = null; }   // a zone name the runtime does not know reads as UTC
    zoneFormatters.set(tz, f);
  }
  return zoneFormatters.get(tz);
}

/** Minutes the zone is ahead of UTC at this instant (Denver in winter: -420). */
function zoneOffsetMinutes(ms, tz) {
  const f = zoneFormatter(tz);
  if (!f) return 0;
  const p = Object.fromEntries(f.formatToParts(new Date(ms)).map(x => [x.type, x.value]));
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return Math.round((asUtc - ms) / 60000);
}

/**
 * A calendar timestamp is 20230104T100000Z (UTC), 20230104T100000 with a TZID
 * (that zone's wall clock), or just 20230104 for an all-day event. Google
 * Takeout writes IANA zone names (America/Denver), which Intl understands.
 */
export function parseStamp(value, tzid = '') {
  const v = String(value || '').trim();
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z?))?/.exec(v);
  if (!m) return null;
  const [, y, mo, d, hh = '00', mm = '00', ss = '00', z = ''] = m;
  let ms = Date.UTC(+y, +mo - 1, +d, +hh, +mm, +ss);
  if (m[4] && !z && tzid) {
    // Wall clock in that zone: step back by the offset, then check once more
    // in case the step crossed a daylight saving change.
    const first = ms - zoneOffsetMinutes(ms, tzid) * 60000;
    ms = ms - zoneOffsetMinutes(first, tzid) * 60000;
  }
  const date = new Date(ms);
  return { year: Number(y), date };
}

/** Pull every VEVENT out of the file as a plain object of its properties. */
export function readEvents(text) {
  const lines  = unfold(text).split(/\r?\n/);
  const events = [];
  let current  = null;
  let depth    = 0;   // a VALARM inside a VEVENT has its own DESCRIPTION; skip it

  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { current = { attendees: [] }; depth = 0; continue; }
    if (line === 'END:VEVENT')   { if (current) events.push(current); current = null; continue; }
    if (!current) continue;
    if (line.startsWith('BEGIN:')) { depth += 1; continue; }
    if (line.startsWith('END:'))   { depth = Math.max(0, depth - 1); continue; }
    if (depth > 0) continue;

    const parsed = parseLine(line);
    if (!parsed) continue;
    const { name, params, value } = parsed;

    switch (name) {
      case 'UID':           current.uid       = value.trim();            break;
      case 'SUMMARY':       current.title     = unescapeText(value);     break;
      case 'LOCATION':      current.location  = unescapeText(value);     break;
      case 'DESCRIPTION':   current.body      = unescapeText(value);     break;
      case 'STATUS':        current.status    = value.trim().toUpperCase(); break;
      case 'RRULE':         current.rrule     = value.trim();            break;
      case 'RECURRENCE-ID': current.recurrenceId = value.trim();         break;
      case 'ORGANIZER':
        current.organizerEmail = mailtoAddress(value);
        current.organizerName  = params.CN || '';
        break;
      case 'ATTENDEE': {
        const email = mailtoAddress(value);
        if (email) current.attendees.push({ email, name: params.CN || '', partstat: (params.PARTSTAT || '').toUpperCase() });
        break;
      }
      case 'DTSTART':
        current.start   = parseStamp(value, params.TZID);
        current.isAllDay = params.VALUE === 'DATE';
        break;
      case 'DTEND':
        current.end = parseStamp(value, params.TZID);
        break;
      case 'X-MICROSOFT-CDO-ALLDAYEVENT':
        if (/true/i.test(value)) current.isAllDay = true;
        break;
      case 'X-MICROSOFT-SKYPETEAMSMEETINGURL':
      case 'X-MICROSOFT-ONLINEMEETINGCONFLINK':
      case 'X-GOOGLE-CONFERENCE':
        if (value.trim()) current.onlineMeetingUrl = value.trim();
        break;
      default: break;
    }
  }
  return events;
}

/** One raw event in the shape the keep-or-throw-away rules expect. */
export function toNeutralEvent(raw) {
  const emails = new Set(raw.attendees.map(a => a.email).filter(Boolean));
  if (raw.organizerEmail) emails.add(raw.organizerEmail);
  const minutes = raw.start?.date && raw.end?.date
    ? Math.round((raw.end.date - raw.start.date) / 60000)
    : null;
  return {
    externalId:       raw.uid || null,
    title:            raw.title || '',
    location:         raw.location || '',
    body:             raw.body || '',
    onlineMeetingUrl: raw.onlineMeetingUrl || null,
    attendeeCount:    emails.size,
    attendeeEmails:   [...emails],
    attendees:        raw.attendees.map(a => ({ email: a.email, name: a.name || '' })),
    organizerEmail:   raw.organizerEmail || '',
    year:             raw.start?.year ?? null,
    durationMinutes:  minutes && minutes > 0 ? minutes : null,
    // Recurring is carried for the report only. Mike's ruling is that repeating
    // on its own never disqualifies anything: "Catalina golf mixer is every
    // other week and is a business event. each of those should count always."
    isCancelled:      raw.status === 'CANCELLED',
    isAllDay:         !!raw.isAllDay,
    isRecurring:      !!(raw.rrule || raw.recurrenceId),
    startAt:          raw.start?.date ?? null,
    endAt:            raw.end?.date ?? null,
  };
}
