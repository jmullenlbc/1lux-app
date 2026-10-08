import { prisma } from '@/lib/db';
import { CLIENT_TYPES } from '@/lib/utils';
import { attachSignalToClient } from './tags';
import { recordMatchFeedback } from './fuzzy-matcher';

/**
 * "Add to CRM" on an article or permit (Mike 10-7): a company the feed named
 * becomes a Client, and the signal links to it as a confirmed match.
 *
 * The tag's role picks the client type. A name that already exists in the
 * CRM (case-insensitive) is reused, never duplicated. The city and state
 * come from the signal's own METRO and STATE tags.
 */
const ROLE_TO_TYPE = {
  DEVELOPER: 'developer',
  GC:        'generalContractor',
  ARCHITECT: 'architect',
  ENGINEER:  'electricalEngineer',
};

export async function addCompanyTagToCrm({ signalId, tagId, userId }) {
  const signal = await prisma.marketSignal.findUnique({
    where:   { id: signalId },
    include: { tags: { include: { tag: true } } },
  });
  if (!signal) throw Object.assign(new Error('Signal not found'), { status: 404 });

  const link = signal.tags.find(t => t.tag.id === tagId && t.tag.kind === 'COMPANY');
  if (!link) throw Object.assign(new Error('That company tag is not on this signal'), { status: 400 });
  const tag = link.tag;

  let client = tag.clientId ? await prisma.client.findUnique({ where: { id: tag.clientId }, select: { id: true, name: true } }) : null;
  let created = false;
  if (!client) {
    client = await prisma.client.findFirst({ where: { name: { equals: tag.name, mode: 'insensitive' } }, select: { id: true, name: true } });
  }
  if (!client) {
    const metro = signal.tags.find(t => t.tag.kind === 'METRO')?.tag.name || '';
    const state = signal.tags.find(t => t.tag.kind === 'STATE')?.tag.name || (metro.split(',')[1] || '').trim() || null;
    const city  = metro.split(',')[0]?.trim() || null;
    const type  = ROLE_TO_TYPE[link.role] || 'developer';
    const label = CLIENT_TYPES.find(t => t.value === type)?.label || 'Developer';
    const agg   = await prisma.client.aggregate({ _max: { clientNumber: true } });
    client = await prisma.client.create({
      data: {
        clientNumber: (agg._max.clientNumber ?? 0) + 1,
        name:         tag.name,
        type,
        orgTypes:     JSON.stringify([label]),
        city,
        state,
        notes:        `Added from Market Intel: ${signal.title}`.slice(0, 500),
        createdById:  userId,
      },
      select: { id: true, name: true },
    });
    created = true;
  }

  await prisma.marketTag.update({ where: { id: tag.id }, data: { clientId: client.id } });
  await prisma.marketSignal.update({
    where: { id: signal.id },
    data:  { linkedClientId: client.id, matchStatus: 'CONFIRMED' },
  });
  await attachSignalToClient(signal.id, client.id, { companyNames: [tag.name] }).catch(() => {});
  await recordMatchFeedback({ candidateName: tag.name, matchedClientId: client.id, outcome: 'CONFIRMED', signalId: signal.id, userId }).catch(() => {});

  return { client, created };
}
