/**
 * Hand back one fixture photograph.
 *
 * A plain <img src> target rather than a presigned link, because the survey
 * screen shows forty of them at once and re-signing forty URLs on every page
 * load is a lot of work to reach the same place.
 *
 * Staff only for now. When shared surveys arrive, this is the one route that
 * has to learn about share tokens — the pictures are the only thing on that
 * screen an outside respondent needs that does not already come down with the
 * survey payload.
 *
 * `name` is the filename alone, never a path. isFixtureKey is what actually
 * decides; the prefix is added here and nowhere else, so no caller can talk
 * this route into reading an object outside `fixtures/`.
 */
import { NextResponse } from 'next/server';
import { requireAuth, canSeeAllData } from '@/lib/auth';
import { getFixtureImage, isFixtureKey } from '@/lib/uploadStorage';

export const dynamic = 'force-dynamic';

const TYPE_BY_EXT = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

export async function GET(request, { params }) {
  const { user, error } = await requireAuth(request);
  if (error) return error;
  if (!canSeeAllData(user)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const name = String(params?.name || '');
  const key = `fixtures/${name}`;
  if (!isFixtureKey(key)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const bytes = await getFixtureImage(key);
  if (!bytes) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const ext = name.split('.').pop().toLowerCase();
  return new NextResponse(bytes, {
    headers: {
      'Content-Type': TYPE_BY_EXT[ext] || 'application/octet-stream',
      // The key is random and an image never changes under it, so this is safe
      // to hold on to. Private: it is behind a login.
      'Cache-Control': 'private, max-age=86400',
      'Content-Length': String(bytes.length),
    },
  });
}
