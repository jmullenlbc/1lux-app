// Browser side of the direct-to-S3 upload flow. Client-safe: no server-only
// imports, no AWS SDK — the browser just PUTs bytes to a presigned URL.
//
// Usage:
//   const sent = await uploadDirect(file, { onProgress });
//   if (sent) → { key } — hand the key to the parse route instead of the file
//   if null  → presigning unavailable (local dev) — use the classic multipart
//              path, which has no front-door cap there
//
// Throws on real failures (oversized, unsupported type, network) with a
// `message` written for a public visitor, so callers can show it as-is.

// Matches PART_BYTES in uploadStorage.js, which is server-only (it reaches for
// the AWS SDK) and so cannot be imported here. The server re-derives the part
// count from the size it is given, so the two only have to agree on this
// number. It sits on storage's 5 MiB floor for a non-final part.
const PART_BYTES = 5 * 1024 * 1024;

// How many times one request may be retried before we give up on it. A network
// drop is the failure we are actually retrying: whatever caused it -- a wifi
// handoff, a carrier timeout, a router with an itchy trigger on long uploads --
// is almost always gone a few seconds later.
const RETRY_DELAYS_MS = [2000, 5000, 12000];

// ── Reading the file BEFORE sending it ──────────────────────────────────────
//
// On a phone, "the file" is often not on the phone. Android hands the browser
// a live pipe to wherever it really lives -- Google Drive, most often -- and
// the bytes are pulled down WHILE the upload runs. When that pipe stalls or
// the cloud app hiccups, the send dies partway and it is indistinguishable
// from a dropped connection: same on wifi or cellular, same at home or on a
// job site. Mike's 12 MB set dying "10% in" on home wifi (2026-08-30) was
// this, with the file sitting in the ILC Google Drive.
//
// So: pull the whole file into memory FIRST, when it is small enough to
// afford. The cloud download has to finish before a single byte goes out, a
// failure surfaces here with a message that says what to actually do, and
// every later read (including each 5 MB part) comes from memory, where
// nothing can change or stall underneath it. Past the ceiling we stream as
// before -- holding hundreds of MB in a phone's memory is its own crash.
const BUFFER_CEILING_BYTES = 64 * 1024 * 1024;

export async function materialize(file) {
  if ((file.size || 0) > BUFFER_CEILING_BYTES) return file;
  let buf;
  try {
    buf = await file.arrayBuffer();
  } catch {
    buf = null;
  }
  if (!buf || buf.byteLength !== file.size) {
    const err = new Error(
      "Your phone couldn't read this file all the way through — that usually "
      + 'means it lives in Google Drive or another cloud app and never finished '
      + 'coming down. Save it to your phone first (in Drive: ⋮ → Download), '
      + 'then try again. (U6)');
    err.unreadable = true;   // the fallback path would fail the same way
    throw err;
  }
  return new Blob([buf]);
}

/**
 * Keep the phone's screen on, and KEEP it on.
 *
 * A single wakeLock.request is not enough on a phone: the browser silently
 * drops the lock the moment the page is hidden (the visitor checks a text,
 * flips to another app) and it does NOT come back on its own. So this
 * re-grabs the lock every time the page comes back into view, until the
 * returned release function is called.
 *
 * Browsers without wake lock get exactly the old behaviour -- every failure
 * here is swallowed on purpose.
 */
export function holdScreenAwake() {
  let lock = null;
  let released = false;
  const grab = async () => {
    if (released) return;
    try { lock = await navigator.wakeLock?.request('screen'); } catch { /* fine without it */ }
  };
  const onVisible = () => { if (document.visibilityState === 'visible') grab(); };
  grab();
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisible);
  return async () => {
    released = true;
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisible);
    try { await lock?.release(); } catch { /* already gone */ }
  };
}

