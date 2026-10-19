/**
 * Route guard for Bid Leveling (Mike 10-18): signed in, ILC staff (bids carry
 * CN and our costs, never shown to a Client Viewer), project exists, and the
 * leveling (when named) belongs to it.
 */
import { NextResponse } from 'next/server';
import { requireAuth, canSeeAllData } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function guardLeveling(params) {
  const { user, error } = await requireAuth();
  if (error) return { error };
  if (!canSeeAllData(user)) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  const project = await prisma.project.findUnique({ where: { id: params.id }, select: { id: true, name: true } });
  if (!project) return { error: NextResponse.json({ error: 'Not found' }, { status: 404 }) };
  if (!params.levelingId) return { user, project };
  const leveling = await prisma.bidLeveling.findUnique({ where: { id: params.levelingId } });
  if (!leveling || leveling.projectId !== project.id || leveling.archivedAt) {
    return { error: NextResponse.json({ error: 'Not found' }, { status: 404 }) };
  }
  return { user, project, leveling };
}
