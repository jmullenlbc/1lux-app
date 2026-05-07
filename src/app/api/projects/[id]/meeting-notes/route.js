import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { randomUUID } from 'crypto';

async function canAccess(projectId, user) {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return false;
  return user.role === 'ILC_ADMIN' || project.createdById === user.id;
}

// Use raw SQL throughout — Prisma client may be stale and unaware of
// the MeetingNote model or its newer columns (meetingDate, meetingLink, attendees).
// All fields are LLM-readable via the GET endpoint.

export async function GET(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  if (!await canAccess(params.id, user)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const notes = await prisma.$queryRawUnsafe(
    `SELECT id, projectId, title, content, meetingDate, meetingLink, attendees, createdAt, updatedAt
     FROM "MeetingNote"
     WHERE "projectId" = ?
     ORDER BY "createdAt" DESC`,
    params.id
  );

  return NextResponse.json({ notes });
}

export async function POST(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  if (!await canAccess(params.id, user)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await request.json();
  const {
    title       = '',
    content     = '',
    meetingDate = null,
    meetingLink = null,
    attendees   = null,
  } = body;

  const id  = randomUUID();
  const now = new Date().toISOString();

  await prisma.$executeRawUnsafe(
    `INSERT INTO "MeetingNote"
       (id, projectId, title, content, meetingDate, meetingLink, attendees, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id, params.id, title, content, meetingDate, meetingLink, attendees, now, now
  );

  const [note] = await prisma.$queryRawUnsafe(
    `SELECT id, projectId, title, content, meetingDate, meetingLink, attendees, createdAt, updatedAt
     FROM "MeetingNote" WHERE id = ?`,
    id
  );

  return NextResponse.json({ note }, { status: 201 });
}
