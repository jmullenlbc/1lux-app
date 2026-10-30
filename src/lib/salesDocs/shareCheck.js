// Can this document or Folder leave the building? One check for hand-made
// links and email campaigns (0147). Returns null when it may be shared, or
// { message, status } saying why not.
import { prisma } from '@/lib/db';
import { shareAllowed } from '@/lib/salesDocs/pricingScan';

export async function docShareProblem(docId) {
  const doc = await prisma.salesDoc.findUnique({
    where: { id: docId },
    select: { title: true, archivedAt: true, currentVersion: { select: { processStatus: true, scanStatus: true } } },
  });
  if (!doc) return { message: 'Not found', status: 404 };
  if (doc.archivedAt) return { message: `${doc.title} is archived.`, status: 400 };
  const v = doc.currentVersion;
  if (!v || v.processStatus !== 'READY') return { message: `${doc.title} is still being checked. Try again in a moment.`, status: 409 };
  if (!shareAllowed(v.scanStatus)) return { message: `Cost columns were found in ${doc.title}, so it cannot be shared until an admin clears it.`, status: 409 };
  return null;
}

export async function spaceShareProblem(spaceId) {
  const space = await prisma.salesDocSpace.findUnique({
    where: { id: spaceId },
    select: { name: true, archivedAt: true, items: { select: { doc: { select: { title: true, archivedAt: true, currentVersion: { select: { scanStatus: true } } } } } } },
  });
  if (!space) return { message: 'Not found', status: 404 };
  if (space.archivedAt) return { message: `The Folder ${space.name} is archived.`, status: 400 };
  const docs = space.items.map((i) => i.doc).filter((d) => !d.archivedAt);
  if (!docs.length) return { message: `Add a document to the Folder ${space.name} first.`, status: 400 };
  const blocked = docs.filter((d) => d.currentVersion?.scanStatus === 'BLOCKED');
  if (blocked.length) return { message: `Cost columns were found in ${blocked.map((d) => d.title).join(', ')}. Clear or remove it before sharing this Folder.`, status: 409 };
  return null;
}
