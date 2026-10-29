import { NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { CONFIRM_WORDS, BATCH } from '@/lib/crmImport';
import { importCounts, wipeStep, loadCompanies, loadPeople, loadProjects } from '@/lib/crmImportLoad';

export const dynamic = 'force-dynamic';

/**
 * Admin > CRM upload (Mike 10-28). Super admins only.
 *
 * GET                                         -> counts now in the app, active users, last wipe
 * POST { action: 'wipe', confirm }            -> deletes the next few dozen projects, people or
 *                                                companies; the page repeats until done: true
 * POST { action: 'companies'|'people'|'projects', rows } -> loads one batch
 */
export async function GET(request) {
  const { error } = await requireSuperAdmin(request);
  if (error) return error;
  return NextResponse.json(await importCounts(prisma));
}

const LOADERS = { companies: loadCompanies, people: loadPeople, projects: loadProjects };

function fail(message, code, status = 400) {
  return NextResponse.json({ error: `${message} (${code})` }, { status });
}

export async function POST(request) {
  const { user, error } = await requireSuperAdmin(request);
  if (error) return error;
  const body = await request.json().catch(() => null);
  const action = body?.action;

  try {
    if (action === 'wipe') {
      if (body.confirm !== CONFIRM_WORDS) {
        return fail(`Type ${CONFIRM_WORDS} exactly to go ahead. Nothing was changed.`, 'CRM_IMPORT_CONFIRM');
      }
      return NextResponse.json({ ok: true, ...(await wipeStep(prisma, user)) });
    }

    const load = LOADERS[action];
    if (!load) return fail('That request did not say what to load, a problem on our side of the page. Nothing was changed. Reload and try again.', 'CRM_IMPORT_ACTION');
    const rows = Array.isArray(body.rows) ? body.rows : [];
    if (!rows.length || rows.length > BATCH[action] * 2) {
      return fail(`A batch must hold 1 to ${BATCH[action] * 2} rows. Nothing was changed. Reload and try again.`, 'CRM_IMPORT_BATCH');
    }
    return NextResponse.json({ ok: true, ...(await load(prisma, user, rows)) });
  } catch (e) {
    console.error('[crm-import]', action, e);
    return fail(
      'Our server stopped partway through this batch. Rows saved before the stop are kept, and sending it again skips them. Press Continue to retry.',
      `CRM_IMPORT_FAILED: ${String(e?.message || e).slice(0, 160)}`, 500,
    );
  }
}