export async function uploadDirect(file, { onProgress, scope = 'intake' } = {}) {
  const res = await fetch('/api/uploads/presign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fileName: file.name,
      size: file.size,
      scope,
      multipart: (file.size || 0) >= PART_BYTES,
    }),
  });
  const slip = await res.json().catch(() => null);

  if (res.ok && slip && slip.available === false) return null; // dev fallback
  if (!res.ok || !(slip?.url || slip?.partUrls?.length)) {
    throw new Error(slip?.message || 'We could not start the upload. Please try again. (U1)');
  }

  // A phone mid-upload is a hostile place: the screen dims, wifi hands off to
  // cell in the parking lot, an elevator eats the signal. Hold a screen wake
  // lock for the duration so the phone at least doesn't put the page to sleep
  // in the middle of sending. (The intake dropzone holds its own lock across
  // the whole upload-and-read journey; this one covers any other caller.)
  const releaseWake = holdScreenAwake();

  const stats = { pct: null, sentBytes: 0, startedAt: Date.now(), part: null, parts: null };
  try {
    const bytes = await materialize(file);
    if (slip.partUrls?.length) await sendInParts(slip, bytes, onProgress, stats);
    else                       await sendWhole(slip, bytes, onProgress, stats);
  } finally {
    await releaseWake();
  }

  return { key: slip.key };
}


// ── Sending ───────────────────────────────────────────────────────────────
//
// Small file: one PUT, retried on a network drop.
//
// Big file: one PUT PER PART, each retried on its own. This is the difference
// that matters. Mike's upload died about 10% into a set on wifi (2026-08-29) --
// the transfer started fine and the connection dropped partway, which used to
// kill the whole file because a single PUT has no smaller unit to fall back
// to. In parts, that same drop costs one 8 MB chunk, which is resent
// automatically while the progress bar barely moves.

async function sendWhole(slip, file, onProgress, stats) {
  stats.parts = 1;
  await withRetry(() => putOnce(slip.url, file, slip.contentType, (pct) => {
    stats.pct = pct;
    stats.sentBytes = Math.round((file.size || 0) * pct / 100);
    onProgress?.(pct);
  }), stats);
}

async function sendInParts(slip, file, onProgress, stats) {
  const total     = file.size || 1;
  const partBytes = slip.partBytes || PART_BYTES;
  stats.parts = slip.partUrls.length;
  let doneBytes = 0;

  try {
    for (let i = 0; i < slip.partUrls.length; i++) {
      const start = i * partBytes;
      // A Blob sliced with no type makes the browser send no Content-Type
      // header, which is what the part slips are signed for.
      const chunk = file.slice(start, Math.min(start + partBytes, total));
      stats.part  = i + 1;

      const base = doneBytes;
      await withRetry(() => putOnce(slip.partUrls[i], chunk, null, (pct) => {
        stats.sentBytes = base + Math.round(chunk.size * pct / 100);
        stats.pct = Math.round((stats.sentBytes / total) * 100);
        onProgress?.(stats.pct);
      }), stats);

      doneBytes += chunk.size;
      stats.sentBytes = doneBytes;
      stats.pct = Math.round((doneBytes / total) * 100);
      onProgress?.(stats.pct);
    }
  } catch (err) {
    // Don't leave half a drawing set sitting in the bucket.
    await tellServer({ ...slip, action: 'abort' }).catch(() => {});
    throw err;
  }

  // Storage holds the parts separately until it is told that's all of them.
  const done = await tellServer({ ...slip, parts: slip.partUrls.length });
  if (!done.ok) {
    const msg = done.message || 'The upload could not be finished. Please try again.';
    throw new Error(`${msg} (U5)`);
  }
}

