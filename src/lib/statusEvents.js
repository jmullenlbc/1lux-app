/**
 * Deal history, the day a deal was created, and every day its status moved.
 *
 * Mike, 2026-09-08: "We need to record the date a deal was created and that
 * status of won, lost, abandoned, etc. changed."
 *
 * Project.procurementStatus / designStatus only ever say where a deal is NOW.
 * Nothing wrote down the day it got there, so "how long does a deal take" was
 * an unanswerable question. Every write goes through this one file so a new
 * screen cannot start changing statuses without leaving a trail.
 *
 * One row per BOARD: a full-design job is won or lost on Procurement and on
 * Design independently, so the two closes are two separate dates.
 *
 * These writes are deliberately best-effort, a failure to file the history
 * must never stop somebody saving a project. A missing event shows up honestly
 * as a deal the duration chart cannot measure, which is the safe failure.
 */

import { pipelinesFor, statusFieldFor, PIPELINE_LABEL, STATUS_LABEL } from './pipeline.js';

function reasonFieldFor(pipeline) {
  return pipeline === 'DESIGN' ? 'designStatusReason' : 'procurementStatusReason';
}

/**
 * The same move, written for a human reading the project's History tab.
 *
 * Mike, 2026-09-08: "All of this should write in the history of a project right?"
 * The event table answers "when did this happen" for charts; this answers "what
 * happened here" for a person looking at one job. Same source, so the two can
 * never tell different stories.
 */
export function describeStatusChange(row) {
  const board = PIPELINE_LABEL[row.pipeline] || row.pipeline;
  const to    = STATUS_LABEL[row.toStatus]   || row.toStatus;
  const from  = row.fromStatus ? (STATUS_LABEL[row.fromStatus] || row.fromStatus) : null;
  const why   = row.reason ? `: ${row.reason}` : '';
  if (!from) return `Added to the **${board}** board as **${to}**`;
  return `${board} project moved from ${from} to **${to}**${why}`;
}

/** The opening row for a brand-new job, one per board it starts out on. */
export async function recordProjectCreated(db, project, userId = null) {
  try {
    const rows = pipelinesFor(project).map(pipeline => ({
      projectId:   project.id,
      pipeline,
      fromStatus:  null,
      toStatus:    project[statusFieldFor(pipeline)] || 'OPEN',
      changedAt:   project.createdAt || new Date(),
      changedById: userId || null,
    }));
    if (rows.length) await db.projectStatusEvent.createMany({ data: rows });
  } catch (e) {
    console.error('[statusEvents] could not record project creation:', e?.message ?? e);
  }
}

/**
 * Compare a project before and after a save and file whatever moved.
 *
 * Two things get written:
 *  - a status change on a board the job was already on;
 *  - an opening row when the job joins a board it was not on before, which is
 *    what happens the moment somebody switches a job to Full Design.
 *
 * Returns the rows it wrote so the caller can put the same moves on the
 * project's History tab, and an empty array when nothing moved or the write
 * failed. Never throws.
 */
export async function recordStatusChanges(db, before, after, userId = null) {
  try {
    const wasOn = new Set(pipelinesFor(before));
    const rows  = [];
    for (const pipeline of pipelinesFor(after)) {
      const field  = statusFieldFor(pipeline);
      const reason = after[reasonFieldFor(pipeline)] || null;
      if (!wasOn.has(pipeline)) {
        rows.push({ projectId: after.id, pipeline, fromStatus: null,
          toStatus: after[field] || 'OPEN', reason, changedById: userId || null });
      } else if (after[field] && after[field] !== before[field]) {
        rows.push({ projectId: after.id, pipeline, fromStatus: before[field] || null,
          toStatus: after[field], reason, changedById: userId || null });
      }
    }
    if (rows.length) await db.projectStatusEvent.createMany({ data: rows });
    return rows;
  } catch (e) {
    console.error('[statusEvents] could not record status change:', e?.message ?? e);
    return [];
  }
}
