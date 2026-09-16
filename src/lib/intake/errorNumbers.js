/**
 * Error numbers for every server-side failure the intake pipeline can hand a
 * visitor. The letter families divide the world by WHERE the failure lives:
 *
 *   U = the upload from the browser        (uploadClient.js, stamped there)
 *   R = the read connection from the browser (stagedParse.js, stamped there)
 *   V = the AI vision call on the server   (siteVision.js, stamped there)
 *   S = everything else the server returns (stamped HERE, automatically)
 *   F = the file itself, rejected before upload (DrawingDropzone, stamped there)
 *
 * A message with NO number is the one kind that should no longer exist: every
 * route that answers a visitor runs its message through stampError() below, so
 * even a code added later without a number ships as "(S-<code>)" rather than
 * bare. One screenshot from the field names the step and the kind of failure.
 */
export const ERROR_NUMBERS = {
  bad_request: 'S1',          // malformed request (missing file, unknown stage)
  too_large: 'S2',            // file over the upload ceiling
  unsupported_type: 'S3',     // not a PDF/Excel
  image_not_supported: 'S4',  // a photo/image where a drawing set was expected
  unreadable: 'S5',           // damaged file / not really a PDF
  no_text_layer: 'S6',        // scan with nothing searchable (spreadsheet path)
  parse_failed: 'S7',         // an unexpected throw reached the top
  extraction_failed: 'S8',    // the AI read ran but produced nothing usable
  bad_output: 'S9',           // the AI answered, but the answer would not parse
  no_pages: 'S10',            // the PDF rendered zero pages
  bad_key: 'S11',             // upload/scan reference is not one of ours
  scan_expired: 'S12',        // parked scan state aged out; start over
  not_found: 'S13',           // the uploaded file is gone from storage
  unavailable: 'S14',         // a required service is not configured/reachable
  rate_limited: 'S15',        // too many uploads at once
  presign_failed: 'S16',      // could not mint the direct-to-S3 permission slip
  missing_parts: 'S17',       // multipart stitch: some pieces never arrived
  no_parts: 'S18',            // multipart stitch: no pieces arrived at all
  ai_unavailable: 'S19',      // AI account failure (message carries V3 instead)
  too_big_to_read: 'S20',     // memory brake stopped the text read before the set could be judged
};

/** True when the message already ends in a code like "(V3)" or "(V1-400)". */
const alreadyCoded = /\([A-Z][A-Za-z0-9/.-]*\)$/;

/**
 * Append the error number for `code` to a public message -- unless the message
 * already ends in a code (the vision layer stamps V-codes itself).
 */
export function stampError(code, message) {
  const msg = String(message ?? '').trim();
  if (alreadyCoded.test(msg)) return msg;
  return `${msg} (${ERROR_NUMBERS[code] ?? `S-${code}`})`;
}
