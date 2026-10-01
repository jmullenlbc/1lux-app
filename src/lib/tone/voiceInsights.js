/**
 * What the Voice screen shows beyond the tone profile (Mike 9-27): how the
 * writing changed over the years, the top phrases, and the emails a person
 * writes over and over (template candidates). Everything here is counted from
 * the emails themselves, not guessed by the model; newer emails count more
 * (see voiceAge.js).
 *
 * Pure: no imports beyond voiceAge and autoMail. Rows are { subject, body, date }.
 */
import { AGE_BANDS, UNDATED, bandOf, groupByAge, ts } from './voiceAge.js';
import { autoMailReason, isAwaySentence } from './autoMail.js';

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

// Whole sentences, for "Top 20 sentences" (Mike 10-1) and the personal lines.
const GREETING = /^(?:hi|hello|hey|dear|good (?:morning|afternoon|evening)|morning|afternoon)\b/i;
const QUOTED = /^(?:on .+ wrote|from:|sent:|to:|cc:|subject:|>)|https?:|www\.|\[image|@|\(?\d{3}\)?[ .-]?\d{3}[ .-]\d{4}/i;
// Pasted scope or bid notes: "Pricing Expiration: This pricing is valid ...".
const LABELLED = /^[A-Z][\w/&' -]{2,40}:\s/;
// Footers and notices the mail program adds, never the person's own words.
const FOOTER = /focus time|observes company|as (?:we|i) (?:are|am) able|thank you for your understanding|confidential|intended (?:only )?for the (?:named )?(?:recipient|addressee)|please consider the environment/i;
// Template placeholders such as {Project Name:} are a blank form, not an email.
const PLACEHOLDER = /\{[^}]{2,40}\}/;

// Mail is often wrapped at about 76 characters: join a wrapped line back onto
// the one before it, so a sentence is never cut in two.
function unwrap(body) {
  const out = [];
  for (const line of String(body || '').split(/\r?\n/)) {
    const prev = out[out.length - 1];
    if (prev && line.trim() && prev.length >= 55 && !/[.!?:]\s*$/.test(prev) && !/^\s*(?:[-*•]|\d+[.)])\s/.test(line)) {
      out[out.length - 1] = `${prev} ${line.trim()}`;
    } else out.push(line);
  }
  return out.join('\n');
}

