import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';

async function canAccess(projectId, user) {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return false;
  return user.role === 'ILC_ADMIN' || user.role === 'SUPER_ADMIN' || project.createdById === user.id;
}

export async function POST(request, { params }) {
  const { user, error } = await requireAuth(request);
  if (error) return error;
  if (!await canAccess(params.id, user)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await request.json();
  const { fileId, unitTypes = [], confirmedFields = {} } = body;

  // unitTypes: [{ code, label, qty, unitSf, bedrooms, bathrooms, balconies, confidence, source }]
  // confirmedFields: { numUnits, unitsSf, numBedrooms, numBathrooms, numBalconies, grossSf }
  //   — only keys present in confirmedFields are written to ProjectData

  await prisma.$transaction(async (tx) => {
    // Replace all existing unit types for this project
    await tx.projectUnitType.deleteMany({ where: { projectId: params.id } });

    if (unitTypes.length > 0) {
      await tx.projectUnitType.createMany({
        data: unitTypes.map((ut, i) => ({
          projectId:  params.id,
          code:       ut.code,
          label:      ut.label ?? null,
          qty:        Number(ut.qty) || 0,
          unitSf:     ut.unitSf != null ? Number(ut.unitSf) : null,
          bedrooms:   ut.bedrooms != null ? Number(ut.bedrooms) : null,
          bathrooms:  ut.bathrooms != null ? Number(ut.bathrooms) : null,
          balconies:  ut.balconies != null ? Number(ut.balconies) : null,
          sortOrder:  i,
          source:     ut.source ?? 'EXTRACTED',
          confidence: ut.confidence != null ? Number(ut.confidence) : null,
        })),
      });
    }

    // Write only the confirmed fields to ProjectData
    const dataUpdate = {};
    if ('numUnits'    in confirmedFields) dataUpdate.numUnits    = confirmedFields.numUnits    != null ? Number(confirmedFields.numUnits)    : null;
    if ('unitsSf'     in confirmedFields) dataUpdate.unitsSf     = confirmedFields.unitsSf     != null ? Number(confirmedFields.unitsSf)     : null;
    if ('numBedrooms' in confirmedFields) dataUpdate.numBedrooms = confirmedFields.numBedrooms != null ? Number(confirmedFields.numBedrooms) : null;
    if ('numBathrooms'in confirmedFields) dataUpdate.numBathrooms= confirmedFields.numBathrooms!= null ? Number(confirmedFields.numBathrooms): null;
    if ('numBalconies'in confirmedFields) dataUpdate.numBalconies= confirmedFields.numBalconies!= null ? Number(confirmedFields.numBalconies): null;
    if ('grossSf'     in confirmedFields) dataUpdate.grossSf     = confirmedFields.grossSf     != null ? Number(confirmedFields.grossSf)     : null;
    // garageSf/corridorSf were parsed by the extractor from day one but never
    // made it past this allowlist — every parse silently discarded them.
    if ('garageSf'    in confirmedFields) dataUpdate.garageSf    = confirmedFields.garageSf    != null ? Number(confirmedFields.garageSf)    : null;
    if ('corridorSf'  in confirmedFields) dataUpdate.corridorSf  = confirmedFields.corridorSf  != null ? Number(confirmedFields.corridorSf)  : null;

    if (Object.keys(dataUpdate).length > 0) {
      await tx.projectData.upsert({
        where:  { projectId: params.id },
        update: dataUpdate,
        create: { projectId: params.id, ...dataUpdate },
      });
    }

    // Stamp extraction JSON onto the file record for audit
    if (fileId) {
      await tx.projectFile.updateMany({
        where: { id: fileId, projectId: params.id },
        data:  { analysisData: JSON.stringify({ committedAt: new Date().toISOString(), confirmedFields, unitTypeCount: unitTypes.length }) },
      });
    }
  });

  const [savedTypes, updatedData] = await Promise.all([
    prisma.projectUnitType.findMany({ where: { projectId: params.id }, orderBy: { sortOrder: 'asc' } }),
    prisma.projectData.findUnique({ where: { projectId: params.id } }),
  ]);

  return NextResponse.json({ ok: true, unitTypes: savedTypes, projectData: updatedData });
}
