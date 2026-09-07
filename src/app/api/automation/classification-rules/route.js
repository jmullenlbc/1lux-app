import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { invalidateRulesCache } from '@/lib/bot/activityClassifier';

/**
 * The starter set of rules, seeded once on first use. Everything here is a
 * starting point the user can edit or switch off.
 *
 * The priorities matter, and they changed on 2026-09-07. Mike's rule is that a
 * business word in the title wins: "Catalina golf mixer is every other week and
 * is a business event. each of those should count always." The two skip rules
 * used to sit ABOVE the title rules (80 and 70), which meant a lunch with a
 * Teams link left on the invite, or a 20-person networking event, got thrown
 * away before anything read the title. They now sit BELOW, so they only decide
 * the events whose title says nothing.
 */
const DEFAULT_RULES = [
  // Title-based (keyword rules — replaces old Python keyword list)
  { name: 'Coffee / Cafe',          conditionType: 'TITLE_CONTAINS', conditionValue: 'coffee',      resultType: 'COFFEE',     priority: 50 },
  { name: 'Cafe keyword',           conditionType: 'TITLE_CONTAINS', conditionValue: 'cafe',        resultType: 'COFFEE',     priority: 50 },
  // One "Meal" category for breakfast, lunch and dinner — Mike, 2026-09-07.
  { name: 'Lunch meeting',          conditionType: 'TITLE_CONTAINS', conditionValue: 'lunch',       resultType: 'MEAL',       priority: 50 },
  { name: 'Dinner meeting',         conditionType: 'TITLE_CONTAINS', conditionValue: 'dinner',      resultType: 'MEAL',       priority: 50 },
  { name: 'Breakfast meeting',      conditionType: 'TITLE_CONTAINS', conditionValue: 'breakfast',   resultType: 'MEAL',       priority: 50 },
  { name: 'Golf outing',            conditionType: 'TITLE_CONTAINS', conditionValue: 'golf',        resultType: 'GOLF',       priority: 50 },
  { name: 'Tee time',               conditionType: 'TITLE_CONTAINS', conditionValue: 'tee time',    resultType: 'GOLF',       priority: 50 },
  { name: 'Happy hour',             conditionType: 'TITLE_CONTAINS', conditionValue: 'happy hour',  resultType: 'HAPPY_HOUR', priority: 50 },
  { name: 'Drinks',                 conditionType: 'TITLE_CONTAINS', conditionValue: 'drinks',      resultType: 'HAPPY_HOUR', priority: 50 },
  { name: 'Cocktails',              conditionType: 'TITLE_CONTAINS', conditionValue: 'cocktail',    resultType: 'HAPPY_HOUR', priority: 50 },
  { name: 'Site visit',             conditionType: 'TITLE_CONTAINS', conditionValue: 'site visit',  resultType: 'SITE_VISIT', priority: 50 },
  { name: 'Site tour',              conditionType: 'TITLE_CONTAINS', conditionValue: 'site tour',   resultType: 'SITE_VISIT', priority: 50 },
  // Networking. A "mixer" is a real business event even when nobody was invited
  // on the calendar entry — the Catalina Golf Mixer is the one that proved it.
  { name: 'Mixer',                  conditionType: 'TITLE_CONTAINS', conditionValue: 'mixer',       resultType: 'EVENT',      priority: 50 },
  { name: 'Networking event',       conditionType: 'TITLE_CONTAINS', conditionValue: 'networking',  resultType: 'EVENT',      priority: 50 },
  { name: 'Conference',             conditionType: 'TITLE_CONTAINS', conditionValue: 'conference',  resultType: 'EVENT',      priority: 50 },
  { name: 'Groundbreaking',         conditionType: 'TITLE_CONTAINS', conditionValue: 'groundbreaking', resultType: 'EVENT',   priority: 50 },
  // Days on the road to see clients — counted in days, not meetings.
  { name: 'Business trip',          conditionType: 'TITLE_CONTAINS', conditionValue: 'business trip', resultType: 'TRAVEL',   priority: 50 },
  { name: 'Travel day',             conditionType: 'TITLE_CONTAINS', conditionValue: 'travel day',  resultType: 'TRAVEL',     priority: 50 },
  { name: 'Flight',                 conditionType: 'TITLE_CONTAINS', conditionValue: 'flight',      resultType: 'TRAVEL',     priority: 50 },
  { name: 'Out of town',            conditionType: 'TITLE_CONTAINS', conditionValue: 'out of town', resultType: 'TRAVEL',     priority: 50 },
  // Location-based
  { name: 'Golf location',          conditionType: 'LOCATION_CONTAINS', conditionValue: 'golf',     resultType: 'GOLF',       priority: 60 },
  // Below the title rules on purpose — see the note above.
  { name: 'Virtual — skip',         conditionType: 'LOCATION_TYPE',  conditionValue: 'virtual',     resultType: 'SKIP',       priority: 30 },
  { name: 'Large group — skip',     conditionType: 'ATTENDEE_MIN',   conditionValue: '15',          resultType: 'SKIP',       priority: 25 },
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
