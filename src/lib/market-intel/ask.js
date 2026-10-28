// Market Intel "ask any market question" (Mike 9-27): "who are the top 50
// affordable housing developers", "top multifamily GCs in Tampa Bay". The
// model searches the open web (no paid data) and answers as rows; ranking.js
// works out totals, order and the year note; every row is checked against the
// CRM. Everything is saved as rows (migration 0110), never a blob.
import { prisma } from '@/lib/db';
import { getAnthropicKey } from '@/lib/anthropicKey';
import { wrapClient } from '@/lib/agent/client';
import { modelParams, answerBudget } from '@/lib/aiModels';
import { jobError } from '@/lib/parkedJob';
import { matchCandidates } from '@/lib/market-intel/fuzzy-matcher';
import { rankRows, yearWindow, readAnswer } from '@/lib/market-intel/ranking';

const JOB = 'marketIntel.ask';
const MAX_ROWS = 60;
const MAX_SEARCHES = 15;
const MAX_CONTINUES = 5;

const isUrl = u => /^https?:\/\/\S+$/i.test(String(u || ''));
const str = (v, n) => (v == null || v === '' ? null : String(v).slice(0, n));
// No em dash, en dash or double dash in anything the app shows (Mike 9-26).
const plain = s => (s == null ? s : String(s).replace(/\s*(—|–|--)\s*/g, ', '));

function promptFor(question, win) {
  const [a, b, c] = win.years;
  return `You research the US construction and real estate market for ILC Studios, a lighting design and supply company that sells to multifamily, affordable, student, senior and hospitality developers and their general contractors.

Question from the sales team: ${question}

Today is ${new Date().toISOString().slice(0, 10)}. Use web search to find the answer on the open web (company sites, local business journals, trade press, public rankings like NMHC, ENR, Affordable Housing Finance, city permit news).

Rules:
- Answer the question as asked. If it asks for a number of companies (top 50, top 10), return up to that many; otherwise return what the question needs, up to ${MAX_ROWS}.
- "Top" means the most units built in the last 3 years (${a}, ${b}, ${c}) unless the question says otherwise. Units built = units completed or delivered; if a source only gives units started or in the pipeline, use it and say so in "detail".
- Give units by year only from what the sources say. Never guess or spread a total across years. Leave a year out if you did not find it. Add ${win.soFar} so far only if a source gives it.
- For a metro area, count only work in that metro.
- Every row needs at least one source URL you actually found.
- Write plainly. Never use an em dash, en dash or double dash.

When you are done searching, reply with ONLY this JSON object, nothing before or after it:
{
  "answerKind": "RANKING" (companies ranked by units) | "LIST" (companies or items without units) | "FACT" (a short answer, rows optional),
  "metro": "the metro area the question is about, or null for national",
  "summary": "2-4 plain sentences answering the question, and what the numbers do and do not cover",
  "rows": [
    {
      "name": "company or item name",
      "role": "developer | general contractor | architect | owner | property manager | other",
      "city": "headquarters city", "state": "two-letter state",
      "unitsByYear": { "${a}": 0, "${b}": 0, "${c}": 0 },
      "detail": "one line: what they build there, notable projects, anything worth knowing",
      "sources": [{ "url": "https://...", "title": "page title" }]
    }
  ]
}`;
}

/** Pages the model cited in its text, for the question's source list. */
function citedPages(content) {
  const seen = new Map();
  for (const b of content || []) {
    for (const c of b?.citations || []) {
      if (isUrl(c?.url) && !seen.has(c.url)) seen.set(c.url, str(c.title, 300));
    }
  }
  return [...seen].map(([url, title]) => ({ url, title }));
}

async function research(question, win, userId) {
  const Anthropic = (await import('@anthropic-ai/sdk')).default;
  const client = wrapClient(new Anthropic({ apiKey: (await getAnthropicKey()) }), JOB, { userId });
  const user = { role: 'user', content: promptFor(question, win) };
  const tools = [{ type: 'web_search_20260209', name: 'web_search', max_uses: MAX_SEARCHES }];
  let messages = [user];
  let msg;
  for (let i = 0; i <= MAX_CONTINUES; i++) {
    msg = await client.messages.stream({
      ...modelParams(JOB), max_tokens: answerBudget(JOB, 16000), tools, messages,
    }).finalMessage();
    // A long search turn pauses; send it back as is and the server carries on.
    if (msg.stop_reason !== 'pause_turn') break;
    messages = [user, { role: 'assistant', content: msg.content }];
  }
  if (msg.stop_reason === 'refusal') throw jobError(422, { error: 'refused', message: 'The research tool would not answer that question. Try wording it another way.' });
  if (msg.stop_reason === 'pause_turn') throw jobError(504, { error: 'too_long', message: 'That question needed more searching than one run allows. Try a narrower question.' });
  return msg.content;
}

