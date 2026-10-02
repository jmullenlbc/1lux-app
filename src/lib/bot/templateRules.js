// The optional matching rules on an Email Template (Mike 10-1). A blank or
// "Any" means the rule is off (null). Pure.
const SERVICE_TYPES = new Set(['fullDesign', 'designAssist', 'peerReview', 'bidOnly']);
const PIPELINES = new Set(['PROCUREMENT', 'DESIGN']);

const clean = (v, max) => {
  const s = String(v ?? '').trim().slice(0, max);
  return s && s.toLowerCase() !== 'any' ? s : null;
};

/** The rule columns from a request body. `partial` only returns the fields the body carries. */
export function ruleFields(body, partial = false) {
  const b = body || {};
  const out = {};
  const has = k => !partial || b[k] !== undefined;
  if (has('serviceType')) { const v = clean(b.serviceType, 40); out.serviceType = v && SERVICE_TYPES.has(v) ? v : null; }
  if (has('pipeline'))    { const v = clean(b.pipeline, 20)?.toUpperCase() ?? null; out.pipeline = v && PIPELINES.has(v) ? v : null; }
  if (has('contactRole')) out.contactRole = clean(b.contactRole, 80);
  if (has('topicWords'))  out.topicWords  = clean(b.topicWords, 300);
  return out;
}
