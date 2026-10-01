import { NextResponse } from 'next/server';
import { requireAuth, canSeeAllData } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { runParkedJob, readJobRequest } from '@/lib/parkedJob';
import { answerQuestion, loadQuestion, QUESTION_SELECT } from '@/lib/market-intel/ask';

// Park-and-poll (src/lib/parkedJob.js): a web research question runs for
// minutes, far past the front door's ~30s. The first request saves the
// question and parks the job; the polls run it and collect the answer.
export const maxDuration = 300;
const ASK_INFLIGHT_MS = 300_000;

async function staff() {
  const { user, error } = await requireAuth();
  if (error) return { error };
  if (!canSeeAllData(user)) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  return { user };
}

/** GET: past questions, newest first. ?id= returns one with its answer rows. */
export async function GET(req) {
  const { error } = await staff();
  if (error) return error;
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (id) {
    const question = await loadQuestion(id);
    if (!question) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ question });
  }
  const archived = searchParams.get('archived') === '1';
  const questions = await prisma.marketQuestion.findMany({
    where: { archivedAt: archived ? { not: null } : null },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: { ...QUESTION_SELECT, _count: { select: { rows: true } } },
  });
  return NextResponse.json({ questions });
}

/** POST { question } starts one; POST { jobKey } polls it. */
export async function POST(req) {
  const { user, error } = await staff();
  if (error) return error;
  const { body } = await readJobRequest(req);

  let args = null;
  if (!body.jobKey) {
    const text = String(body.question || '').trim();
    if (text.length < 8) return NextResponse.json({ error: 'Type a question first.' }, { status: 400 });
    const q = await prisma.marketQuestion.create({
      data: { askedById: user.id, question: text.slice(0, 1000) },
      select: { id: true },
    });
    args = { questionId: q.id };
  }

  return runParkedJob({
    body, kind: 'marketIntel.ask', scope: user.id, args, inflightMs: ASK_INFLIGHT_MS,
    run: (a) => answerQuestion(a.questionId, { userId: user.id }),
  });
}
