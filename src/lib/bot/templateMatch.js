/**
 * Picking an email template for a draft (Mike 10-1: "a template for a topic can
 * be used, but modified for that specific email"). Pure, no DB, so the unit
 * tests can read it; templatePick.js does the lookup.
 *
 * Order: a template filed under this scenario AND deal stage wins; then the
 * template whose words best match what this email is about; then a template
 * filed under the scenario with no stage; else none. A template filed for one
 * client type is never used for another. The same word counting decides when
 * two template suggestions are on the same topic (tone/library.js).
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

export const templateText = t => [t?.name, t?.direction, t?.subject, t?.body].filter(Boolean).join(' ');

/**
 * The best template for an email. `text` is what the email is about (project,
 * service type, stage, the items in it). Returns { template, how, score } or null.
 */
export function bestTemplate(list, { text = '', stage = null, scenario = null, clientType = null, minScore = 0.2 } = {}) {
  const ok = (list || []).filter(t => t && t.isActive !== false && String(t.body || '').trim()
    && (!t.clientType || !clientType || t.clientType === clientType));
  const filed = scenario ? ok.filter(t => t.scenario === scenario) : [];
  const byStage = stage ? filed.find(t => t.dealStage === stage) : null;
  if (byStage) return { template: byStage, how: 'stage', score: 1 };

  const words = topicWords(text);
  let best = null;
  for (const t of ok) {
    const shared = sharedWords(words, templateText(t));
    const score = words.size ? shared / words.size : 0;
    if (shared >= 2 && score >= minScore && (!best || score > best.score)) best = { template: t, how: 'topic', score };
  }
  if (best) return best;
  const general = filed.find(t => !t.dealStage);
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
