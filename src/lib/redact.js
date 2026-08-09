/**
 * The single audited redaction boundary.
 *
 * Mike's rule: **DN / buy price is never shown to contractors** — not in PDFs,
 * not in share links, not in the client portal. Only logged-in ILC staff see it.
 *
 * Before this module that rule was enforced four different ways in four places
 * (a destructure-and-drop in the CO share route, a query-string flag in the CO
 * PDF template, and Prisma `select` allowlists in two portal routes). Three of
 * those were correct. The gaps that motivated consolidating them:
 *
 *   1. `change-orders/[coId]/pdf` called `requireAuth()` but never checked the
 *      returned `error`, so the route was **completely unauthenticated** — and
 *      `?hideInternalDN=false` printed the buy price for anyone with the URL.
 *   2. `share/co/[token]` correctly dropped `originalDN` from every line item,
 *      then handed back `rates` — which contains `marginPct`. Because CN is
 *      derived as `cn = dn / (1 - marginPct)`, publishing the margin publishes
 *      the buy price: `dn = cn × (1 - marginPct)`. The strip was arithmetic
 *      theatre.
 *
 * Redaction is **by field name, recursively**, not by model. That is deliberate:
 * a per-model map has to be re-plumbed every time a route adds an `include`, and
 * the miss is silent. A name-keyed deep walk covers nesting depth it has never
 * seen, which is the failure mode that actually bites.
 *
 * This module is intentionally dependency-free apart from the ontology registry,
 * which is itself dependency-free, so it can be unit-tested with plain
 * `node --test` (importing `@/lib/auth` would pull in `next/headers`).
 *
 * @see src/lib/ontology/index.js       — where the field list is actually declared
 * @see src/lib/ontology/redact.js      — the object-aware allowlist counterpart
 * @see scripts/tests/redact.test.mjs   — unit tests for this module
 * @see scripts/tests/dn-leak.test.mjs  — live audit of the real outbound routes
 */
import { globalDenyFieldNames } from './ontology/index.js';

/**
 * Who is on the other end of the response.
 *
 *   ILC    — a logged-in ILC staff member. Sees everything; redact() is a no-op.
 *   CLIENT — an authenticated portal contact (developer / owner side).
 *   PUBLIC — anyone holding a share-link token: contractors, bidders, forwards.
 *
 * CLIENT and PUBLIC are both stripped identically today. They are kept distinct
 * so a future field can be client-ok-but-not-public without another rewrite.
 */
export const AUDIENCE = Object.freeze({
  ILC:    'ilc',
  CLIENT: 'client',
  PUBLIC: 'public',
});

const VALID_AUDIENCES = Object.freeze(Object.values(AUDIENCE));

/**
 * Field names that must never cross the ILC boundary.
 *
 * **Derived, not hand-written.** The list lives in the ontology registry, on the
 * property itself, as `globalDeny: true` alongside `sensitivity: 'ilc_only'`.
 * Adding a buy-price column? Declare it once in `src/lib/ontology/objects/` and
 * it disappears from share links, PDFs and MCP responses together. There is no
 * second list here to forget.
 *
 * Two flags rather than one because they are different claims:
 *   `sensitivity: 'ilc_only'`  — this PROPERTY of this OBJECT is internal.
 *   `globalDeny: true`         — the bare NAME is unambiguous across all 116
 *                                models, so seeing it in a payload of unknown
 *                                shape is enough to strip it.
 *
 * `marginPct` and `originalDN` earn the second flag. `notes` and `status` never
 * could — they are `ilc_only` on Client and `client_ok` on ChangeOrder, and
 * stripping them by name would blank out the client's own quote. Those are left
 * to the object-aware redactor, which knows what it is holding.
 *
 * `scripts/tests/dn-leak.test.mjs` scans real route responses for these names,
 * so a declaration is enforced rather than documented.
 */
export const ILC_ONLY_FIELDS = Object.freeze(globalDenyFieldNames());

/**
 * Strip every ILC-only field from an outbound payload.
 *
 * Returns a redacted copy; the input is never mutated (callers routinely compute
 * footers and totals from the full row first, then redact for transport).
 *
 * `audience` is required and validated — there is no default. A default would
 * mean a forgotten argument silently picks a policy, and the safe-looking
 * default (PUBLIC) would quietly blank out ILC's own screens while the unsafe
 * one leaks. Making it explicit forces the call site to state who is asking.
 *
 * @param {*} data                     Any JSON-ish value: object, array, primitive.
 * @param {'ilc'|'client'|'public'} audience
 * @returns {*} redacted copy (or `data` itself when audience is ILC)
 */
export function redact(data, audience) {
  if (!VALID_AUDIENCES.includes(audience)) {
    throw new Error(
      `redact(): audience must be one of ${VALID_AUDIENCES.join(' | ')} — got ${JSON.stringify(audience)}. ` +
      `Pass AUDIENCE.ILC explicitly for internal responses.`
    );
  }
  if (audience === AUDIENCE.ILC) return data;
  return strip(data);
}

function strip(value) {
  if (value === null || typeof value !== 'object') return value;
  // Dates, Decimals and Buffers are values, not shapes to walk into.
  if (value instanceof Date || Buffer.isBuffer?.(value)) return value;
  if (Array.isArray(value)) return value.map(strip);

  const out = {};
  for (const key of Object.keys(value)) {
    if (ILC_ONLY_FIELDS.has(key)) continue;
    out[key] = strip(value[key]);
  }
  return out;
}

/**
 * Deep-scan a payload and return the dotted path of every ILC-only field found.
 * Empty array means clean. Used by the audit test and by assertNoIlcOnly().
 *
 * @returns {string[]} e.g. ['co.optionGroups[0].lineItems[2].originalDN']
 */
export function findIlcOnly(data, path = '') {
  const hits = [];
  walk(data, path);
  return hits;

  function walk(value, at) {
    if (value === null || typeof value !== 'object') return;
    if (value instanceof Date) return;
    if (Array.isArray(value)) {
      value.forEach((v, i) => walk(v, `${at}[${i}]`));
      return;
    }
    for (const key of Object.keys(value)) {
      const here = at ? `${at}.${key}` : key;
      if (ILC_ONLY_FIELDS.has(key)) hits.push(here);
      else walk(value[key], here);
    }
  }
}

/**
 * Throw if a payload bound for a non-ILC audience still carries an ILC-only
 * field. Cheap enough to call on real responses in tests; the thrown message
 * names the exact paths so a failure is actionable without a debugger.
 */
export function assertNoIlcOnly(data, label = 'payload') {
  const hits = findIlcOnly(data);
  if (hits.length) {
    throw new Error(`${label} leaks ILC-only field(s): ${hits.join(', ')}`);
  }
}

/**
 * Map an authenticated user's role to an audience.
 *
 * No session at all → PUBLIC, so a route that forgets its auth guard degrades to
 * the *most* redacted view rather than the least.
 *
 * The `CLIENT_VIEWER` literal mirrors `isClientViewer()` in `src/lib/auth.js`.
 * It is repeated rather than imported so this module stays free of `next/headers`
 * and remains unit-testable; `scripts/tests/redact.test.mjs` asserts the two
 * stay in agreement.
 */
export function audienceForRole(role) {
  if (!role) return AUDIENCE.PUBLIC;
  return role === 'CLIENT_VIEWER' ? AUDIENCE.CLIENT : AUDIENCE.ILC;
}
