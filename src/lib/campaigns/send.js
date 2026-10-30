// Sending a campaign (0147). Press Send once: prepareSends locks the campaign,
// checks everything and makes one QUEUED row per person. Then the browser
// calls sendBatch over and over (about 50 at a time, under the 30 second
// server wall) until nothing is left.
import { prisma } from '@/lib/db';
import { newToken } from '@/lib/salesDocs/share';
import { docShareProblem, spaceShareProblem } from '@/lib/salesDocs/shareCheck';
import { resolveAudience, suppressedSet } from './audience';
import { renderEmail, getFooterAddress, NO_ADDRESS, isWebUrl } from './render';
import { senderStatus, sendOne } from './sender';

export const BATCH_SIZE = 50;
const BATCH_BUDGET_MS = 20000;

export const BLOCK_INCLUDE = {
  salesDoc: { select: { id: true, title: true } },
  space: { select: { id: true, name: true } },
};

export async function activeBlocks(campaignId) {
  return prisma.campaignBlock.findMany({ where: { campaignId, archivedAt: null }, orderBy: { sortOrder: 'asc' }, include: BLOCK_INCLUDE });
}

/** Everything that would stop a send, as plain sentences. Empty = good to go. */
export async function sendProblems(campaign, blocks) {
  const problems = [];
  const s = senderStatus();
  if (!s.ready) problems.push(s.message);
  if (!(await getFooterAddress())) problems.push(NO_ADDRESS);
  if (!String(campaign.subject || '').trim()) problems.push('Add a subject line.');
  if (!campaign.listId) problems.push('Pick who gets it (a list).');
  const useful = blocks.filter((b) => ['HEADING', 'TEXT'].includes(b.kind) ? String(b.text || '').trim()
    : ['BUTTON', 'IMAGE'].includes(b.kind) ? isWebUrl(b.url) : (b.salesDocId || b.spaceId));
  if (!useful.length) problems.push('Add something to the email body.');
  for (const b of blocks) {
    if (b.kind === 'BUTTON' && !isWebUrl(b.url)) problems.push('A button needs a web address that starts with https://.');
    if (b.kind === 'DOC' && !b.salesDocId) problems.push('A document card has no document picked.');
    if (b.kind === 'FOLDER' && !b.spaceId) problems.push('A folder card has no Folder picked.');
    const p = b.kind === 'DOC' && b.salesDocId ? await docShareProblem(b.salesDocId)
      : b.kind === 'FOLDER' && b.spaceId ? await spaceShareProblem(b.spaceId) : null;
    if (p) problems.push(p.message);
  }
  return [...new Set(problems)];
}

/**
 * Locks a DRAFT campaign into SENDING and queues one row per person.
 * Returns { error, status } or { queued, skipped }.
 */
export async function prepareSends(campaignId, user) {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign || campaign.archivedAt) return { error: 'That campaign was not found, or it was archived. Nothing was sent. (CAMPAIGN_NOT_FOUND)', status: 404 };
  if (campaign.status !== 'DRAFT') return { error: 'This campaign was already sent. Make a copy to send it again. (CAMPAIGN_NOT_DRAFT)', status: 409 };
  const blocks = await activeBlocks(campaignId);
  const problems = await sendProblems(campaign, blocks);
  if (problems.length) return { error: `${problems.join(' ')} Nothing was sent.`, problems, status: 400 };
  const { recipients, skipped } = await resolveAudience(campaign.listId);
  if (!recipients.length) return { error: 'Nobody on that list can be emailed (no email address, or on the do-not-email list). Nothing was sent. (CAMPAIGN_EMPTY_LIST)', status: 400 };

  // Only one press wins, even if Send is clicked twice.
  const locked = await prisma.campaign.updateMany({
    where: { id: campaignId, status: 'DRAFT' },
    data: { status: 'SENDING', sentById: user.id, sendStartedAt: new Date() },
  });
  if (!locked.count) return { error: 'This campaign is already sending. (CAMPAIGN_NOT_DRAFT)', status: 409 };

  const row = (r, extra) => ({ campaignId, contactId: r.contactId, email: r.email, name: r.name, token: newToken(), ...extra });
  await prisma.campaignSend.createMany({
    data: [
      ...recipients.map((r) => row(r, { status: 'QUEUED' })),
      ...skipped.map((r) => row(r, { status: 'SKIPPED', skipReason: r.reason })),
    ],
  });
  return { queued: recipients.length, skipped: skipped.length };
}

