// ─────────────────────────────────────────────────────────────────────────────
// What department a CRM person works in.
//
// Mike's eight, from CRM ORGANIZATION.xlsx and confirmed 2026-09-19. Until now
// this was a free-text box on one screen with a five-word suggestion list, so
// the same department could be spelled four ways and nothing could be grouped
// or filtered by it. It is now a controlled list: the database stores a KEY,
// every screen shows the LABEL.
//
// This is the PERSON's department at their own company. It has nothing to do
// with src/lib/departments.js, which is the ILC STAFF department list behind
// the privileges work. Two different questions, two separate lists, on purpose.
// ─────────────────────────────────────────────────────────────────────────────

export const CONTACT_DEPARTMENTS = [
  { key: 'CORPORATE',       label: 'Corporate' },
  { key: 'PRECONSTRUCTION', label: 'Preconstruction' },
  { key: 'CONSTRUCTION',    label: 'Construction' },
  { key: 'PROCUREMENT',     label: 'Procurement' },
  { key: 'DESIGN',          label: 'Design' },
  { key: 'DEVELOPMENT',     label: 'Development' },
  { key: 'ARCHITECT',       label: 'Architect' },
  { key: 'INTERIOR_DESIGN', label: 'Interior Design' },
];

// Readable, never settable. 'Finance' was on the old five-word suggestion list
// and is not one of Mike's eight, so anybody already saved that way keeps
// reading "Finance" instead of losing their department. Same handling as the
// retired "Other" service type and the legacy COMPLETED project status.
export const LEGACY_CONTACT_DEPARTMENTS = [
  { key: 'FINANCE',         label: 'Finance' },
];

export const ALL_CONTACT_DEPARTMENTS = [...CONTACT_DEPARTMENTS, ...LEGACY_CONTACT_DEPARTMENTS];
export const CONTACT_DEPARTMENT_KEYS = CONTACT_DEPARTMENTS.map(d => d.key);
export const ALL_CONTACT_DEPARTMENT_KEYS = ALL_CONTACT_DEPARTMENTS.map(d => d.key);

const LABEL_BY_KEY = Object.fromEntries(ALL_CONTACT_DEPARTMENTS.map(d => [d.key, d.label]));

export function contactDepartmentLabel(key) {
  if (!key) return null;
  return LABEL_BY_KEY[key] || normalizeContactDepartment(key, { labelFallback: true }) || key;
}

// The list is settable only if it is one of Mike's eight. A legacy key can be
// read back and saved unchanged, but it cannot be chosen from a picker.
export function isSettableContactDepartment(key) {
  return CONTACT_DEPARTMENT_KEYS.includes(key);
}

// Turns whatever is already in the database — or whatever a spreadsheet import
// hands us — into one of our keys. Case, spaces, hyphens and the two common
// spellings of "pre-construction" are all forgiven. Returns null when nothing
// matches, so the caller decides whether to keep the raw text or drop it.
const ALIASES = {
  CORPORATE: 'CORPORATE', CORP: 'CORPORATE', 'HEAD OFFICE': 'CORPORATE', EXECUTIVE: 'CORPORATE',
  PRECONSTRUCTION: 'PRECONSTRUCTION', 'PRE CONSTRUCTION': 'PRECONSTRUCTION', PRECON: 'PRECONSTRUCTION', 'PRE CON': 'PRECONSTRUCTION',
  CONSTRUCTION: 'CONSTRUCTION', FIELD: 'CONSTRUCTION', OPERATIONS: 'CONSTRUCTION',
  PROCUREMENT: 'PROCUREMENT', PURCHASING: 'PROCUREMENT', BUYING: 'PROCUREMENT',
  DESIGN: 'DESIGN',
  DEVELOPMENT: 'DEVELOPMENT', DEVELOPER: 'DEVELOPMENT', DEV: 'DEVELOPMENT',
  ARCHITECT: 'ARCHITECT', ARCHITECTURE: 'ARCHITECT', ARCHITECTURAL: 'ARCHITECT',
  'INTERIOR DESIGN': 'INTERIOR_DESIGN', INTERIORS: 'INTERIOR_DESIGN', 'INTERIOR DESIGNER': 'INTERIOR_DESIGN', ID: 'INTERIOR_DESIGN',
  FINANCE: 'FINANCE', ACCOUNTING: 'FINANCE',
};

export function normalizeContactDepartment(raw, { labelFallback = false } = {}) {
  if (!raw) return null;
  const flat = String(raw).trim().toUpperCase().replace(/[-_/]+/g, ' ').replace(/\s+/g, ' ');
  const key = ALIASES[flat] || null;
  if (!key) return null;
  return labelFallback ? LABEL_BY_KEY[key] : key;
}

// What the API stores when a screen sends a department. One of our keys passes
// straight through, a spelling we recognise is converted, and anything we do
// not recognise is kept EXACTLY AS TYPED — a bulk import must never silently
// wipe somebody's department just because it used a word we had not seen.
export function cleanDepartment(raw) {
  if (raw === null || raw === undefined) return null;
  const text = String(raw).trim();
  if (!text) return null;
  if (ALL_CONTACT_DEPARTMENT_KEYS.includes(text)) return text;
  return normalizeContactDepartment(text) || text;
}

// The dropdown for ONE person. Mike's eight, plus a blank, plus whatever this
// person already holds if it is not one of the eight — a legacy key like
// FINANCE, or a word an import left as typed. Without that last part, opening
// the menu on such a person would show the first option and quietly move them.
export function departmentOptions(current) {
  const known = CONTACT_DEPARTMENT_KEYS.includes(current);
  const extra = (!current || known) ? [] : [{
    value: current,
    label: contactDepartmentLabel(current) + (LABEL_BY_KEY[current] ? '' : ' (old)'),
  }];
  return [
    { value: '', label: '— Department —' },
    ...CONTACT_DEPARTMENTS.map(d => ({ value: d.key, label: d.label })),
    ...extra,
  ];
}
