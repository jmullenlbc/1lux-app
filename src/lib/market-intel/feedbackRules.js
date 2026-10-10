/**
 * "Not relevant" with learning (migration 0130, Mike 10-9: "We need a system
 * that gets smarter"). Pure rules, no DB, no fetch, so the tests load it
 * directly and the card, the route and the proposer agree.
 *
 * A press records one of seven reasons; only Other needs a sentence. The
 * proposer counts presses per feature (source, case type, company, city,
 * zone) and proposes a rule when the same feature keeps getting dismissed and
 * nobody acts on it. An admin applies or ignores a rule; nothing is automatic.
 */
export const REASONS = [
  { code: 'WRONG_BUILDING_TYPE', label: 'Wrong building type' },
  { code: 'DONT_WANT_CLIENT',    label: "Don't want to work with client" },
  { code: 'NOT_A_PROJECT',       label: 'Not about a project' },
  { code: 'DUPLICATE',           label: 'Duplicate' },
  { code: 'TOO_OLD',             label: 'Too old' },
  { code: 'ALREADY_BUILT',       label: 'Already built' },
  { code: 'OTHER',               label: 'Other' },
];
export const REASON_CODES = REASONS.map(r => r.code);
export const REASON_LABEL = Object.fromEntries(REASONS.map(r => [r.code, r.label]));

/** Only Other needs the one sentence (Mike 10-9: "the other ones basically are" the description). */
export function reasonNeedsText(code) {
  return code === 'OTHER';
}

/** Clean a press from the form; null when it cannot be saved. */
export function cleanFeedback({ reasonCode, reasonText } = {}) {
  const code = String(reasonCode || '').toUpperCase();
  if (!REASON_CODES.includes(code)) return null;
  const text = String(reasonText || '').trim().slice(0, 300);
  if (reasonNeedsText(code) && !text) return null;
  return { reasonCode: code, reasonText: text };
}

// Which feature each reason teaches about. "Too old" and "Duplicate" say
// nothing about the source or the company, so they never propose a rule.
export const RULE_FIELDS = ['SOURCE', 'PERMIT_CLASS', 'COMPANY', 'CITY', 'ZONE'];
const REASON_FIELDS = {
  WRONG_BUILDING_TYPE: ['PERMIT_CLASS', 'ZONE', 'SOURCE'],
  DONT_WANT_CLIENT:    ['COMPANY'],
  NOT_A_PROJECT:       ['SOURCE', 'PERMIT_CLASS'],
  ALREADY_BUILT:       ['SOURCE', 'PERMIT_CLASS'],
  OTHER:               ['SOURCE', 'PERMIT_CLASS', 'COMPANY', 'CITY', 'ZONE'],
  DUPLICATE:           [],
  TOO_OLD:             [],
};

/** How many presses on one feature before a rule is proposed. */
export const PROPOSE_AFTER = 3;
/** A feature a person kept (reviewed, assigned, linked) more than this share of the time is not proposed. */
export const MAX_KEPT_SHARE = 0.25;

/** The features of one signal, as the snapshot stores them. */
export function featuresOf(signal = {}) {
  const tags = signal.tags || [];
  // The owner side first (that is who "don't want to work with" means), then the GC, then anyone.
  const company = tags.find(l => l.tag?.kind === 'COMPANY' && ['DEVELOPER', 'OWNER', 'BUYER', 'INVESTOR'].includes(l.role))
    || tags.find(l => l.tag?.kind === 'COMPANY' && l.role === 'GC')
    || tags.find(l => l.tag?.kind === 'COMPANY');
  return {
    kind:        signal.kind || 'ARTICLE',
    sourceId:    signal.sourceId || null,
    city:        signal.city || null,
    state:       signal.state || null,
    permitClass: signal.permitClass || null,
    zone:        signal.kind === 'LAND' ? (signal.neighborhood || null) : null,
    company:     company?.tag?.normalized || null,
    unitCount:   signal.unitCount ?? null,
    valuation:   signal.valuation ?? null,
  };
}

