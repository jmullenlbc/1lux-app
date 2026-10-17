import { NextResponse } from 'next/server';
import { requireAuth, canSeeAllData } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { archiveData, deleteRefused } from '@/lib/archive';
import { cleanJob, sortJobs, MAX_PASTE_CHARS } from '@/lib/workHistory';
import { extractWorkHistory } from '@/lib/workHistoryExtract';

export const dynamic = 'force-dynamic';

// A person's work history (ContactEmployment, migration 0083). Mike, 2026-09-14:
// "meeting prep should pull in the person's Linkedin resume with years worked
// at places." LinkedIn is never read by the app, a salesperson pastes the
// Experience section in, or types a job by hand. Rows are archived, never deleted.

const JOB_SELECT = {
  id: true, company: true, title: true, startYear: true, startMonth: true,
  endYear: true, endMonth: true, isCurrent: true, position: true, source: true,
};

async function authorize(params, user) {
  const client = await prisma.client.findUnique({ where: { id: params.id }, select: { id: true, createdById: true } });
  if (!client) return { err: NextResponse.json({ error: 'Not found' }, { status: 404 }) };
  if (!canSeeAllData(user) && client.createdById !== user.id)
    return { err: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  const contact = await prisma.contact.findFirst({ where: { id: params.contactId, clientId: client.id }, select: { id: true } });
  if (!contact) return { err: NextResponse.json({ error: 'Not found' }, { status: 404 }) };
  return { contact };
}

async function list(contactId) {
  const rows = await prisma.contactEmployment.findMany({
    where: { contactId, archivedAt: null },
    orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    select: JOB_SELECT,
  });
  return sortJobs(rows);
}

// GET, this person's jobs, newest first.
export async function GET(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const { err, contact } = await authorize(params, user);
  if (err) return err;
  return NextResponse.json({ jobs: await list(contact.id) });
}

// POST { text }, read a LinkedIn paste. The jobs from the last paste are
//   archived and replaced; jobs typed in by hand stay.
// POST { row }, add one job by hand.
export async function POST(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const { err, contact } = await authorize(params, user);
  if (err) return err;

  const body = await request.json().catch(() => ({}));

  if (typeof body?.text === 'string') {
    const text = body.text.trim();
    if (!text) return NextResponse.json({ error: 'Paste their LinkedIn Experience section first.' }, { status: 400 });
    if (text.length > MAX_PASTE_CHARS) {
      return NextResponse.json({ error: 'That paste is too long. Copy just the Experience section.' }, { status: 400 });
    }
    let jobs;
    try {
      ({ jobs } = await extractWorkHistory(text, { userId: user.id }));
    } catch (e) {
      console.error('[work-history] read failed:', e?.message ?? e);
      return NextResponse.json({ error: 'Could not read that paste just now. Try again, or add the jobs by hand.' }, { status: 502 });
    }
    if (!jobs.length) {
      return NextResponse.json({ error: 'No jobs found in that paste. Copy the Experience section of their profile and try again.' }, { status: 422 });
    }
    await prisma.$transaction([
      prisma.contactEmployment.updateMany({
        where: { contactId: contact.id, source: 'linkedin_paste', archivedAt: null },
        data: archiveData(true, user),
      }),
      prisma.contactEmployment.createMany({
        data: jobs.map((j, i) => ({ ...j, contactId: contact.id, position: i, source: 'linkedin_paste', createdById: user.id })),
      }),
    ]);
    return NextResponse.json({ jobs: await list(contact.id), read: jobs.length });
  }

  if (body?.row && typeof body.row === 'object') {
    const job = cleanJob(body.row);
    if (!job) return NextResponse.json({ error: 'A job needs a company.' }, { status: 400 });
    const top = await prisma.contactEmployment.aggregate({ where: { contactId: contact.id }, _max: { position: true } });
    await prisma.contactEmployment.create({
      data: { ...job, contactId: contact.id, position: (top._max.position ?? -1) + 1, source: 'manual', createdById: user.id },
    });
    return NextResponse.json({ jobs: await list(contact.id) });
  }

  return NextResponse.json({ error: 'Send { "text": "…" } to read a LinkedIn paste, or { "row": { … } } to add one job.' }, { status: 400 });
}

// PATCH { id, archived: true | false }, archive or restore one job.
// PATCH { id, company?, title?, startYear?, … }, correct one job.
export async function PATCH(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const { err, contact } = await authorize(params, user);
  if (err) return err;

  const body = await request.json().catch(() => ({}));
  const row = body?.id
    ? await prisma.contactEmployment.findFirst({ where: { id: String(body.id), contactId: contact.id } })
    : null;
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (typeof body.archived === 'boolean') {
    await prisma.contactEmployment.update({ where: { id: row.id }, data: archiveData(body.archived, user) });
    return NextResponse.json({ jobs: await list(contact.id) });
  }

  const merged = { ...row };
  for (const k of ['company', 'title', 'startYear', 'startMonth', 'endYear', 'endMonth', 'isCurrent']) {
    if (body[k] !== undefined) merged[k] = body[k];
  }
  const job = cleanJob(merged);
  if (!job) return NextResponse.json({ error: 'A job needs a company.' }, { status: 400 });
  await prisma.contactEmployment.update({ where: { id: row.id }, data: job });
  return NextResponse.json({ jobs: await list(contact.id) });
}

// DELETE, refused. Work history is archived, never deleted.
export async function DELETE() {
  return NextResponse.json({ error: deleteRefused('Work history entries') }, { status: 405 });
}
