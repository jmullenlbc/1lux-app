/**
 * Input cleaning for the PUBLIC "Report a bug" button on /conceptual_budget.
 *
 * /api/intake/bug-report is an unauthenticated write, so everything a visitor
 * sends is clamped here before it goes anywhere near the database: strings are
 * length-capped, non-strings become blank, NUL bytes are stripped (Postgres
 * rejects them in text columns), and only http(s) page URLs are kept.
 *
 * Kept dependency-free and alias-free so `node --test` can load it directly —
 * see scripts/tests/publicBugReport.test.mjs.
 */

export const LIMITS = {
  description: 4000,
  name:        200,
  email:       200,
  pageUrl:     1000,
  userAgent:   500,
  viewport:    20,
  title:       80,
};

// Deliberately loose: something@something.something. The email is only for a
// human to follow up with, so a strict parser would just turn real people away.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Built from the char code so the source file never holds a raw NUL byte
// (which would make git and editors treat it as binary).
const NUL_RE = new RegExp(String.fromCharCode(0), 'g');

/** Anything that is not a string or number becomes ''. Trimmed and capped. */
export function clampText(value, max) {
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  return String(value).replace(NUL_RE, '').trim().slice(0, max);
}

/** A one-line board title from the description: whitespace collapsed, ~80 chars. */
export function titleFrom(description) {
  const line = String(description || '').replace(/\s+/g, ' ').trim();
  if (line.length <= LIMITS.title) return line;
  return line.slice(0, LIMITS.title - 1).trimEnd() + '…';
}

/**
 * @param body the parsed JSON a visitor POSTed
 * @returns {{ ok: false, error: string } | { ok: true, data: object }}
 *          `error` is shown to the visitor as-is, so it is written for them.
 */
export function cleanPublicBugReport(body) {
  const b = body && typeof body === 'object' ? body : {};

  const description = clampText(b.description, LIMITS.description);
  if (!description) return { ok: false, error: 'Please tell us what went wrong.' };

  const email = clampText(b.email, LIMITS.email).toLowerCase();
  if (email && !EMAIL_RE.test(email)) {
    return { ok: false, error: "That email address doesn't look quite right. Please check it, or leave it blank." };
  }

  const pageUrl = clampText(b.pageUrl, LIMITS.pageUrl);

  return {
    ok: true,
    data: {
      title:         titleFrom(description),
      description,
      reporterName:  clampText(b.name, LIMITS.name) || null,
      reporterEmail: email || null,
      pageUrl:       /^https?:\/\//i.test(pageUrl) ? pageUrl : null,
      browserInfo:   clampText(b.userAgent, LIMITS.userAgent) || null,
      viewport:      clampText(b.viewport, LIMITS.viewport) || null,
    },
  };
}
