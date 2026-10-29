/**
 * Bid Comparison learning, the database part (0139, Mike 10-22). Server only.
 * Saves a staff mark on a comparison line, recounts the proposals the marks
 * add up to, and applies a proposal a person approved through rulesStore.
 */
import { prisma } from '@/lib/db';
import { normMfr } from '../specSwap/family.js';
import { MARKS, GRADES, proposeFromMarks } from './learnRules.js';
import { loadRules } from './load.js';
import { RuleError, saveBrand, addKindWord } from './rulesStore.js';

const str = (v, n) => String(v ?? '').trim().slice(0, n);
const opt = (v, n) => (v ? str(v, n) : null);

export const markOut = (m) => ({
  lineKey: m.lineKey,
  mark: m.mark,
  kindShould: m.kindShould,
  gradeShould: m.gradeShould,
  at: m.updatedAt,
});

export const proposalOut = (p) => ({
  id: p.id,
  kind: p.kind,
  kindKey: p.kindKey,
  phrase: p.phrase,
  brand: p.brand,
  grade: p.grade,
  status: p.status,
  marks: p.marks,
  against: p.against,
  sample: p.sample,
  appliedAs: p.appliedAs,
  proposedAt: p.proposedAt,
  decidedAt: p.decidedAt,
});

/** This person's marks on one job, keyed by line. */
export async function marksFor(job, user) {
  const rows = await prisma.bidLineMark.findMany({ where: { job, userId: user.id } });
  return Object.fromEntries(rows.map((m) => [m.lineKey, markOut(m)]));
}

/** Every proposal, waiting ones first, newest first. */
export async function listProposals() {
  const rows = await prisma.ruleProposal.findMany({ orderBy: { proposedAt: 'desc' }, take: 300 });
  return rows.sort((a, b) => (a.status === 'PROPOSED' ? 0 : 1) - (b.status === 'PROPOSED' ? 0 : 1)).map(proposalOut);
}

/** Save (or change) one person's mark on one line, then recount the proposals. */
export async function saveMark(input, user) {
  const mark = str(input.mark, 20).toUpperCase();
  if (!MARKS.has(mark)) throw new RuleError('Mark must be Right, Wrong kind or Wrong grade');
  const job = str(input.job, 200);
  const lineKey = str(input.lineKey, 300);
  if (!job || !lineKey) throw new RuleError('Which line is this?');
  const rules = await loadRules();
  const kindShould = mark === 'WRONG_KIND' ? str(input.kindShould, 40) : null;
  if (mark === 'WRONG_KIND' && !rules.kinds.some((k) => k.key === kindShould)) throw new RuleError('Pick the kind it should be');
  const gradeShould = mark === 'WRONG_GRADE' ? str(input.gradeShould, 10).toUpperCase() : null;
  if (mark === 'WRONG_GRADE' && !GRADES.has(gradeShould)) throw new RuleError('Pick Builder or Spec');
  const data = {
    typeTag: str(input.typeTag, 40),
    description: str(input.description, 400),
    mfr: str(input.mfr, 120),
    catalog: str(input.catalog, 200),
    kindRead: opt(input.kindRead, 40),
    gradeRead: opt(input.gradeRead, 10),
    gradeBy: opt(input.gradeBy, 10),
    mark,
    kindShould,
    gradeShould,
  };
  const row = await prisma.bidLineMark.upsert({
    where: { job_lineKey_userId: { job, lineKey, userId: user.id } },
    create: { job, lineKey, userId: user.id, ...data },
    update: data,
  });
  const proposals = await refreshProposals(rules);
  return { mark: markOut(row), proposals };
}

/** Take one person's mark off a line (pressed by mistake). */
export async function clearMark(input, user) {
  const job = str(input.job, 200);
  const lineKey = str(input.lineKey, 300);
  await prisma.bidLineMark.deleteMany({ where: { job, lineKey, userId: user.id } });
  return { proposals: await refreshProposals(await loadRules()) };
}

// New proposals are added; a waiting one's counts move with the marks; a
// decided one is left alone (a turned down change does not come back).
async function refreshProposals(rules) {
  const [marks, existing] = await Promise.all([prisma.bidLineMark.findMany(), prisma.ruleProposal.findMany()]);
  const byKey = new Map(existing.map((p) => [p.key, p]));
  for (const w of proposeFromMarks(marks, rules)) {
    const p = byKey.get(w.key);
    if (!p) await prisma.ruleProposal.create({ data: w });
    else if (p.status === 'PROPOSED' && (p.marks !== w.marks || p.against !== w.against)) {
      await prisma.ruleProposal.update({ where: { id: p.id }, data: { marks: w.marks, against: w.against } });
    }
  }
  return listProposals();
}

/**
 * A person approves (optionally changing the word or grade first) or turns
 * down a proposal. Approving applies it through rulesStore, so it shows on
 * the kind or brand as a HUMAN edit.
 */
export async function decideProposal(input, user) {
  const status = str(input.status, 10).toUpperCase();
  if (status !== 'APPROVED' && status !== 'REJECTED') throw new RuleError('Approve or turn down');
  const p = await prisma.ruleProposal.findUnique({ where: { id: str(input.id, 40) } });
  if (!p) throw new RuleError('No suggestion by that id');
  if (p.status !== 'PROPOSED') throw new RuleError('Already decided');
  let appliedAs = '';
  if (status === 'APPROVED') {
    if (p.kind === 'KIND_WORD') {
      const phrase = str(input.phrase ?? p.phrase, 60).toUpperCase();
      await addKindWord(p.kindKey, phrase, user);
      if (phrase !== p.phrase) appliedAs = phrase;
    } else {
      const grade = str(input.grade ?? p.grade, 10).toUpperCase();
      const row = (await loadRules()).brandRows.find((b) => normMfr(b.brand) === p.brand);
      await saveBrand({ brand: p.brand, grade, sage: !!row?.sage, note: 'From staff marks' }, user);
      if (grade !== p.grade) appliedAs = grade;
    }
  }
  await prisma.ruleProposal.update({ where: { id: p.id }, data: { status, appliedAs, decidedById: user.id, decidedAt: new Date() } });
  return { ok: true };
}
