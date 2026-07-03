import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { putQcObject, getQcObjectUrl } from '@/lib/qcStorage';

async function authorize(clientId) {
  const { user, error } = await requireAuth();
  if (error) return { error };
  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) return { error: NextResponse.json({ error: 'Not found' }, { status: 404 }) };
  if (user.role !== 'ILC_ADMIN' && client.createdById !== user.id) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { user, client };
}

function mapRow(clientId, r) {
  const num = (v) => (v != null && v !== '' && !Number.isNaN(Number(v)) ? Number(v) : null);
  return {
    clientId,
    name:          String(r.name).trim(),
    units:         num(r.units) != null ? Math.round(num(r.units)) : null,
    startDate:     r.startDate || null,
    projectType:   r.projectType || null,
    buildingType:  r.buildingType || null,
    phase:         r.phase || null,
    ilcRevenue:    num(r.ilcRevenue),
    architect:     r.architect || null,
    gc:            r.gc || null,
    gcContact:     r.gcContact || null,
    gcEmail:       r.gcEmail || null,
    address:       r.address || null,
    preconManager: r.preconManager || null,
    raw:           r.raw ? (typeof r.raw === 'string' ? r.raw : JSON.stringify(r.raw)) : null,
  };
}

// GET — current synced pipeline + upload history (with download URLs)
export async function GET(request, { params }) {
  const { error, client } = await authorize(params.id);
  if (error) return error;

  const [projects, uploadRows] = await Promise.all([
    prisma.pipelineProject.findMany({ where: { clientId: params.id }, orderBy: [{ startDate: 'asc' }, { name: 'asc' }] }),
    prisma.pipelineUpload.findMany({ where: { clientId: params.id }, orderBy: { createdAt: 'desc' } }),
  ]);

  const uploads = await Promise.all(uploadRows.map(async (u) => ({
    id: u.id, fileName: u.fileName, rowCount: u.rowCount, createdAt: u.createdAt,
    url: await getQcObjectUrl(u.fileKey),
  })));

  return NextResponse.json({ projects, uploads, perUnit: client.pipelinePerUnit ?? null });
}

// PATCH — bulk dismiss/restore pipeline projects ("we're not working on it").
// Dismissed projects stay out across future re-syncs (POST preserves the flag).
export async function PATCH(request, { params }) {
  const { error } = await authorize(params.id);
  if (error) return error;

  const { ids = [], dismissed, projectType } = await request.json();
  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: 'No projects selected' }, { status: 400 });
  }
  const data = {};
  if (dismissed !== undefined)   data.dismissed   = !!dismissed;
  if (projectType !== undefined) data.projectType = projectType || null;
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }
  await prisma.pipelineProject.updateMany({
    where: { clientId: params.id, id: { in: ids } },
    data,
  });
  return NextResponse.json({ ok: true, count: ids.length });
}

// POST — store the file + sync the pipeline (add / modify / remove by name)
export async function POST(request, { params }) {
  const { user, error } = await authorize(params.id);
  if (error) return error;

  const { fileName, fileBase64, rows = [] } = await request.json();

  // Store the original file (reuses the qc S3 bucket).
  let fileKey = null;
  if (fileBase64) {
    const b64 = fileBase64.includes(',') ? fileBase64.split(',')[1] : fileBase64;
    const buffer = Buffer.from(b64, 'base64');
    fileKey = await putQcObject(buffer, {
      ext: 'xlsx',
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
  }

  // De-dupe incoming by name (keep last), drop nameless rows.
  const byName = new Map();
  for (const r of rows) {
    const nm = String(r?.name ?? '').trim();
    if (nm) byName.set(nm, r);
  }
  const incoming = [...byName.values()];
  const names    = [...byName.keys()];

  const ops = [
    prisma.pipelineProject.deleteMany({
      where: { clientId: params.id, name: { notIn: names.length ? names : ['__none__'] } },
    }),
    ...incoming.map((r) => {
      const data = mapRow(params.id, r);
      const { clientId, name, ...rest } = data;
      return prisma.pipelineProject.upsert({
        where:  { clientId_name: { clientId: params.id, name } },
        create: data,
        update: rest,
      });
    }),
  ];
  if (fileKey) {
    ops.push(prisma.pipelineUpload.create({
      data: { clientId: params.id, fileName: fileName || 'pipeline.xlsx', fileKey, rowCount: incoming.length, uploadedById: user.id },
    }));
  }
  await prisma.$transaction(ops);

  return NextResponse.json({ ok: true, count: incoming.length });
}
