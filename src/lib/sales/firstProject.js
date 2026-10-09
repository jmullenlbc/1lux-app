// Cost to first project (0129): the database side. Pure math lives in
// src/lib/sales/expenses.js; this file only gathers the rows.
//
// First win = the earliest ProjectStatusEvent with toStatus WON or COMPLETED
// on any project whose clientId is the client (either pipeline). Rows whose
// date was approximated (deal history backfill, 0069) are used only when no
// real-dated win exists, and the client is then marked approximated so the
// averages leave it out.
import { WON_STATUSES } from '@/lib/pipeline';
import { costToFirstProject, summarizeFirstProjectCosts } from './expenses';

const noteDate = n => n.meetingDate || n.createdAt;

/** Earliest win per client: { [clientId]: { at, approximated, projectId, projectName } } */
export async function firstWinByClient(prisma, clientIds) {
  const events = await prisma.projectStatusEvent.findMany({
    where:   { toStatus: { in: WON_STATUSES }, project: { clientId: { in: clientIds } } },
    select:  { changedAt: true, approximated: true, projectId: true, project: { select: { clientId: true, name: true } } },
    orderBy: { changedAt: 'asc' },
  });
  const out = {};
  for (const e of events) {
    const cid = e.project?.clientId;
    if (!cid) continue;
    const cur = out[cid];
    // A real date always beats a guessed one; among equals the earliest wins.
    if (!cur || (cur.approximated && !e.approximated)) {
      out[cid] = { at: e.changedAt, approximated: e.approximated, projectId: e.projectId, projectName: e.project.name };
    }
  }
  return out;
}

/**
 * One row per client: { clientId, clientName, ownerId, ownerName, salesUserId,
 * salesUserName, firstProjectName, ...costToFirstProject() }.
 * salesUserId = the client's owner, else whoever held the most meetings before the win.
 */
export async function firstProjectCostRows(prisma, { clientIds = null } = {}) {
  const clients = await prisma.client.findMany({
    where:  clientIds ? { id: { in: clientIds } } : {},
    select: { id: true, name: true, ownerId: true, owner: { select: { id: true, name: true } } },
    orderBy: { name: 'asc' },
  });
  const ids = clients.map(c => c.id);
  if (!ids.length) return [];

  const [wins, links, expenses] = await Promise.all([
    firstWinByClient(prisma, ids),
    prisma.noteClient.findMany({
      where:  { clientId: { in: ids }, note: { noteType: 'SALES', isPublished: true, archivedAt: null } },
      select: { clientId: true, note: { select: { meetingDate: true, createdAt: true, isInPerson: true, createdById: true, createdBy: { select: { name: true } } } } },
    }),
    prisma.salesExpense.findMany({
      where:  { OR: [{ clientId: { in: ids } }, { clientId: null, note: { clients: { some: { clientId: { in: ids } } } } }] },
      select: { clientId: true, spentOn: true, amountCents: true, note: { select: { clients: { select: { clientId: true } } } } },
    }),
  ]);

  const notesBy = {}, expBy = {};
  for (const l of links) (notesBy[l.clientId] ||= []).push({ date: noteDate(l.note), isInPerson: l.note.isInPerson, userId: l.note.createdById, userName: l.note.createdBy?.name });
  for (const e of expenses) {
    // An expense pinned to a company counts there only; one that rides on a
    // note is split evenly across the note's companies (Mike 10-9: a golf
    // league with 20 clients is not 20 full rounds). Placeholder until the
    // expense data source is settled.
    const targets = e.clientId ? [e.clientId] : (e.note?.clients || []).map(c => c.clientId);
    const share = targets.length ? Math.round(e.amountCents / targets.length) : 0;
    for (const cid of targets) if (ids.includes(cid)) (expBy[cid] ||= []).push({ spentOn: e.spentOn, amountCents: share });
  }

  return clients.map(c => {
    const win = wins[c.id] || null;
    const notes = notesBy[c.id] || [];
    const row = costToFirstProject({ notes, expenses: expBy[c.id] || [], firstWinAt: win?.at || null, approximated: win?.approximated });
    let salesUserId = c.ownerId || null, salesUserName = c.owner?.name || null;
    if (!salesUserId) {
      const tally = {};
      for (const n of notes) if (n.userId && (!win || new Date(n.date) <= win.at)) tally[n.userId] = { n: (tally[n.userId]?.n || 0) + 1, name: n.userName };
      const top = Object.entries(tally).sort((a, b) => b[1].n - a[1].n)[0];
      if (top) { salesUserId = top[0]; salesUserName = top[1].name; }
    }
    return {
      clientId: c.id, clientName: c.name,
      ownerId: c.ownerId || null, ownerName: c.owner?.name || null,
      salesUserId, salesUserName,
      firstProjectId: win?.projectId || null, firstProjectName: win?.projectName || null,
      ...row,
    };
  });
}

/** Everything the Activity page shows: rows, team summary, one summary per salesperson. */
export async function firstProjectCostReport(prisma) {
  const rows = await firstProjectCostRows(prisma);
  const byUser = {};
  for (const r of rows) {
    if (!r.salesUserId) continue;
    (byUser[r.salesUserId] ||= { userId: r.salesUserId, userName: r.salesUserName || r.salesUserId, rows: [] }).rows.push(r);
  }
  const perUser = Object.values(byUser)
    .map(u => ({ userId: u.userId, userName: u.userName, ...summarizeFirstProjectCosts(u.rows) }))
    .sort((a, b) => b.wonClients - a.wonClients || a.userName.localeCompare(b.userName));
  return { rows, summary: summarizeFirstProjectCosts(rows), perUser };
}
