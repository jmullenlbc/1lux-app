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

export async function uploadDirect(file, { onProgress, scope = 'intake' } = {}) {
  const res = await fetch('/api/uploads/presign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileName: file.name, size: file.size, scope }),
  });
  const slip = await res.json().catch(() => null);

  if (res.ok && slip && slip.available === false) return null; // dev fallback
  if (!res.ok || !slip?.url) {
    throw new Error(slip?.message || 'We could not start the upload. Please try again. (U1)');
  }

  // XMLHttpRequest instead of fetch for two reasons: upload progress events,
  // and it STREAMS the File from disk rather than reading it into memory first.
  // That second one is what lets a phone send a 300 MB drawing set at all — the
  // browser never holds the file, so the only real constraint is time.
  await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let sentPct = null;   // how far it got, so a drop can say where it happened
    xhr.open('PUT', slip.url);
    xhr.setRequestHeader('Content-Type', slip.contentType);
    xhr.upload.onprogress = (e) => {
      if (!e.lengthComputable) return;
      sentPct = Math.round((e.loaded / e.total) * 100);
      onProgress?.(sentPct);
    };
    // ── Why these carry codes ────────────────────────────────────────────────
    // Four different things can go wrong between picking a file and reading it,
    // and they used to print the same sentence: "Upload failed, check your
    // connection." That sentence is worse than useless -- it sends someone to
    // check their wifi when the real problem was elsewhere, and it tells us
    // nothing when a GC reports it. The codes are ugly but they are the only
    // thing that survives a screenshot from a job site.
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Storage would not accept the file (${xhr.status}). Please try again. (U2)`));
    };
    xhr.onerror   = () => reject(new Error(
      `The connection dropped while sending the file${sentPct != null ? ` at ${sentPct}%` : ' before it started'}. Please try again. (U3)`));
    xhr.ontimeout = () => reject(new Error('The upload timed out. Please try again — a strong connection helps with a big set. (U4)'));
    // Matches the slip's own expiry (PRESIGN_TTL_SECONDS in uploadStorage.js).
    // A 400 MB set over a job-site connection at 2 Mbps takes ~27 minutes; a
    // timeout shorter than the slip would kill a transfer that was going fine.
    xhr.timeout = 60 * 60 * 1000;
    xhr.send(file);
  });

  return { key: slip.key };
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

export function isPresignable(file) {
  const ext = (file?.name || '').split('.').pop()?.toLowerCase();
  return PRESIGNABLE_EXT.includes(ext);
}

// Amplify's front door. Anything at or under this can still ride in the form
// body, which is what makes the fallback below safe.
const FRONT_DOOR_BYTES = 4 * 1024 * 1024;

export async function appendUpload(form, file, { onProgress, scope = 'project' } = {}) {
  if (isPresignable(file)) {
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
    if (isPresignable(file)) {
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
