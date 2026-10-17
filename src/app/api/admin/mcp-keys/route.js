/**
 * Issue and list per-person MCP keys.
 *
 * SUPER_ADMIN only. A key grants its owner's whole view of the data over an API
 * with no screen in front of it, so handing them out is an admin act, not a
 * self-service one, and issuing a key to somebody else is the same act as
 * giving them their password, which is why the person doing it has to be the
 * person who can already do anything.
 *
 * The plaintext key is in the POST response and nowhere else, ever. There is no
 * route that reads it back, because there is nothing stored to read back.
 */
import { NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { generateKey, keyTableReady } from '@/lib/mcp/apiKeys';

export const dynamic = 'force-dynamic';

/** The same words in both handlers, so a missing migration reads the same way twice. */
function notMigrated() {
  return NextResponse.json(
    { error: 'MCP keys are not available yet: migration 0094 has not been applied to this database.' },
    { status: 503 },
  );
}

// GET /api/admin/mcp-keys, every key ever issued, live ones first.
export async function GET(request) {
  const { error } = await requireSuperAdmin(request);
  if (error) return error;
  if (!keyTableReady(prisma)) return notMigrated();

  const keys = await prisma.mcpApiKey.findMany({
    // Never `include` here. An explicit select is the difference between showing
    // an admin a list of keys and shipping every field of every owner's row.
    select: {
      id: true, name: true, prefix: true, createdAt: true, lastUsedAt: true, revokedAt: true,
      user: { select: { id: true, name: true, email: true, role: true, isActive: true } },
    },
    orderBy: [{ revokedAt: 'asc' }, { createdAt: 'desc' }],
  });

  return NextResponse.json({ keys });
}

// POST /api/admin/mcp-keys, mint one. Body: { name, userId }
export async function POST(request) {
  const { user: admin, error } = await requireSuperAdmin(request);
  if (error) return error;
  if (!keyTableReady(prisma)) return notMigrated();

  let body;
  try { body = await request.json(); } catch { body = {}; }

  const name = String(body?.name || '').trim();
  const userId = String(body?.userId || '').trim();
  if (!name) return NextResponse.json({ error: 'Give the key a name so somebody can tell later what it is for.' }, { status: 400 });
  if (!userId) return NextResponse.json({ error: 'Choose the person this key belongs to.' }, { status: 400 });

  const owner = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, role: true, isActive: true },
  });
  if (!owner) return NextResponse.json({ error: 'That person no longer exists.' }, { status: 404 });
  // A key for a switched-off account would be a live door into a closed one.
  if (owner.isActive === false) {
    return NextResponse.json({ error: 'That account is switched off. Turn it back on first, or pick somebody else.' }, { status: 400 });
  }

  const { token, tokenHash, prefix } = generateKey();

  const key = await prisma.mcpApiKey.create({
    data: { name, prefix, tokenHash, userId: owner.id, createdById: admin?.id || null },
    select: { id: true, name: true, prefix: true, createdAt: true },
  });

  return NextResponse.json({
    key: { ...key, user: { id: owner.id, name: owner.name, email: owner.email, role: owner.role } },
    // Said out loud in the payload as well as on the screen, because the next
    // person to call this route may be a script and not a browser.
    token,
    warning: 'This is the only time this key will ever be shown. Copy it now; it cannot be recovered.',
  }, { status: 201 });
}
