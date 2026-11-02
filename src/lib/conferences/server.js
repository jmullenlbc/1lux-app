import { loadAnnualBudgets } from '@/lib/sales/annualBudgets';
import { prisma } from '@/lib/db';
import { actsAsAdmin, isSalesAdmin } from '@/lib/auth';
import { settingsFromRows, computeEdition, computePlan, rankRows, markClashes, dayOf, DEFAULT_PLAN_SETTINGS } from './engine';
import { verticalLabel, formatLabel, accessLabel, scopeLabel, statusLabel, priceLabel, focusLabel, regionLabel } from './constants';

// Reads the plan out of the database and runs the math over it. Scores and
// costs are never stored, so a changed setting moves every number at once.
// Staff only: this carries organizer contacts and our own read on each event.

const dollars = (c) => (c == null ? null : c / 100);

const SERIES_SELECT = {
  id: true, archivedAt: true, slug: true, name: true, organizer: true, vertical: true, format: true, audience: true,
  description: true, url: true, accessRoute: true, supplierEligible: true, regCostPerCompany: true,
  membershipRequired: true, supplierRestrictions: true, buyerDensity: true, supplierAccess: true,
  tags: { select: { tag: true } },
};

// Any sales staff can look. Sales Admins and admins change the plan.
export const canEditConferences = (user) => isSalesAdmin(user) || actsAsAdmin(user);

export async function currentPlan() {
  return prisma.conferencePlan.findFirst({ orderBy: { year: 'desc' }, include: { settings: true } });
}

function engineEdition(e) {
  return {
    ...e,
    regCost: dollars(e.regCostCents),
    hotelRateOverride: dollars(e.hotelRateOverrideCents),
    airfareOverride: dollars(e.airfareOverrideCents),
  };
}

// One row for the Library and Plan tables. Long research text stays on the
// event page.
function rowOf(e, settings, membershipBySlug) {
  const s = e.series;
  const c = computeEdition(engineEdition(e), s, settings);
  const tags = s.tags.map(t => t.tag).sort();
  return {
    ...c,
    id: e.id,
    key: e.key,
    name: e.name,
    slug: s.slug,
    organizer: s.organizer,
    vertical: s.vertical,
    verticalLabel: verticalLabel(s.vertical),
    format: formatLabel(s.format),
    formatKey: s.format,
    access: accessLabel(s.accessRoute),
    accessRoute: s.accessRoute,
    tags,
    tagLabels: tags.map(focusLabel),
    year: e.year,
    start: dayOf(e.startDate),
    end: dayOf(e.endDate),
    dateStatus: e.dateStatus,
    city: e.city,
    state: e.state,
    region: e.region,
    regionLabel: regionLabel(e.region),
    scope: e.scope,
    scopeLabel: scopeLabel(e.scope),
    isLocal: e.isLocal,
    attendance: e.attendance,
    priceLabel: priceLabel(e.regCostBasis),
    regCostBasis: e.regCostBasis,
    status: e.status,
    statusLabel: statusLabel(e.status),
    ownerId: e.ownerId,
    ownerName: e.owner?.name || null,
    tierOverride: e.tierOverride,
    includeOverride: e.includeOverride,
    headcountOverride: e.headcountOverride,
    supplierEligible: s.supplierEligible,
    membership: membershipBySlug.get(s.slug) || (c.needsMembership ? s.membershipRequired : null),
    restriction: s.supplierEligible ? null : s.supplierRestrictions,
  };
}

async function loadMemberships(year) {
  const rows = await prisma.conferenceMembership.findMany({
    where: { year },
    include: { unlocks: { include: { series: { select: { slug: true, name: true } } } } },
    orderBy: { orgName: 'asc' },
  });
  return rows.map(m => ({
    id: m.id,
    orgName: m.orgName,
    annualDues: dollars(m.annualDuesCents),
    paid: dollars(m.paidCents),
    paidOn: dayOf(m.paidOn),
    include: m.include,
    notes: m.notes,
    unlocks: m.unlocks.map(u => u.series.slug),
    unlockNames: m.unlocks.map(u => u.series.name),
  }));
}

