/**
 * One decorative option: read it, change it, retire it.
 *
 * ── Nothing is deleted ───────────────────────────────────────────────────────
 * A retired option is `isActive: false`. It stops being offered on new surveys
 * and it keeps every choice anybody ever made from it, which is the whole point
 * — a survey from March has to still say what was on the screen in March. DELETE
 * refuses, out loud, the same way the rest of the app refuses.
 *
 * The same applies one level down. Taking a finish off a fixture switches that
 * finish off; it never removes the row, because somebody may have picked it.
 */
import { NextResponse } from 'next/server';
import { requireAuth, requirePermission, canSeeAllData } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

const OPTION_SHAPE = {
  id: true, category: true, name: true, bodyKey: true,
  shape: true, style: true, dimLabel: true,
  projectionIn: true, bladeSpanIn: true,
  wetRated: true, dampRated: true,
  imageUrl: true, sortOrder: true, isActive: true,
  createdAt: true, updatedAt: true,
  finishes: {
    select: {
      id: true, finishKey: true, catalogNumber: true, manufacturer: true,
      dnPrice: true, cnPrice: true, leadTimeWks: true,
      imageUrl: true, isDefault: true, isActive: true,
    },
    orderBy: [{ isDefault: 'desc' }, { finishKey: 'asc' }],
  },
};

function optionalNumber(v) {
  if (v === null || v === undefined || v === '') return null;
  // A comma is always a thousands separator in this app.
  const n = Number(String(v).replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : null;
}

export async function GET(request, { params }) {
  const { user, error } = await requireAuth(request);
  if (error) return error;
  if (!canSeeAllData(user)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const option = await prisma.decorativeOption.findUnique({
    where: { id: params.id },
    select: OPTION_SHAPE,
  });
  if (!option) return NextResponse.json({ error: 'That fixture is not here any more.' }, { status: 404 });

  return NextResponse.json({ option });
}

/**
 * PATCH — change the body, and/or hand over the whole finish list.
 *
 * `finishes`, if sent, is the complete set. A finish in the list is created or
 * updated; a finish not in the list is switched off, not removed.
 */
export async function PATCH(request, { params }) {
  const { error } = await requirePermission(request, 'editProducts');
  if (error) return error;

  let body;
  try { body = await request.json(); } catch { body = {}; }

  const existing = await prisma.decorativeOption.findUnique({
    where: { id: params.id },
    select: { id: true, category: true },
  });
  if (!existing) return NextResponse.json({ error: 'That fixture is not here any more.' }, { status: 404 });

  const data = {};
  // Only fields that were actually sent. A screen that patches one checkbox must
  // not blank out the fields it did not put on the form.
  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (!name) return NextResponse.json({ error: 'A fixture needs a name.' }, { status: 400 });
    data.name = name;
  }
  if (body.shape !== undefined)        data.shape = String(body.shape || '').trim();
  if (body.style !== undefined)        data.style = String(body.style || '').trim();
  if (body.dimLabel !== undefined)     data.dimLabel = String(body.dimLabel || '').trim();
  if (body.projectionIn !== undefined) data.projectionIn = optionalNumber(body.projectionIn);
  if (body.bladeSpanIn !== undefined)  data.bladeSpanIn = optionalNumber(body.bladeSpanIn);
  if (body.wetRated !== undefined)     data.wetRated = !!body.wetRated;
  if (body.dampRated !== undefined)    data.dampRated = !!body.dampRated;
  if (body.imageUrl !== undefined)     data.imageUrl = body.imageUrl ? String(body.imageUrl) : null;
  if (body.sortOrder !== undefined)    data.sortOrder = optionalNumber(body.sortOrder) ?? 0;
  // Retire and bring back, from the same field.
  if (body.isActive !== undefined)     data.isActive = !!body.isActive;

  // The category is deliberately not editable. Moving a pendant into the fan
  // category would silently re-file every choice ever made from it.

  if (Object.keys(data).length) {
    await prisma.decorativeOption.update({ where: { id: params.id }, data });
  }

  if (Array.isArray(body.finishes)) {
    const sent = body.finishes.filter(f => String(f?.finishKey || '').trim());
    const keys = new Set(sent.map(f => String(f.finishKey).trim()));

    for (const f of sent) {
      const finishKey = String(f.finishKey).trim();
      const fields = {
        catalogNumber: f?.catalogNumber ? String(f.catalogNumber).trim() : null,
        manufacturer: f?.manufacturer ? String(f.manufacturer).trim() : null,
        dnPrice: optionalNumber(f?.dnPrice),
        cnPrice: optionalNumber(f?.cnPrice),
        leadTimeWks: optionalNumber(f?.leadTimeWks),
        imageUrl: f?.imageUrl ? String(f.imageUrl) : null,
        isDefault: !!f?.isDefault,
        isActive: f?.isActive === undefined ? true : !!f.isActive,
      };
      await prisma.decorativeOptionFinish.upsert({
        where: { optionId_finishKey: { optionId: params.id, finishKey } },
        create: { optionId: params.id, finishKey, ...fields },
        update: fields,
      });
    }

    // Anything left off the list is switched off, never removed.
    const dropped = await prisma.decorativeOptionFinish.findMany({
      where: { optionId: params.id, isActive: true },
      select: { id: true, finishKey: true },
    });
    const toRetire = dropped.filter(f => !keys.has(f.finishKey)).map(f => f.id);
    if (toRetire.length) {
      await prisma.decorativeOptionFinish.updateMany({
        where: { id: { in: toRetire } },
        data: { isActive: false },
      });
    }
  }

  const option = await prisma.decorativeOption.findUnique({
    where: { id: params.id },
    select: OPTION_SHAPE,
  });
  return NextResponse.json({ option });
}

export async function DELETE() {
  return NextResponse.json(
    {
      error:
        'Fixtures are never deleted. Retire it instead — it stops being offered on new surveys ' +
        'and every choice anybody already made from it stays readable.',
    },
    { status: 405 },
  );
}
