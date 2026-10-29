import { NextResponse } from 'next/server';
import { requireAuth, isClientViewer } from '@/lib/auth';
import { DEFAULT_KINDS, WORD_LISTS, defaultBrandRows, rangeText } from '@/lib/bidComparison/kinds';
import { loadPastRows, loadRules, jobList, tryPastJob } from '@/lib/bidComparison/load';
import { RuleError, saveKind, archiveKind, moveKind, saveBrand, archiveBrand } from '@/lib/bidComparison/rulesStore';
import { marksFor, listProposals, saveMark, clearMark, decideProposal } from '@/lib/bidComparison/learn';

// Bid Comparison (Mike 10-21): internal only. The fixture kinds and brand
// grades the check reads, the past jobs, and ?job= checks one past job's ILC
// prices against the other jobs. Staff edit kinds and brands here (0138, Mike
// 10-22); until the first edit the code defaults are shown. Every staff
// account may edit and mark lines (Mike 10-22: "everyone for now"); client
// viewers may not. Marks and the proposals they add up to are 0139.

async function requireStaff(request) {
  const r = await requireAuth(request);
  if (r.error) return r;
  if (isClientViewer(r.user.role)) return { user: null, error: NextResponse.json({ error: 'Staff only' }, { status: 403 }) };
  return r;
}

const wordsOf = (k, list) => (k.words ? k.words.filter((w) => w.list === list).sort((a, b) => a.sortOrder - b.sortOrder).map((w) => w.phrase) : k[WORD_LISTS[list]] || []);

const kindOut = (k) => ({
  key: k.key,
  name: k.name,
  sizeUnit: k.sizeUnit ?? null,
  sizeMin: k.sizeMin ?? null,
  sizeMax: k.sizeMax ?? null,
  sageOnly: !!k.sageOnly,
  noTypical: !!k.noTypical,
  match: wordsOf(k, 'MATCH'),
  not: wordsOf(k, 'NOT'),
  builderWords: wordsOf(k, 'BUILDER'),
  specWords: wordsOf(k, 'SPEC'),
  builderNote: k.builderNote || '',
  specNote: k.specNote || '',
  builderLow: k.builderLow ?? null,
  builderHigh: k.builderHigh ?? null,
  specLow: k.specLow ?? null,
  specHigh: k.specHigh ?? null,
  builderRange: rangeText(k, 'BUILDER'),
  specRange: rangeText(k, 'SPEC'),
  source: k.source || 'DEFAULT',
  archived: !!k.archivedAt,
  updatedAt: k.updatedAt || null,
});

const brandOut = (b) => ({
  brand: b.brand,
  grade: b.grade ?? null,
  sage: !!b.sage,
  status: b.status || 'APPROVED',
  source: b.source || 'DEFAULT',
  confidence: b.confidence ?? null,
  note: b.note || '',
  archived: !!b.archivedAt,
  decidedAt: b.decidedAt || null,
});

export async function GET(request) {
  const { user, error } = await requireStaff(request);
  if (error) return error;

  const job = new URL(request.url).searchParams.get('job');
  const [rows, rules] = await Promise.all([loadPastRows(), loadRules()]);
  if (job) {
    const out = tryPastJob(rows, job, rules);
    if (!out) return NextResponse.json({ error: 'No past job by that name' }, { status: 404 });
    return NextResponse.json({ ...out, marks: await marksFor(job, user) });
  }

  const kinds = (rules.kindRows.length ? rules.kindRows : DEFAULT_KINDS).map(kindOut);
  const brands = (rules.brandRows.length ? rules.brandRows : defaultBrandRows())
    .map(brandOut)
    .sort((a, b) => a.brand.localeCompare(b.brand));
  return NextResponse.json({ kinds, brands, fromDb: rules.fromDb, jobs: jobList(rows), proposals: await listProposals() });
}

// { action: saveKind | archiveKind | moveKind | saveBrand | archiveBrand | mark | clearMark | decideProposal, ... }
export async function POST(request) {
  const { user, error } = await requireStaff(request);
  if (error) return error;
  const body = await request.json().catch(() => ({}));
  try {
    switch (body.action) {
      case 'saveKind':
        return NextResponse.json(await saveKind(body.kind || {}, user));
      case 'archiveKind':
        await archiveKind(body.key, body.archived !== false, user);
        return NextResponse.json({ ok: true });
      case 'moveKind':
        await moveKind(body.key, Number(body.dir) || 0, user);
        return NextResponse.json({ ok: true });
      case 'saveBrand':
        return NextResponse.json(await saveBrand(body.brand || {}, user));
      case 'archiveBrand':
        await archiveBrand(body.brand, body.archived !== false, user);
        return NextResponse.json({ ok: true });
      case 'mark':
        return NextResponse.json(await saveMark(body, user));
      case 'clearMark':
        return NextResponse.json(await clearMark(body, user));
      case 'decideProposal':
        return NextResponse.json(await decideProposal(body, user));
      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }
  } catch (e) {
    if (e instanceof RuleError || e instanceof SyntaxError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
