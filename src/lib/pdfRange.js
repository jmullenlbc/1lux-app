/**
 * Reading a huge PDF without pulling the whole thing into memory at once.
 *
 * ── The problem this solves ──
 * A real construction drawing set is 200–400 MB. The old path fetched the whole
 * object out of S3 into a Buffer before pdfjs saw a single page, so the ceiling
 * on "how big a set can a GC send us" was really "how much memory does the
 * Amplify Lambda have". Mike, 2026-08-21: "We have to make it so it never fails
 * unless it is absurdly big."
 *
 * ── How it works ──
 * A PDF is a random-access format: a table at the END of the file says where
 * every page lives. pdfjs can drive that table itself if you hand it a way to
 * fetch arbitrary byte ranges instead of the whole file — that is what
 * PDFDataRangeTransport is for, and S3 GetObject takes a Range header. So we
 * fetch the tail, let pdfjs read the index, and then pull only the slices it
 * asks for, page by page.
 *
 * ── What this does NOT do, corrected 2026-08-22 ──
 * An earlier version of this comment claimed peak memory was a function of the
 * pages we touch and not of the file. That was measured on an 11 MB set, which
 * is too small to show the problem. Measured on a real 231 MB set:
 *
 *   - Opening the document reserves a slot the size of the WHOLE file. pdfjs
 *     allocates `new Uint8Array(length)` up front, so external memory jumped
 *     237 MB after fetching 0 MB. The reservation itself is cheap — the pages
 *     are not physically committed until something writes to them, and real
 *     memory only rose 42 MB — but it means the file size is the shape of the
 *     hole we are filling, not an irrelevance.
 *   - As pages are read, those reserved pages get filled in and parsing costs
 *     roughly 2–3x the bytes fetched on top. Scanning the 231 MB set peaked at
 *     827 MB of real memory with 108 MB fetched. The byte budget did not
 *     prevent that, because bytes fetched is a bad predictor of bytes resident.
 *
 * So the brake is no longer a guess about bytes. `overBudget` measures actual
 * process memory against the actual Lambda memory size, both of which are
 * knowable at runtime. The byte budget is kept as a cheap second brake, but it
 * is the belt, not the braces.
 *
 * ── Reading this file ──
 * `openRangedPdf` is generic (it takes a fetch function, so tests can back it
 * with a local file). `openUploadedPdf` is the S3 flavour used in production.
 * Small files skip all of this: under RANGE_THRESHOLD_BYTES a plain buffer is
 * simpler and faster, and that is still the path almost every upload takes.
 */
import { loadPdfjs, pdfDocOptions } from './pdfjsNode.js';
import { headUploadedObject, rangeFetcherFor, getUploadedObject } from './uploadStorage.js';

/**
 * Above this, read by byte range; below it, just buffer the thing.
 *
 * Not a safety limit — a crossover. Ranged reading costs extra round trips, so
 * it only pays once the file is big enough that holding it is the bigger risk.
 * 24 MB is comfortably above the everyday schedule/matrix upload and well below
 * anything that would trouble a Lambda.
 */
export const RANGE_THRESHOLD_BYTES = 24 * 1024 * 1024;

/**
 * How many bytes a single read is allowed to pull before we call it enough.
 *
 * A cheap, cost-free sanity brake, NOT the memory guard — see the note at the
 * top of this file. It exists because fetching hundreds of megabytes out of S3
 * is slow and billable even when it fits, and because it is one `+=` rather
 * than a syscall so it can be checked as often as we like.
 *
 * Sheets we care about (cover, code summary, site plan, unit matrix) sit at the
 * FRONT of every set, and the scan runs front to back, so stopping at the
 * budget costs us the tail of the set — the floor plans — which we were not
 * going to use anyway. Confirmed on the 231 MB Limelight set: the scan stopped
 * at page 123 of 212 and still found the site plan (p33) and the gross area
 * (p5).
 */
export const SCAN_BYTE_BUDGET = 96 * 1024 * 1024;

