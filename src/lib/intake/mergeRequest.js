/**
 * Linking a web request to a job we already have, without losing anything.
 *
 * Mike, 2026-09-12: "We need a project merging process so we never overwrite
 * important data." So the rule is fill-blanks-only:
 *
 *   • the job has nothing and the request has something → fill it in;
 *   • both say the same thing                            → nothing to do;
 *   • both say DIFFERENT things                          → a conflict. Shown side
 *     by side, and the job's answer is kept unless a person picks the request's.
 *
 * The project name is never touched, the job is already called something.
 *
 * Pure: rows in, plan out. The routes do the reading and the writing.
 */

/** Which request field feeds which job field, in the order they are shown. */
export const MERGE_FIELDS = [
  { field: 'clientId',     from: 'clientId',       label: 'Company' },
  { field: 'contactName',  from: 'submitterName',  label: 'Contact name' },
  { field: 'contactEmail', from: 'submitterEmail', label: 'Contact email' },
  { field: 'city',         from: 'city',           label: 'City' },
  { field: 'state',        from: 'state',          label: 'State' },
  { field: 'zip',          from: 'zip',            label: 'Zip' },
  { field: 'buildingType', from: 'buildingType',   label: 'Building type' },
];

function blank(v) {
  return v == null || String(v).trim() === '';
}

function same(a, b) {
  return String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
}

/**
 * One row per field: { field, label, projectValue, requestValue, kind }
 * where kind is 'fill' | 'same' | 'conflict' | 'empty' (neither side has it).
 */
export function planMerge(project, request) {
  return MERGE_FIELDS.map(({ field, from, label }) => {
    const projectValue = project?.[field] ?? null;
    const requestValue = request?.[from] ?? null;
    let kind;
    if (blank(requestValue))      kind = blank(projectValue) ? 'empty' : 'same';
    else if (blank(projectValue)) kind = 'fill';
    else if (same(projectValue, requestValue)) kind = 'same';
    else                          kind = 'conflict';
    return { field, label, projectValue, requestValue, kind };
  });
}

/**
 * What to write to the job. `choices` is { [field]: 'request' } for the
 * conflicts where a person picked the request's answer; any conflict not named
 * keeps the job's. Returns { data, filled, replaced, kept }, the three lists
 * are labels, for the note left on the request.
 */
export function applyMerge(plan, choices = {}, project = {}) {
  const data = {};
  const filled = [], replaced = [], kept = [];
  for (const row of plan) {
    if (row.kind === 'fill') {
      data[row.field] = normalise(row.field, row.requestValue);
      filled.push(row.label);
    } else if (row.kind === 'conflict') {
      if (choices[row.field] === 'request') {
        data[row.field] = normalise(row.field, row.requestValue);
        replaced.push(`${row.label} (was “${row.projectValue}”)`);
      } else {
        kept.push(row.label);
      }
    }
  }

  // The one-line "Denver, CO" the rest of the app shows. Only rewritten when it
  // was blank or was itself built from the old city/state, never when somebody
  // typed something of their own into it.
  if ('city' in data || 'state' in data) {
    const oldCity  = project.city  || '';
    const oldState = project.state || '';
    const oldDerived = oldCity && oldState ? `${oldCity}, ${oldState}` : (oldCity || oldState);
    if (blank(project.location) || same(project.location, oldDerived || ' ')) {
      const city  = data.city  ?? oldCity;
      const state = data.state ?? oldState;
      const loc = city && state ? `${city}, ${state}` : (city || state);
      if (loc) data.location = loc;
    }
  }
  return { data, filled, replaced, kept };
}

function normalise(field, value) {
  const v = String(value).trim();
  if (field === 'contactEmail') return v.toLowerCase();
  if (field === 'state')        return v.toUpperCase();
  return v;
}
