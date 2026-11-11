// Server side of src/lib/brand.js: the brand for a job, read from its company's BusinessUnit row so the names and
// details admins type in Admin → Companies are what documents print. Server-only (uses the database).
import { prisma } from '@/lib/db';
import { brandFor, DEFAULT_BRAND } from '@/lib/brand';

const UNIT_SELECT = { id: true, code: true, name: true, legalName: true, address: true, phone: true, ordersEmail: true, website: true };

/** The brand for a BusinessUnit id (or null = 1LUX). */
export async function brandForUnitId(businessUnitId, db = prisma) {
  if (!businessUnitId) return DEFAULT_BRAND;
  const unit = await db.businessUnit.findUnique({ where: { id: businessUnitId }, select: UNIT_SELECT }).catch(() => null);
  return brandFor(unit || { id: businessUnitId });
}

/**
 * The brand for a job: pass the project (with businessUnitId, or businessUnit already loaded) or its id.
 * Never throws: a failed lookup falls back to 1LUX so a PDF or an email still goes out.
 */
export async function brandForProject(projectOrId, db = prisma) {
  try {
    if (!projectOrId) return DEFAULT_BRAND;
    if (typeof projectOrId === 'object') {
      if (projectOrId.businessUnit !== undefined) return brandFor(projectOrId.businessUnit);
      if (projectOrId.businessUnitId !== undefined) return brandForUnitId(projectOrId.businessUnitId, db);
      projectOrId = projectOrId.id;
    }
    const p = await db.project.findUnique({ where: { id: projectOrId }, select: { businessUnit: { select: UNIT_SELECT } } });
    return brandFor(p?.businessUnit);
  } catch {
    return DEFAULT_BRAND;
  }
}

export { UNIT_SELECT as BRAND_UNIT_SELECT };
