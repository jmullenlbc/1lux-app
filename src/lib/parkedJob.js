/**
 * Park-and-poll for the in-app AI reads.
 *
 * Amplify's front door hangs up on any single request that runs longer than
 * ~30 seconds and answers the browser with an EMPTY 504 — but the Lambda keeps
 * running to its own `maxDuration`. The public conceptual-budget read already
 * lives with that (src/app/api/intake/parse/route.js): it parks its state,
 * marks the work in flight, and the browser polls until the answer is there.
 * Mike, 2026-09-18: "match the public page across all drawing uploads in the
 * system. Or else we will hit timeout errors in other places."
 *
 * This is that same mechanism, made shareable, for the reads that used to run
 * inside one request: site plan, unit matrix, contract review, schedule
 * milestones, fixture schedules, reviewer notes, TOC, code check, bot library.
 *
 * The shape, from the browser's side (see src/lib/parkedFetch.js):
 *
 *   POST body            → { jobKey, queued: true }     the job is written down
 *   POST { jobKey }      → runs it; if the front door hangs up first the Lambda
 *                          still finishes and parks the answer
 *   POST { jobKey }      → { jobKey, waiting: true }    while the first run is alive
 *   POST { jobKey }      → the real answer (or the real error, same body and
 *                          status the route always sent), then the job is swept
 *   POST { jobKey, sweep: true } → 204, after a direct success
 *
 * What a route keeps doing itself, on EVERY request: auth, project access, and
 * any cheap validation that produces a friendly 4xx. Those run again on each
 * poll, which is the point — a poll is a real request from the same person.
 *
 * What the route hands over: `args` (small, JSON-able — a fileId or an upload
 * key, never bytes) and `run(args)`, which returns the success body as a plain
 * object or throws `jobError(status, payload)` to send the failure body the
 * UI already knows how to read.
 *
 * With no parking store at all (no bucket and not in dev), the job runs inline
 * exactly as it did before this file existed.
 */
import {
  isScanKey, putScanState, putScanStateAt, getScanState, deleteScanState,
  putScanAttempt, getScanAttempt, deleteScanAttempt,
  stashUploadedObject, getUploadedObject, deleteUploadedObject,
} from './uploadStorage.js';

/**
 * How long a started run is trusted to still be alive. Under this age a poll
 * says "waiting"; past it the run is presumed dead (a Lambda that hit its own
 * ceiling, or a crash that parked nothing) and the poll starts it again.
 * The public pick stage uses 90s for one model call; these reads chain two or
 * three, so the default is longer, and the contract review longer still.
 */
export const JOB_INFLIGHT_MS = 120_000;

/** Starts allowed before we give up and tell the person, honestly. */
export const JOB_MAX_KICKS = 2;

/** Every failure body the routes send carries at least this. */
export function jobError(status, payload) {
  const body = payload && typeof payload === 'object' ? payload : { error: String(payload ?? 'job_failed') };
  const err  = new Error(body.message || body.error || 'job failed');
  err.isJobError = true;
  err.status     = Number(status) || 500;
  err.payload    = body;
  return err;
}

// A plain Response, not NextResponse: route handlers accept either, and this
// file is unit-tested in bare Node where next/server does not resolve.
const respond = (payload, status = 200) => new Response(JSON.stringify(payload ?? {}), {
  status, headers: { 'content-type': 'application/json; charset=utf-8' },
});

/** Run it here and now — the no-store path and the "done" path share this. */
async function runInline(run, args, deps) {
  try {
    return respond(await run(args));
  } catch (e) {
    if (e?.isJobError) return respond(e.payload, e.status);
    deps.log('[parkedJob] run failed', e?.message ?? e);
    return respond({ error: 'job_failed', message: e?.message || 'The read failed. Please try again.' }, 500);
  }
}

/**
 * @param {object} opts
 * @param {object} opts.body        the parsed JSON body (or the fields lifted off a form)
 * @param {string} opts.kind        a name for this job type, e.g. 'site.parse'
 * @param {string} opts.scope       what it belongs to — the project id — so a
 *                                  key minted on one project cannot be replayed on another
 * @param {object} [opts.args]      what run() needs; read only on the START request
 * @param {(args: object) => Promise<object>} opts.run
 * @param {number} [opts.inflightMs]
 * @param {object} [opts.deps]      test seam — the storage functions and a clock
 * @returns {Promise<Response>}
 */