/**
 * Answer one saved MarketQuestion and write the rows. Safe to call twice (a
 * parked job can be kicked again): a question already answered is returned as
 * it is, and only the run that flips RUNNING to DONE writes rows.
 */
export async function answerQuestion(questionId, { userId } = {}) {
  const q = await prisma.marketQuestion.findUnique({ where: { id: questionId } });
  if (!q) throw jobError(404, { error: 'Not found' });
  if (q.status === 'DONE') return { question: await loadQuestion(questionId) };

  const win = yearWindow();
  let content;
  try {
    content = await research(q.question, win, userId);
  } catch (e) {
    const message = e?.payload?.message || e?.message || 'The research failed.';
    await prisma.marketQuestion.updateMany({ where: { id: questionId, status: { not: 'DONE' } }, data: { status: 'FAILED', error: String(message).slice(0, 500), finishedAt: new Date() } });
    throw e;
  }
  const answer = readAnswer(content);
  if (!answer) {
    await prisma.marketQuestion.updateMany({ where: { id: questionId, status: { not: 'DONE' } }, data: { status: 'FAILED', error: 'The answer came back in a form the app could not read.', finishedAt: new Date() } });
    throw jobError(502, { error: 'unreadable', message: 'The answer came back in a form the app could not read. Please ask again.' });
  }

  const kind = ['RANKING', 'LIST', 'FACT'].includes(answer.answerKind) ? answer.answerKind : 'LIST';
  const rawRows = (Array.isArray(answer.rows) ? answer.rows : []).filter(r => String(r?.name || '').trim()).slice(0, MAX_ROWS);
  const rows = rankRows(rawRows, { byUnits: kind === 'RANKING', win });
  const matches = await matchCandidates(rows.map(r => String(r.name).trim())).catch(() => []);
  const matchOf = new Map(matches.map(m => [m.candidateName, m]));

  await prisma.$transaction(async tx => {
    const flipped = await tx.marketQuestion.updateMany({
      where: { id: questionId, status: { not: 'DONE' } },
      data: {
        status: 'DONE', answerKind: kind, error: null, finishedAt: new Date(),
        metro: str(answer.metro, 120), summary: plain(str(answer.summary, 2000)),
      },
    });
    if (!flipped.count) return; // another run got here first
    for (const r of rows) {
      const name = String(r.name).trim();
      const m = matchOf.get(name);
      const row = await tx.marketAnswerRow.create({
        data: {
          questionId, rank: r.rank, companyName: name.slice(0, 200),
          role: str(r.role, 60), city: str(r.city, 80), state: str(r.state, 20),
          unitsTotal: r.unitsTotal, yearNote: r.yearNote, detail: plain(str(r.detail, 1000)),
          clientId: m?.clientId || null, matchStatus: m?.status || null,
          years: { create: r.years },
        },
      });
      const srcs = (Array.isArray(r.sources) ? r.sources : []).filter(s => isUrl(s?.url)).slice(0, 5);
      if (srcs.length) {
        await tx.marketAnswerSource.createMany({
          data: srcs.map(s => ({ questionId, rowId: row.id, url: String(s.url).slice(0, 1000), title: str(s.title, 300) })),
        });
      }
    }
    const cited = citedPages(content).slice(0, 30);
    if (cited.length) {
      await tx.marketAnswerSource.createMany({
        data: cited.map(s => ({ questionId, url: s.url.slice(0, 1000), title: s.title })),
      });
    }
  }, { timeout: 30_000 });

  return { question: await loadQuestion(questionId) };
}

export const QUESTION_SELECT = {
  id: true, question: true, status: true, answerKind: true, metro: true, summary: true, error: true,
  createdAt: true, finishedAt: true,
  askedBy: { select: { id: true, name: true } },
};

/** One question with its rows, years, sources and CRM links. */
export function loadQuestion(id) {
  return prisma.marketQuestion.findUnique({
    where: { id },
    select: {
      ...QUESTION_SELECT,
      rows: {
        orderBy: { rank: 'asc' },
        select: {
          id: true, rank: true, companyName: true, role: true, city: true, state: true,
          unitsTotal: true, yearNote: true, detail: true, matchStatus: true, status: true,
          client: { select: { id: true, name: true } },
          years: { orderBy: { year: 'asc' }, select: { year: true, units: true } },
          sources: { select: { url: true, title: true } },
        },
      },
      sources: { where: { rowId: null }, select: { url: true, title: true } },
    },
  });
}
