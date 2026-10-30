import { NextResponse } from 'next/server';
import { requireAuth, actsAsAdmin, isSalesAdmin } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { DEPARTMENTS_SELECT } from '@/lib/departments';
import { recordCalendarEvent } from '@/lib/calendar/recorder';
import { pickSalesOwners } from '@/lib/calendar/salesOwner';
import { addNoteLinks, stampLastMet } from '@/lib/noteLinks';
import { addNoteOwners, logNoteChanges } from '@/lib/notes/owners';
import { INCLUDE_ARCHIVED } from '@/lib/archive';
import {
  checkImportEvent, importedBody, importMark, IMPORT_MARK, UNDO_MARK, IMPORT_BATCH,
} from '@/lib/calendar/icsImport';

export const dynamic = 'force-dynamic';

/**
 * Admin > Calendar Upload (Mike 10-29). The page reads the .ics in the browser
 * and sends the kept meetings here in batches.
 *
 * GET                                                   -> staff to pick from, recent uploads
 * POST { action: 'import', importId, ownerUserId, events } -> one batch
 * POST { action: 'archive', importId }                  -> archives that upload's notes
 *
 * Past meetings become published notes dated the day they happened: no
 * follow ups, no bot drafts, no emails, no triggers. Future ones go through the
 * live sync's recorder as drafts. A note already in the app is never changed,
 * except one this page archived with Undo, which a later upload brings back.
 * Each note gets a history line naming the upload; Undo finds them by it.
 */

const fail = (message, code, status = 400) => NextResponse.json({ error: `${message} (${code})` }, { status });
const lower = s => String(s || '').trim().toLowerCase();
const DRAFT = id => `${importMark(id)} (draft)`;
const ID_OK = /^[A-Za-z0-9-]{6,40}$/;

async function guard(request) {
  const { user, error } = await requireAuth(request);
  if (error) return { error };
  if (!actsAsAdmin(user) && !isSalesAdmin(user)) {
    return { error: fail('Only an admin or a Sales Admin can upload a calendar. Nothing was saved. Ask Mike for access.', 'CAL_IMPORT_FORBIDDEN', 403) };
  }
  return { user };
}

async function recentImports() {
  const groups = await prisma.noteChange.groupBy({
    by: ['after', 'userName'],
    where: { field: 'published', after: { startsWith: `${IMPORT_MARK} ` } },
    _count: { _all: true },
    _min: { createdAt: true },
  });
  const byId = new Map();
  for (const g of groups) {
    const id = String(g.after).slice(IMPORT_MARK.length + 1).replace(/ \(draft\)$/, '');
    const row = byId.get(id) || { importId: id, by: g.userName, at: g._min.createdAt, notes: 0 };
    row.notes += g._count._all;
    if (g._min.createdAt < row.at) row.at = g._min.createdAt;
    byId.set(id, row);
  }
  const rows = [...byId.values()].sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, 10);
  for (const r of rows) {
    r.live = await prisma.note.count({
      where: { archivedAt: null, changes: { some: { field: 'published', after: { in: [importMark(r.importId), DRAFT(r.importId)] } } } },
    });
  }
  return rows;
}

export async function GET(request) {
  const { user, error } = await guard(request);
  if (error) return error;
  const staff = await prisma.user.findMany({
    where: { isActive: true, role: { not: 'CLIENT_VIEWER' } },
    select: { id: true, name: true, email: true },
    orderBy: { name: 'asc' },
  });
  return NextResponse.json({ me: user.id, staff, imports: await recentImports(), batch: IMPORT_BATCH });
}

// The last archive line on a note says whether Undo put it there.
async function undoneByUs(noteId) {
  const last = await prisma.noteChange.findFirst({
    where: { noteId, field: 'archived' }, orderBy: { createdAt: 'desc' }, select: { after: true },
  });
  return last?.after === UNDO_MARK;
}

async function nextNumber() {
  const max = await prisma.note.aggregate({ where: { noteType: 'SALES' }, _max: { noteNumber: true } });
  return (max._max.noteNumber ?? 0) + 1;
}

