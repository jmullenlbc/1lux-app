import { NextResponse } from 'next/server';
import { requireAuth, isClientViewer } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { archiveData } from '@/lib/archive';
import { cents } from '@/lib/money';
import { EDITION_STATUSES, TIERS } from '@/lib/conferences/constants';
import { canEditConferences, loadConferenceEdition } from '@/lib/conferences/server';

export const dynamic = 'force-dynamic';

const STATUS_KEYS = EDITION_STATUSES.map(s => s.key);
const TIER_KEYS = TIERS.map(t => (typeof t === 'string' ? t : t.key));
const bad = (error) => NextResponse.json({ error }, { status: 400 });

const text = (v) => (typeof v === 'string' ? v.trim().slice(0, 60) : '');
// Blank goes back to the worked out number. 0 is a real number.
function moneyField(v) {
  if (v === null || v === '') return { value: null };
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return { error: 'Type a dollar amount of 0 or more, or leave it blank.' };
  return { value: Math.round(cents(n) * 100) };
}

export async function GET(_request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  if (isClientViewer(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const edition = await loadConferenceEdition(params.id);
  if (!edition) return NextResponse.json({ error: 'This event is not in the plan. It may have been archived.' }, { status: 404 });
  return NextResponse.json({ edition, canEdit: canEditConferences(user) });
}

// PATCH: the planner's own choices on one event. `{ archived: true }` archives it.
export async function PATCH(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  if (!canEditConferences(user)) return NextResponse.json({ error: 'Only a Sales Admin can change the conference plan.' }, { status: 403 });

  const body = await request.json().catch(() => null);
  if (!body) return bad('The change did not come through. Nothing was saved. Try again.');
  const found = await prisma.conferenceEdition.findUnique({ where: { id: params.id }, select: { id: true, seriesId: true } });
  if (!found) return NextResponse.json({ error: 'This event is not in the plan. Nothing was saved.' }, { status: 404 });

  const data = {};
  if (typeof body.archived === 'boolean') Object.assign(data, archiveData(body.archived, user));
  if (body.status !== undefined) {
    if (!STATUS_KEYS.includes(body.status)) return bad('Pick a status from the list.');
    data.status = body.status;
  }
  if (body.tierOverride !== undefined) {
    if (body.tierOverride !== null && !TIER_KEYS.includes(body.tierOverride)) return bad('Pick a tier from the list.');
    data.tierOverride = body.tierOverride;
  }
  if (body.includeOverride !== undefined) {
    if (body.includeOverride !== null && typeof body.includeOverride !== 'boolean') return bad('Include is yes or no.');
    data.includeOverride = body.includeOverride;
  }
  if (body.headcountOverride !== undefined) {
    const n = body.headcountOverride;
    if (n !== null && n !== '' && (!Number.isInteger(Number(n)) || Number(n) < 0)) return bad('Headcount is a whole number.');
    data.headcountOverride = n === null || n === '' ? null : Number(n);
  }
  if (body.ownerId !== undefined) data.ownerId = body.ownerId || null;
  if (body.planNotes !== undefined) data.planNotes = String(body.planNotes || '').trim() || null;
  for (const [field, column] of [['hotelRateOverride', 'hotelRateOverrideCents'], ['airfareOverride', 'airfareOverrideCents']]) {
    if (body[field] === undefined) continue;
    const m = moneyField(body[field]);
    if (m.error) return bad(m.error);
    data[column] = m.value;
  }

  if (body.regCost !== undefined) {
    const m = moneyField(body.regCost);
    if (m.error) return bad(m.error);
    data.regCostCents = m.value;
    data.regCostBasis = m.value === null ? 'ESTIMATED' : 'MANUAL';
  }

  // Vertical, Focus, Format and Access belong to the conference, so they apply to every year of it.
  const series = {};
  if (body.vertical !== undefined) {
    const v = text(body.vertical);
    if (!v) return bad('Vertical needs a value.');
    series.vertical = v;
  }
  if (body.format !== undefined) series.format = text(body.format) || null;
  if (body.accessRoute !== undefined) {
    const v = text(body.accessRoute);
    if (!v) return bad('Access needs a value.');
    series.accessRoute = v;
    series.supplierEligible = v !== 'BARRED';
  }
  let tags = null;
  if (body.tags !== undefined) {
    if (!Array.isArray(body.tags)) return bad('Focus has to be a list.');
    tags = [...new Set(body.tags.map(text).filter(Boolean))];
  }

  await prisma.$transaction(async (tx) => {
    await tx.conferenceEdition.update({ where: { id: params.id }, data });
    if (Object.keys(series).length) await tx.conferenceSeries.update({ where: { id: found.seriesId }, data: series });
    if (tags) {
      await tx.conferenceSeriesTag.deleteMany({ where: { seriesId: found.seriesId } });
      if (tags.length) await tx.conferenceSeriesTag.createMany({ data: tags.map(tag => ({ seriesId: found.seriesId, tag })) });
    }
  });
  return NextResponse.json({ ok: true });
}
