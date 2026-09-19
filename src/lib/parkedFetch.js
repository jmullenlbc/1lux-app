/**
 * Browser half of park-and-poll. See src/lib/parkedJob.js for the why.
 *
 *   const res  = await postParked(url, body, { onWait });
 *   const data = await res.json();      // same shape the route always sent
 *   if (!res.ok) …                      // same status the route always sent
 *
 * `body` is a plain object (sent as JSON) or a FormData (sent as-is). The
 * first request only writes the job down; every request after that is a JSON
 * `{ jobKey }` poll. A poll the front door hangs up on (an empty non-2xx,
 * which is never one of our own answers — they all carry a message) is simply
 * asked again after a pause: the server keeps running and parks the answer.
 *
 * `onWait(info)` fires each time the browser goes back to wait, so a screen
 * can say "still reading" instead of nothing; `info.seconds` is the wait so far.
 */

export const PARKED_POLL_MS       = 4_000;
export const PARKED_HANGUP_WAIT_MS = 3_000;
export const PARKED_MAX_WAIT_MS   = 8 * 60 * 1000;
/** Consecutive empty hang-ups before we stop believing the server is alive. */
export const PARKED_MAX_HANGUPS   = 8;

const sleep = (ms, signal) => new Promise((resolve, reject) => {
  if (signal?.aborted) return reject(abortError());
  const t = setTimeout(() => { signal?.removeEventListener?.('abort', onAbort); resolve(); }, ms);
  function onAbort() { clearTimeout(t); reject(abortError()); }
  signal?.addEventListener?.('abort', onAbort, { once: true });
});

function abortError() {
  const e = new Error('The read was cancelled.');
  e.name = 'AbortError';
  return e;
}

/** Read a response the way the routes speak: JSON, or nothing at all. */
async function readBody(res) {
  const text = await res.text().catch(() => '');
  if (!text) return null;
  try { return JSON.parse(text); } catch { return { error: 'bad_response', message: text.slice(0, 300) }; }
}

function wrap(status, data) {
  return {
    ok: status >= 200 && status < 300,
    status,
    data,
    json: async () => data,
    text: async () => JSON.stringify(data),
  };
}

/**
 * @param {string} url
 * @param {object|FormData} body
 * @param {object} [opts]
 * @param {(info: {seconds: number, waiting: boolean, hangUp: boolean}) => void} [opts.onWait]
 * @param {AbortSignal} [opts.signal]
 * @param {number} [opts.pollMs]
 * @param {number} [opts.maxWaitMs]
 * @param {number} [opts.hangupWaitMs]
 * @param {typeof fetch} [opts.fetch]   test seam
 */
export async function postParked(url, body, {
  onWait, signal, pollMs = PARKED_POLL_MS, maxWaitMs = PARKED_MAX_WAIT_MS, hangupWaitMs = PARKED_HANGUP_WAIT_MS, fetch: fetchFn,
} = {}) {
  const doFetch = fetchFn || globalThis.fetch;
  const startedAt = Date.now();
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;

  const send = (payload, asForm) => doFetch(url, {
    method:  'POST',
    signal,
    ...(asForm
      ? { body: payload }
      : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }),
  });

  // ── Start ────────────────────────────────────────────────────────────────
  let res  = await send(body, isForm);
  let data = await readBody(res);
  if (!data) {
    // A hang-up on the START is not survivable: nothing was written down.
    return wrap(res.status, { error: 'hang_up', message: 'The server did not answer. Please try again.' });
  }
  if (!res.ok || !data.jobKey || data.queued !== true) return wrap(res.status, data);   // inline answer, or a 4xx

  const jobKey = data.jobKey;
  let hangUps = 0;

  // ── Poll ─────────────────────────────────────────────────────────────────
  for (;;) {
    if (signal?.aborted) throw abortError();
    if (Date.now() - startedAt > maxWaitMs) {
      return wrap(504, { error: 'job_timeout', message: 'This read took too long. Please try again with a smaller file.' });
    }

    res  = await send({ jobKey }, false);
    data = await readBody(res);

    if (!data) {
      // The front door hung up while the server was still working.
      hangUps += 1;
      if (hangUps >= PARKED_MAX_HANGUPS) {
        return wrap(504, { error: 'job_timeout', message: 'The server stopped answering. Please try again.' });
      }
      onWait?.({ seconds: Math.round((Date.now() - startedAt) / 1000), waiting: true, hangUp: true });
      await sleep(hangupWaitMs, signal);
      continue;
    }
    hangUps = 0;

    if (res.ok && data.waiting === true) {
      onWait?.({ seconds: Math.round((Date.now() - startedAt) / 1000), waiting: true, hangUp: false });
      await sleep(pollMs, signal);
      continue;
    }

    // The real answer, success or failure. A collected answer was swept by the
    // server; a direct one (success or the route's own 4xx/5xx) is swept here,
    // without waiting on it. Sweeping twice is harmless.
    send({ jobKey, sweep: true }, false).catch(() => {});
    return wrap(res.status, data);
  }
}