/** Everything the four tabs read. `loaded` is false until the Admin button has run. */
export async function loadConferencePlan() {
  const plan = await currentPlan();
  if (!plan) return { loaded: false };

  const settings = settingsFromRows(plan.settings);
  const [editions, memberships, archived] = await Promise.all([
    prisma.conferenceEdition.findMany({
      where: { planYear: plan.year },
      include: { series: { select: SERIES_SELECT }, owner: { select: { name: true } } },
    }),
    loadMemberships(plan.year),
    prisma.conferenceEdition.findMany({
      where: { planYear: plan.year, archivedAt: { not: null } },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
  ]);

  const membershipBySlug = new Map();
  for (const m of memberships) for (const slug of m.unlocks) membershipBySlug.set(slug, m.orgName);

  const rows = markClashes(rankRows(editions.filter(e => !e.series.archivedAt).map(e => rowOf(e, settings, membershipBySlug))));
  const budgetCap = dollars(plan.budgetCapCents);
  const result = computePlan(rows, memberships, settings, budgetCap);
  const [budgets, membershipBudgets] = await Promise.all([loadAnnualBudgets('EVENTS'), loadAnnualBudgets('MEMBERSHIPS')]);
  if (budgetCap != null && budgets[plan.year]?.budget == null) budgets[plan.year] = { typedSpend: null, ...budgets[plan.year], budget: budgetCap };

  return {
    loaded: true,
    plan: { id: plan.id, year: plan.year, budgetCap, notes: plan.notes },
    settings,
    defaults: DEFAULT_PLAN_SETTINGS,
    rows,
    result,
    archived,
    budgets,
    membershipBudgets,
  };
}

/** One event with its research text and cost ledger. */
// Everything typed so far, so a new option shows on the other events too.
async function optionsInUse() {
  const [series, tags] = await Promise.all([
    prisma.conferenceSeries.findMany({ select: { vertical: true, format: true, accessRoute: true } }),
    prisma.conferenceSeriesTag.findMany({ select: { tag: true }, distinct: ['tag'] }),
  ]);
  const uniq = (list) => [...new Set(list.filter(Boolean))].sort();
  return {
    vertical: uniq(series.map(s => s.vertical)),
    format: uniq(series.map(s => s.format)),
    access: uniq(series.map(s => s.accessRoute)),
    focus: uniq(tags.map(t => t.tag)),
  };
}

export async function loadConferenceEdition(id) {
  const [edition, plan] = await Promise.all([
    prisma.conferenceEdition.findUnique({
      where: { id },
      include: {
        series: { select: SERIES_SELECT },
        owner: { select: { name: true } },
        sources: { select: { url: true } },
      },
    }),
    currentPlan(),
  ]);
  if (!edition || edition.archivedAt) return null;
  const settings = settingsFromRows(plan?.settings || []);
  const memberships = await loadMemberships(edition.planYear);
  const membershipBySlug = new Map();
  for (const m of memberships) for (const slug of m.unlocks) membershipBySlug.set(slug, m.orgName);
  return {
    ...rowOf(edition, settings, membershipBySlug),
    planNotes: edition.planNotes,
    audience: edition.series.audience,
    description: edition.series.description,
    url: edition.series.url,
    regCostPerCompany: edition.series.regCostPerCompany,
    supplierRestrictions: edition.series.supplierRestrictions,
    buyerDensity: edition.series.buyerDensity,
    supplierAccess: edition.series.supplierAccess,
    priorDates: edition.priorDates,
    regCostDetail: edition.regCostDetail,
    sponsorMinText: edition.sponsorMinText,
    researchNotes: edition.researchNotes,
    addedFrom: edition.addedFrom,
    hotelRateOverride: dollars(edition.hotelRateOverrideCents),
    airfareOverride: dollars(edition.airfareOverrideCents),
    sources: edition.sources.map(s => s.url),
    options: await optionsInUse(),
    settings,
  };
}
