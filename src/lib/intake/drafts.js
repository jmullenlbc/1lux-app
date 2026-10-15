/**
 * Unfinished public conceptual budgets — the server-side copy.
 *
 * Mike, 2026-09-15: "People need to be able to fill out a budget and come back
 * to it somehow" and "Yes we should see it abandoned." The wizard keeps a copy
 * in the visitor's own browser (see IntakeClient.jsx DRAFT_KEY); this is the
 * other half: once the visitor's name, work email and project name check out,
 * the same inputs are saved to a ConceptualDraft row so
 *
 *   1. staff see the unfinished budget on the intake queue as a lead, and
 *   2. a resume link (?resume=<token>) can bring the draft back on any device —
 *      built, but hidden until Microsoft email is hooked up.
 *
 * This file is the PURE part: packing the browser's draft into a bounded,
 * structured row plus field rows, and unpacking it again. No IO, no clock, no
 * `@/` imports, so the unit tests load it directly. Inputs only, never a price:
 * nothing in here knows what anything costs.
 *
 * Everything arrives from an unauthenticated browser, so every value is
 * clamped: strings are cut to a length, answers to the questionnaire's own
 * options, figures to digits, step ids to the wizard's step list.
 *
 * @see src/app/api/intake/draft/route.js         — save / load
 * @see src/app/api/admin/intake/drafts/[id]/route.js — staff "Put away"
 * @see prisma/migrations/0087_conceptual_drafts   — the tables
 */
import { INTAKE_QUESTIONS, FIGURE_KEYS, CLUBHOUSE_ANSWERS, POOL_KEY, POOL_ANSWERS } from './questionnaire.js';

/** The wizard's step ids, in order (mirrors STEPS in IntakeClient.jsx). */
export const STEP_IDS = ['about', 'drawings', 'units', 'corridors', 'amenities', 'exterior', 'emergency', 'controls', 'review'];

/** Plain-English step names for the staff list. */
export const STEP_LABELS = {
  about: 'About you',
  drawings: 'Drawings',
  units: 'Residential units',
  corridors: 'Corridors',
  amenities: 'Amenities',
  exterior: 'Exterior',
  emergency: 'Emergency',
  controls: 'Controls',
  review: 'Review & send',
};

/** A draft that has not been touched for this long reads as abandoned. */
export const ABANDONED_AFTER_MS = 24 * 60 * 60 * 1000;

/** The merged drawing read is the one big value; same ceiling as rawPayload. */
export const MAX_DRAWINGS_CHARS = 200_000;

/** Field-row ceilings — the questionnaire has ~20 questions and ~20 figures. */
const MAX_FIELDS = 200;
const MAX_FIELD_KEY = 60;

const FIELD_KINDS = ['answer', 'figure', 'correction'];

const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const digits = v => (typeof v === 'string' ? v.replace(/[,\s]/g, '') : '');
const IDENT = /^[a-zA-Z][a-zA-Z0-9]{0,59}$/;

const QUESTION_BY_KEY = new Map(INTAKE_QUESTIONS.map(q => [q.key, q]));
const FIGURE_KEY_SET = new Set(FIGURE_KEYS.map(f => f.key));

/** An answer the questionnaire recognises for this key, or null. */
function knownAnswer(key, raw) {
  if (key === POOL_KEY) return POOL_ANSWERS.includes(raw) ? raw : null;
  const q = QUESTION_BY_KEY.get(key);
  if (!q || typeof raw !== 'string') return null;
  const v = raw.trim();
  if (!v) return null;
  const known = q.options.includes(v) || !!q.legacyOptions?.includes(v)
    || (q.engine?.map != null && Object.prototype.hasOwnProperty.call(q.engine.map, v));
  return known ? v : null;
}

/** A typed figure: digits only, commas and spaces tolerated, 0 allowed. */
function knownFigure(raw) {
  const d = digits(raw);
  return /^\d{1,9}$/.test(d) ? d : null;
}

/**
 * Turn the browser's draft (the same object the wizard keeps in localStorage)
 * into what the database stores.
 *
 * @param {object} draft  { firstName, lastName, email, company, project,
 *   projCity, projState, projZip, haveDrawings, stepId, completedSteps,
 *   hasClubhouse, figures, corrections, answers, drawings }
 * @returns {{ ok: true, row: object, fields: Array<{kind,key,value}>,
 *   drawingsJson: string|null, drawingsDropped: boolean } | { ok: false, error: string }}
 */