async function tellServer({ key, uploadId, parts, action }) {
  const res = await fetch('/api/uploads/complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, uploadId, parts, action }),
  });
  const out = await res.json().catch(() => null);
  return { ok: res.ok && out?.ok === true, message: out?.message };
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Retries only what retrying can fix. A storage rejection (U2) or a genuine
// hour-long timeout (U4) would fail identically the second time, so those are
// thrown straight through.
async function withRetry(attempt, stats) {
  const stops = [];   // how far each attempt got before it died
  for (let n = 0; ; n++) {
    try {
      return await attempt();
    } catch (err) {
      stops.push(stats.sentBytes);
      if (!err.retryable || n >= RETRY_DELAYS_MS.length) {
        if (err.retryable) err.message = describeDrop(stats, stops);
        throw err;
      }
      await wait(RETRY_DELAYS_MS[n]);
    }
  }
}

// Did every attempt die in the same place? That single question separates the
// two causes, and they need opposite fixes:
//
//   same place every time  -> something is refusing the transfer at a fixed
//                             point (a limit, a filter, a file the phone can
//                             only partly read). Retrying will never help.
//   a different place each -> a genuinely weak or busy connection, which is
//                             exactly what the retries are for.
//
// Asking Mike to upload five times and eyeball the percentages is not a
// diagnostic. Measuring it inside the one failure he already had is.
export function stoppedAtTheSamePlace(stops) {
  if (stops.length < 2) return false;
  const hi = Math.max(...stops), lo = Math.min(...stops);
  if (hi === 0) return false;
  return (hi - lo) / hi < 0.15;
}

// ── Why the message is this specific ──────────────────────────────────────
//
// Four different things can go wrong between picking a file and reading it,
// and they used to print the same sentence: "Upload failed, check your
// connection." That sentence is worse than useless -- it sends someone to
// check their wifi when the real problem was elsewhere, and it tells us
// nothing when a GC reports it.
//
// The codes are ugly but they are the only thing that survives a screenshot
// from a job site, and the numbers around them are what let us tell a weak
// signal (dies at a random point, different every time) from a size or time
// wall (dies at the same place every time). Chasing this bug without them
// cost a day.
export function describeDrop(stats, stops) {
  const mb    = (n) => `${Math.round((n / (1024 * 1024)) * 10) / 10} MB`;
  const secs  = Math.round((Date.now() - stats.startedAt) / 1000);
  const where = stats.pct != null ? `${stats.pct}% in` : 'before it started';
  const part  = stats.parts > 1 ? `, part ${stats.part} of ${stats.parts}` : '';
  const verdict = stoppedAtTheSamePlace(stops)
    ? `It stopped at the same point all ${stops.length} times, so this is a limit somewhere `
      + `on the way — not a weak signal. Send the file to precon@ilcstudios.com and we'll take it from there.`
    : 'Please try again on a stronger connection.';
  return `The connection dropped ${where}${part} — ${mb(stats.sentBytes)} sent over ${secs}s, `
       + `across ${stops.length} tries. ${verdict} (U3)`;
}

