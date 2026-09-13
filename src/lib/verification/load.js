import { prisma } from '@/lib/db';
import { runChecks } from './checks';

/**
 * Everything the five checks need, read out of the database in one go.
 *
 * This lives on its own because three routes need exactly the same reads and
 * exactly the same result: the card itself, "That's fine" (which has to look up
 * what the item said in order to keep a copy of it), and the archive. If they
 * each grew their own version of these selects they would drift, and a drifted
 * select here fails silently — a wrong relation name simply finds nothing and
 * the item quietly stops being checked.
 *
 * Nothing is cached. The whole point of these checks is that they are worked out
 * fresh every time, so fixing a record makes the item disappear on its own.
 */
export async function runChecksFromDb(now) {
  const [projects, statusEvents, pipelineRows, contacts, submissions] = await Promise.all([
    prisma.project.findMany({
      select: {
        id: true, name: true, clientId: true, serviceType: true, updatedAt: true,
        city: true, state: true, contactEmail: true,       // for "looks like a job"
        procurementStatus: true, designStatus: true,
        architect:         { select: { id: true, name: true } },
        generalContractor: { select: { id: true, name: true } },
        contactLinks:      { select: { contactId: true, isLead: true } },
      },
    }),
    prisma.projectStatusEvent.findMany({
      select: { projectId: true, pipeline: true, toStatus: true, changedAt: true, approximated: true },
    }),
    prisma.pipelineProject.findMany({
      select: { id: true, clientId: true, name: true, architect: true, gc: true, dismissed: true },
    }),
    prisma.contact.findMany({
      select: {
        id: true, name: true, email: true, clientId: true, company: true, createdAt: true,
        projectLinks: { select: { projectId: true } },
      },
    }),
    prisma.conceptualSubmission.findMany({
      where: { status: 'PENDING', duplicateMatchId: null, suggestionDismissedAt: null },
      select: {
        id: true, proposedName: true, city: true, state: true, submitterDomain: true, submitterEmail: true,
        clientId: true, status: true, duplicateMatchId: true, suggestionDismissedAt: true, createdAt: true,
      },
    }),
  ]);

  return runChecks({ now, projects, statusEvents, pipelineRows, contacts, submissions });
}

/**
 * The two facts a live recompute cannot know, split the way the card needs them.
 *
 * A DISMISSED row with a `restoredAt` on it is a bury that somebody has since
 * taken back, so it no longer hides anything — but the row stays, because
 * nothing in this table is ever deleted.
 */
export async function loadActions() {
  const actions = await prisma.verificationAction.findMany({
    select: { itemKey: true, kind: true, createdAt: true, restoredAt: true },
  });

  return {
    actions,
    shown:     new Map(actions.filter(a => a.kind === 'SHOWN').map(a => [a.itemKey, a.createdAt])),
    dismissed: new Set(actions.filter(a => a.kind === 'DISMISSED' && !a.restoredAt).map(a => a.itemKey)),
  };
}