/** One person's tracked links, made once and reused on a retry. */
async function linksFor(send, blocks, campaign) {
  const existing = await prisma.salesDocLink.findMany({ where: { campaignSendId: send.id }, select: { token: true, docId: true, spaceId: true } });
  const map = new Map(existing.map((l) => [l.docId || l.spaceId, l.token]));
  for (const b of blocks) {
    const key = b.kind === 'DOC' ? b.salesDocId : b.kind === 'FOLDER' ? b.spaceId : null;
    if (!key || map.has(key)) continue;
    const link = await prisma.salesDocLink.create({
      data: {
        token: newToken(),
        name: `${campaign.name}: ${send.email}`.slice(0, 200),
        docId: b.kind === 'DOC' ? key : null,
        spaceId: b.kind === 'FOLDER' ? key : null,
        createdById: campaign.sentById,
        recipientEmail: send.email,
        requireEmail: false,
        notifyOnFirstOpen: false,
        allowDownload: false,
        campaignSendId: send.id,
      },
      select: { token: true },
    });
    map.set(key, link.token);
  }
  return map;
}

/** Sends the next batch. Returns { sent, failed, skipped, remaining, done }. */
export async function sendBatch(campaignId, baseUrl, { max = BATCH_SIZE, budgetMs = BATCH_BUDGET_MS } = {}) {
  const started = Date.now();
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) return { error: 'That campaign was not found. (CAMPAIGN_NOT_FOUND)', status: 404 };
  if (campaign.status === 'SENT') return { sent: 0, failed: 0, skipped: 0, remaining: 0, done: true };
  if (campaign.status !== 'SENDING') return { error: 'Press Send first. (CAMPAIGN_NOT_SENDING)', status: 409 };
  const s = senderStatus();
  if (!s.ready) return { error: s.message, status: 503 };
  const address = await getFooterAddress();
  if (!address) return { error: NO_ADDRESS, status: 400 };
  const blocks = await activeBlocks(campaignId);

  const queue = await prisma.campaignSend.findMany({ where: { campaignId, status: 'QUEUED' }, orderBy: { createdAt: 'asc' }, take: max });
  // Someone may have unsubscribed since Send was pressed.
  const blocked = await suppressedSet(queue.map((q) => q.email));
  let sent = 0, failed = 0, skipped = 0;
  for (const q of queue) {
    if (Date.now() - started > budgetMs) break;
    if (blocked.has(q.email)) {
      await prisma.campaignSend.update({ where: { id: q.id }, data: { status: 'SKIPPED', skipReason: 'SUPPRESSED' } });
      skipped += 1;
      continue;
    }
    try {
      // Document cards click through to these (see /api/e/c).
      await linksFor(q, blocks, campaign);
      const contact = q.contactId ? await prisma.contact.findUnique({ where: { id: q.contactId }, select: { preferredName: true, firstName: true } }) : null;
      const email = renderEmail({
        campaign, blocks, baseUrl,
        person: { token: q.token, email: q.email, firstName: contact?.preferredName || contact?.firstName || null },
        address,
      });
      const res = await sendOne({ to: q.email, ...email });
      await prisma.campaignSend.update({ where: { id: q.id }, data: { status: 'SENT', sentAt: new Date(), providerMessageId: res.providerMessageId, error: null } });
      sent += 1;
    } catch (e) {
      await prisma.campaignSend.update({ where: { id: q.id }, data: { status: 'FAILED', error: String(e?.message || e).slice(0, 500) } });
      failed += 1;
    }
  }
  const remaining = await prisma.campaignSend.count({ where: { campaignId, status: 'QUEUED' } });
  if (!remaining) await prisma.campaign.updateMany({ where: { id: campaignId, status: 'SENDING' }, data: { status: 'SENT', sentAt: new Date() } });
  return { sent, failed, skipped, remaining, done: !remaining };
}
