/**
 * Turning a synced calendar event into a draft sales note.
 *
 * Why a note at all: publishing a note is what starts everything else. Publish →
 * the AI pulls out the action items → the bot writes the drafts and sets the
 * reminders → the people who were there get their Last In Person date moved. A
 * meeting that never becomes a note reaches none of that.
 *
 * So the sync's job is to have the note already sitting there, filled in, the
 * morning after the meeting — with the type and the in-person answer already
 * worked out from the title and the location. Mike writes what was said and hits
 * Publish. Nothing is published automatically; that stays his call.
 *
 * Three promises this file keeps:
 *
 *  - Running the same sync twice is safe. The note is keyed on the event's own
 *    id (Note.calendarRef), so a re-sync updates the note it already made.
 *
 *  - It never touches a note that is yours. Once a note is published, or once
 *    anyone has set its type by hand, the sync leaves it completely alone.
 *
 *  - It does not make notes for meetings that are not worth one. An internal
 *    standup classifies as SKIP and no note appears.
 */
import { classifyEvent } from '@/lib/bot/activityClassifier';

/** The note body the sync writes, so an empty draft still says something. */
function draftBody(event, classification) {
  const lines = [];
  const when = event.startAt instanceof Date
    ? event.startAt.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
    : null;

  lines.push('Pulled in from your calendar. Add what was said, then publish.');
  lines.push('');
  if (when)           lines.push(`When: ${when}`);
  if (event.location) lines.push(`Where: ${event.location}`);

  const guests = (event.attendees || []).map(a => a.name || a.email).filter(Boolean);
  if (guests.length) lines.push(`Who: ${guests.join(', ')}`);

  if (classification?.reason) {
    lines.push('');
    lines.push(`Read as ${classification.isInPerson ? 'in person' : 'not in person'} because ${classification.reason}.`);
  }
  return lines.join('\n');
}

async function nextNoteNumber(prisma) {
  const max = await prisma.note.aggregate({ where: { noteType: 'SALES' }, _max: { noteNumber: true } });
  return (max._max.noteNumber ?? 0) + 1;
}

/**
 * Match the guest list to people we already know.
 *
 * Compared in JS rather than in the query because Prisma's case-insensitive
 * matching is Postgres-only and this codebase also runs on SQLite locally.
 */
export async function matchAttendeesToContacts(prisma, event) {
  const addresses = [...new Set(
    (event.attendees || []).map(a => String(a.email || '').trim().toLowerCase()).filter(Boolean),
  )];
  if (addresses.length === 0) return [];

  const known = await prisma.contact.findMany({
    where:  { email: { not: null } },
    select: { id: true, email: true },
  });

  return known
    .filter(c => addresses.includes(String(c.email).trim().toLowerCase()))
    .map(c => c.id);
}

/**
 * Record one neutral calendar event as a draft sales note.
 *
 * @returns {
 *   noteId:           string | null
 *   status:           'created' | 'updated' | 'left alone' | 'skipped'
 *   reason:           string        — plain English, safe to show or log
 *   activityType:     string | null
 *   isInPerson:       boolean
 *   linkedContactIds: string[]
 * }
 */
export async function recordCalendarEvent(
  prisma,
  event,
  { ownerUserId = null, classification = null, projectId = null } = {},
) {
  const calendarRef = event?.externalId || event?.iCalUid || null;
  if (!calendarRef) {
    return { noteId: null, status: 'skipped', reason: 'the event had no id to key a note on',
             activityType: null, isInPerson: false, linkedContactIds: [] };
  }

  const existing = await prisma.note.findFirst({
    where:  { calendarRef },
    select: { id: true, isPublished: true, classificationSource: true },
  });

  // Hands off anything a human has taken over.
  if (existing && (existing.isPublished || existing.classificationSource === 'manual')) {
    return {
      noteId: existing.id, status: 'left alone',
      reason: existing.isPublished ? 'the note is already published' : 'the type was set by hand',
      activityType: null, isInPerson: false, linkedContactIds: [],
    };
  }

  // A cancelled meeting did not happen. Say so on the draft; never delete.
  if (event.isCancelled) {
    if (!existing) {
      return { noteId: null, status: 'skipped', reason: 'the meeting was cancelled',
               activityType: null, isInPerson: false, linkedContactIds: [] };
    }
    await prisma.note.update({
      where: { id: existing.id },
      data:  { title: `Cancelled — ${event.title || 'meeting'}`.slice(0, 300), isInPerson: false },
    });
    return { noteId: existing.id, status: 'updated', reason: 'the meeting was cancelled',
             activityType: null, isInPerson: false, linkedContactIds: [] };
  }

  const verdict = classification ?? await classifyEvent(event);

  // Nothing worth a note — an internal standup, or a meeting nothing could read.
  if (!verdict?.activityType) {
    return {
      noteId: existing?.id ?? null,
      status: existing ? 'left alone' : 'skipped',
      reason: verdict?.reason || 'nothing in the title or the location said this was worth a note',
      activityType: null, isInPerson: false, linkedContactIds: [],
    };
  }

  const fields = {
    noteType:                 'SALES',
    title:                    String(event.title || 'Meeting').slice(0, 300),
    meetingDate:              event.startAt ?? null,
    attendees:                JSON.stringify(event.attendees || []),
    calendarRef,
    activityType:             verdict.activityType,
    isInPerson:               Boolean(verdict.isInPerson),
    classificationSource:     verdict.source || 'keyword',
    classificationConfidence: verdict.confidence ?? null,
  };

  let noteId;
  let status;
  if (existing) {
    await prisma.note.update({ where: { id: existing.id }, data: fields });
    noteId = existing.id;
    status = 'updated';
  } else {
    const created = await prisma.note.create({
      data: {
        ...fields,
        noteNumber:  await nextNoteNumber(prisma),
        body:        draftBody(event, verdict),
        isPublished: false,               // publishing stays a person's decision
        createdById: ownerUserId,
        projectId,
      },
      select: { id: true },
    });
    noteId = created.id;
    status = 'created';
  }

  // Put the people who were in the room on the note.
  const linkedContactIds = await matchAttendeesToContacts(prisma, event);
  if (linkedContactIds.length) {
    await prisma.noteContact.createMany({
      data: linkedContactIds.map(contactId => ({ noteId, contactId })),
      skipDuplicates: true,
    });
  }

  // Deliberately NOT touching anyone's Last In Person date here. That happens on
  // publish, in the note's own PATCH route — an invite on a calendar is not proof
  // the meeting happened.
  return {
    noteId, status,
    reason:       verdict.reason || 'read from the title and the location',
    activityType: verdict.activityType,
    isInPerson:   Boolean(verdict.isInPerson),
    linkedContactIds,
  };
}
