/**
 * Shared by the Voice Training routes (Mike 9-26). Server only.
 */
import { NextResponse } from 'next/server';
import { isSalesAdmin } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { activeSampleCount } from '@/lib/tone/library';

export const SOURCES = new Set(['MBOX', 'EML', 'TEXT', 'PASTE', 'PST', 'OLM', 'MSG']);


/** Everyone works on their own library; a Sales Admin can pick anyone's. */
export function whoseLibrary(user, requested) {
  if (!requested || requested === user.id) return { userId: user.id };
  if (!isSalesAdmin(user)) return { error: NextResponse.json({ error: 'Only a Sales Admin can work on someone else\'s voice.' }, { status: 403 }) };
  return { userId: String(requested) };
}

export async function libraryState(userId) {
  const [person, count, batches] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, email: true, toneProfile: true, toneProfileBuiltAt: true, toneProfileSource: true } }),
    activeSampleCount(userId),
    prisma.voiceBatch.findMany({
      where: { userId }, orderBy: { createdAt: 'desc' }, take: 100,
      select: { id: true, fileName: true, source: true, emailsAdded: true, archivedAt: true, createdAt: true, uploadedBy: { select: { name: true } } },
    }),
  ]);
  let profile = null;
  try { profile = person?.toneProfile ? JSON.parse(person.toneProfile) : null; } catch {}
  return {
    person: person ? { id: person.id, name: person.name, email: person.email } : null,
    count, batches, profile, builtAt: person?.toneProfileBuiltAt || null, source: person?.toneProfileSource || null,
  };
}
