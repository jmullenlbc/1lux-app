/**
 * Unfinished public budgets become projects (Mike, 2026-10-03: "Yes so it
 * alerts the team in some way saying it was unfinished"). Pure rules here; the
 * part that touches the database is conceptualProjects.js.
 */
import { ABANDONED_AFTER_MS } from './drafts.js';

// Only drafts left within this window are picked up. Without it, the first run
// in production would turn every old abandoned draft into a project at once.
export const UNFINISHED_LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000;

// At most this many projects per sweep, so one run stays well under the
// 30 second request wall.
export const SWEEP_BATCH = 10;

/** Which drafts the sweep picks up: left over a day ago, never sent, never picked up before. */
export function unfinishedDraftWhere(now = new Date()) {
  const t = now instanceof Date ? now.getTime() : Number(now);
  return {
    submissionId: null,
    archivedAt: null,
    projectId: null,
    abandonedAlertedAt: null,
    lastSavedAt: { lt: new Date(t - ABANDONED_AFTER_MS), gte: new Date(t - UNFINISHED_LOOKBACK_MS) },
  };
}

/**
 * The answers a draft would have sent, built the same way the public page
 * builds them (IntakeClient mergedAnswers): typed figures sit beside the
 * answers, a typed correction becomes correctXxx, "no drawings" and the
 * clubhouse answer ride along.
 */
export function draftAnswers(unpacked) {
  const u = unpacked && typeof unpacked === 'object' ? unpacked : {};
  const out = { ...(u.answers || {}) };
  for (const [k, v] of Object.entries(u.figures || {})) {
    const s = String(v ?? '').trim();
    if (s) out[k] = s;
  }
  for (const [key, v] of Object.entries(u.corrections || {})) {
    const s = String(v ?? '').trim();
    if (s) out[`correct${key.charAt(0).toUpperCase()}${key.slice(1)}`] = s;
  }
  const manual = u.haveDrawings === 'no';
  if (manual) out.noDrawings = 'yes';
  if (manual && u.hasClubhouse) out.hasClubhouse = u.hasClubhouse;
  return out;
}

/** The shape findLikelyProject reads, from a draft row. */
export function draftAsRequest(row) {
  const r = row || {};
  return {
    proposedName: r.projectName || '',
    city: r.city || null,
    state: r.state || null,
    submitterEmail: r.email || '',
    submitterDomain: r.emailDomain || null,
    clientId: null,
  };
}
