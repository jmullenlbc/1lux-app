// Turns a failed browser upload into ONE honest sentence a non-technical user can act on.
//
// Why this exists: several drop zones used to do `if (res.ok) { ...show file... }`
// with no else, inside a `try { } catch {}`. Every failure — the size cap, an auth
// timeout, a server error — looked identical to the user: the spinner disappeared
// and the file just never showed up. That is the worst possible failure mode,
// because the honest answer ("too big", "log back in") is completely different
// depending on the cause.
//
// The 4 MB number is AWS Amplify's front door, not our code. It rejects the request
// before the app ever runs, so the response body is empty and there is nothing for
// the server to explain — the browser has to say it.
export const UPLOAD_LIMIT_BYTES = 4 * 1024 * 1024;

const mb = (bytes) => (bytes / (1024 * 1024)).toFixed(1);

// Check BEFORE sending — saves the user a long upload that was always going to fail.
export function oversizeMessage(file) {
  if (!file || file.size <= UPLOAD_LIMIT_BYTES) return null;
  return `${file.name} is ${mb(file.size)} MB. The server can only accept uploads up to 4 MB. Save a reduced-size copy of the PDF, or split it, and try again.`;
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