/**
 * The real memory guard: stop when the process is actually running out of room.
 *
 * Lambda publishes its own memory size in the environment, so this does not
 * have to be guessed — on Amplify the number is whatever Amplify configured,
 * and if that ever changes the brake follows it without a code change. Outside
 * Lambda (dev, tests, the dry-run scripts) there is no such number and no hard
 * ceiling to hit, so a deliberately conservative 384 MB stands in, which makes
 * a local dry run behave like the tightest plausible production box rather than
 * like a laptop with 32 GB.
 *
 * 70% is the share of the box the read may occupy. The rest is Next.js itself,
 * the JPEG we are about to render, and the slack V8 leaves lying around because
 * nothing has pressured it to collect yet.
 */
export function memoryCeilingBytes() {
  const lambdaMb = Number(process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE);
  const overrideMb = Number(process.env.PDF_SCAN_MEMORY_CEILING_MB);
  if (Number.isFinite(overrideMb) && overrideMb > 0) return overrideMb * 1024 * 1024;
  if (Number.isFinite(lambdaMb) && lambdaMb > 0) return Math.round(lambdaMb * 0.7) * 1024 * 1024;
  return 384 * 1024 * 1024;
}

/**
 * Open a PDF that is fetched in slices.
 *
 * @param {object}   opts
 * @param {number}   opts.size        total byte length of the object
 * @param {Function} opts.fetchRange  (begin, end) => Promise<Uint8Array>, end exclusive
 * @returns {Promise<{ doc, stats, destroy }>}
 *   `stats` is live — read it after the work is done to see what the read cost.
 */
export async function openRangedPdf({ size, fetchRange }) {
  if (!Number.isFinite(size) || size <= 0) throw new Error('openRangedPdf: size is required');
  if (typeof fetchRange !== 'function') throw new Error('openRangedPdf: fetchRange is required');

  const pdfjs = await loadPdfjs();
  const ceiling = memoryCeilingBytes();
  const stats = { size, bytesFetched: 0, requests: 0, failures: 0, peakRss: 0, ceiling };

  // Latched, not sampled on demand. Memory can fall again the moment V8 decides
  // to collect, and a brake that un-applies itself because a garbage collection
  // happened to land at the right moment is not a brake. Once the read has been
  // over the line, it is over the line.
  let hitCeiling = false;

  // pdfjs has no way to be told "that fetch failed". It asks for a range and
  // then waits, forever, for bytes that are never coming — so an S3 outage does
  // not raise an error here, it HANGS until the Lambda's own 300-second timeout
  // kills it and the visitor sees nothing but a spinner. This promise is the
  // missing error channel: the first failure rejects it, and every await below
  // races against it.
  let giveUp;
  const failed = new Promise((_, reject) => { giveUp = reject; });
  failed.catch(() => {});   // it is a backstop; nobody may see it, and that is fine

  const pull = async (begin, end) => {
    const from = Math.max(0, begin);
    const to   = Math.min(size, end);
    const chunk = await fetchRange(from, to);
    stats.bytesFetched += chunk.length;
    stats.requests += 1;
    // Sampled here rather than once per page because a single page of a big
    // architectural sheet can pull many ranges, and the earlier per-page-only
    // check let a 96 MB budget run to 108 MB before anyone noticed.
    const rss = process.memoryUsage.rss();
    if (rss > stats.peakRss) stats.peakRss = rss;
    if (rss > ceiling) hitCeiling = true;
    return chunk;
  };

  class S3RangeTransport extends pdfjs.PDFDataRangeTransport {
    requestDataRange(begin, end) {
      // pdfjs calls this fire-and-forget: it does not await, it waits for
      // onDataRange. A rejected promise here would surface as an unhandled
      // rejection and take the whole invocation down, so the failure is
      // absorbed and reported through `failed` instead.
      pull(begin, end)
        .then(chunk => this.onDataRange(begin, chunk))
        .catch(err => {
          stats.failures += 1;
          console.error('[pdfRange] range fetch failed', begin, end, err?.message ?? err);
          giveUp(new Error('Could not read that file from storage. Please try the upload again.'));
        });
    }
  }

  // No initial data and nothing pre-seeded: pdfjs asks for every byte it wants
  // through requestDataRange, including the tail it needs to find the
  // cross-reference table. One code path, no ordering to get wrong.
  //
  // An earlier version pre-fetched the tail and pushed it in with onDataRange
  // before getDocument. That crashes: pdfjs only registers its listener partway
  // through getDocument's own async setup, so the push landed on a null
  // listener and threw inside the PDF library. Caught by a dry run on a real
  // 24-sheet set — it would otherwise have been a production-only failure, on
  // exactly the big files this path exists for.
  //
  // `false` = not progressively complete.
  const transport = new S3RangeTransport(size, new Uint8Array(0), false);

  const task = pdfjs.getDocument({
    ...pdfDocOptions(Buffer.alloc(0)),
    data: undefined,
    range: transport,
    length: size,
    // Both of these keep pdfjs lazy. Without them it happily streams the entire
    // file into memory in the background, which would undo the whole exercise.
    disableAutoFetch: true,
    disableStream: true,
  });

  const doc = await Promise.race([task.promise, failed]);

  return {
    doc,
    stats,
    /**
     * Race any later read against this. Once a fetch has failed, waiting on
     * pdfjs is waiting on nothing.
     */
    failed,
    /**
     * Pass this to extractPdfPages as `shouldStop`. True once the read has
     * either run the process close to its memory ceiling — the brake that
     * actually matters — or pulled more bytes than is reasonable.
     *
     * Stopping here is a degraded read, not a failed one: the caller keeps
     * every page scanned so far, and the sheets worth having are at the front.
     */
    overBudget: (limit = SCAN_BYTE_BUDGET) => {
      // Sampled here as well as in the fetcher: parsing a page costs memory
      // even when it pulls no new bytes, so a read can cross the line without
      // ever going back to storage.
      const rss = process.memoryUsage.rss();
      if (rss > stats.peakRss) stats.peakRss = rss;
      if (rss > ceiling) hitCeiling = true;
      return hitCeiling || stats.bytesFetched > limit;
    },
    async destroy() {
      try { await doc.destroy(); } catch {}
      try { transport.abort(); } catch {}
    },
  };
}

