/**
 * Sales-note attendees and meeting time, for the editor. Pure — safe in the browser.
 *
 * Attendees are stored as a JSON array. Typed notes hold names; the calendar
 * sync holds { name, email }. The editor shows one comma-separated line and,
 * on save, keeps each calendar guest's email when their name is still there.
 */

function parse(raw) {
  if (Array.isArray(raw)) return raw;
  try { const v = JSON.parse(raw || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
}

const label = (a) => (typeof a === 'string' ? a : a?.name || a?.email || '').trim();

/** Stored attendees → "Jane Smith, bob@x.com". */
export function attendeesToText(raw) {
  return parse(raw).map(label).filter(Boolean).join(', ');
}

/** Typed line → JSON array, keeping the stored { name, email } for names still present. */
export function textToAttendees(text, raw) {
  const known = new Map(parse(raw).map(a => [label(a).toLowerCase(), a]));
  const out = String(text || '').split(',').map(s => s.trim()).filter(Boolean)
    .map(s => known.get(s.toLowerCase()) ?? s);
  return JSON.stringify(out);
}

/** A stored date → the value a datetime-local box wants, in the viewer's own time. */
export function toLocalInput(d) {
  if (!d) return '';
  const t = new Date(d);
  if (Number.isNaN(t.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}T${p(t.getHours())}:${p(t.getMinutes())}`;
}

/** The datetime-local value → an ISO instant (read as the viewer's own time), or null. */
export function fromLocalInput(v) {
  if (!v) return null;
  const t = new Date(v.length === 10 ? `${v}T12:00` : v);
  return Number.isNaN(t.getTime()) ? null : t.toISOString();
}
