import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';

// GET /api/clients/[id]/standards
// Returns all ClientStandardsAnswer rows for this client
export async function GET(req, { params }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const perms = (() => { try { return JSON.parse(session.permissions || '{}'); } catch { return {}; } })();
  const isIlcAdmin = session.role === 'ILC_ADMIN' || session.role === 'SUPER_ADMIN';
  const canView    = isIlcAdmin || perms.clientStandards === true;
  if (!canView) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  if (!prisma.clientStandardsAnswer) return NextResponse.json([]);

  const answers = await prisma.clientStandardsAnswer.findMany({
    where: { clientId: params.id },
    orderBy: [{ section: 'asc' }, { subsection: 'asc' }, { question_key: 'asc' }],
  });

  return NextResponse.json(answers);
}

// POST /api/clients/[id]/standards
// Upsert a single answer  { question_key, answer_value, answer_note, ... }
export async function POST(req, { params }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const perms = (() => { try { return JSON.parse(session.permissions || '{}'); } catch { return {}; } })();
  const isIlcAdmin = session.role === 'ILC_ADMIN' || session.role === 'SUPER_ADMIN';
  const canEdit    = isIlcAdmin || perms.clientStandards === true;
  if (!canEdit) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  if (!prisma.clientStandardsAnswer) return NextResponse.json({ error: 'Feature not available' }, { status: 503 });

  const body = await req.json();
  const { question_key, section, subsection, input_type, answer_value, answer_note } = body;

  if (!question_key) return NextResponse.json({ error: 'question_key required' }, { status: 400 });

  const answer = await prisma.clientStandardsAnswer.upsert({
    where:  { clientId_question_key: { clientId: params.id, question_key } },
    update: { answer_value: answer_value ?? null, answer_note: answer_note ?? null, answeredById: session.id, answered_at: new Date() },
    create: {
      clientId:     params.id,
      question_key,
      section:      section      || question_key.split('.')[0],
      subsection:   subsection   || question_key.split('.')[1] || '',
      input_type:   input_type   || 'TEXT',
      answer_value: answer_value ?? null,
      answer_note:  answer_note  ?? null,
      source:       'MANUAL',
      answeredById: session.id,
      answered_at:  new Date(),
    },
  });

  return NextResponse.json(answer);
}