export function packDraft(draft) {
  const d = draft && typeof draft === 'object' ? draft : {};
  const firstName = str(d.firstName, 100);
  const lastName = str(d.lastName, 100);
  const email = str(d.email, 254).toLowerCase();
  const projectName = str(d.project, 300);
  if (!firstName || !lastName || !email || !projectName) {
    return { ok: false, error: 'A name, a work email and a project name are needed before a budget can be saved.' };
  }

  const haveDrawings = d.haveDrawings === 'yes' || d.haveDrawings === 'no' ? d.haveDrawings : null;
  const stepId = STEP_IDS.includes(d.stepId) ? d.stepId : null;
  const completedSteps = Array.isArray(d.completedSteps)
    ? STEP_IDS.filter(id => d.completedSteps.includes(id)).join(',')
    : '';
  const hasClubhouse = CLUBHOUSE_ANSWERS.includes(d.hasClubhouse) ? d.hasClubhouse : null;

  const fields = [];
  const seen = new Set();
  const push = (kind, key, value) => {
    const id = `${kind}:${key}`;
    if (seen.has(id) || fields.length >= MAX_FIELDS) return;
    seen.add(id);
    fields.push({ kind, key, value });
  };
  if (d.answers && typeof d.answers === 'object') {
    for (const [key, raw] of Object.entries(d.answers)) {
      const v = knownAnswer(key, raw);
      if (v != null) push('answer', key, v);
    }
  }
  if (d.figures && typeof d.figures === 'object') {
    for (const [key, raw] of Object.entries(d.figures)) {
      if (!FIGURE_KEY_SET.has(key)) continue;
      const v = knownFigure(raw);
      if (v != null) push('figure', key, v);
    }
  }
  if (d.corrections && typeof d.corrections === 'object') {
    for (const [key, raw] of Object.entries(d.corrections)) {
      if (!IDENT.test(key) || key.length > MAX_FIELD_KEY) continue;
      const v = knownFigure(raw);
      if (v != null) push('correction', key, v);
    }
  }

  // The drawing read is kept only when the visitor said they have drawings;
  // a "no drawings" budget ignores any read that rode along, same as submit.
  let drawingsJson = null;
  let drawingsDropped = false;
  if (haveDrawings === 'yes' && d.drawings && typeof d.drawings === 'object' && !Array.isArray(d.drawings)) {
    const json = JSON.stringify(d.drawings);
    if (json.length <= MAX_DRAWINGS_CHARS) drawingsJson = json;
    else drawingsDropped = true;
  }

  return {
    ok: true,
    row: {
      firstName, lastName, email,
      emailDomain: email.includes('@') ? email.split('@').pop() : null,
      company: str(d.company, 200) || null,
      projectName,
      city: str(d.projCity, 120) || null,
      state: str(d.projState, 2).toUpperCase() || null,
      zip: str(d.projZip, 10) || null,
      haveDrawings, stepId, completedSteps, hasClubhouse,
    },
    fields,
    drawingsJson,
    drawingsDropped,
  };
}

/**
 * The stored row back into the shape the wizard restores from — the same
 * object it keeps in localStorage, so one restore path serves both.
 *
 * @param {object} row     ConceptualDraft
 * @param {Array}  fields  ConceptualDraftField rows (blank values are "no longer set")
 */
export function unpackDraft(row, fields = []) {
  const r = row && typeof row === 'object' ? row : {};
  const figures = {};
  const corrections = {};
  const answers = {};
  for (const f of Array.isArray(fields) ? fields : []) {
    if (!f || typeof f.value !== 'string' || !f.value) continue;
    if (f.kind === 'answer') answers[f.key] = f.value;
    else if (f.kind === 'figure') figures[f.key] = f.value;
    else if (f.kind === 'correction') corrections[f.key] = f.value;
  }
  let drawings = null;
  if (typeof r.drawingsJson === 'string' && r.drawingsJson) {
    try {
      const parsed = JSON.parse(r.drawingsJson);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) drawings = parsed;
    } catch { drawings = null; }
  }
  const savedAt = r.lastSavedAt instanceof Date ? r.lastSavedAt.toISOString()
    : (typeof r.lastSavedAt === 'string' ? r.lastSavedAt : null);
  return {
    v: 1,
    savedAt,
    stepId: STEP_IDS.includes(r.stepId) ? r.stepId : 'about',
    completedSteps: typeof r.completedSteps === 'string'
      ? r.completedSteps.split(',').filter(id => STEP_IDS.includes(id))
      : [],
    firstName: r.firstName ?? '',
    lastName: r.lastName ?? '',
    email: r.email ?? '',
    company: r.company ?? '',
    project: r.projectName ?? '',
    projCity: r.city ?? '',
    projState: r.state ?? '',
    projZip: r.zip ?? '',
    haveDrawings: r.haveDrawings === 'yes' || r.haveDrawings === 'no' ? r.haveDrawings : null,
    drawings,
    figures,
    corrections,
    answers,
    hasClubhouse: CLUBHOUSE_ANSWERS.includes(r.hasClubhouse) ? r.hasClubhouse : '',
  };
}

/**
 * Which field rows to write, given what is stored and what just arrived:
 * every incoming field is set; a stored key that no longer arrives is blanked
 * to '' — the row stays (nothing is ever deleted), it just reads as unset.
 *
 * @returns {Array<{kind,key,value}>} the full set of writes
 */
export function diffFields(existing, incoming) {
  const next = new Map();
  for (const f of incoming) next.set(`${f.kind}:${f.key}`, f);
  const writes = [...incoming];
  for (const f of Array.isArray(existing) ? existing : []) {
    if (!FIELD_KINDS.includes(f.kind)) continue;
    const id = `${f.kind}:${f.key}`;
    if (!next.has(id) && f.value !== '') writes.push({ kind: f.kind, key: f.key, value: '' });
  }
  return writes;
}

/** 'working' for the first day after the last save, 'abandoned' after that. */
export function draftStage(lastSavedAt, now = Date.now()) {
  const t = lastSavedAt instanceof Date ? lastSavedAt.getTime() : new Date(lastSavedAt).getTime();
  if (!Number.isFinite(t)) return 'abandoned';
  return now - t < ABANDONED_AFTER_MS ? 'working' : 'abandoned';
}

/** The furthest step the visitor reached, for the staff list. */
export function reachedLabel(row) {
  const r = row && typeof row === 'object' ? row : {};
  const done = typeof r.completedSteps === 'string' ? r.completedSteps.split(',') : [];
  let best = STEP_IDS.indexOf(STEP_IDS.includes(r.stepId) ? r.stepId : 'about');
  for (const id of done) best = Math.max(best, STEP_IDS.indexOf(id));
  return STEP_LABELS[STEP_IDS[Math.max(best, 0)]];
}