/**
 * Open an uploaded object as a pdfjs document, choosing buffered or ranged
 * reading by size. Callers get the same shape either way.
 *
 * @returns {Promise<{ ok: true, doc, buffer, ranged, size, stats, destroy }
 *                  | { ok: false, code, message }>}
 *   `buffer` is null on the ranged path — nothing downstream may assume the
 *   whole file is in hand. Anything that needs bytes should ask the doc.
 */
export async function openUploadedPdf(key, { limit } = {}) {
  const head = await headUploadedObject(key);
  if (!head.ok) return head;
  if (limit != null && head.size > limit) {
    return { ok: false, code: 'too_large', message: `That file is larger than ${Math.round(limit / (1024 * 1024))} MB.` };
  }

  if (head.size <= RANGE_THRESHOLD_BYTES) {
    const got = await getUploadedObject(key, { limit: limit ?? head.size });
    if (!got.ok) return got;
    const pdfjs = await loadPdfjs();
    const doc = await pdfjs.getDocument(pdfDocOptions(got.buffer)).promise;
    return {
      ok: true, doc, buffer: got.buffer, ranged: false, size: head.size,
      stats: { size: head.size, bytesFetched: head.size, requests: 1, failures: 0 },
      // Already in memory and already under the threshold, so there is nothing
      // to ration and nothing left to fail. Both are present anyway so callers
      // never have to branch on which path ran.
      overBudget: () => false,
      failed: new Promise(() => {}),
      destroy: async () => { try { await doc.destroy(); } catch {} },
    };
  }

  const opened = await openRangedPdf({ size: head.size, fetchRange: rangeFetcherFor(key) });
  return { ok: true, buffer: null, ranged: true, size: head.size, ...opened };
}
