import { NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { isUploadKey, presignAvailable } from '@/lib/uploadStorage';
import { LOADERS, heldFiles, loadFile } from '@/lib/jobLoaderLoad';
import { refreshContractRollupQuietly } from '@/lib/changeOrderRollup';

export const dynamic = 'force-dynamic';

/**
 * Job Loader: one finished job into one project. Super admin only.
 * GET                 the projects to pick from
 * GET ?projectId=     what that project holds now, for the dry run
 * POST { step:'file', projectId, row:{ ..., uploadKey } }   one file already on Amazon
 * POST form with file + meta                                one file, dev only
 * POST { step, projectId, rows }                            one batch of records
 */
export async function GET(request) {
  const { error } = await requireSuperAdmin(request);
  if (error) return error;
  const projectId = new URL(request.url).searchParams.get('projectId');
  if (projectId) {
    if (!await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } })) {
      return fail('That project is not in the app any more. Pick it again.', 'JOB_LOADER_NO_PROJECT', 404);
    }
    return NextResponse.json(await heldFiles(prisma, projectId));
  }
  const projects = await prisma.project.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } });
  return NextResponse.json({ projects });
}

function fail(message, code, status = 400) {
  return NextResponse.json({ error: `${message} (${code})` }, { status });
}

async function readBody(request) {
  if (!(request.headers.get('content-type') || '').includes('multipart/form-data')) {
    return { body: await request.json().catch(() => null) };
  }
  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  const meta = JSON.parse(String(form?.get('meta') || '{}'));
  return { body: { step: 'file', ...meta }, buffer: file ? Buffer.from(await file.arrayBuffer()) : null };
}

export async function POST(request) {
  const { user, error } = await requireSuperAdmin(request);
  if (error) return error;

  try {
    const { body, buffer } = await readBody(request);
    const step = body?.step;
    const projectId = String(body?.projectId || '');
    if (!projectId || !await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } })) {
      return fail('That project is not in the app any more. Pick it again. Nothing was saved from this batch.', 'JOB_LOADER_NO_PROJECT', 404);
    }

    if (step === 'file') {
      const uploadKey = body.row?.uploadKey || null;
      if (uploadKey && !isUploadKey(uploadKey)) return fail('That upload key is not one of ours. Nothing was saved.', 'JOB_LOADER_BAD_KEY');
      if (!uploadKey && (!buffer || presignAvailable())) return fail('The file never reached us. Nothing was saved. Press Continue to send it again.', 'JOB_LOADER_NO_FILE');
      const res = await loadFile(prisma, user, projectId, body.row, { buffer, uploadKey });
      if (!res.error && body.row?.tab === 'ca' && body.row?.amount != null) await refreshContractRollupQuietly(projectId);
      return res.error ? NextResponse.json(res, { status: 400 }) : NextResponse.json(res);
    }

    const loader = LOADERS[step];
    if (!loader) return fail(`We do not know a step called ${step}. Nothing was saved.`, 'JOB_LOADER_BAD_STEP');
    const res = await loader(prisma, user, projectId, body.rows || []);
    if (step === 'changeOrders') await refreshContractRollupQuietly(projectId);
    return NextResponse.json({ ok: true, ...res });
  } catch (e) {
    console.error('[job-loader]', e);
    return fail('Our server stopped partway through. What saved before the stop is kept, and sending it again skips it. Press Continue to retry.', `JOB_LOADER_FAILED: ${String(e?.message || e).slice(0, 160)}`, 500);
  }
}
