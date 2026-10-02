/**
 * Picking an email template for a draft (Mike 10-1: "a template for a topic can
 * be used, but modified for that specific email"). Pure, no DB, so the unit
 * tests can read it; templatePick.js does the lookup.
 *
 * Order: a template filed under this scenario AND deal stage wins; then the
 * template whose words best match what this email is about; then a template
 * filed under the scenario with no stage; else none. A template filed for one
 * client type, service type, pipeline or contact role is never used for a
 * different one (a rule only rules a template out when the email's own value is
 * known). Among equals the template with more matching rules wins. The same
 * word counting decides when two template suggestions are on the same topic
 * (tone/library.js).
 */
const STOP = new Set(('the a an and or of to in on for with at by from is are was were be been being this that these those it its '
  + 'as we you your our they their them i my me will would can could should shall have has had do does did not no yes if then than '
  + 'so just about into over under out up down more most very also any all some such only own same other new re fw fwd hi hello '
  + 'thanks thank please let know get got here there when what which who how one two per via each both few per').split(' '));

/** The topic words of a text as a Set: lower case, no stop words, no {placeholders} or [blanks]. */
export function topicWords(text) {
  const src = Array.isArray(text) ? text.join(' ') : String(text || '');
  const out = new Set();
  for (const w of src.toLowerCase().replace(/\{[^}]*\}|\[[^\]]*\]/g, ' ').split(/[^a-z0-9']+/)) {
    const x = w.replace(/'s$/, '').replace(/'/g, '');
    if (x.length >= 3 && !STOP.has(x) && !/^\d+$/.test(x)) out.add(x);
  }
  return out;
}

const toSet = x => (x instanceof Set ? x : topicWords(x));

/** How many topic words a and b share. */
export function sharedWords(a, b) {
  const A = toSet(a), B = toSet(b);
  let n = 0;
  for (const w of A) if (B.has(w)) n++;
  return n;
}

/** Shared words over the smaller side, 0..1. Two 4-word topics sharing 2 words = 0.5. */
export function topicOverlap(a, b) {
  const A = toSet(a), B = toSet(b);
  if (!A.size || !B.size) return 0;
  return sharedWords(A, B) / Math.min(A.size, B.size);
}

export const templateText = t => [t?.name, t?.topicWords, t?.direction, t?.subject, t?.body].filter(Boolean).join(' ');

// Does any word of the template's contact role appear as a word in the contact's job title?
const roleWords = s => String(s || '').toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length >= 2);
function roleMatches(rule, title) {
  const have = new Set(roleWords(title));
  return roleWords(rule).some(w => have.has(w));
}

/** Does this template's own rules allow it for this email? An unknown email value never rules one out. */
function allowed(t, { clientType, serviceType, pipeline, contactTitle }) {
  if (t.clientType && clientType && t.clientType !== clientType) return false;
  if (t.serviceType && serviceType && t.serviceType !== serviceType) return false;
  if (t.pipeline && pipeline && String(t.pipeline).toUpperCase() !== String(pipeline).toUpperCase()) return false;
  if (t.contactRole && contactTitle && !roleMatches(t.contactRole, contactTitle)) return false;
  return true;
}

/** How many of the template's own rules this email positively matches. */
function specificity(t, { clientType, serviceType, pipeline, contactTitle }) {
  return (t.clientType && clientType ? 1 : 0) + (t.serviceType && serviceType ? 1 : 0)
    + (t.pipeline && pipeline ? 1 : 0) + (t.contactRole && contactTitle ? 1 : 0);
}

/**
 * The best template for an email. `text` is what the email is about (project,
 * service type, stage, the items in it). Returns { template, how, score } or null.
 */
export function bestTemplate(list, opts = {}) {
  const { text = '', stage = null, scenario = null, minScore = 0.2 } = opts;
  const ok = (list || []).filter(t => t && t.isActive !== false && String(t.body || '').trim() && allowed(t, opts));
  const spec = t => specificity(t, opts);
  const mostSpecific = arr => arr.reduce((b, t) => (!b || spec(t) > spec(b) ? t : b), null);
  const filed = scenario ? ok.filter(t => t.scenario === scenario) : [];
  const byStage = stage ? mostSpecific(filed.filter(t => t.dealStage === stage)) : null;
  if (byStage) return { template: byStage, how: 'stage', score: 1 };

  const words = topicWords(text);
  let best = null;
  for (const t of ok) {
    const shared = sharedWords(words, templateText(t));
    const score = words.size ? shared / words.size : 0;
    if (shared >= 2 && score >= minScore && (!best || score > best.score || (score === best.score && spec(t) > spec(best.template)))) best = { template: t, how: 'topic', score };
  }
  if (best) return best;
  const general = mostSpecific(filed.filter(t => !t.dealStage));
  return general ? { template: general, how: 'scenario', score: 0 } : null;
}

/** The prompt lines that hand a template in as a skeleton, never as the answer. */
export function templateSection(pick) {
  const t = pick?.template;
  if (!t?.body) return '';
  return `\nClosest template on file${t.name ? ` ("${t.name}")` : ''}${t.direction ? `. ${t.direction}` : ''}
Use it as a skeleton: keep its shape and the lines that fit this email, fill in the specifics of this one, drop what does not apply and change anything that does not fit. Never send it word for word. Anything in {curly} or [square] brackets is a blank to fill in.
${t.subject ? `Subject: ${t.subject}\n` : ''}${t.body}\n`;
}
