import { requirePortalAuth } from '@/lib/portalAuth';
import { prisma } from '@/lib/db';
import { readFile } from 'fs/promises';
import path from 'path';

/**
 * GET /api/portal/projects/[id]/files/[fileId]
 * Streams a file inline for portal users.
 * Enforces per-tab permission based on the contact's access settings.
 *
 * Tab → permission mapping:
 *   budgets     → canViewBudgets
 *   submittals  → canViewSubmittals
 *   contracts   → canViewContracts
 *   ca          → canViewChangeOrders
 */

const TAB_PERMISSION = {
  budgets:    'canViewBudgets',
  submittals: 'canViewSubmittals',
  contracts:  'canViewContracts',
  ca:         'canViewChangeOrders',
};

export async function GET(req, { params }) {
  const { portalUser, error } = await requirePortalAuth();
  if (error) return error;

  // Verify the file exists and belongs to this project
  const record = await prisma.projectFile.findFirst({
    where: { id: params.fileId, projectId: params.id },
  });
  if (!record) {
    return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
  }

  // Check that the portal user has permission for this tab
  const permField = TAB_PERMISSION[record.tab];
  if (!permField) {
    return new Response(JSON.stringify({ error: 'Not authorized' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
  }

  const contact = await prisma.projectExternalContact.findFirst({
    where: { project_id: params.id, portalUserId: portalUser.portalUserId, acceptedAt: { not: null } },
  });
  if (!contact?.[permField]) {
    return new Response(JSON.stringify({ error: 'Not authorized' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
  }

  // Stream the file
  try {
    const buffer      = await readFile(path.join(process.cwd(), 'uploads', record.storedPath));
    const contentType = record.mimeType || 'application/octet-stream';
    return new Response(buffer, {
      headers: {
        'Content-Type':        contentType,
        'Content-Disposition': `inline; filename="${encodeURIComponent(record.originalName)}"`,
        'Content-Length':      String(buffer.length),
      },
    });
  } catch {
    return new Response(JSON.stringify({ error: 'File not found on disk' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
  }
}
