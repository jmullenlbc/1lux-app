export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { getSession, canSeeAllData, isClientViewer } from '@/lib/auth';
import { prisma } from '@/lib/db';
import ArchiveClient from './ArchiveClient';

export const metadata = { title: 'Archive: ILC Studios' };

// Everything that was archived instead of deleted (Mike, 2026-09-11:
// "archive only for everything"): companies, projects, people and notes
// (0075), and project files, drawing sets, budget versions and products
// (0076), each with a Restore button. Reached from the small "Archived …"
// links at the bottom of the client list and the projects list, there on
// purpose, not in the main menu ("accessible but not easily").
//
// `archivedAt: { not: null }` is what lets these lists through the rule in
// src/lib/archive.js that hides archived rows everywhere else.
export default async function ArchivePage() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (isClientViewer(session.role)) redirect('/dashboard');

  const all      = canSeeAllData(session);
  const archived = { archivedAt: { not: null } };
  const by       = { archivedBy: { select: { name: true, email: true } } };

  const ownProject = all ? {} : { project: { createdById: session.id } };
  const onProject  = { projectId: true, project: { select: { name: true } } };

  const [clients, projects, contacts, notes, files, drawings, budgets, products] = await Promise.all([
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
    prisma.projectFile.findMany({
      where: { ...archived, ...ownProject },
      orderBy: { archivedAt: 'desc' },
      select: { id: true, originalName: true, tab: true, archivedAt: true, ...by, ...onProject },
    }),
    prisma.drawingSubmission.findMany({
      where: { ...archived, ...ownProject },
      orderBy: { archivedAt: 'desc' },
      select: { id: true, phaseTag: true, archivedAt: true, ...by, ...onProject, _count: { select: { files: true } } },
    }),
    prisma.designBidMatrix.findMany({
      where: { ...archived, ...ownProject },
      orderBy: { archivedAt: 'desc' },
      select: { id: true, version: true, submissionTag: true, archivedAt: true, ...by, ...onProject },
    }),
    // Products belong to the whole company and only an admin can archive or
    // restore one, so they are listed only for people who see everything.
    all
      ? prisma.manufacturerProduct.findMany({
          where: archived,
          orderBy: { archivedAt: 'desc' },
          select: {
            id: true, partNumber: true, description: true, archivedAt: true, ...by,
            manufacturer: { select: { name: true } },
          },
        })
      : [],
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
    files: files.map(f => ({
      id: f.id,
      label: f.originalName || 'Unnamed file',
      sub: [f.project?.name, f.tab ? `${f.tab} tab` : ''].filter(Boolean).join(' · '),
      href: `/project/${f.projectId}`,
      restoreUrl: `/api/projects/${f.projectId}/files/${f.id}`,
      archivedAt: iso(f.archivedAt), archivedBy: who(f),
    })),
    drawings: drawings.map(d => ({
      id: d.id,
      label: `${d.phaseTag ? `${d.phaseTag} drawing set` : 'Drawing set'} · ${d._count.files} sheet file${d._count.files !== 1 ? 's' : ''}`,
      sub: d.project?.name || '',
      href: `/project/${d.projectId}`,
      restoreUrl: `/api/projects/${d.projectId}/drawing-submissions/${d.id}`,
      archivedAt: iso(d.archivedAt), archivedBy: who(d),
    })),
    budgets: budgets.map(b => ({
      id: b.id,
      label: `Budget v${b.version}${b.submissionTag ? ` · ${b.submissionTag}` : ''}`,
      sub: b.project?.name || '',
      href: `/project/${b.projectId}`,
      restoreUrl: `/api/projects/${b.projectId}/design-bid-matrix/${b.id}`,
      archivedAt: iso(b.archivedAt), archivedBy: who(b),
    })),
    products: products.map(p => ({
      id: p.id,
      label: p.partNumber,
      sub: [p.manufacturer?.name, p.description].filter(Boolean).join(' · '),
      href: `/products/${p.id}`,
      restoreUrl: `/api/products/${p.id}`,
      archivedAt: iso(p.archivedAt), archivedBy: who(p),
    })),
  };

  return <ArchiveClient sections={sections} />;
}
