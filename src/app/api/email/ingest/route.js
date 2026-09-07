import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { fromGraphMessage } from '@/lib/email/normalize';
import { recordEmailMessage } from '@/lib/email/recorder';
import { getMassEmailThreshold } from '@/lib/email/settings';

/**
 * POST /api/email/ingest — take a batch of mail and record it against people.
 *
 * This is the door the Microsoft mailbox sync will knock on. It is built and
 * tested now so that connecting Graph later is a matter of pointing a sync at
 * this route, not of writing the intelligence from scratch (Mike, 2026-09-06).
 *
 * Body:
 *   {
 *     accountId  string    the EmailAccount these came from
 *     projectId  string?   optional, when the sync already matched a project
 *     format     'graph' | 'neutral'   defaults to 'graph'
 *     messages   [ ... ]   the raw provider messages
 *   }
 *
 * Every message is saved. Mass sends, calendar invites, replies and automatic
 * messages are saved too, but marked as not counting, so they never move a
 * person's Last Email dates. "Mass" is 25 people by default and is editable on
 * Sales Automation → Rules → Exclusions; the number in force is returned as
 * `massEmailMinPeople` so a sync can log which rule it ran under.
 *
 * Admin only — this is internal mailbox data and never reaches a client viewer.
 */
export async function POST(req) {
  const { error } = await requireAdmin();
  if (error) return error;

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Body must be JSON' }, { status: 400 });
  }

  const { accountId, projectId = null, format = 'graph', messages } = body || {};

  if (!accountId) {
    return NextResponse.json({ error: 'accountId is required' }, { status: 400 });
  }
  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: 'messages must be a non-empty array' }, { status: 400 });
  }

  const account = await prisma.emailAccount.findUnique({
    where:  { id: accountId },
    select: { id: true, email: true },
  });
  if (!account) {
    return NextResponse.json({ error: 'No such email account' }, { status: 404 });
  }

  // Looked up once for the whole batch rather than per message.
  const massEmailMinPeople = await getMassEmailThreshold(prisma);

  const results = [];
  let recorded = 0;
  let counted  = 0;

  for (const raw of messages) {
    const message = format === 'neutral' ? raw : fromGraphMessage(raw, account.email);
    try {
      const result = await recordEmailMessage(prisma, message, { accountId, projectId, massEmailMinPeople });
      recorded += 1;
      if (result.counts) counted += 1;
      results.push({
        externalId: message.externalId,
        saved:      true,
        counts:     result.counts,
        reasons:    result.reasons,
        people:     result.linkedContactIds.length,
      });
    } catch (err) {
      // One bad message must not lose the rest of the batch.
      results.push({ externalId: message?.externalId ?? null, saved: false, error: err.message });
    }
  }

  return NextResponse.json({
    accountId,
    received: messages.length,
    recorded,
    counted,                                  // how many count as real contact
    skipped: recorded - counted,
    massEmailMinPeople,                       // the threshold this run used
    results,
  });
}
