// Turns a failed browser upload into ONE honest sentence a non-technical user can act on.
//
// Why this exists: several drop zones used to do `if (res.ok) { ...show file... }`
// with no else, inside a `try { } catch {}`. Every failure — the size cap, an auth
// timeout, a server error — looked identical to the user: the spinner disappeared
// and the file just never showed up. That is the worst possible failure mode,
// because the honest answer ("too big", "log back in") is completely different
// depending on the cause.
//
// Two different ceilings, because there are two different routes into the app.
//
// UPLOAD_LIMIT_BYTES (4 MB) is AWS Amplify's front door, not our code. It rejects
// the request before the app ever runs, so the response body is empty and there is
// nothing for the server to explain — the browser has to say it. This applies to
// anything that still travels THROUGH the app as a multipart body.
//
// PROJECT_UPLOAD_LIMIT_BYTES (25 MB) applies to PDFs and spreadsheets, which now
// go straight to S3 and never pass the front door at all. Mike, 2026-08-19:
// "we need that limit to go up to 25mb — schedules can be 50 pages long if
// detailed." Keep this in step with MAX_PROJECT_UPLOAD_BYTES in uploadStorage.js;
// that one is the server's enforcement and this one is the browser's warning.
export const UPLOAD_LIMIT_BYTES = 4 * 1024 * 1024;
export const PROJECT_UPLOAD_LIMIT_BYTES = 25 * 1024 * 1024;

// Which ceiling a given file is actually subject to. Decidable from the name
// alone, so the browser can warn instantly with no round trip.
const DIRECT_EXT = ['pdf', 'xlsx', 'xls'];
export function limitForFile(file) {
  const ext = (file?.name || '').split('.').pop()?.toLowerCase();
  return DIRECT_EXT.includes(ext) ? PROJECT_UPLOAD_LIMIT_BYTES : UPLOAD_LIMIT_BYTES;
}

const mb = (bytes) => (bytes / (1024 * 1024)).toFixed(1);
const wholeMb = (bytes) => Math.round(bytes / (1024 * 1024));

// Check BEFORE sending — saves the user a long upload that was always going to fail.
export function oversizeMessage(file, limit = null) {
  if (!file) return null;
  const ceiling = limit ?? limitForFile(file);
  if (file.size <= ceiling) return null;
  const advice = ceiling === UPLOAD_LIMIT_BYTES
    ? 'Save a reduced-size copy, or split it, and try again.'
    : 'Save a reduced-size copy of the PDF, or split it into volumes, and try again.';
  return `${file.name} is ${mb(file.size)} MB. The server can only accept uploads up to ${wholeMb(ceiling)} MB. ${advice}`;
}

// Check AFTER sending — res is the fetch Response, file is what we tried to send.
export async function uploadErrorMessage(res, file) {
  if (res.ok) return null;
  // 413 (and the empty/opaque responses the front door sometimes returns) means the
  // request never reached our code. Size is the only cause we have ever seen.
  if (res.status === 413) return oversizeMessage(file) || `${file?.name ?? 'That file'} was rejected as too large by the server.`;

  if (res.status === 401 || res.status === 403) return 'Your session expired. Refresh the page, sign in again, and re-drop the file.';
  const body = await res.json().catch(() => null);
  if (body?.error) return body.error;
  return `Upload failed (server said ${res.status}). ${file?.name ?? 'The file'} was not saved.`;
}

// Network-level throw (offline, aborted, front door closing the socket on a big body).
export function uploadThrowMessage(err, file) {
  return oversizeMessage(file)
    || `Upload failed before it finished: ${err?.message || 'connection lost'}. ${file?.name ?? 'The file'} was not saved.`;
}


// ── The multi-file drop zones ───────────────────────────────────────────────
//
// These used to add every file up and compare the total against 4 MB, because
// the whole set travelled in one request body. That is no longer true: PDFs and
// spreadsheets now go to S3 one at a time, each with its own 25 MB ceiling, and
// only the leftovers still share the request body. So the check is now two
// checks — per-file for the direct ones, combined for the rest.
//
// Returns null when the batch is fine, otherwise the message to show.

export function batchOversizeMessage(files) {
  const list = Array.from(files || []);
  if (!list.length) return null;

  for (const file of list) {
    if (limitForFile(file) === PROJECT_UPLOAD_LIMIT_BYTES) {
      const msg = oversizeMessage(file);
      if (msg) return msg;
    }
  }

  const shared = list.filter(f => limitForFile(f) === UPLOAD_LIMIT_BYTES);
  const total  = shared.reduce((sum, f) => sum + (f.size || 0), 0);
  if (total > UPLOAD_LIMIT_BYTES) {
    const n = shared.length;
    return `${n === 1 ? shared[0].name : `Those ${n} files`} add${n === 1 ? 's' : ''} up to ${mb(total)} MB. `
      + `Files of that type travel together and the server only accepts ${wholeMb(UPLOAD_LIMIT_BYTES)} MB at a time — `
      + `send them in smaller batches.`;
  }

  return null;
}
