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
 *    anyone has set its type by hand, the sync leaves its words alone. The one
 *    exception: a draft whose invite is later declined or cancelled is
 *    archived (Mike 9-25), and comes back if the invite is accepted again.
 *
 *  - It does not make notes for meetings that are not worth one. An internal
 *    standup classifies as SKIP and no note appears.
 */
// Relative imports, and the AI classifier loaded only when needed, so the
// tests can run this file with a fake database.
import { notAcceptedReason } from './worthANote.js';
import { linkMatchesEvent } from './salesOwner.js';
import { addNoteOwners } from '../notes/owners.js';
import { addNoteLinks } from '../noteLinks.js';

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
 * A hand-made note whose calendar link is this event (Mike 9-25: "connect it to
 * a calendar link"). The note keeps its title, body and type; the sync adds the
 * event id, and the date, guests and owner only where they are blank.
 */
async function adoptLinkedNote(prisma, event, calendarRef, ownerUserId, ownerUserIds) {
  const candidates = await prisma.note.findMany({
    where:  { noteType: 'SALES', calendarRef: null, meetingLink: { not: null } },
    select: { id: true, meetingLink: true, meetingDate: true, attendees: true, createdById: true, activityType: true, isInPerson: true },
  });
  const note = candidates.find(n => linkMatchesEvent(n.meetingLink, event));
  if (!note) return null;

  const data = { calendarRef };
  if (!note.meetingDate && event.startAt) data.meetingDate = event.startAt;
  if ((!note.attendees || note.attendees === '[]') && event.attendees?.length) data.attendees = JSON.stringify(event.attendees);
  if (!note.createdById && ownerUserId) data.createdById = ownerUserId;
  await prisma.note.update({ where: { id: note.id }, data });
  // The salespeople on the invite join whoever wrote it as owners (0108).
  await addNoteOwners(prisma, note.id, [note.createdById || ownerUserId, ...ownerUserIds].filter(Boolean), { source: 'calendar' });

  const linkedContactIds = await matchAttendeesToContacts(prisma, event);
  await addNoteLinks(prisma, 'contact', note.id, linkedContactIds);
  return { noteId: note.id, status: 'linked', reason: "a note already had this meeting's calendar link",
           activityType: note.activityType, isInPerson: note.isInPerson, linkedContactIds };
}

/**
 * Record one neutral calendar event as a draft sales note.
 *
 * @returns {
 *   noteId:           string | null
 *   status:           'created' | 'updated' | 'linked' | 'archived' | 'left alone' | 'skipped'
 *   reason:           string        — plain English, safe to show or log
 *   activityType:     string | null
 *   isInPerson:       boolean
 *   linkedContactIds: string[]
 * }
 */
export async function recordCalendarEvent(
  prisma,
  event,
  { ownerUserId = null, ownerUserIds = null, classification = null, projectId = null } = {},
) {
  // Every salesperson on the invite owns the note (0108); the first is its creator.
  const owners = [...new Set([ownerUserId, ...(ownerUserIds || [])].filter(Boolean))];
  const calendarRef = event?.externalId || event?.iCalUid || null;
  if (!calendarRef) {
    return { noteId: null, status: 'skipped', reason: 'the event had no id to key a note on',
             activityType: null, isInPerson: false, linkedContactIds: [] };
  }

  // An invite THEY sent closes an "expect an invite" step — whether or not it
  // has been accepted yet; receiving it is the thing we were waiting for.
  if (prisma.noteAction && !event.isCancelled) {
    try {
      const { matchEventToWaits } = await import('../followUp/engine.js');
      await matchEventToWaits(prisma, event);
    } catch (err) {
      console.error('[calendar] follow-up match failed:', err?.message || err);
    }
  }

  // A guest we do not know, invited alongside someone we do (0118). Never
  // fails the recording.
  if (prisma.introduction && !event.isCancelled && event.attendees?.length) {
    try {
      const { recordIntroductionsForAddresses } = await import('../sync/introductions.js');
      const guests = [
        ...(event.organizerEmail ? [{ email: event.organizerEmail, name: null }] : []),
        ...event.attendees,
      ];
      await recordIntroductionsForAddresses(prisma, guests, {
        kind: 'calendar', sourceCalendarRef: calendarRef, detectedAt: event.startAt || undefined, introducedByUserId: ownerUserId,
      });
    } catch (err) {
      console.error('[calendar] introduction detection failed:', err?.message || err);
    }
  }

  // findFirst sees archived notes too, so a meeting re-accepted after a decline
  // finds the draft it archived.
  let existing = await prisma.note.findFirst({
    where:  { calendarRef },
    select: { id: true, isPublished: true, classificationSource: true, archivedAt: true, archivedById: true, createdById: true },
  });

  const gone = event.isCancelled ? 'the meeting was cancelled' : notAcceptedReason(event);

  // A note someone typed by hand with this event's calendar link: join it to the
  // event, fill only what is blank, never touch the words.
  if (!existing && !gone) {
    const adopted = await adoptLinkedNote(prisma, event, calendarRef, ownerUserId, owners);
    if (adopted) return adopted;
  }

  // Published notes are the person's record of what happened. Hands off.
  if (existing?.isPublished) {
    return { noteId: existing.id, status: 'left alone', reason: 'the note is already published',
             activityType: null, isInPerson: false, linkedContactIds: [] };
  }

  // Cancelled, declined, never answered or tentative (Maram 9-17: accepted
  // invites only). A draft that already exists is archived — Mike 9-25: "a
  // declined one after accepted should remove it too". Archived, not deleted,
  // with no archivedById, so a later accept can bring it back.
  if (gone) {
    if (!existing) {
      return { noteId: null, status: 'skipped', reason: gone,
               activityType: null, isInPerson: false, linkedContactIds: [] };
    }
    if (!existing.archivedAt) {
      await prisma.note.update({ where: { id: existing.id }, data: { archivedAt: new Date(), archivedById: null } });
    }
    return { noteId: existing.id, status: 'archived', reason: gone,
             activityType: null, isInPerson: false, linkedContactIds: [] };
  }

  // Accepted again. Only the sync's own archive is undone; a person's stays.
  if (existing?.archivedAt) {
    if (existing.archivedById) {
      return { noteId: existing.id, status: 'left alone', reason: 'someone archived this note',
               activityType: null, isInPerson: false, linkedContactIds: [] };
    }
    await prisma.note.update({ where: { id: existing.id }, data: { archivedAt: null } });
  }

  // The owner is the salesperson on the invite; fill it on a draft that had none.
  if (existing && !existing.createdById && ownerUserId) {
    await prisma.note.update({ where: { id: existing.id }, data: { createdById: ownerUserId } });
  }
  // Owners only where there are none yet: a later sync never re-adds somebody
  // a person took off the note.
  if (existing && owners.length && !(await prisma.noteOwner.count({ where: { noteId: existing.id } }))) {
    await addNoteOwners(prisma, existing.id, owners, { source: 'calendar' });
  }

  if (existing?.classificationSource === 'manual') {
    return { noteId: existing.id, status: 'left alone', reason: 'the type was set by hand',
             activityType: null, isInPerson: false, linkedContactIds: [] };
  }

  const verdict = classification ?? await (await import('@/lib/bot/activityClassifier')).classifyEvent(event);

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
    await addNoteOwners(prisma, noteId, owners, { source: 'calendar' });
  }

  // Put the people who were in the room on the note.
  const linkedContactIds = await matchAttendeesToContacts(prisma, event);
  await addNoteLinks(prisma, 'contact', noteId, linkedContactIds);

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
