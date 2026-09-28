import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { readNote } from '@/lib/bot/extractNoteActions';
import { savePersonalFacts } from '@/lib/contacts/savePersonalFacts';
import { getActiveActionTypes } from '@/lib/noteActionTypesStore';
import { fireNoteActionConfirmed } from '@/lib/bot/noteActionRunner';
import { isWaitExecutor, waitStatus, ladderOf } from '@/lib/followUp/watch';
import { ownerIdsOf, logNoteChanges, senderFor } from '@/lib/notes/owners';
import { swapSender } from '@/lib/bot/emailStyle';

// Candidate contacts for soft-resolution: the note's linked contacts + contacts of linked clients.
async function candidateContacts(noteId) {
  const note = await prisma.note.findUnique({
    where: { id: noteId },
    include: {
      contacts: { include: { contact: { select: { id: true, name: true } } } },
      clients:  { include: { client: { include: { contacts: { select: { id: true, name: true } } } } } },
      owners:   { select: { userId: true, user: { select: { id: true, name: true } } }, orderBy: { createdAt: 'asc' } },
    },
  });
  if (!note) return { note: null, candidates: [] };
  const map = new Map();
  for (const c of note.contacts) if (c.contact) map.set(c.contact.id, c.contact);
  for (const cl of note.clients) for (const c of (cl.client?.contacts || [])) map.set(c.id, c);
  return { note, candidates: [...map.values()] };
}

// GET — list a note's actions
export async function GET(request, { params }) {
  const { error } = await requireAuth();
  if (error) return error;
  const rows = await prisma.noteAction.findMany({
    where:   { noteId: params.id },
    orderBy: [{ kind: 'asc' }, { createdAt: 'asc' }],
    include: { fulfilledByEmail: { select: { subject: true, sentAt: true } } },
  });
  // Steps that wait on them get a plain-words line: "Lee sent Seattle
  // drawings.pdf", "Watching email — reminder 1 of 3 on Oct 8".
  const types = await prisma.noteActionType.findMany({ where: { key: { in: [...new Set(rows.map(a => a.type))] } } });
  const byKey = new Map(types.map(t => [t.key, t]));
  const now = new Date();
  const actions = rows.map(a => {
    const t = byKey.get(a.type);
    return isWaitExecutor(t?.executor) ? { ...a, watch: waitStatus(a, ladderOf(t, a), now) } : a;
  });
  return NextResponse.json({ actions });
}

// POST — (re)extract actions from the note's prose. Replaces prior AI SUGGESTED
// items; keeps anything the human CONFIRMED/DISMISSED.
export async function POST(request, { params }) {
  const { error } = await requireAuth();
  if (error) return error;

  const { note, candidates } = await candidateContacts(params.id);
  if (!note) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const actionTypes = await getActiveActionTypes();
  const owners = note.owners.map(o => o.user).filter(Boolean);
  const { actions: extracted, personal } = await readNote(note, candidates, actionTypes, { owners });
  const onNote = note.contacts.map(c => c.contact).filter(Boolean);
  const facts = await savePersonalFacts(personal, { noteId: params.id, createdById: note.createdById || null, onlyContact: onNote.length === 1 ? onNote[0] : null })
    .catch(() => ({ created: 0 }));

  await prisma.$transaction([
    prisma.noteAction.deleteMany({ where: { noteId: params.id, status: 'SUGGESTED', source: 'ai' } }),
    ...extracted.map(a => prisma.noteAction.create({ data: { ...a, noteId: params.id } })),
  ]);

  const actions = await prisma.noteAction.findMany({ where: { noteId: params.id }, orderBy: [{ kind: 'asc' }, { createdAt: 'asc' }] });
  return NextResponse.json({ actions, extractedCount: extracted.length, personalCount: facts.created });
}

