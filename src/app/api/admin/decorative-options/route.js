/**
 * The decorative option pool, list and add.
 *
 * This is the fixture library for the five things a client actually picks: the
 * kitchen pendant, the bath vanity, the balcony sconce, the unit entry sconce
 * and the ceiling fan. Every Unit Selections survey draws its choices from here,
 * so what is in this pool is what anybody ever gets offered.
 *
 * ── Who can do what ──────────────────────────────────────────────────────────
 * Reading is open to staff. Writing rides on the same key as the rest of the
 * fixture library, `editProducts`, so the people who maintain products maintain
 * this too and there is no second list of role names to drift.
 *
 * Contractors (Client Viewers) are turned away at the door, reading included.
 * dnPrice lives on these rows, and a route that never answers a contractor is a
 * simpler promise to keep than a route that answers them carefully.
 */
import { NextResponse } from 'next/server';
import { requireAuth, requirePermission, canSeeAllData } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { CATEGORY_KEYS } from '@/lib/unitSelections';

export const dynamic = 'force-dynamic';

/** Everything a screen shows about one option, finishes included. */
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

/** A number field that is allowed to be left empty. '' and null both mean empty. */
function optionalNumber(v) {
  if (v === null || v === undefined || v === '') return null;
  // A comma is always a thousands separator in this app.
  const n = Number(String(v).replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : null;
}

/** Turn a name into a slug, so nobody has to think about what a bodyKey is. */
function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

// GET /api/admin/decorative-options?category=p1&includeRetired=1
export async function GET(request) {
  const { user, error } = await requireAuth(request);
  if (error) return error;
  if (!canSeeAllData(user)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const url = new URL(request.url);
  const category = url.searchParams.get('category');
  const includeRetired = url.searchParams.get('includeRetired') === '1';

  const where = {};
  // An unknown category means nobody, not everybody. Asking for a category
  // that does not exist and being handed the whole pool is the kind of answer
  // that looks right until somebody notices fans in the pendant list.
  if (category) where.category = CATEGORY_KEYS.includes(category) ? category : '__none__';
  if (!includeRetired) where.isActive = true;

  const options = await prisma.decorativeOption.findMany({
    where,
    select: OPTION_SHAPE,
    orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
  });

  return NextResponse.json({ options });
}

// POST /api/admin/decorative-options, add one body, optionally with finishes.
export async function POST(request) {
  const { error } = await requirePermission(request, 'editProducts');
  if (error) return error;

  let body;
  try { body = await request.json(); } catch { body = {}; }

  const category = String(body?.category || '').trim();
  const name = String(body?.name || '').trim();

  if (!CATEGORY_KEYS.includes(category)) {
    return NextResponse.json(
      { error: `Pick which fixture this is. One of: ${CATEGORY_KEYS.join(', ')}.` },
      { status: 400 },
    );
  }
  if (!name) return NextResponse.json({ error: 'Give the fixture a name.' }, { status: 400 });

  const bodyKey = slugify(body?.bodyKey || name);
  if (!bodyKey) {
    return NextResponse.json({ error: 'That name has no letters or numbers in it.' }, { status: 400 });
  }

  // Two fixtures in the same category sharing a bodyKey would look like one
  // fixture that changed its mind, and the seed matches on this pair.
  const clash = await prisma.decorativeOption.findFirst({
    where: { category, bodyKey },
    select: { id: true, name: true },
  });
  if (clash) {
    return NextResponse.json(
      { error: `"${clash.name}" already uses that short name in this category. Give this one a different name.` },
      { status: 409 },
    );
  }

  const finishes = Array.isArray(body?.finishes) ? body.finishes : [];

  const created = await prisma.decorativeOption.create({
    data: {
      category,
      name,
      bodyKey,
      shape: String(body?.shape || '').trim(),
      style: String(body?.style || '').trim(),
      dimLabel: String(body?.dimLabel || '').trim(),
      projectionIn: optionalNumber(body?.projectionIn),
      bladeSpanIn: optionalNumber(body?.bladeSpanIn),
      wetRated: !!body?.wetRated,
      dampRated: !!body?.dampRated,
      imageUrl: body?.imageUrl ? String(body.imageUrl) : null,
      sortOrder: optionalNumber(body?.sortOrder) ?? 0,
      finishes: finishes.length
        ? {
            create: finishes
              .filter(f => String(f?.finishKey || '').trim())
              .map(f => ({
                finishKey: String(f.finishKey).trim(),
                catalogNumber: f?.catalogNumber ? String(f.catalogNumber).trim() : null,
                manufacturer: f?.manufacturer ? String(f.manufacturer).trim() : null,
                dnPrice: optionalNumber(f?.dnPrice),
                cnPrice: optionalNumber(f?.cnPrice),
                leadTimeWks: optionalNumber(f?.leadTimeWks),
                imageUrl: f?.imageUrl ? String(f.imageUrl) : null,
                isDefault: !!f?.isDefault,
              })),
          }
        : undefined,
    },
    select: OPTION_SHAPE,
  });

  return NextResponse.json({ option: created }, { status: 201 });
}
