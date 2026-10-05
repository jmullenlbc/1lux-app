/**
 * "Same person? Same company? Same job?" on My Desk (0117). A web budget whose
 * person, company or job looks like one we already have waits here, and
 * nothing is made or joined until somebody answers.
 *
 *   Same       the web budget is joined to the record we already have.
 *   Different  a new record is made, exactly as if there had been no look alike.
 *
 * Server only.
 */
import { createWebContact, createWebClient, linkPeopleToProject } from '@/lib/intake/webPeople';
import { projectFromSubmission, projectFromDraft, automaticOwner } from '@/lib/intake/conceptualProjects';

const ANSWERS = { same: 'SAME', different: 'DIFFERENT' };

/** A project question that something else already settled (staff linked it, rejected it, or the sweep made it). */
function settledElsewhere(r) {
  if (r.kind !== 'project') return null;
  const s = r.submission, d = r.draft;
  if (s?.duplicateMatchId) return s.duplicateMatchId === r.existingProjectId ? 'SAME' : 'DIFFERENT';
  if (s && (s.status === 'REJECTED' || s.suggestionDismissedAt)) return 'DIFFERENT';
  if (!s && d?.projectId) return d.projectId === r.existingProjectId ? 'SAME' : 'DIFFERENT';
  return null;
}

/** Questions waiting on somebody, oldest first. Closes the ones already settled elsewhere. */
export async function pendingReviews(db) {
  const rows = await db.duplicateReview.findMany({
    where: { status: 'PENDING' },
    orderBy: { createdAt: 'asc' },
    take: 50,
    include: {
      existingContact: { select: { id: true, name: true, email: true, company: true, client: { select: { name: true } } } },
      existingClient: { select: { id: true, name: true, website: true } },
      existingProject: { select: { id: true, name: true, budgetNumber: true, city: true, state: true } },
      draft: { select: { projectId: true } },
      submission: { select: { duplicateMatchId: true, status: true, suggestionDismissedAt: true } },
    },
  });
  const open = [];
  for (const r of rows) {
    const done = settledElsewhere(r);
    if (done) {
      await db.duplicateReview.updateMany({ where: { id: r.id, status: 'PENDING' }, data: { status: done, decidedAt: new Date() } });
      continue;
    }
    // The record it looked like was archived: nothing left to compare against.
    if (!r.existingContact && !r.existingClient && !r.existingProject) {
      await db.duplicateReview.updateMany({ where: { id: r.id, status: 'PENDING' }, data: { status: 'DIFFERENT', decidedAt: new Date() } });
      continue;
    }
    const { draft, submission, ...rest } = r;
    open.push(rest);
  }
  return open;
}

/** The web budget's own rows, and the project it became (if any). */
async function loadSources(db, r) {
  const [draft, submission] = await Promise.all([
    r.draftId ? db.conceptualDraft.findUnique({ where: { id: r.draftId }, include: { fields: true } }) : null,
    r.submissionId ? db.conceptualSubmission.findUnique({ where: { id: r.submissionId } }) : null,
  ]);
  return { draft, submission, projectId: submission?.duplicateMatchId || draft?.projectId || null };
}

/**
 * Answer one question. answer: 'same' | 'different'.
 * Returns { ok, projectId } or { error, status }.
 */
export async function decideReview(db, id, answer, user) {
  const status = ANSWERS[answer];
  if (!status) return { error: 'Answer must be same or different.', status: 400 };
  const r = await db.duplicateReview.findUnique({ where: { id } });
  if (!r) return { error: 'Question not found.', status: 404 };
  // Claim it, so two people answering at once cannot both act.
  const claim = await db.duplicateReview.updateMany({
    where: { id, status: 'PENDING' },
    data: { status, decidedById: user.id, decidedAt: new Date() },
  });
  if (claim.count !== 1) return { error: 'Somebody already answered this one.', status: 409 };
  try {
    const out = await applyAnswer(db, r, status === 'SAME', user);
    if (out.error) await reopen(db, id);
    return out;
  } catch (e) {
    // Put the question back so it can be answered again.
    await reopen(db, id);
    throw e;
  }
}

function reopen(db, id) {
  return db.duplicateReview.update({ where: { id }, data: { status: 'PENDING', decidedById: null, decidedAt: null } });
}

async function applyAnswer(db, r, same, user) {
  const { draft, submission, projectId } = await loadSources(db, r);

  if (r.kind === 'contact') {
    const contactId = same
      ? r.existingContactId
      : (await createWebContact(db, {
          firstName: r.firstName, lastName: r.lastName, email: r.email, companyName: r.companyName,
          clientId: draft?.clientId || submission?.clientId || null,
        })).id;
    if (!contactId) return { ok: true, projectId };
    if (draft) await db.conceptualDraft.update({ where: { id: draft.id }, data: { contactId } });
    if (submission) await db.conceptualSubmission.update({ where: { id: submission.id }, data: { contactId } });
    const clientId = draft?.clientId || submission?.clientId || null;
    if (same && clientId) await db.contact.updateMany({ where: { id: contactId, clientId: null }, data: { clientId } });
    if (projectId) await linkPeopleToProject(db, projectId, { contactId, clientId });
    return { ok: true, projectId };
  }

  if (r.kind === 'client') {
    const clientId = same
      ? r.existingClientId
      : (await createWebClient(db, { name: r.companyName || r.emailDomain || 'Web company', domain: r.emailDomain, creatorId: user.id })).id;
    if (!clientId) return { ok: true, projectId };
    if (draft) await db.conceptualDraft.update({ where: { id: draft.id }, data: { clientId } });
    if (submission) await db.conceptualSubmission.update({ where: { id: submission.id }, data: { clientId } });
    const contactId = draft?.contactId || submission?.contactId || null;
    if (contactId) await db.contact.updateMany({ where: { id: contactId, clientId: null }, data: { clientId } });
    if (projectId) await linkPeopleToProject(db, projectId, { clientId, contactId });
    return { ok: true, projectId };
  }

  // kind 'project'
  const people = { clientId: submission?.clientId || draft?.clientId || null, contactId: submission?.contactId || draft?.contactId || null };
  if (same) {
    const target = r.existingProjectId;
    if (!target) return { ok: true, projectId: null };
    if (submission && !submission.duplicateMatchId) {
      const line = `${user.name || 'Staff'} said this is the same job as one we already have.`;
      await db.conceptualSubmission.update({
        where: { id: submission.id },
        data: {
          duplicateMatchId: target, status: 'APPROVED', reviewedById: user.id,
          reviewNote: submission.reviewNote ? `${submission.reviewNote}\n${line}` : line,
        },
      });
    }
    if (draft && !draft.projectId) {
      // One draft per project: a project already holding a draft keeps it.
      try { await db.conceptualDraft.update({ where: { id: draft.id }, data: { projectId: target } }); }
      catch (e) { if (e?.code !== 'P2002') throw e; }
    }
    await linkPeopleToProject(db, target, people);
    return { ok: true, projectId: target };
  }

  // Different job: make it now, as if there had been no look alike.
  if (projectId) return { ok: true, projectId };
  if (submission) {
    const out = await projectFromSubmission(db, submission.id, user);
    if (out.error) return out;
    return { ok: true, projectId: out.project.id };
  }
  if (draft) {
    const owner = (await automaticOwner(db)) || user;
    const { project } = await projectFromDraft(db, draft, owner);
    return { ok: true, projectId: project.id };
  }
  return { ok: true, projectId: null };
}
