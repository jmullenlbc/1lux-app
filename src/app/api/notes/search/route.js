import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';

// GET /api/notes/search?q=...&type=SALES|PROJECT_MEETING
// Unified search across sales notes + project meeting notes (one table),
// returning each result with a link back to its native screen.
export async function GET(request) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const q    = (searchParams.get('q') || '').trim();
  const type = searchParams.get('type'); // optional: SALES | PROJECT_MEETING
  if (!q) return NextResponse.json({ results: [] });

  const where = {
    OR: [{ title: { contains: q } }, { body: { contains: q } }],
    ...(type ? { noteType: type } : {}),
  };

  const notes = await prisma.note.findMany({
    where,
    orderBy: [{ meetingDate: 'desc' }, { updatedAt: 'desc' }],
    take: 50,
    include: {
      project:  { select: { id: true, name: true } },
      clients:  { include: { client:  { select: { id: true, name: true } } } },
      projects: { include: { project: { select: { id: true, name: true } } } },
      contacts: { include: { contact: { select: { id: true, name: true } } } },
    },
  });

  const results = notes.map(n => ({
    id:          n.id,
    noteType:    n.noteType,
    title:       n.title,
    snippet:     (n.body || '').slice(0, 200),
    meetingDate: n.meetingDate,
    project:     n.project ? { id: n.project.id, name: n.project.name } : null,
    clients:     n.clients.map(c => c.client),
    projects:    n.projects.map(p => p.project),
    contacts:    n.contacts.map(c => c.contact),
    href:        n.noteType === 'PROJECT_MEETING' && n.project ? `/project/${n.project.id}` : `/crm/notes?note=${n.id}`,
  }));

  return NextResponse.json({ results });
}
