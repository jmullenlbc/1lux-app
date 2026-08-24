import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { CASCADE_MAP } from '@/lib/standards-questions';

// ── GET /api/clients/[id]/standards ──────────────────────────────────────────
// Returns ALL ClientStandardsAnswer rows for this client (all projectTypes + regions).
// The client resolves the effective answer via resolveAnswer().
export async function GET(req, { params }) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  const perms = (() => { try { return JSON.parse(user.permissions || '{}'); } catch { return {}; } })();
  const isAdmin = user.role === 'ILC_ADMIN' || user.role === 'SUPER_ADMIN';
  const canView = isAdmin || perms.clientStandards === true;
  if (!canView) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const answers = await prisma.clientStandardsAnswer.findMany({
    where:   { clientId: params.id },
    orderBy: [{ question_key: 'asc' }, { projectType: 'asc' }],
  });

  return NextResponse.json(answers);
}

// ── POST /api/clients/[id]/standards ─────────────────────────────────────────
// Upserts a single answer.
// Body: { question_key, section, answer_value, answer_note?, projectType?, region?, input_type? }
// projectType defaults to '' (global). region defaults to '' (all regions).
// Cascade: if question_key is a CASCADE_MAP source, auto-creates answers for targets
// that don't yet have ANY answer for the same (projectType, region).
export async function POST(req, { params }) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  const perms = (() => { try { return JSON.parse(user.permissions || '{}'); } catch { return {}; } })();
  const isAdmin = user.role === 'ILC_ADMIN' || user.role === 'SUPER_ADMIN';
  const canEdit = isAdmin || perms.clientStandards === true;
  if (!canEdit) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json();
  const {
    question_key,
    section      = '',
    subsection   = '',
    input_type   = 'CHIPS',
    answer_value,
    answer_note,
    projectType  = '',
    region       = '',
  } = body;

  if (!question_key) {
    return NextResponse.json({ error: 'question_key required' }, { status: 400 });
  }

  const answer = await prisma.clientStandardsAnswer.upsert({
    where: {
      clientId_question_key_projectType_region: {
        clientId:    params.id,
        question_key,
        projectType,
        region,
      },
    },
    update: {
      answer_value: answer_value ?? null,
      answer_note:  answer_note  ?? null,
      source:       'MANUAL',
      answeredById: user.id,
      answered_at:  new Date(),
    },
    create: {
      clientId:    params.id,
      question_key,
      section,
      subsection,
      input_type,
      projectType,
      region,
      answer_value: answer_value ?? null,
      answer_note:  answer_note  ?? null,
      source:       'MANUAL',
      answeredById: user.id,
      answered_at:  new Date(),
    },
  });

  // ── Cascade logic ─────────────────────────────────────────────────────────
  // Only cascade when a non-null value is being set on a source question.
  let cascaded = 0;
  const targets = CASCADE_MAP[question_key];
  if (targets && answer_value != null) {
    const results = await Promise.allSettled(
      targets.map(async (targetKey) => {
        // Only auto-fill if the target has NO record at all for this projectType+region.
        // This preserves intentional manual overrides.
        const existing = await prisma.clientStandardsAnswer.findUnique({
          where: {
            clientId_question_key_projectType_region: {
              clientId:    params.id,
              question_key: targetKey,
              projectType,
              region,
            },
          },
        });
        if (!existing) {
          await prisma.clientStandardsAnswer.create({
            data: {
              clientId:    params.id,
              question_key: targetKey,
              section,
              subsection:  '',
              input_type:  'CHIPS',
              projectType,
              region,
              answer_value,
              answer_note:  null,
              source:       'CASCADE',
              answeredById: user.id,
              answered_at:  new Date(),
            },
          });
          return true;
        }
        return false;
      })
    );
    cascaded = results.filter(r => r.status === 'fulfilled' && r.value === true).length;
  }

  return NextResponse.json({ answer, cascaded });
}
