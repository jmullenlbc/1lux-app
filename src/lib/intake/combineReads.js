// From the standalone module, not '@/lib/drawingExtract' — that one reaches the
// model and would pull server-only code (node:crypto) into the browser bundle.
import { mergeProposals } from '../mergeProposals.js';

/** The one "file" a draft's saved read is shown as in the dropzone list. */
export const EARLIER_NAME = 'Read earlier';

const IN_FLIGHT = new Set(['queued', 'uploading', 'parsing']);

/**
 * One combined read from the files dropped now plus the read kept from last
 * time — or NOTHING, while any file is still being read.
 *
 * Mike 2026-09-16: "If I drag in multiple drawings, just because it read one
 * first doesn't mean it should use that data. It shouldn't show data until it
 * reads all drawings and then decides if it needs to guess or if there is
 * something real it can use."
 *
 * Before this, the merge re-ran every time one file finished, so the first
 * file to come back — often the small one, often the one with the worse
 * numbers — set the building summary and the live price for a minute or two,
 * and every later file read as a "disagreement" with it. Now `merged` stays
 * null until nothing is queued, uploading or parsing, and the merge then runs
 * ONCE over everything (see mergeProposals: the counted schedule's file speaks
 * first, then the more confident read, then upload order).
 *
 * A file that FAILED does not hold the others up: it is not in flight, and
 * nothing it read is waiting to be counted. Retry puts it back in flight,
 * which pulls the figures again until that read lands.
 *
 * Alone, the earlier read passes through untouched (re-merging a merge would
 * re-derive verdicts it already settled); with new files it joins the merge
 * as one more source, so nothing read last time is lost.
 *
 * @param {Array<{name:string,status:string,proposal:?Object}>} items
 * @param {?Object} kept   the merged read restored from a saved draft
 * @returns {{ merged: ?Object, reading: number, done: number, failed: number, total: number }}
 */
export function combineReads(items, kept = null) {
  const list = Array.isArray(items) ? items : [];
  const reading = list.filter(i => IN_FLIGHT.has(i?.status)).length;
  const done = list.filter(i => i?.status === 'done');
  const failed = list.filter(i => i?.status === 'error').length;
  const status = { reading, done: done.length, failed, total: list.length };

  if (reading > 0) return { merged: null, ...status };

  const ok = done.map(i => ({ fileName: i.name, proposal: i.proposal }));
  if (!ok.length) return { merged: kept ?? null, ...status };
  if (kept) ok.unshift({ fileName: EARLIER_NAME, proposal: kept });
  return { merged: mergeProposals(ok), ...status };
}