// PATCH — update one action (confirm/dismiss/done, change type, set contact, due date)
export async function PATCH(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const { actionId, status, type, detail, contactId, contactName, targetName, company, dueDate, reminderDays, leadUserId } = await request.json();
  if (!actionId) return NextResponse.json({ error: 'actionId required' }, { status: 400 });

  const before = await prisma.noteAction.findUnique({ where: { id: actionId } });
  if (!before || before.noteId !== params.id) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const note = await prisma.note.findUnique({
    where: { id: params.id },
    select: { createdById: true, isPublished: true, owners: { select: { userId: true, user: { select: { name: true } } } } },
  });
  const ownerIds = ownerIdsOf(note);

  const data = {};
  if (status      !== undefined) data.status      = status;
  if (type        !== undefined) data.type        = type;
  if (detail      !== undefined) data.detail      = detail || null;
  if (contactId   !== undefined) data.contactId   = contactId || null;
  if (contactName !== undefined) data.contactName = contactName || null;
  if (targetName  !== undefined) data.targetName  = targetName || null;
  if (company     !== undefined) data.company     = company || null;
  if (dueDate     !== undefined) data.dueDate     = dueDate ? new Date(dueDate) : null;
  if (reminderDays!== undefined) data.reminderDays = (reminderDays === '' || reminderDays == null) ? null : Number(reminderDays);
  if (status === 'CONFIRMED' || status === 'DISMISSED') data.source = 'manual'; // human-touched → don't re-clobber on re-extract
  // Lead (0108): one of the note's owners, or nobody (then every owner gets it).
  if (leadUserId !== undefined) {
    if (leadUserId && !ownerIds.includes(leadUserId)) return NextResponse.json({ error: 'The lead must be one of the note\'s owners.' }, { status: 400 });
    data.leadUserId = leadUserId || null;
  }
  // A new date moves the bell with it when the bell was set from the date
  // (a "by Friday" step or a Remind me), unless it already went off.
  const bellFromDate = before.type === 'REMIND_ME' || (before.remindAt && before.dueDate && +before.remindAt === +before.dueDate);
  if (dueDate !== undefined && data.dueDate && bellFromDate && before.confirmedAt && !before.remindedAt) data.remindAt = data.dueDate;

  let updated = await prisma.noteAction.update({ where: { id: actionId }, data });

  // History (0108): steps are part of the note, so their changes show there too.
  const nameOf = id => note.owners.find(o => o.userId === id)?.user?.name || null;
  const label = before.detail || before.rawText || 'step';
  const changes = [];
  if (status !== undefined && status !== before.status) changes.push({ field: 'step', before: `${label}: ${STATUS_WORD[before.status] || before.status}`, after: `${label}: ${STATUS_WORD[status] || status}` });
  if (type !== undefined && type !== before.type) changes.push({ field: 'step type', before: `${label}: ${before.type}`, after: `${label}: ${type}` });
  if ('leadUserId' in data && data.leadUserId !== before.leadUserId) changes.push({ field: 'step lead', before: `${label}: ${nameOf(before.leadUserId) || 'Everyone'}`, after: `${label}: ${nameOf(data.leadUserId) || 'Everyone'}` });
  if (dueDate !== undefined && String(data.dueDate?.toISOString().slice(0, 10) ?? '') !== String(before.dueDate?.toISOString().slice(0, 10) ?? '')) changes.push({ field: 'step due', before: before.dueDate ? `${label}: ${before.dueDate.toISOString().slice(0, 10)}` : null, after: data.dueDate ? `${label}: ${data.dueDate.toISOString().slice(0, 10)}` : null });
  if (detail !== undefined && (detail || null) !== before.detail) changes.push({ field: 'step', before: before.detail, after: detail || null });
  await logNoteChanges(prisma, params.id, user, changes);

  // A lead picked on a shared note may settle who sends the email (0108).
  if ('leadUserId' in data && updated.botDraftId) await resolvePendingSender(updated.botDraftId, params.id, ownerIds, note.createdById);

  // The bot only acts on PUBLISHED notes. In draft, confirming just records the
  // action; on publish everything runs (see executeNotePublished). For an
  // already-published note, confirming/linking executes immediately.
  if (updated.status === 'CONFIRMED' && updated.kind === 'ACTION') {
    try {
      if (note?.isPublished) {
        await fireNoteActionConfirmed(params.id, actionId);
        updated = await prisma.noteAction.findUnique({ where: { id: actionId } });
      }
    } catch (e) { console.error('[note action run] failed:', e?.message ?? e); }
  }

  return NextResponse.json({ action: updated });
}

const STATUS_WORD = { SUGGESTED: 'Suggested', CONFIRMED: 'Confirmed', DISMISSED: 'Dismissed', DONE: 'Done' };

/** Once every step behind a waiting-for-sender draft has one lead, that lead sends it. */
async function resolvePendingSender(draftId, noteId, ownerIds, createdById) {
  const draft = await prisma.botDraft.findUnique({ where: { id: draftId } });
  if (!draft?.senderPending || draft.status !== 'PENDING_REVIEW') return;
  const steps = await prisma.noteAction.findMany({ where: { noteId, botDraftId: draftId }, select: { leadUserId: true } });
  const pick = senderFor(steps, ownerIds, createdById);
  if (pick.pending || !pick.userId) return;
  const [from, to] = await Promise.all([
    draft.userId ? prisma.user.findUnique({ where: { id: draft.userId } }) : null,
    prisma.user.findUnique({ where: { id: pick.userId } }),
  ]);
  await prisma.botDraft.update({
    where: { id: draftId },
    data: { userId: pick.userId, senderPending: false, body: from && to && from.id !== to.id ? swapSender(draft.body, from, to) : draft.body },
  });
}
