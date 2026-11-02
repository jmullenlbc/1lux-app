import { cents } from '../money.js';
import { CONFERENCE_SEED } from './seedData.js';
import { seriesFromSeed, editionFromSeed, SEED_MEMBERSHIPS, PLAN_YEAR } from './seedMap.js';

// Loads the research file into the database (0160, Mike 11-1). Run from a button
// on Admin, never on deploy. It only adds what is missing and never updates a
// row, so pressing it twice is safe and your edits stay. All or nothing: a load
// that stops part way leaves no half made events.

const toCents = (dollars) => (dollars == null ? null : Math.round(cents(dollars) * 100));
const toDay = (day) => (day ? new Date(`${String(day).slice(0, 10)}T12:00:00.000Z`) : null);

// The file repeats four series on two rows. The first row's text wins and the
// focus tags are added together.
function seriesBySlug() {
  const map = new Map();
  for (const { series } of CONFERENCE_SEED) {
    const row = map.get(series.slug) || { data: seriesFromSeed(series), tags: new Set() };
    for (const t of series.focusTags || []) row.tags.add(t);
    map.set(series.slug, row);
  }
  return map;
}

function editionData(edition, seriesId) {
  const { regCost, hotelRateOverride, startDate, endDate, ...rest } = editionFromSeed(edition);
  return {
    ...rest,
    seriesId,
    planYear: PLAN_YEAR,
    startDate: toDay(startDate),
    endDate: toDay(endDate),
    regCostCents: toCents(regCost),
    hotelRateOverrideCents: toCents(hotelRateOverride),
  };
}

export async function loadConferenceSeed(prisma) {
  return prisma.$transaction(async (tx) => {
    // Archived rows count as present, so a load never brings one back as a copy.
    const haveSeries = await tx.conferenceSeries.findMany({ where: { archivedAt: undefined }, select: { slug: true } });
    const haveEditions = await tx.conferenceEdition.findMany({ where: { archivedAt: undefined }, select: { key: true } });
    const seen = new Set(haveSeries.map(s => s.slug));
    const seenKeys = new Set(haveEditions.map(e => e.key));

    const wanted = seriesBySlug();
    const newSeries = [...wanted.entries()].filter(([slug]) => !seen.has(slug));
    if (newSeries.length) await tx.conferenceSeries.createMany({ data: newSeries.map(([, s]) => s.data) });

    const idRows = await tx.conferenceSeries.findMany({ where: { archivedAt: undefined }, select: { id: true, slug: true } });
    const idOf = new Map(idRows.map(s => [s.slug, s.id]));

    const tags = newSeries.flatMap(([slug, s]) => [...s.tags].map(tag => ({ seriesId: idOf.get(slug), tag })));
    if (tags.length) await tx.conferenceSeriesTag.createMany({ data: tags });

    const newEditions = CONFERENCE_SEED.filter(({ edition }) => !seenKeys.has(edition.key));
    if (newEditions.length) {
      await tx.conferenceEdition.createMany({
        data: newEditions.map(({ series, edition }) => editionData(edition, idOf.get(series.slug))),
      });
    }

    const keys = newEditions.map(({ edition }) => edition.key);
    const editionIds = keys.length
      ? await tx.conferenceEdition.findMany({ where: { key: { in: keys } }, select: { id: true, key: true } })
      : [];
    const editionIdOf = new Map(editionIds.map(e => [e.key, e.id]));
    const sources = newEditions.flatMap(({ edition }) =>
      [...new Set(edition.sourceUrls || [])].map(url => ({ editionId: editionIdOf.get(edition.key), url })));
    if (sources.length) await tx.conferenceEditionSource.createMany({ data: sources });

    let planMade = 0;
    if (!await tx.conferencePlan.findUnique({ where: { year: PLAN_YEAR } })) {
      await tx.conferencePlan.create({ data: { year: PLAN_YEAR } });
      planMade = 1;
    }

    let membershipsMade = 0;
    for (const m of SEED_MEMBERSHIPS) {
      const found = await tx.conferenceMembership.findUnique({ where: { year_orgName: { year: PLAN_YEAR, orgName: m.orgName } } });
      if (found) continue;
      await tx.conferenceMembership.create({
        data: {
          year: PLAN_YEAR,
          orgName: m.orgName,
          annualDuesCents: toCents(m.annualDues),
          include: m.include,
          notes: m.notes,
          unlocks: { create: m.unlocks.filter(slug => idOf.has(slug)).map(slug => ({ seriesId: idOf.get(slug) })) },
        },
      });
      membershipsMade += 1;
    }

    return {
      series: newSeries.length,
      editions: newEditions.length,
      sources: sources.length,
      plan: planMade,
      memberships: membershipsMade,
      inFile: { series: wanted.size, editions: CONFERENCE_SEED.length },
    };
  }, { timeout: 25000, maxWait: 5000 });
}
