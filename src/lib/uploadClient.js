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

export async function uploadDirect(file, { onProgress } = {}) {
  const res = await fetch('/api/uploads/presign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileName: file.name, size: file.size }),
  });
  const slip = await res.json().catch(() => null);

  if (res.ok && slip && slip.available === false) return null; // dev fallback
  if (!res.ok || !slip?.url) {
    throw new Error(slip?.message || 'Could not prepare the upload. Please try again.');
  }

  // XMLHttpRequest instead of fetch for one reason: upload progress events.
  // Today's uploads show no progress at all; a 40 MB drawing set deserves one.
  await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', slip.url);
    xhr.setRequestHeader('Content-Type', slip.contentType);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error('The upload was rejected. Please try again.'));
    };
    xhr.onerror   = () => reject(new Error('Upload failed. Please check your connection and try again.'));
    xhr.ontimeout = () => reject(new Error('The upload timed out. Please try again.'));
    xhr.timeout = 10 * 60 * 1000; // matches the slip's own 10-minute expiry
    xhr.send(file);
  });

  return { key: slip.key };
}
