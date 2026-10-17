/**
 * Revoke one MCP key.
 *
 * PATCH, not DELETE, and the route says so: this stamps `revokedAt` and the row
 * stays forever. An audit line from six months ago has to keep resolving to a
 * key with a name and an owner, and everything else in this codebase is
 * archive-only for the same reason.
 *
 * Revoking is instant: `resolveApiKey` reads `revokedAt` on every single
 * request, so there is no cache to wait out and no session to expire.
 */
import { NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { keyTableReady } from '@/lib/mcp/apiKeys';

export const dynamic = 'force-dynamic';

// PATCH /api/admin/mcp-keys/[id], body { revoked: true } | { revoked: false }
export async function PATCH(request, { params }) {
  const { error } = await requireSuperAdmin(request);
  if (error) return error;
  if (!keyTableReady(prisma)) {
    return NextResponse.json(
      { error: 'MCP keys are not available yet: migration 0094 has not been applied to this database.' },
      { status: 503 },
    );
  }

  const { id } = await params;
  let body;
  try { body = await request.json(); } catch { body = {}; }

  const existing = await prisma.mcpApiKey.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return NextResponse.json({ error: 'No such key.' }, { status: 404 });

  const revoking = body?.revoked !== false;
  const key = await prisma.mcpApiKey.update({
    where: { id },
    data: { revokedAt: revoking ? new Date() : null },
    select: {
      id: true, name: true, prefix: true, createdAt: true, lastUsedAt: true, revokedAt: true,
      user: { select: { id: true, name: true, email: true, role: true, isActive: true } },
    },
  });

  return NextResponse.json({ key });
}

// DELETE is not offered. Keys are revoked, never removed, see the note above.
export async function DELETE() {
  return NextResponse.json(
    { error: 'MCP keys are revoked, not deleted. Deleting one would break the audit trail that explains it.' },
    { status: 405 },
  );
}
