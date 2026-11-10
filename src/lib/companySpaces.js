// The 1LUX company spaces (Jason, 2026-11-10): LOGIQ (distributor), SAGE and Shift (manufacturers), one NetSuite
// subsidiary each. The rows live in BusinessUnit (migration 0165, fixed ids); this file is the one list the code and
// the screens use, so a picker, a filter and a badge can never disagree. Import-free: screens use it too.
//
// A project belongs to at most one space (Project.businessUnitId; blank = not set yet). A person can sell for one or
// several (UserBusinessUnit; none = all). Selling for a space puts it first; it never hides the others.

export const SPACES = Object.freeze([
  { code: 'LOGIQ', id: 'bu_logiq', label: 'LOGIQ', kind: 'DISTRIBUTOR' },
  { code: 'SAGE',  id: 'bu_sage',  label: 'SAGE',  kind: 'MANUFACTURER' },
  { code: 'SHIFT', id: 'bu_shift', label: 'Shift', kind: 'MANUFACTURER' },
]);

export const SPACE_CODES = Object.freeze(SPACES.map(s => s.code));

// The filter value for "no company set yet".
export const NO_SPACE = 'NONE';
export const NO_SPACE_LABEL = 'No company yet';

const byCode = new Map(SPACES.map(s => [s.code, s]));
const byId   = new Map(SPACES.map(s => [s.id, s]));

/** The space for a BusinessUnit id or a code (any case), or null. */
export function spaceOf(idOrCode) {
  if (!idOrCode) return null;
  const v = String(idOrCode).trim();
  return byId.get(v) || byCode.get(v.toUpperCase()) || null;
}

/** Display name for a project's space; blank when none. */
export const spaceLabel = (idOrCode) => spaceOf(idOrCode)?.label || '';

/** Options for a select: the three spaces, with an optional blank first. */
export function spaceOptions({ blankLabel } = {}) {
  const opts = SPACES.map(s => ({ value: s.id, label: s.label }));
  return blankLabel ? [{ value: '', label: blankLabel }, ...opts] : opts;
}

/**
 * What a request may store in Project.businessUnitId: a known id (or code), or null to clear it.
 * Returns undefined for anything else, so the caller can refuse it.
 */
export function businessUnitIdFrom(value) {
  if (value === null || value === '') return null;
  return spaceOf(value)?.id;
}

/** A clean list of space codes from a request: known codes only, no repeats. null when it is not a list. */
export function cleanSpaces(list) {
  if (!Array.isArray(list)) return null;
  return [...new Set(list.map(v => spaceOf(v)?.code).filter(Boolean))];
}

/** The codes on a user loaded with `businessUnits: SPACES_SELECT`, in the standard order. */
export function spaceKeys(user) {
  const set = new Set((user?.businessUnits || []).map(r => r.space));
  return SPACE_CODES.filter(c => set.has(c));
}

/** Prisma select fragment for a user's spaces. */
export const SPACES_SELECT = Object.freeze({ select: { space: true } });

/** Does a project (with businessUnitId) pass a space filter value (a code, NO_SPACE, or blank = all)? */
export function inSpace(project, filterValue) {
  if (!filterValue) return true;
  if (filterValue === NO_SPACE) return !project?.businessUnitId;
  return spaceOf(project?.businessUnitId)?.code === filterValue;
}

/** Prisma where for a space filter value; {} for all. */
export function spaceWhere(filterValue) {
  if (!filterValue) return {};
  if (filterValue === NO_SPACE) return { businessUnitId: null };
  const space = spaceOf(filterValue);
  return space ? { businessUnitId: space.id } : {};
}

/** The spaces in the order a person sees them: the ones they sell for first. */
export function spacesFor(userSpaceCodes = []) {
  const mine = new Set(userSpaceCodes);
  return [...SPACES.filter(s => mine.has(s.code)), ...SPACES.filter(s => !mine.has(s.code))];
}

/** Filter choices ([value, label]) for a space filter, the person's own spaces first, then "No company yet". */
export function spaceFilterChoices(userSpaceCodes = []) {
  return [...spacesFor(userSpaceCodes).map(s => [s.code, s.label]), [NO_SPACE, NO_SPACE_LABEL]];
}