// One PUT. XMLHttpRequest instead of fetch for two reasons: upload progress
// events, and it STREAMS from disk rather than reading the whole thing into
// memory first. That second one is what lets a phone send a 300 MB drawing set
// at all -- the browser never holds the file.
function putOnce(url, body, contentType, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    if (contentType) xhr.setRequestHeader('Content-Type', contentType);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Storage would not accept the file (${xhr.status}). Please try again. (U2)`));
    };
    xhr.onerror = () => {
      const err = new Error('The connection dropped while sending the file. Please try again. (U3)');
      err.retryable = true;   // the one failure a retry can actually fix
      reject(err);
    };
    xhr.ontimeout = () => reject(new Error('The upload timed out. Please try again — a strong connection helps with a big set. (U4)'));
    // Matches the slip's own expiry (PRESIGN_TTL_SECONDS in uploadStorage.js).
    // A 400 MB set over a job-site connection at 2 Mbps takes ~27 minutes; a
    // timeout shorter than the slip would kill a transfer that was going fine.
    xhr.timeout = 60 * 60 * 1000;
    xhr.send(body);
  });
}


// ── The one call every in-app drop zone makes ───────────────────────────────
//
// Puts `file` into `form` the best way available, and returns how it travelled:
//
//   'direct'    — went straight to S3; the form carries only a key, so the
//                 request sails through Amplify's 4 MB front door
//   'multipart' — the file itself is in the form, as it always was. Happens in
//                 local dev (no bucket) and for types we don't presign
//                 (images, Word docs). Local dev has no front-door cap.
//
// If the direct attempt fails, we retry through the form body ONLY when the
// file would have fit there anyway (under Amplify's ~4.4 MB front door). That
// keeps small uploads working even if the bucket's CORS or IAM settings are not
// in place yet. A big file is not retried: it would hit the 4 MB wall and
// report the wrong problem, so its real error is thrown for the caller to show.

const PRESIGNABLE_EXT = ['pdf', 'xlsx', 'xls'];

// The bot's library reads more than drawings and schedules, so its drop zone can
// send more than they can. Must stay in step with KNOWLEDGE_PRESIGNABLE in
// uploadStorage.js — an extension listed here but not there gets a slip refused
// and quietly falls back to the form body, which caps out at 4 MB in prod.
const KNOWLEDGE_EXT = [
  ...PRESIGNABLE_EXT,
  'doc', 'docx', 'rtf', 'xlsm', 'csv',
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp',
  'txt', 'md',
];

export function isPresignable(file, scope = 'project') {
  const ext = (file?.name || '').split('.').pop()?.toLowerCase();
  return (scope === 'knowledge' ? KNOWLEDGE_EXT : PRESIGNABLE_EXT).includes(ext);
}

// Amplify's front door. Anything at or under this can still ride in the form
// body, which is what makes the fallback below safe.
const FRONT_DOOR_BYTES = 4 * 1024 * 1024;

export async function appendUpload(form, file, { onProgress, scope = 'project' } = {}) {
  if (isPresignable(file, scope)) {
    let sent;
    try {
      sent = await uploadDirect(file, { onProgress, scope });
    } catch (err) {
      if ((file.size || 0) > FRONT_DOOR_BYTES) throw err;
      sent = null; // small enough to go the old way — no need to bother the user
    }
    if (sent) {
      form.append('uploadKey', sent.key);
      form.append('fileName', file.name);
      form.append('fileType', file.type || '');
      return 'direct';
    }
  }
  form.append('file', file);
  return 'multipart';
}


// ── The multi-file version, for the drop zones that take a whole set ────────
//
// Each file is placed the best way it can be: presignable ones go straight to
// S3 and are described in a single `uploadKeys` list; the rest ride in the form
// under `field`. The server reads both and stitches them back into one set, so
// a mixed drop still arrives as one submission.
//
// Progress is reported across the whole batch (0-100), not per file, because
// that is what the drop zones display.

export async function appendUploads(form, files, { onProgress, scope = 'project', field = 'files' } = {}) {
  const list  = Array.from(files || []);
  const sent  = [];
  const total = list.reduce((n, f) => n + (f.size || 0), 0) || 1;
  let done    = 0;

  for (const file of list) {
    if (isPresignable(file, scope)) {
      const base = done;
      let slip;
      try {
        slip = await uploadDirect(file, {
          scope,
          onProgress: (pct) => onProgress?.(Math.round(((base + (file.size || 0) * pct / 100) / total) * 100)),
        });
      } catch (err) {
        // Same rule as appendUpload: only fall back for a file the form body
        // could actually carry.
        if ((file.size || 0) > FRONT_DOOR_BYTES) throw err;
        slip = null;
      }
      if (slip) {
        sent.push({ key: slip.key, name: file.name, type: file.type || '' });
        done += file.size || 0;
        continue;
      }
    }
    form.append(field, file);
    done += file.size || 0;
  }

  if (sent.length) form.append('uploadKeys', JSON.stringify(sent));
  return { direct: sent.length, multipart: list.length - sent.length };
}
