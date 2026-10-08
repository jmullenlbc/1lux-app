import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { normalizeTagName } from '@/lib/market-intel/tagRules';
import { RELEVANCE_SELECT, PROJECT_ONLY, rankByRelevance } from '@/lib/market-intel/relevance';

export const SIGNAL_INCLUDE = {
  source:        { select: { name: true, siteUrl: true } },
  linkedClient:  { select: { id: true, name: true } },
  linkedProject: { select: { id: true, name: true, projectNumber: true } },
  assignedTo:    { select: { id: true, name: true } },
  supersededBy:  { select: { id: true, kind: true, title: true } },
  tags:          { select: { role: true, tag: { select: { id: true, kind: true, name: true, normalized: true, clientId: true } } } },
};

// Sort orders the news and permits tabs offer (Mike 10-8: "sort all those
// tabs"). Nulls go last so "most units" does not open with the blanks.
// `relevant` is not a database order: see relevance.js and the branch below.
export const SIGNAL_SORTS = {
  relevant:   [{ publishedAt: 'desc' }],
  newest:     [{ publishedAt: 'desc' }],
  oldest:     [{ publishedAt: 'asc' }],
  units:      [{ unitCount:      { sort: 'desc', nulls: 'last' } }, { publishedAt: 'desc' }],
  value:      [{ valuation:      { sort: 'desc', nulls: 'last' } }, { publishedAt: 'desc' }],
  title:      [{ title: 'asc' }],
  source:     [{ source: { name: 'asc' } }, { publishedAt: 'desc' }],
  contractor: [{ contractorName: { sort: 'asc', nulls: 'last' } }, { publishedAt: 'desc' }],
  address:    [{ address:        { sort: 'asc', nulls: 'last' } }, { publishedAt: 'desc' }],
};

export async function GET(request) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const sort         = SIGNAL_SORTS[searchParams.get('sort')] ? searchParams.get('sort') : 'newest';
  const projectType  = searchParams.get('projectType');
  const signalType   = searchParams.get('signalType');
  const reviewStatus = searchParams.get('reviewStatus');
  const clientId     = searchParams.get('clientId');
  const projectId    = searchParams.get('projectId');
  const signalId     = searchParams.get('signalId');
  const search       = searchParams.get('search')?.trim();
  const page         = Math.max(1, parseInt(searchParams.get('page') || '1'));
  const limit        = 50;

  // Tag filters (0122): metro, state, company, project are all "has a tag of
  // this kind with this name". assignedTo takes a user id or "me".
  const tagFilters = [];
  for (const [kind, param] of [['METRO', 'metro'], ['STATE', 'state'], ['COMPANY', 'company'], ['PROJECT', 'project']]) {
    const v = searchParams.get(param)?.trim();
    if (v) tagFilters.push({ tags: { some: { tag: { kind, normalized: normalizeTagName(v, kind) } } } });
  }
  // city / state columns (0127): exact match on the column, no tag walk.
  const cityParam  = searchParams.get('city')?.trim();
  if (cityParam) tagFilters.push({ city: { equals: cityParam, mode: 'insensitive' } });
  const assignedTo = searchParams.get('assignedTo')?.trim();
  const hasUnits   = searchParams.get('hasUnits') === '1';

  // kind (0123): ARTICLE is the news tab, PERMIT the permits tab. A direct
  // link by signalId must work from either tab, so no kind filter then.
  const kind        = (searchParams.get('kind') || 'ARTICLE').toUpperCase();
  const permitClass = searchParams.get('permitClass')?.trim();

  const where = {};
  if (signalId)     where.id           = signalId;
  else if (kind !== 'ALL') where.kind  = kind;
  // Articles that are not about a project are not wanted (Mike 10-8, 0125).
  // A direct link by id still opens, so an old bell item never 404s.
  // screened=1 flips the list to ONLY the screened out ones, so a wrong call
  // can be found and kept ("Show screened out" on the news tab).
  const screened = searchParams.get('screened') === '1';
  if (!signalId)    tagFilters.push(screened ? { projectRelated: false } : PROJECT_ONLY);
  if (permitClass)  where.permitClass  = permitClass;
  if (projectType)  where.projectType  = projectType;
  if (signalType)   where.signalType   = signalType;
  if (reviewStatus) where.reviewStatus = reviewStatus;
  if (hasUnits)     where.unitCount    = { not: null };
  if (assignedTo)   where.assignedToId = assignedTo === 'me' ? (user.id || user.userId) : assignedTo;
  // "This client's news" means articles linked to it OR tagged with a company
  // tag that points at it, so a confirmed GC or architect match counts too.
  if (clientId) {
    tagFilters.push({ OR: [
      { linkedClientId: clientId },
      { tags: { some: { tag: { clientId } } } },
    ] });
  }
  // Asking for one job's news means the confirmed ones, not the guesses. A
  // suggestion is visible on the market-intel screen where it can be reviewed,
  // not on the project it has not yet been agreed to belong to.
  if (projectId) {
    where.linkedProjectId    = projectId;
    where.projectMatchStatus = { in: ['AUTO_LINKED', 'CONFIRMED'] };
  }
  if (search) {
    tagFilters.push({ OR: [
      { title:          { contains: search } },
      { summary:        { contains: search } },
      { developerNames: { contains: search } },
      { address:        { contains: search, mode: 'insensitive' } },
      { contractorName: { contains: search, mode: 'insensitive' } },
      { permitNumber:   { contains: search, mode: 'insensitive' } },
      { tags: { some: { tag: { normalized: { contains: search.toLowerCase() } } } } },
    ] });
  }
  if (tagFilters.length) where.AND = tagFilters;

  // "Most relevant" is a score, not a column: score every matching row on a
  // handful of fields, take this page's ids, then load those rows in full.
  if (sort === 'relevant') {
    const thin  = await prisma.marketSignal.findMany({ where, select: RELEVANCE_SELECT });
    const ids   = rankByRelevance(thin).slice((page - 1) * limit, page * limit);
    const rows  = await prisma.marketSignal.findMany({ where: { id: { in: ids } }, include: SIGNAL_INCLUDE });
    const byId  = new Map(rows.map(r => [r.id, r]));
    return NextResponse.json({ signals: ids.map(id => byId.get(id)).filter(Boolean), total: thin.length, page, limit });
  }

  const [signals, total] = await Promise.all([
    prisma.marketSignal.findMany({
      where,
      orderBy: SIGNAL_SORTS[sort],
      skip:    (page - 1) * limit,
      take:    limit,
      include: SIGNAL_INCLUDE,
    }),
    prisma.marketSignal.count({ where }),
  ]);

  return NextResponse.json({ signals, total, page, limit });
}
