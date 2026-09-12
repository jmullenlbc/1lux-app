export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { getSession, canSeeAllData, isClientViewer } from '@/lib/auth';
import { prisma } from '@/lib/db';
import ArchiveClient from './ArchiveClient';

export const metadata = { title: 'Archive — ILC Studios' };

// Everything that was archived instead of deleted (Mike, 2026-09-11:
// "archive only for everything"): companies, projects, people and notes, each
// with a Restore button. Reached from the small "Archived …" links at the
// bottom of the client list and the projects list — there on purpose, not in
// the main menu ("accessible but not easily").
//
// `archivedAt: { not: null }` is what lets these four lists through the rule
// in src/lib/archive.js that hides archived rows everywhere else.
export default async function ArchivePage() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (isClientViewer(session.role)) redirect('/dashboard');

  const all      = canSeeAllData(session);
  const archived = { archivedAt: { not: null } };
  const by       = { archivedBy: { select: { name: true, email: true } } };

  const [clients, projects, contacts, notes] = await Promise.all([
    prisma.client.findMany({
      where: { ...archived, ...(all ? {} : { createdById: session.id }) },
      orderBy: { archivedAt: 'desc' },
      select: { id: true, name: true, clientNumber: true, archivedAt: true, ...by },
    }),
    prisma.project.findMany({
      where: { ...archived, ...(all ? {} : { createdById: session.id }) },
      orderBy: { archivedAt: 'desc' },
      select: {
        id: true, name: true, projectNumber: true, city: true, state: true, archivedAt: true, ...by,
        client: { select: { name: true } },
      },
    }),
    prisma.contact.findMany({
      where: { ...archived, ...(all ? {} : { client: { createdById: session.id } }) },
      orderBy: { archivedAt: 'desc' },
      select: {
        id: true, name: true, email: true, title: true, clientId: true, archivedAt: true, ...by,
        client: { select: { name: true, archivedAt: true } },
      },
    }),
    prisma.note.findMany({
      where: { ...archived, ...(all ? {} : { createdById: session.id }) },
      orderBy: { archivedAt: 'desc' },
      select: {
        id: true, title: true, noteNumber: true, noteType: true, projectId: true, archivedAt: true, ...by,
        project: { select: { name: true } },
      },
    }),
  ]);

  const iso = d => (d ? d.toISOString() : null);
  const who = r => r.archivedBy?.name || r.archivedBy?.email || null;

  const sections = {
    clients: clients.map(c => ({
      id: c.id,
      label: c.name,
      sub: c.clientNumber ? `#${c.clientNumber}` : '',
      href: `/clients/${c.id}`,
      restoreUrl: `/api/clients/${c.id}`,
      archivedAt: iso(c.archivedAt), archivedBy: who(c),
    })),
    projects: projects.map(p => ({
      id: p.id,
      label: p.name || 'Untitled project',
      sub: [p.projectNumber ? `PRJ-${String(p.projectNumber).padStart(4, '0')}` : '', p.client?.name, [p.city, p.state].filter(Boolean).join(', ')]
        .filter(Boolean).join(' · '),
      href: `/project/${p.id}`,
      restoreUrl: `/api/projects/${p.id}`,
      archivedAt: iso(p.archivedAt), archivedBy: who(p),
    })),
    contacts: contacts.map(c => ({
      id: c.id,
      label: c.name || c.email || 'Unnamed person',
      sub: [c.title, c.client?.name ? `${c.client.name}${c.client.archivedAt ? ' (company archived)' : ''}` : 'No company', c.email]
        .filter(Boolean).join(' · '),
      href: c.clientId ? `/clients/${c.clientId}` : null,
      // People are archived from a company's People tab, so there is always a
      // company to restore them through. One with none cannot be put back here.
      restoreUrl: c.clientId ? `/api/clients/${c.clientId}/contacts/${c.id}` : null,
      archivedAt: iso(c.archivedAt), archivedBy: who(c),
    })),
    notes: notes.map(n => ({
      id: n.id,
      label: n.title || (n.noteNumber ? `Note #${n.noteNumber}` : 'Untitled note'),
      sub: n.noteType === 'PROJECT_MEETING'
        ? `Meeting note${n.project?.name ? ` · ${n.project.name}` : ''}`
        : `Sales note${n.noteNumber ? ` #${n.noteNumber}` : ''}`,
      href: n.noteType === 'PROJECT_MEETING' && n.projectId ? `/project/${n.projectId}` : null,
      restoreUrl: n.noteType === 'PROJECT_MEETING'
        ? (n.projectId ? `/api/projects/${n.projectId}/meeting-notes/${n.id}` : null)
        : `/api/crm/notes/${n.id}`,
      archivedAt: iso(n.archivedAt), archivedBy: who(n),
    })),
  };

  return <ArchiveClient sections={sections} />;
}
