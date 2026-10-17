import { NextResponse } from 'next/server';
import { getSession, canSeeAllData } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { putQcObject, getQcObjectUrl } from '@/lib/qcStorage';

export const dynamic = 'force-dynamic';

// Client standards are open to everyone on staff (Mike, 2026-09-14); contractors
// (Client Viewers) never see them. This used to let only Super Admins and people
// whose permissions said `clients: true` in, a value the Users screen never saves.
const staff = s => canSeeAllData(s);
const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/webp': 'webp' };

async function withUrl(concept) {
  return { ...concept, imageUrl: concept.imageKey ? await getQcObjectUrl(concept.imageKey) : null };
}

// GET ?answerId= | ?questionKey=&projectType=&region=, list a question's concepts
export async function GET(req, { params }) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!staff(s)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const sp = new URL(req.url).searchParams;
  const where = { clientId: params.id };
  if (sp.get('answerId')) where.answerId = sp.get('answerId');
  if (sp.get('questionKey')) where.questionKey = sp.get('questionKey');
  const concepts = await prisma.standardsAnswerConcept.findMany({ where, orderBy: { sortOrder: 'asc' } });
  return NextResponse.json({ concepts: await Promise.all(concepts.map(withUrl)) });
}

// POST { answerId? , questionKey?, projectType?, region?, description?, typeCode?, resolvedSku?, sortOrder? }
// Attaches a concept to an existing answer (resolved by answerId or question key).
export async function POST(req, { params }) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!staff(s)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const b = await req.json();
  let answer = null;
  if (b.answerId) {
    answer = await prisma.clientStandardsAnswer.findUnique({ where: { id: b.answerId } });
  } else if (b.questionKey) {
    answer = await prisma.clientStandardsAnswer.findUnique({
      where: { clientId_question_key_projectType_region: { clientId: params.id, question_key: b.questionKey, projectType: b.projectType || '', region: b.region || '' } },
    });
  }
  if (!answer || answer.clientId !== params.id) {
    return NextResponse.json({ error: 'Answer not found, create the standards answer first' }, { status: 400 });
  }

  const concept = await prisma.standardsAnswerConcept.create({
    data: {
      answerId: answer.id, clientId: params.id, questionKey: answer.question_key,
      description: b.description || null, typeCode: b.typeCode || null,
      resolvedSku: b.resolvedSku || null, sortOrder: b.sortOrder ?? 0,
    },
  });
  return NextResponse.json({ concept: await withUrl(concept) }, { status: 201 });
}

// PATCH { conceptId, description?, typeCode?, resolvedSku?, sortOrder?, imageBase64?, imageContentType? }
export async function PATCH(req, { params }) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!staff(s)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const b = await req.json();
  if (!b.conceptId) return NextResponse.json({ error: 'conceptId required' }, { status: 400 });
  const existing = await prisma.standardsAnswerConcept.findUnique({ where: { id: b.conceptId } });
  if (!existing || existing.clientId !== params.id) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const data = {};
  if (b.description !== undefined) data.description = b.description || null;
  if (b.typeCode    !== undefined) data.typeCode    = b.typeCode || null;
  if (b.resolvedSku !== undefined) data.resolvedSku = b.resolvedSku || null;
  if (b.sortOrder   !== undefined) data.sortOrder   = Number(b.sortOrder) || 0;

  // Durable image upload (base64 → qcStorage)
  if (b.imageBase64) {
    const ct = b.imageContentType || 'image/png';
    const buffer = Buffer.from(b.imageBase64.replace(/^data:[^;]+;base64,/, ''), 'base64');
    data.imageKey = await putQcObject(buffer, { ext: EXT[ct] || 'png', contentType: ct });
  }

  const concept = await prisma.standardsAnswerConcept.update({ where: { id: b.conceptId }, data });
  return NextResponse.json({ concept: await withUrl(concept) });
}

// DELETE ?conceptId=
export async function DELETE(req, { params }) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!staff(s)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const conceptId = new URL(req.url).searchParams.get('conceptId');
  if (!conceptId) return NextResponse.json({ error: 'conceptId required' }, { status: 400 });
  const existing = await prisma.standardsAnswerConcept.findUnique({ where: { id: conceptId } });
  if (!existing || existing.clientId !== params.id) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  await prisma.standardsAnswerConcept.delete({ where: { id: conceptId } });
  return NextResponse.json({ ok: true });
}
