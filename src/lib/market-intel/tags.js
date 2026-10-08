import { prisma } from '@/lib/db';
import { tagsFromExtraction } from './tagRules.js';
import { applySupersedes } from './supersede.js';

/**
 * Database side of Market Intel tags (0122). Pure rules live in tagRules.js.
 *
 * saveSignalTags: write the tag rows an extraction produced and link them to
 * the signal. A COMPANY tag that the matcher auto-linked gets its clientId
 * here; everything else waits for a person to confirm.
 *
 * attachSignalToClient: once an article is agreed to be about a client, the
 * client inherits the article's place tags as ordinary CRM tags ("Denver, CO",
 * "CO"), which is what makes the clients list filterable by where they build.
 */
export async function saveSignalTags(signalId, extracted, { matches = [], db } = {}) {
  const client = db || prisma;
  const rows   = tagsFromExtraction(extracted);
  const autoByName = new Map(
    (matches || []).filter(m => m.status === 'AUTO_LINKED').map(m => [String(m.candidateName).trim().toLowerCase(), m.clientId]),
  );
  const saved = [];
  for (const row of rows) {
    const tag = await client.marketTag.upsert({
      where:  { kind_normalized: { kind: row.kind, normalized: row.normalized } },
      create: { kind: row.kind, name: row.name, normalized: row.normalized },
      update: {},
    });
    const autoClient = row.kind === 'COMPANY' ? autoByName.get(row.name.toLowerCase()) : null;
    if (autoClient && !tag.clientId) {
      await client.marketTag.update({ where: { id: tag.id }, data: { clientId: autoClient } }).catch(() => {});
    }
    await client.marketSignalTag.upsert({
      where:  { signalId_tagId: { signalId, tagId: tag.id } },
      create: { signalId, tagId: tag.id, role: row.role },
      update: { role: row.role },
    });
    saved.push(tag);
  }
  await client.marketSignal.update({ where: { id: signalId }, data: { taggedAt: new Date() } }).catch(() => {});
  // One building, one count (0124): now that the metro tag is on, settle who supersedes whom.
  await applySupersedes(signalId, { db: client }).catch(() => {});
  return saved;
}

export async function attachSignalToClient(signalId, clientId, { companyNames = [], db } = {}) {
  const client = db || prisma;
  if (!signalId || !clientId) return;
  const links = await client.marketSignalTag.findMany({
    where:   { signalId },
    include: { tag: true },
  });
  const wanted = new Set((companyNames || []).map(n => String(n).trim().toLowerCase()));
  for (const link of links) {
    const tag = link.tag;
    if (tag.kind === 'COMPANY' && !tag.clientId && wanted.has(tag.name.toLowerCase())) {
      await client.marketTag.update({ where: { id: tag.id }, data: { clientId } }).catch(() => {});
    }
    if (tag.kind === 'METRO' || tag.kind === 'STATE') {
      const ct = await client.clientTag.upsert({
        where:  { name: tag.name },
        create: { name: tag.name },
        update: {},
      });
      await client.clientTagLink.upsert({
        where:  { clientId_tagId: { clientId, tagId: ct.id } },
        create: { clientId, tagId: ct.id },
        update: {},
      }).catch(() => {});
    }
  }
}
