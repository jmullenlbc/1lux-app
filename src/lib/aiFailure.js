/**
 * One plain sentence for a failed AI call on a drawing (Mike 10-26: "every
 * error needs to be in plain terms and explain what happens").
 *
 * Each message says three things: what went wrong, whose side it is on, and
 * what to do now. The code at the end is for us, from a screenshot:
 *   V1-<status> = the AI service answered with that HTTP status
 *   V1          = no answer at all (connection dropped, timed out)
 *   V3          = our AI account is out of credit
 *
 * Pure, no SDK import, so the tests can feed it fake errors.
 */

const EMAIL = 'precon@ilcstudios.com';
const SEND_IT = `Please email the set to ${EMAIL} and we will run it for you.`;
const THEN_SEND = `email the set to ${EMAIL} and we will run it for you.`;

/** @returns {{ code: string, message: string }} for the intake error map. */
export function visionFailure(e) {
  const status = e?.status ?? null;
  const tag = status ? `V1-${status}` : 'V1';

  // An empty credit balance is OUR outage, not the visitor's drawing, and
  // billing words have no business on a public page. Found the hard way
  // 2026-08-31: it surfaced as "Could not read the drawing". V3 = pay the bill.
  if (/credit balance/i.test(e?.message ?? '')) {
    return { code: 'ai_unavailable', message: `Our drawing reader is switched off right now. This is on our side, not your file. ${SEND_IT} (V3)` };
  }
  // 401 found 2026-10-26: the key was rejected and the visitor was told their
  // drawing could not be read. Same answer as V3, different number.
  if (status === 401 || status === 403) {
    return { code: 'ai_unavailable', message: `Our drawing reader could not sign in to the AI service it uses. This is on our side, not your file. ${SEND_IT} (${tag})` };
  }
  if (status === 429) {
    return { code: 'extraction_failed', message: `Our drawing reader has too many sets in line right now. This is on our side, not your file. Wait a minute, then press Retry. (${tag})` };
  }
  if (status === 413 || status === 400) {
    return { code: 'extraction_failed', message: `The AI service would not take these sheets as they are, usually because a page is very large. Press Retry once. If it fails again, ${THEN_SEND} (${tag})` };
  }
  if (status >= 500) {
    return { code: 'extraction_failed', message: `The AI service our drawing reader uses is having trouble right now. This is on their side, not your file. Wait a few minutes, then press Retry. If it keeps happening, ${THEN_SEND} (${tag})` };
  }
  if (!status) {
    return { code: 'extraction_failed', message: `Our drawing reader lost its connection partway through. This is on our side, not your file. Press Retry. (${tag})` };
  }
  return { code: 'extraction_failed', message: `Our drawing reader hit a problem it could not explain. This is on our side, not your file. ${SEND_IT} (${tag})` };
}

/** The AI answered, but its answer would not parse. */
export const VISION_GARBLED = `We read your drawing, but the answer came back garbled. This is on our side, not your file. Press Retry. If it happens again, ${THEN_SEND} (V2)`;
