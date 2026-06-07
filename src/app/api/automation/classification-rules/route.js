import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { invalidateRulesCache } from '@/lib/bot/activityClassifier';

const DEFAULT_RULES = [
  // Title-based (keyword rules — replaces old Python keyword list)
  { name: 'Coffee / Cafe',          conditionType: 'TITLE_CONTAINS', conditionValue: 'coffee',      resultType: 'COFFEE',     priority: 50 },
  { name: 'Cafe keyword',           conditionType: 'TITLE_CONTAINS', conditionValue: 'cafe',        resultType: 'COFFEE',     priority: 50 },
  { name: 'Lunch meeting',          conditionType: 'TITLE_CONTAINS', conditionValue: 'lunch',       resultType: 'LUNCH',      priority: 50 },
  { name: 'Dinner meeting',         conditionType: 'TITLE_CONTAINS', conditionValue: 'dinner',      resultType: 'LUNCH',      priority: 50 },
  { name: 'Breakfast meeting',      conditionType: 'TITLE_CONTAINS', conditionValue: 'breakfast',   resultType: 'LUNCH',      priority: 50 },
  { name: 'Golf outing',            conditionType: 'TITLE_CONTAINS', conditionValue: 'golf',        resultType: 'GOLF',       priority: 50 },
  { name: 'Tee time',               conditionType: 'TITLE_CONTAINS', conditionValue: 'tee time',    resultType: 'GOLF',       priority: 50 },
  { name: 'Happy hour',             conditionType: 'TITLE_CONTAINS', conditionValue: 'happy hour',  resultType: 'HAPPY_HOUR', priority: 50 },
  { name: 'Drinks',                 conditionType: 'TITLE_CONTAINS', conditionValue: 'drinks',      resultType: 'HAPPY_HOUR', priority: 50 },
  { name: 'Cocktails',              conditionType: 'TITLE_CONTAINS', conditionValue: 'cocktail',    resultType: 'HAPPY_HOUR', priority: 50 },
  { name: 'Site visit',             conditionType: 'TITLE_CONTAINS', conditionValue: 'site visit',  resultType: 'SITE_VISIT', priority: 50 },
  { name: 'Site tour',              conditionType: 'TITLE_CONTAINS', conditionValue: 'site tour',   resultType: 'SITE_VISIT', priority: 50 },
  // Location-based
  { name: 'Golf location',          conditionType: 'LOCATION_CONTAINS', conditionValue: 'golf',     resultType: 'GOLF',       priority: 60 },
  { name: 'Virtual — skip',         conditionType: 'LOCATION_TYPE',  conditionValue: 'virtual',     resultType: 'SKIP',       priority: 80 },
  // Attendee count
  { name: 'Large group — skip',     conditionType: 'ATTENDEE_MIN',   conditionValue: '15',          resultType: 'SKIP',       priority: 70 },
];

export async function GET() {
  const { error } = await requireAuth();
  if (error) return error;
  const rules = await prisma.activityClassificationRule.findMany({
    orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
  });
  return NextResponse.json({ rules });
}

export async function POST(req) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const body = await req.json();

  // Seed defaults
  if (body.seed) {
    const existing = await prisma.activityClassificationRule.count();
    if (existing > 0) return NextResponse.json({ ok: true, skipped: true });
    const created = await prisma.activityClassificationRule.createMany({
      data: DEFAULT_RULES.map(r => ({ ...r, createdById: user.id })),
    });
    invalidateRulesCache();
    return NextResponse.json({ ok: true, created: created.count });
  }

  const { name, conditionType, conditionValue, resultType, priority, isActive } = body;
  if (!name || !conditionType || !conditionValue || !resultType) {
    return NextResponse.json({ error: 'name, conditionType, conditionValue, resultType required' }, { status: 400 });
  }

  const rule = await prisma.activityClassificationRule.create({
    data: {
      name, conditionType, conditionValue, resultType,
      priority: priority ?? 50,
      isActive: isActive ?? true,
      createdById: user.id,
    },
  });
  invalidateRulesCache();
  return NextResponse.json({ rule }, { status: 201 });
}
