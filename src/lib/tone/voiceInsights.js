/**
 * What the Voice screen shows beyond the tone profile (Mike 9-27): how the
 * writing changed over the years, the top phrases, and the emails a person
 * writes over and over (template candidates). Everything here is counted from
 * the emails themselves, not guessed by the model; newer emails count more
 * (see voiceAge.js).
 *
 * Pure: no imports beyond voiceAge. Rows are { subject, body, date }.
 */
import { AGE_BANDS, UNDATED, bandOf, groupByAge, ts } from './voiceAge.js';

const DAY = 86_400_000;
const words = s => String(s || '').toLowerCase().match(/[a-z][a-z']*/g) || [];

// Words that soften or pad an ask. Fewer of these usually reads stronger.
const SOFT = ['just', 'i think', 'maybe', 'hopefully', 'sorry', 'i was wondering', 'kind of', 'sort of',
  'i feel like', 'perhaps', 'possibly', 'touch base', 'circle back', 'no worries', 'if possible', 'quick question'];
const SOFT_RES = SOFT.map(p => new RegExp(`\\b${p.replace(/ /g, '\\s+')}\\b`, 'gi'));

const round1 = n => Math.round(n * 10) / 10;

/** One line per period: how long, how direct, how soft. */
export function periodStats(rows, { now = Date.now() } = {}) {
  const groups = groupByAge(rows, { now });
  return [...AGE_BANDS, UNDATED].map(b => {
    const list = groups.get(b.key);
    if (!list.length) return null;
    let w = 0, sentences = 0, questions = 0, lists = 0, soft = 0;
    for (const r of list) {
      const body = String(r.body || '');
      const n = words(body).length;
      w += n;
      sentences += Math.max(1, (body.match(/[.!?]+(\s|$)/g) || []).length);
      if (/\?/.test(body)) questions++;
      if (/^\s*(?:[-*•]|\d+[.)])\s+/m.test(body)) lists++;
      for (const re of SOFT_RES) soft += (body.match(re) || []).length;
    }
    const c = list.length;
    return {
      key: b.key, label: b.label, weight: b.weight, emails: c,
      avgWords: Math.round(w / c),
      wordsPerSentence: round1(w / sentences),
      questionPct: Math.round((questions / c) * 100),
      listPct: Math.round((lists / c) * 100),
      softPerEmail: round1(soft / c),
    };
  }).filter(Boolean);
}

// A phrase may not start or end on one of these ("know if you", "the project and").
const EDGE = new Set(['and', 'or', 'but', 'the', 'a', 'an', 'of', 'to', 'in', 'on', 'for', 'at', 'with', 'by',
  'from', 'as', 'is', 'are', 'was', 'be', 'if', 'so', 'that', 'this', 'it', 'its', "it's"]);
// Nor end on a word that leaves it hanging ("know if you", "i just wanted").
const END = new Set([...EDGE, 'i', 'we', 'you', 'they', 'my', 'our', 'your', 'will', 'would', 'can', 'could',
  'have', 'has', 'had', 'am', 'just', 'wanted', 'let', 'me', 'us']);
const FILLER = new Set([...EDGE, 'i', 'me', 'my', 'we', 'our', 'us', 'you', 'your', 'will', 'can', 'have', 'has',
  'had', 'do', 'did', 'not', 'am', 'been', 'would', 'could', 'should', 'all', 'any', 'there', 'they', 'them']);

// A voice phrase has a person in it ("let me know", "happy to help"). Without
// one it is usually pasted scope text ("common area controls").
const PERSONAL = new Set(['i', "i'm", "i'll", "i've", "i'd", 'me', 'my', 'we', "we're", "we'll", "we've", 'our', 'us',
  'you', "you're", "you'll", 'your', 'let', "let's", 'thanks', 'thank', 'please', 'happy', 'hope', 'glad', 'appreciate', 'looking']);

/**
 * The phrases a person uses most, 3 to 8 words, counted once per email and
 * scored by age weight. Returns [{ phrase, emails, recent }] best first;
 * `recent` = emails from the last 12 months that use it.
 */
export function topPhrases(rows, { now = Date.now(), n = 10, minEmails = 3 } = {}) {
  const tally = new Map();
  for (const r of rows) {
    const weight = bandOf(r.date, now).weight;
    const recent = ts(r.date) && now - ts(r.date) < 365 * DAY;
    const seen = new Set();
    for (const line of String(r.body || '').split(/[.!?;:\n]+/)) {
      if (/\d/.test(line)) continue;                  // dates, prices, phone numbers
      const w = words(line);
      for (let len = 3; len <= 8; len++) {
        for (let i = 0; i + len <= w.length; i++) {
          const g = w.slice(i, i + len);
          if (EDGE.has(g[0]) || END.has(g[len - 1])) continue;
          if (g.every(x => FILLER.has(x)) || !g.some(x => PERSONAL.has(x))) continue;
          seen.add(g.join(' '));
        }
      }
    }
    for (const p of seen) {
      const t = tally.get(p) || { phrase: p, emails: 0, recent: 0, score: 0 };
      t.emails++; t.score += weight; if (recent) t.recent++;
      tally.set(p, t);
    }
  }
  const cands = [...tally.values()].filter(t => t.emails >= minEmails)
    .sort((a, b) => b.score - a.score).slice(0, 400);
  // "let me know if you have" says the same as "let me know if" when nearly
  // every use of the short one is inside the long one: keep the long one.
  const kept = cands.filter(t => !cands.some(o => o !== t && o.phrase.length > t.phrase.length
    && ` ${o.phrase} `.includes(` ${t.phrase} `) && o.emails >= t.emails * 0.8));
  const out = [];
  for (const t of kept) {
    if (out.some(o => overlaps(o.phrase, t.phrase))) continue;
    out.push(t);
    if (out.length >= n) break;
  }
  return out.map(({ phrase, emails, recent }) => ({ phrase, emails, recent }));
}

// One phrase inside the other, or one runs on into the other by 3+ words
// ("let me know if you have" / "me know if you have questions").
function overlaps(a, b) {
  if (` ${a} `.includes(` ${b} `) || ` ${b} `.includes(` ${a} `)) return true;
  const x = a.split(' '), y = b.split(' ');
  for (let k = Math.min(x.length, y.length) - 1; k >= 3; k--) {
    if (x.slice(-k).join(' ') === y.slice(0, k).join(' ') || y.slice(-k).join(' ') === x.slice(0, k).join(' ')) return true;
  }
  return false;
}

function shingles(body) {
  const w = words(String(body || '').replace(/\d+/g, ' 0 '));
  const out = new Set();
  for (let i = 0; i + 3 <= w.length; i++) out.add(`${w[i]} ${w[i + 1]} ${w[i + 2]}`);
  return out;
}

/**
 * Emails a person writes again and again: groups of near-identical emails
 * (3-word overlap), newest first. Looks at the last two years when there is
 * enough there, since a template should sound like them now.
 * Returns [{ size, recent, lastSentAt, examples: [{subject, body}] }] best first.
 */
export function recurringEmails(rows, { now = Date.now(), minSize = 3, max = 8, similarity = 0.28 } = {}) {
  const sorted = [...rows].sort((a, b) => ts(b.date) - ts(a.date));
  const twoYears = sorted.filter(r => ts(r.date) && now - ts(r.date) < 730 * DAY);
  const pool = (twoYears.length >= 30 ? twoYears : sorted).slice(0, 1500);
  const clusters = [];
  const index = new Map();
  for (const r of pool) {
    const sh = shingles(r.body);
    if (sh.size < 6) continue;
    const hits = new Map();
    for (const s of sh) for (const c of index.get(s) || []) hits.set(c, (hits.get(c) || 0) + 1);
    let best = -1, bestJ = 0;
    for (const [c, inter] of hits) {
      const j = inter / (sh.size + clusters[c].rep.size - inter);
      if (j > bestJ) { bestJ = j; best = c; }
    }
    if (best >= 0 && bestJ >= similarity) { clusters[best].members.push(r); continue; }
    const c = clusters.length;
    clusters.push({ rep: sh, members: [r] });
    for (const s of sh) { if (!index.has(s)) index.set(s, []); index.get(s).push(c); }
  }
  return clusters.filter(c => c.members.length >= minSize)
    .map(c => ({
      size: c.members.length,
      recent: c.members.filter(r => ts(r.date) && now - ts(r.date) < 365 * DAY).length,
      lastSentAt: ts(c.members[0].date) || null,
      score: c.members.reduce((s, r) => s + bandOf(r.date, now).weight, 0),
      examples: c.members.slice(0, 3).map(({ subject, body }) => ({ subject, body })),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
    .map(({ score, ...c }) => c);
}