async function importBatch(user, { importId, ownerUserId, events }) {
  const owner = await prisma.user.findFirst({ where: { id: ownerUserId, isActive: true }, select: { id: true, email: true } });
  if (!owner) return { error: fail('The person whose calendar this is was not found. Nothing in this batch was saved. Pick them again and press Continue.', 'CAL_IMPORT_OWNER') };

  const users = await prisma.user.findMany({ where: { isActive: true }, select: { id: true, email: true, departments: DEPARTMENTS_SELECT } });
  // One read of the CRM's emails per batch, not one per meeting.
  const contactsByEmail = new Map();
  for (const c of await prisma.contact.findMany({ where: { email: { not: null } }, select: { id: true, email: true, clientId: true } })) {
    const k = lower(c.email);
    contactsByEmail.set(k, [...(contactsByEmail.get(k) || []), c]);
  }
  const contactsFor = event => (event.attendees || []).flatMap(a => contactsByEmail.get(lower(a.email)) || []);

  const refs = events.map(e => String(e?.ref || '')).filter(Boolean);
  const existing = new Map();
  for (const n of await prisma.note.findMany({
    // Archived ones too: Undo's notes come back instead of being made twice.
    where: { calendarRef: { in: refs }, ...INCLUDE_ARCHIVED },
    select: { id: true, calendarRef: true, archivedAt: true, isPublished: true },
  })) existing.set(n.calendarRef, n);

  const out = { created: 0, restored: 0, alreadyIn: 0, refused: 0, futureDrafts: 0, futureSkipped: 0, refusals: [] };
  const refuse = (item, reason) => {
    out.refused += 1;
    if (out.refusals.length < 8) out.refusals.push(`${String(item?.title || 'Untitled').slice(0, 80)}: ${reason}`);
  };
  const now = new Date();
  let number = null;

  for (const item of events) {
    const check = checkImportEvent(item);
    if (!check.ok) { refuse(item, check.reason); continue; }
    const { event, verdict } = check;
    const owners = pickSalesOwners(event, users, { mailbox: owner.email });
    if (!owners.length) owners.push(owner.id);
    const have = existing.get(event.externalId);

    // A meeting still to come: the live sync's recorder makes it a draft.
    if (event.startAt >= now) {
      if (have?.archivedAt && await undoneByUs(have.id)) {
        await prisma.note.update({ where: { id: have.id }, data: { archivedAt: null, archivedById: null } });
      }
      const r = await recordCalendarEvent(prisma, event, { ownerUserId: owners[0], ownerUserIds: owners, classification: verdict });
      if (r.status === 'created') {
        out.futureDrafts += 1;
        await logNoteChanges(prisma, r.noteId, user, [{ field: 'published', before: null, after: DRAFT(importId) }]);
      } else {
        out.futureSkipped += 1;
      }
      continue;
    }

    if (have) {
      if (have.archivedAt && await undoneByUs(have.id)) {
        await prisma.note.update({ where: { id: have.id }, data: { archivedAt: null, archivedById: null } });
        await logNoteChanges(prisma, have.id, user, [
          { field: 'archived', before: 'Archived', after: 'Kept' },
          { field: 'published', before: null, after: importMark(importId) },
        ]);
        out.restored += 1;
      } else {
        out.alreadyIn += 1;   // a person's note, or one already uploaded: hands off
      }
      continue;
    }

    const data = {
      noteType:                 'SALES',
      title:                    String(event.title || 'Meeting').slice(0, 300),
      body:                     importedBody(item, verdict),
      meetingDate:              event.startAt,
      attendees:                JSON.stringify(event.attendees || []),
      calendarRef:              event.externalId,
      activityType:             verdict.activityType,
      isInPerson:               verdict.isInPerson,
      classificationSource:     verdict.source,
      classificationConfidence: verdict.confidence,
      isPublished:              true,
      publishedAt:              event.startAt,
      createdById:              owners[0],
    };
    let note = null;
    for (let tries = 0; !note && tries < 3; tries += 1) {
      if (number == null || tries > 0) number = await nextNumber();
      try {
        note = await prisma.note.create({ data: { ...data, noteNumber: number }, select: { id: true } });
        number += 1;
      } catch (e) {
        if (e?.code !== 'P2002' || tries === 2) throw e;   // someone else took the number; read it again
      }
    }
    await addNoteOwners(prisma, note.id, owners, { source: 'calendar', addedById: user.id });
    // The people in the room, and their companies so the company pages count it too.
    const people = contactsFor(event);
    await addNoteLinks(prisma, 'contact', note.id, people.map(c => c.id));
    await addNoteLinks(prisma, 'client', note.id, people.map(c => c.clientId));
    if (verdict.isInPerson) await stampLastMet(prisma, note.id, event.startAt);   // forward only
    await logNoteChanges(prisma, note.id, user, [{ field: 'published', before: null, after: importMark(importId) }]);
    existing.set(event.externalId, { id: note.id });
    out.created += 1;
  }
  return { result: out };
}

async function archiveImport(user, importId) {
  const notes = await prisma.note.findMany({
    where: {
      archivedAt: null,
      calendarRef: { startsWith: 'ics:' },
      changes: { some: { field: 'published', after: { in: [importMark(importId), DRAFT(importId)] } } },
    },
    select: { id: true, isPublished: true, changes: { where: { field: 'published' }, select: { after: true } } },
  });
  let archived = 0;
  let kept = 0;
  for (const n of notes) {
    // A draft a person has since published is theirs now.
    const wasDraft = n.changes.some(c => c.after === DRAFT(importId));
    if (wasDraft && n.isPublished) { kept += 1; continue; }
    await prisma.note.update({ where: { id: n.id }, data: { archivedAt: new Date(), archivedById: user.id } });
    await logNoteChanges(prisma, n.id, user, [{ field: 'archived', before: 'Kept', after: UNDO_MARK }]);
    archived += 1;
  }
  return { archived, kept };
}

export async function POST(request) {
  const { user, error } = await guard(request);
  if (error) return error;
  const body = await request.json().catch(() => null);
  if (!body) return fail('The page sent nothing we could read. Nothing was saved. Reload the page and try again.', 'CAL_IMPORT_BODY');
  const importId = String(body.importId || '');
  if (!ID_OK.test(importId)) return fail('The upload had no id. Nothing was saved. Reload the page and start again.', 'CAL_IMPORT_ID');

  try {
    if (body.action === 'archive') {
      return NextResponse.json(await archiveImport(user, importId));
    }
    if (body.action === 'import') {
      const events = Array.isArray(body.events) ? body.events : [];
      if (!events.length) return fail('The batch had no meetings in it. Nothing was saved.', 'CAL_IMPORT_EMPTY');
      if (events.length > IMPORT_BATCH) return fail(`The batch had ${events.length} meetings; the most is ${IMPORT_BATCH}. Nothing was saved. Reload the page and try again.`, 'CAL_IMPORT_BIG');
      const { result, error: bad } = await importBatch(user, { importId, ownerUserId: String(body.ownerUserId || ''), events });
      return bad || NextResponse.json(result);
    }
    return fail('The page asked for something this upload does not do. Nothing was saved.', 'CAL_IMPORT_ACTION');
  } catch (e) {
    console.error('[calendar-import]', e);
    return fail('Our server stopped partway through this batch. Meetings saved before it stopped are kept, and running the upload again skips them. Press Continue.', 'CAL_IMPORT_SERVER', 500);
  }
}
