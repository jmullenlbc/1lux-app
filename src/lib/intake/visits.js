/**
 * Visitor tracking for the public /conceptual_budget page, the pure half.
 *
 * Mike, 2026-09-16: "build the tracking feature, it would be hugely helpful."
 *
 * What is kept about a stranger is deliberately small: the SITE they came
 * from (never the full address, a search or mail link can carry a name), the
 * three campaign tags a marketing link carries, phone / tablet / desktop, and
 * how far through the wizard they got. No IP address and no browser string are
 * stored; `visitorKey` is a one-way hash of the two, so a second visit from the
 * same place reads as "returning" without us holding anything that identifies
 * anyone. A visit only gets a name when that person saves a draft or submits.
 *
 * No database, no request objects, the route hands in plain strings, so every
 * rule here is unit-tested (scripts/tests/intakeVisits.test.mjs).
 */
import { createHash } from 'node:crypto';
import { STEP_IDS, STEP_LABELS } from './drafts.js';

export const DEVICE_KINDS = ['desktop', 'tablet', 'mobile'];

/** Crawlers, link previewers and uptime checks are not visitors. */
const BOT_RE = /bot\b|bot\/|crawl|spider|slurp|preview|monitor|pingdom|uptime|lighthouse|headless|facebookexternalhit|embedly|curl\/|wget|python-requests|axios\/|node-fetch|go-http-client/i;

export function isBot(userAgent) {
  const ua = String(userAgent ?? '').trim();
  return !ua || BOT_RE.test(ua);
}

export function deviceKind(userAgent) {
  const ua = String(userAgent ?? '');
  if (/ipad|tablet|kindle|silk|playbook|android(?!.*mobile)/i.test(ua)) return 'tablet';
  if (/mobi|iphone|ipod|android|windows phone/i.test(ua)) return 'mobile';
  return 'desktop';
}

/** One-way. The salt keeps a copy of the table from being matched to IP logs. */
export function visitorKey(ip, userAgent, salt = '') {
  return createHash('sha256').update(`${salt}|${ip ?? ''}|${userAgent ?? ''}`).digest('hex').slice(0, 32);
}

/**
 * "https://www.linkedin.com/feed/?x=1" → "linkedin.com". Our own site is not a
 * referrer (a refresh, or a click from the marketing site's own page, would
 * otherwise top the list). Anything unreadable → null.
 */
export function referrerHost(referrer, ownHost = '') {
  const raw = String(referrer ?? '').trim();
  if (!raw) return null;
  try {
    const host = new URL(raw).hostname.toLowerCase().replace(/^www\./, '');
    if (!host || !host.includes('.')) return null;
    const own = String(ownHost ?? '').toLowerCase().replace(/^www\./, '').replace(/:\d+$/, '');
    if (own && host === own) return null;
    return host.slice(0, 120);
  } catch {
    return null;
  }
}

/** A campaign tag: short, plain, and nothing that could be a person's details. */
export function cleanTag(v) {
  const s = String(v ?? '').trim().toLowerCase();
  if (!s || s.length > 80) return null;
  if (s.includes('@')) return null;                 // an email address in a link
  if (!/^[a-z0-9][a-z0-9 _.\-+]*$/.test(s)) return null;
  return s;
}

/** A wizard step we recognise → its position; anything else → -1. */
export function stepIndexOf(stepId) {
  // Building Figures (no-drawings path, 10-14) counts as the Drawings stage:
  // stored indexes stay meaningful and the funnel keeps its nine rungs.
  const id = String(stepId ?? '');
  return STEP_IDS.indexOf(id === 'figures' ? 'drawings' : id);
}

/** The furthest step wins, going Back must not move a visitor backwards. */
export function furthestStep(current, incoming) {
  const a = stepIndexOf(current), b = stepIndexOf(incoming);
  if (b < 0) return a < 0 ? { stepReached: STEP_IDS[0], stepIndex: 0 } : { stepReached: current, stepIndex: a };
  return b > a ? { stepReached: incoming, stepIndex: b } : { stepReached: current, stepIndex: a };
}

export function stepLabel(stepId) {
  return STEP_LABELS?.[stepId] || 'Opened the page';
}

/** What became of a visit, in the order that matters to sales. */
export function visitOutcome(v) {
  if (v?.submissionId) return 'submitted';
  if (v?.draftId) return 'lead';
  return (v?.stepIndex ?? 0) > 0 ? 'browsed' : 'looked';
}

export const OUTCOME_LABELS = {
  submitted: 'Sent a request',
  lead:      'Left their details',
  browsed:   'Started, then left',
  looked:    'Opened the page only',
};

/**
 * The numbers across the top of the visitors page, from plain visit rows.
 * `returning` = visitor keys seen on more than one visit in the rows given.
 */
export function summariseVisits(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const byKey = new Map();
  const bySource = new Map();
  const byStep = new Map(STEP_IDS.map(id => [id, 0]));
  const byDevice = { desktop: 0, tablet: 0, mobile: 0 };
  let leads = 0, submitted = 0;

  for (const v of list) {
    byKey.set(v.visitorKey, (byKey.get(v.visitorKey) || 0) + 1);
    const source = v.utmSource || v.referrerHost || 'Direct / typed in';
    bySource.set(source, (bySource.get(source) || 0) + 1);
    if (byDevice[v.deviceKind] !== undefined) byDevice[v.deviceKind] += 1;
    if (v.draftId || v.submissionId) leads += 1;
    if (v.submissionId) submitted += 1;
    // A funnel counts everyone who got AT LEAST this far.
    const idx = Math.max(0, Math.min(STEP_IDS.length - 1, v.stepIndex ?? 0));
    for (let i = 0; i <= idx; i++) byStep.set(STEP_IDS[i], byStep.get(STEP_IDS[i]) + 1);
  }

  const visits = list.length;
  const pct = n => (visits ? Math.round((n / visits) * 100) : 0);
  return {
    visits,
    visitors: byKey.size,
    returning: [...byKey.values()].filter(n => n > 1).length,
    leads, submitted,
    leadPct: pct(leads), submittedPct: pct(submitted),
    byDevice,
    sources: [...bySource.entries()].map(([source, count]) => ({ source, count, pct: pct(count) }))
      .sort((a, b) => b.count - a.count || a.source.localeCompare(b.source)),
    funnel: STEP_IDS.map(id => ({ stepId: id, label: stepLabel(id), count: byStep.get(id), pct: pct(byStep.get(id)) })),
  };
}
