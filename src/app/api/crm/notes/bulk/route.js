import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { addNoteLinks, stampLastMet, NOTE_CONTACTS_INCLUDE } from '@/lib/noteLinks';
import { archiveData } from '@/lib/archive';
import { extractActionsOnPublish } from '@/lib/notes/publishActions';
import { executeNotePublished, pauseNoteOnUnpublish } from '@/lib/bot/noteActionRunner';
import { isInPersonType } from '@/lib/calendar/inPerson';
import { addNoteOwners, logNoteChanges } from '@/lib/notes/owners';

// POST /api/crm/notes/bulk (Mike 10-6: "mass edit or archive sales notes").
// One request, many notes. Every change is the same one the single-note route
// makes, applied note by note so history, the bot pause on archive and the
// publish actions all behave exactly as they do one at a time.
//
//   { ids: [...],
//     archived?: true | false,      archive or restore
//     publish?:  true | false,      publish or back to draft
//     activityType?: 'CALL' ...,    set the meeting type
//     addOwnerIds?: [...],          add owners (never removes)
//     addClientIds?: [...],         link companies
//     addProjectIds?: [...] }       link projects
//
// Returns { updated: [notes...], failed: [{ id, error }] }.

const NOTE_INCLUDE = {
  createdBy: { select: { id: true, name: true } },
  owners: { select: { userId: true, user: { select: { id: true, name: true } } }, orderBy: { createdAt: 'asc' } },
  clients: { include: { client: { select: { id: true, clientNumber: true, name: true, type: true } } }, orderBy: { createdAt: 'asc' } },
  projects: {
    include: { project: { select: { id: true, projectNumber: true, name: true, serviceType: true, procurementStage: true, designStage: true, procurementStatus: true, designStatus: true } } },
    orderBy: { createdAt: 'asc' },
  },
  contacts: NOTE_CONTACTS_INCLUDE,
};

const MAX_IDS = 200;
const strList = v => (Array.isArray(v) ? [...new Set(v.filter(x => typeof x === 'string' && x))] : []);

export async function POST(request) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const body = await request.json().catch(() => null);
  const ids = strList(body?.ids);
  if (!ids.length) return NextResponse.json({ error: 'Pick at least one note.' }, { status: 400 });
  if (ids.length > MAX_IDS) return NextResponse.json({ error: `Pick ${MAX_IDS} notes or fewer at a time.` }, { status: 400 });

  const archived     = typeof body.archived === 'boolean' ? body.archived : null;
  const publish      = typeof body.publish  === 'boolean' ? body.publish  : null;
  const activityType = typeof body.activityType === 'string' && body.activityType ? body.activityType : null;
  const addClientIds  = strList(body.addClientIds);
  const addProjectIds = strList(body.addProjectIds);

  let addOwnerIds = strList(body.addOwnerIds);
  if (addOwnerIds.length) {
    const real = await prisma.user.findMany({ where: { id: { in: addOwnerIds }, role: { not: 'CLIENT_VIEWER' } }, select: { id: true } });
    addOwnerIds = addOwnerIds.filter(id => real.some(u => u.id === id));
  }

  if (archived === null && publish === null && !activityType && !addOwnerIds.length && !addClientIds.length && !addProjectIds.length) {
    return NextResponse.json({ error: 'Nothing to change.' }, { status: 400 });
  }

  const notes = await prisma.note.findMany({ where: { id: { in: ids } }, select: { id: true, isPublished: true, isInPerson: true, meetingDate: true, activityType: true } });
  const updated = [], failed = [];

  for (const note of notes) {
    try {
      const data = {};
      const changes = [];

      if (activityType && activityType !== note.activityType) {
        data.activityType = activityType;
        data.isInPerson   = isInPersonType(activityType);
        data.classificationSource     = 'manual';
        data.classificationConfidence = 100;
        changes.push({ field: 'activityType', before: note.activityType, after: activityType });
      }
      const publishing   = publish === true  && !note.isPublished;
      const unpublishing = publish === false &&  note.isPublished;
      if (publishing)   { data.isPublished = true;  data.publishedAt = new Date(); changes.push({ field: 'published', before: 'Draft', after: 'Published' }); }
      if (unpublishing) { data.isPublished = false; data.publishedAt = null;       changes.push({ field: 'published', before: 'Published', after: 'Draft' }); }
      if (archived !== null) {
        Object.assign(data, archiveData(archived, user));
        changes.push({ field: 'archived', before: archived ? 'Kept' : 'Archived', after: archived ? 'Archived' : 'Kept' });
      }

      await prisma.$transaction(async (tx) => {
        if (Object.keys(data).length) await tx.note.update({ where: { id: note.id }, data });
        await addNoteLinks(tx, 'client',  note.id, addClientIds);
        await addNoteLinks(tx, 'project', note.id, addProjectIds);
      });

      if (addOwnerIds.length) {
        const added = await addNoteOwners(prisma, note.id, addOwnerIds, { source: 'manual', addedById: user.id });
        for (const n of await namesOf('user', added)) changes.push({ field: 'owner', after: n });
      }
      for (const n of await namesOf('client',  addClientIds))  changes.push({ field: 'company', after: n });
      for (const n of await namesOf('project', addProjectIds)) changes.push({ field: 'project', after: n });
      await logNoteChanges(prisma, note.id, user, changes);

      if (publishing) {
        const inPerson = data.isInPerson ?? note.isInPerson;
        if (inPerson) {
          try { await stampLastMet(prisma, note.id, note.meetingDate); }
          catch (e) { console.error('[notes bulk publish] last-met update failed:', e?.message ?? e); }
        }
        try { await extractActionsOnPublish(note.id); }
        catch (e) { console.error('[notes bulk publish] action extraction failed:', e?.message ?? e); }
        try { await executeNotePublished(note.id); }
        catch (e) { console.error('[notes bulk publish] execution failed:', e?.message ?? e); }
      }
      if (unpublishing || archived === true) {
        await pauseNoteOnUnpublish(note.id).catch(() => {});
      }

      updated.push(await prisma.note.findUnique({ where: { id: note.id }, include: NOTE_INCLUDE }));
    } catch (err) {
      console.error('[POST /api/crm/notes/bulk] note failed:', note.id, err?.message ?? err);
      failed.push({ id: note.id, error: err?.message || 'Database error' });
    }
  }
  for (const id of ids) if (!notes.some(n => n.id === id)) failed.push({ id, error: 'Not found' });

  return NextResponse.json({ updated, failed });
}

async function namesOf(model, ids) {
  if (!ids?.length) return [];
  return (await prisma[model].findMany({ where: { id: { in: ids } }, select: { name: true } })).map(r => r.name);
}