/** The (field, value) pairs one feedback row votes on. */
export function featureKeys(fb) {
  const fields = REASON_FIELDS[fb.reasonCode] || [];
  const out = [];
  for (const f of fields) {
    const v = f === 'SOURCE' ? fb.sourceId : f === 'PERMIT_CLASS' ? fb.permitClass : f === 'COMPANY' ? fb.company : f === 'CITY' ? fb.city : fb.zone;
    if (v) out.push({ kind: fb.kind || 'ARTICLE', field: f, value: String(v) });
  }
  return out;
}

/**
 * Proposed rules from the feedback rows and the "kept" counts.
 * `kept` maps "kind|field|value" to how many matching rows people acted on.
 * Returns rules with the most common reason, sorted by dismissals.
 */
export function proposeRules(feedback = [], kept = {}) {
  const groups = new Map();
  for (const fb of feedback) {
    for (const k of featureKeys(fb)) {
      const id = `${k.kind}|${k.field}|${k.value}`;
      const g  = groups.get(id) || { ...k, dismissals: 0, reasons: {}, signals: new Set() };
      if (g.signals.has(fb.signalId)) continue;   // two presses on one row count once
      g.signals.add(fb.signalId);
      g.dismissals += 1;
      g.reasons[fb.reasonCode] = (g.reasons[fb.reasonCode] || 0) + 1;
      groups.set(id, g);
    }
  }
  const out = [];
  for (const [id, g] of groups) {
    const keptN = kept[id] || 0;
    if (g.dismissals < PROPOSE_AFTER) continue;
    if (keptN / (keptN + g.dismissals) > MAX_KEPT_SHARE) continue;
    const reasonCode = Object.entries(g.reasons).sort((a, b) => b[1] - a[1])[0][0];
    out.push({ kind: g.kind, field: g.field, value: g.value, reasonCode, dismissals: g.dismissals, kept: keptN });
  }
  return out.sort((a, b) => b.dismissals - a.dismissals);
}

/** True when an applied rule matches this signal's features. */
export function ruleMatches(rule, features) {
  if (rule.kind !== 'ALL' && rule.kind !== features.kind) return false;
  const v = rule.field === 'SOURCE' ? features.sourceId : rule.field === 'PERMIT_CLASS' ? features.permitClass
          : rule.field === 'COMPANY' ? features.company : rule.field === 'CITY' ? features.city : features.zone;
  return !!v && String(v).toLowerCase() === String(rule.value).toLowerCase();
}

/** The first applied rule that matches, or null. */
export function suppressedBy(rules = [], features) {
  return rules.find(r => r.status === 'APPLIED' && !r.archivedAt && ruleMatches(r, features)) || null;
}

/** Plain-English line for a rule on the Sources tab. */
export function describeRule(rule, { sourceName } = {}) {
  const what = rule.field === 'SOURCE' ? `everything from ${sourceName || 'this source'}`
    : rule.field === 'PERMIT_CLASS' ? `${rule.value} cases`
    : rule.field === 'COMPANY' ? `anything naming ${rule.value}`
    : rule.field === 'CITY' ? `anything in ${rule.value}`
    : `land zoned ${rule.value}`;
  const kind = rule.kind === 'ALL' ? '' : ` (${rule.kind.toLowerCase()} rows)`;
  return `Skip ${what}${kind}: marked not relevant ${rule.dismissals} time${rule.dismissals === 1 ? '' : 's'}, usually "${REASON_LABEL[rule.reasonCode] || rule.reasonCode}"${rule.kept ? `, kept ${rule.kept}` : ''}.`;
}

/** Share of rows marked not relevant among those a person touched, for the weekly line. */
export function notRelevantRate({ dismissed = 0, reviewed = 0 } = {}) {
  const n = dismissed + reviewed;
  return n ? dismissed / n : null;
}