function sentencesOf(body) {
  return unwrap(body).split(/(?<=[.!?])\s+|\n+/)
    .map(x => x.replace(/\s+/g, ' ').trim())
    .filter(x => {
      const n = words(x).length;
      return n >= 3 && n <= 35 && /[.!?]$/.test(x) && !GREETING.test(x) && !QUOTED.test(x) && !LABELLED.test(x) && !FOOTER.test(x) && !isAwaySentence(x);
    });
}
const normSentence = x => x.toLowerCase().replace(/\d+(?:[.,:/-]\d+)*/g, '#').replace(/[^a-z#' ]+/g, ' ').replace(/\s+/g, ' ').trim();

function tallySentences(rows, now, keep = () => true) {
  const tally = new Map();
  for (const r of rows) {
    const weight = bandOf(r.date, now).weight;
    const recent = ts(r.date) && now - ts(r.date) < 365 * DAY;
    const seen = new Set();
    for (const x of sentencesOf(r.body)) {
      if (!keep(x)) continue;
      const k = normSentence(x);
      if (!k || seen.has(k)) continue;
      seen.add(k);
      const t = tally.get(k) || { sentence: x, emails: 0, recent: 0, score: 0, last: -1 };
      t.emails++; t.score += weight; if (recent) t.recent++;
      if (ts(r.date) > t.last) { t.last = ts(r.date); t.sentence = x; }   // show the newest wording
      tally.set(k, t);
    }
  }
  return [...tally.values()];
}

/**
 * The sentences a person writes most, word for word (numbers aside), counted
 * once per email and scored by age weight. Greetings ("Hi Lee,") and quoted
 * reply lines are left out. Returns [{ sentence, emails, recent }] best first.
 */
export function topSentences(rows, { now = Date.now(), n = 20, minEmails = 3 } = {}) {
  // A long sentence in over 12% of all emails is a footer the mail program
  // adds ("ILC Studios observes company-wide focus time..."), not the voice.
  const footer = t => rows.length >= 20 && t.emails > rows.length * 0.12 && words(t.sentence).length >= 10;
  // A sentence naming a job, person or dollar amount is about one job, not the
  // voice ("We have also provided Brinkmann a copy of this budget").
  const names = namesIn(rows);
  for (const w of ['i', 'ilc']) names.delete(w);
  const aboutOneJob = x => /\$|\d{3,}/.test(x) || PLACEHOLDER.test(x)
    || (x.match(/[A-Za-z][A-Za-z']*/g) || []).slice(1).some(w => /^[A-Z]/.test(w) && !/^I(?:'|$)/.test(w) && names.has(w.toLowerCase()));
  return tallySentences(rows, now)
    .filter(t => t.emails >= minEmails && !footer(t) && !aboutOneJob(t.sentence))
    .sort((a, b) => b.score - a.score || b.emails - a.emails)
    .slice(0, n)
    .map(({ sentence, emails, recent }) => ({ sentence, emails, recent }));
}

// Lines where a person steps outside the job: family, weekends, trips, sports,
// congratulations, health, catching up (Mike 10-1: "what kind of things I say
// in a personal way").
const PERSONAL_LINE = new RegExp('\\b(?:family|kids?|wife|husband|son|daughter|baby|grandkids?|wedding|birthday|anniversary|'
  + 'holidays?|thanksgiving|christmas|easter|new year|vacation|weekend|golf|fishing|hunting|skiing|beach|lake house|'
  + 'football|baseball|basketball|hockey|game last night|dinner|beers?|drinks|congrat\\w*|feel better|get well|'
  + 'condolences|sorry to hear|safe travels|travels|hope (?:you|all|everyone|things|the family|your)|'
  + 'how (?:are|was|have) (?:you|things|the|your)|(?:great|good|nice) (?:to see|seeing|catching up|meeting)|catch up|'
  + 'dog|puppy|retire\\w*|proud|blessed)\\b', 'i');

/** Personal lines across the whole library, most used then newest first: [{ sentence, emails }]. */
export function personalLines(rows, { now = Date.now(), max = 80 } = {}) {
  return tallySentences(rows, now, x => PERSONAL_LINE.test(x))
    .sort((a, b) => b.emails - a.emails || b.last - a.last)
    .slice(0, max)
    .map(({ sentence, emails }) => ({ sentence, emails }));
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

// Words that say nothing about what an email is about.
const STOP = new Set([...FILLER, ...PERSONAL, 'hi', 'hello', 'hey', 'dear', 'thanks', 'regards', 'best', 'cheers', 'sincerely',
  'please', 'know', 'see', 'get', 'got', 'just', 'also', 'here', 'what', 'when', 'where', 'which', 'who', 'how', 'why',
  'one', 'two', 'out', 'up', 'about', 'into', 'over', 'more', 'some', 'than', 'then', 'only', 'very', 'well', 'good',
  'great', 'today', 'tomorrow', 'week', 'next', 'last', 'time', 'back', 'want', 'need', 'make', 'take', 'look', 'send',
  'sent', 'attached', 'attach', 'email', 'mail', 'call', 'questions', 'question', 'like', 'thing', 'things',
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'were', 'does', 'doing', 'going', 'yes', 'sure', 'okay', 'ok',
  're', 'fw', 'fwd', 'sounds', 'think', 'still', 'already', 'any', 'each', 'other', 'these', 'those', 'him', 'her', 'his',
  'she', 'he', 'their', 'them', 'own', 'same', 'again', 'once', 'much', 'many', 'such', 'too', 'did', 'done', 'way']);
// Short trade words that are written in capitals but say what an email is about.
const TRADE = new Set(['gmp', 'ifc', 'rfi', 'rfp', 'dd', 'cd', 'sd', 'led', 've', 'po']);
const threadOf = s => String(s || '').toLowerCase().replace(/\[[^\]]*\]|^\s*|\b(?:re|fw|fwd)\s*:/g, '').replace(/\s+/g, ' ').trim();

// Names (projects, people, companies) are written with a capital letter even
// mid-sentence. They say WHICH job, not what KIND of email, so they are left
// out of the topic (Mike 10-1: "similar ones on the same topic").
function namesIn(pool) {
  const seen = new Map();
  for (const r of pool) {
    for (const part of `${r.subject || ''}\n${unwrap(r.body)}`.split(/(?<=[.!?:])\s+|\n+/)) {
      const toks = part.match(/[A-Za-z][A-Za-z']*/g) || [];
      for (let i = 1; i < toks.length; i++) {
        const w = toks[i].toLowerCase();
        const t = seen.get(w) || [0, 0];
        t[0]++; if (/^[A-Z]/.test(toks[i])) t[1]++;
        seen.set(w, t);
      }
    }
  }
  return new Set([...seen].filter(([w, [n, cap]]) => cap >= n * 0.6 && !TRADE.has(w)).map(([w]) => w));
}

// Signature images, links and addresses say nothing about the topic.
const plainBody = b => unwrap(String(b || '').replace(/\[image:[^\]]*\]|<[^>\s]+>|\S+@\S+|https?:\/\/\S+|www\.\S+/gi, ' '))
  .split(/(?<=[.!?])\s+|\n+/).filter(x => !FOOTER.test(x)).join('\n');
const topicWords = (r, names) => [
  ...words(threadOf(r.subject)).flatMap(w => [w, w]),  // subject counts double
  ...words(plainBody(r.body)),
].filter(w => w.length > 2 && !STOP.has(w) && !names.has(w));

/**
 * Emails a person writes again and again, grouped by TOPIC (Mike 10-1: "similar
 * ones on the same topic"), not only near-identical wording: emails whose
 * subject and body share the same telling words (weighted by how rare each word
 * is in the library) land together. Out-of-office and calendar mail never
 * counts. Looks at the last two years when there is enough there, since a
 * template should sound like them now.
 * Returns [{ size, recent, lastSentAt, topic: [words], examples: [{subject, body}] }] best first.
 */
export function recurringEmails(rows, { now = Date.now(), minSize = 3, max = 8, similarity = 0.3, mergeAt = 0.5 } = {}) {
  const sorted = [...rows].filter(r => !autoMailReason(r) && !PLACEHOLDER.test(`${r.subject || ''} ${r.body || ''}`))
    .sort((a, b) => ts(b.date) - ts(a.date));
  const twoYears = sorted.filter(r => ts(r.date) && now - ts(r.date) < 730 * DAY);
  // One email per thread (the newest), so a long back-and-forth on one job
  // is not mistaken for a kind of email written over and over.
  const threads = new Set();
  const pool = (twoYears.length >= 30 ? twoYears : sorted).filter(r => {
    const t = threadOf(r.subject);
    if (!t) return true;
    if (threads.has(t)) return false;
    threads.add(t);
    return true;
  }).slice(0, 1500);
  const names = namesIn(pool);
  const docs = pool.map(r => ({ r, tf: topicWords(r, names).reduce((m, w) => m.set(w, (m.get(w) || 0) + 1), new Map()) }));
  const df = new Map();
  for (const d of docs) for (const w of d.tf.keys()) df.set(w, (df.get(w) || 0) + 1);
  const N = docs.length, common = N >= 40 ? N * 0.4 : N;
  const clusters = [];
  const index = new Map();
  for (const d of docs) {
    // tf-idf over the 25 most telling words; a word in only this email, or in
    // most of the library, says nothing about a shared topic.
    let vec = [...d.tf].filter(([w]) => df.get(w) >= 2 && df.get(w) <= common)
      .map(([w, n]) => [w, (1 + Math.log(n)) * Math.log(N / df.get(w))])
      .sort((a, b) => b[1] - a[1]).slice(0, 25);
    if (vec.length < 4) continue;
    const len = Math.hypot(...vec.map(x => x[1]));
    vec = vec.map(([w, v]) => [w, v / len]);
    let best = -1, bestCos = 0;
    for (const c of new Set(vec.flatMap(([w]) => [...(index.get(w) || [])]))) {
      const cl = clusters[c];
      let dot = 0;
      for (const [w, v] of vec) dot += v * (cl.sum.get(w) || 0);
      if (dot / cl.norm > bestCos) { bestCos = dot / cl.norm; best = c; }
    }
    if (best < 0 || bestCos < similarity) { best = clusters.length; clusters.push({ sum: new Map(), norm: 1, members: [] }); }
    const cl = clusters[best];
    cl.members.push(d.r);
    for (const [w, v] of vec) {
      cl.sum.set(w, (cl.sum.get(w) || 0) + v);
      if (!index.has(w)) index.set(w, new Set());
      index.get(w).add(best);
    }
    cl.norm = Math.hypot(...cl.sum.values());
  }
  // Groups that ended up on the same topic join (Mike 10-1: one "budget sent"
  // group, not six split by drawing stage). Biggest first, small ones fold in.
  const merged = [];
  for (const c of [...clusters].sort((x, y) => y.members.length - x.members.length)) {
    let into = null, best = mergeAt;
    for (const k of merged) {
      let dot = 0;
      for (const [w, v] of c.sum) dot += v * (k.sum.get(w) || 0);
      const cos = dot / (c.norm * k.norm);
      if (cos >= best) { best = cos; into = k; }
    }
    if (!into) { merged.push(c); continue; }
    into.members.push(...c.members);
    for (const [w, v] of c.sum) into.sum.set(w, (into.sum.get(w) || 0) + v);
    into.norm = Math.hypot(...into.sum.values());
  }
  for (const c of merged) c.members.sort((x, y) => ts(y.date) - ts(x.date));
  return merged.filter(c => c.members.length >= minSize)
    .map(c => ({
      size: c.members.length,
      recent: c.members.filter(r => ts(r.date) && now - ts(r.date) < 365 * DAY).length,
      lastSentAt: ts(c.members[0].date) || null,
      topic: [...c.sum].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([w]) => w),
      score: c.members.reduce((s, r) => s + bandOf(r.date, now).weight, 0),
      examples: c.members.slice(0, 4).map(({ subject, body }) => ({ subject, body })),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
    .map(({ score, ...c }) => c);
}
