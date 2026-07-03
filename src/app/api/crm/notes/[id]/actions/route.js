import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { extractNoteActions } from '@/lib/bot/extractNoteActions';
import { getActiveActionTypes } from '@/lib/noteActionTypesStore';
import { fireNoteActionConfirmed } from '@/lib/bot/noteActionRunner';

// Candidate contacts for soft-resolution: the note's linked contacts + contacts of linked clients.
async function candidateContacts(noteId) {
  const note = await prisma.note.findUnique({
    where: { id: noteId },
    include: {
      contacts: { include: { contact: { select: { id: true, name: true } } } },
      clients:  { include: { client: { include: { contacts: { select: { id: true, name: true } } } } } },
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
  const actions = await prisma.noteAction.findMany({
    where:   { noteId: params.id },
    orderBy: [{ kind: 'asc' }, { createdAt: 'asc' }],
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
  const extracted = await extractNoteActions(note, candidates, actionTypes);

  await prisma.$transaction([
    prisma.noteAction.deleteMany({ where: { noteId: params.id, status: 'SUGGESTED', source: 'ai' } }),
    ...extracted.map(a => prisma.noteAction.create({ data: { ...a, noteId: params.id } })),
  ]);

  const actions = await prisma.noteAction.findMany({ where: { noteId: params.id }, orderBy: [{ kind: 'asc' }, { createdAt: 'asc' }] });
  return NextResponse.json({ actions, extractedCount: extracted.length });
}

// PATCH — update one action (confirm/dismiss/done, change type, set contact, due date)
export async function PATCH(request, { params }) {
  const { error } = await requireAuth();
  if (error) return error;

  const { actionId, status, type, detail, contactId, contactName, targetName, company, dueDate, reminderDays } = await request.json();
  if (!actionId) return NextResponse.json({ error: 'actionId required' }, { status: 400 });

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

  let updated = await prisma.noteAction.update({ where: { id: actionId }, data });

  // The bot only acts on PUBLISHED notes. In draft, confirming just records the
  // action; on publish everything runs (see executeNotePublished). For an
  // already-published note, confirming/linking executes immediately.
  if (updated.status === 'CONFIRMED' && updated.kind === 'ACTION') {
    try {
      const note = await prisma.note.findUnique({ where: { id: params.id }, select: { isPublished: true } });
      if (note?.isPublished) {
        await fireNoteActionConfirmed(params.id, actionId);
        updated = await prisma.noteAction.findUnique({ where: { id: actionId } });
      }
    } catch (e) { console.error('[note action run] failed:', e?.message ?? e); }
  }

  return NextResponse.json({ action: updated });
}
