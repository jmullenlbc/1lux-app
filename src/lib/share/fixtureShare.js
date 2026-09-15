// What a fixture-schedule share link may show and change. The link is public —
// whoever holds the URL is an outsider — so this is an allowlist, never a denylist:
// a column added to FixtureScheduleItem later stays private until someone adds it here.
//
// Found 2026-09-15: the link returned every column (internalNotes included), and an
// edit link could write any column on any fixture row in the database by id.

export const SHARED_FIXTURE_FIELDS = Object.freeze([
  'type', 'location', 'description', 'manufacturer', 'catalogNumber', 'finish',
  'cct', 'lumens', 'wattage', 'voltage', 'dimming', 'mounting', 'notes',
]);

const MAX_CELL = 2000;

// One fixture row as an outsider sees it: its id (needed to save an edit) plus the
// allowlisted columns. Nothing else — no internal notes, AI flags, links or dates.
export function publicFixtureItem(item) {
  const out = { id: item.id };
  for (const key of SHARED_FIXTURE_FIELDS) out[key] = item[key] ?? null;
  return out;
}

// Check a cell edit sent through an edit link. Returns { data } to save, or { error }.
export function cleanShareEdit(field, value) {
  if (!SHARED_FIXTURE_FIELDS.includes(field)) {
    return { error: 'That column can’t be changed through a shared link.' };
  }
  if (value !== null && value !== undefined && typeof value !== 'string') {
    return { error: 'Cell values must be text.' };
  }
  const text = (value ?? '').trim().slice(0, MAX_CELL);
  // type/location/description are required text columns; the rest may be blank.
  const required = field === 'type' || field === 'location' || field === 'description';
  return { data: { [field]: text || (required ? '' : null) } };
}