export async function runParkedJob({ body, kind, scope, args = null, run, inflightMs = JOB_INFLIGHT_MS, deps = {} }) {
  const d = {
    putScanState, putScanStateAt, getScanState, deleteScanState,
    putScanAttempt, getScanAttempt, deleteScanAttempt,
    now: Date.now, log: (...a) => console.error(...a),
    ...deps,
  };
  const jobKey = body?.jobKey ? String(body.jobKey) : null;

  // ── Start ────────────────────────────────────────────────────────────────
  if (!jobKey) {
    const key = await d.putScanState({
      job: kind, scope: String(scope), args: args ?? {}, status: 'queued', createdAt: new Date(d.now()).toISOString(),
    });
    if (!key) return runInline(run, args ?? {}, d);   // nowhere to park → the old way
    return respond({ jobKey: key, queued: true });
  }

  if (!isScanKey(jobKey)) return respond({ error: 'bad_job', message: 'That job reference is not valid.' }, 400);

  // ── Sweep (after the browser got a direct answer) ────────────────────────
  if (body.sweep === true) {
    await d.deleteScanState(jobKey);
    await d.deleteScanAttempt(jobKey);
    return new Response(null, { status: 204 });
  }

  // ── Poll / run ───────────────────────────────────────────────────────────
  const got = await d.getScanState(jobKey, { quiet: true });
  if (!got.ok) {
    return respond({ error: 'job_gone', message: 'That read has expired or was already collected. Please start it again.' }, 410);
  }
  const state = got.state || {};
  if (state.job !== kind || String(state.scope) !== String(scope)) {
    return respond({ error: 'job_mismatch', message: 'That job belongs to a different read.' }, 404);
  }

  const sweep = async () => { await d.deleteScanState(jobKey); await d.deleteScanAttempt(jobKey); };

  if (state.status === 'done') {
    await sweep();
    return respond(state.result ?? {});
  }
  if (state.status === 'error') {
    await sweep();
    return respond(state.payload ?? { error: 'job_failed' }, state.httpStatus || 500);
  }

  // Queued, or started by a request that may or may not still be alive.
  const marker = await d.getScanAttempt(jobKey);
  const kicks  = Number(marker?.kicks) || 0;
  if (marker?.stage === 'run') {
    const age = d.now() - (Number(marker.startedAt) || 0);
    if (age >= 0 && age < inflightMs) return respond({ jobKey, waiting: true, kicks });
  }
  if (kicks >= JOB_MAX_KICKS) {
    // Two whole attempts ate their requests alive and never parked an answer.
    // Say so rather than starting a third, and sweep so the key is dead.
    await sweep();
    return respond({
      error:   'job_timeout',
      message: 'This read is taking longer than the server allows. Try a smaller file, or just the sheets you need.',
    }, 504);
  }

  // Marker first, then the work — if the front door cuts this request the next
  // poll must already be able to see that a run is alive.
  await d.putScanAttempt(jobKey, { stage: 'run', startedAt: d.now(), kicks: kicks + 1 });

  let parked;
  try {
    const result = await run(state.args ?? {});
    parked = { ...state, status: 'done', result };
  } catch (e) {
    if (e?.isJobError) {
      parked = { ...state, status: 'error', httpStatus: e.status, payload: e.payload };
    } else {
      d.log('[parkedJob] run failed', kind, e?.message ?? e);
      parked = {
        ...state, status: 'error', httpStatus: 500,
        payload: { error: 'job_failed', message: e?.message || 'The read failed. Please try again.' },
      };
    }
  }

  // Park BEFORE answering. If this request was already cut off, the answer
  // lands in the store and the next poll collects it. If it was not, the
  // browser gets it now and sweeps.
  await d.putScanStateAt(jobKey, parked);
  await d.putScanAttempt(jobKey, { stage: 'parked' });

  return parked.status === 'done'
    ? respond(parked.result ?? {})
    : respond(parked.payload, parked.httpStatus);
}

// ── Helpers for the routes that take a file in the form ──────────────────────

/**
 * The start request for an upload route is multipart; every poll is JSON.
 * @returns {Promise<{ body: object, formData: FormData|null }>}
 */
export async function readJobRequest(request) {
  const ct = request.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    let body = {};
    try { body = await request.json(); } catch { body = {}; }
    return { body: body && typeof body === 'object' ? body : {}, formData: null };
  }
  let formData = null;
  try { formData = await request.formData(); } catch { formData = null; }
  const jobKey = formData?.get('jobKey');
  return { body: jobKey ? { jobKey: String(jobKey) } : {}, formData };
}

/**
 * Turn what readUploadedFile returned into job args a later request can use.
 * A direct upload already has a key. A file that rode the form body is stashed
 * under the same prefix; if there is no store at all the bytes stay in the args
 * and the job runs inline anyway (putScanState refuses for the same reason).
 */
export async function uploadToJobArgs(upload, { scope = 'project' } = {}) {
  const ext = (upload.name || '').split('.').pop()?.toLowerCase() || 'bin';
  let uploadKey = upload.uploadKey || null;
  if (!uploadKey) uploadKey = await stashUploadedObject(upload.buffer, ext, scope);
  return {
    uploadKey,
    fileName: upload.name,
    fileType: upload.type || 'application/octet-stream',
    ...(uploadKey ? {} : { buffer: upload.buffer }),
  };
}

/**
 * The other half: bytes back from job args, plus a cleanup for the stash.
 * @returns {Promise<{ buffer: Buffer, name: string, type: string, cleanup: () => Promise<boolean> }>}
 * @throws jobError(400|413) when the upload is gone or too large
 */
export async function loadJobUpload(args, { limit } = {}) {
  const name = String(args?.fileName || 'upload.pdf');
  const type = String(args?.fileType || '') || 'application/octet-stream';
  if (args?.buffer) {
    // Inline run, or (rarely) a stash that failed while the state store worked:
    // Buffer.from also accepts the { type: 'Buffer', data } shape JSON gives back.
    return { buffer: Buffer.from(args.buffer), name, type, cleanup: async () => false };
  }
  const key = String(args?.uploadKey || '');
  const got = await getUploadedObject(key, limit ? { limit } : {});
  if (!got.ok) {
    throw jobError(got.code === 'too_large' ? 413 : 400, { error: got.code || 'upload_gone', message: got.message });
  }
  return { buffer: got.buffer, name, type, cleanup: () => deleteUploadedObject(key) };
}
