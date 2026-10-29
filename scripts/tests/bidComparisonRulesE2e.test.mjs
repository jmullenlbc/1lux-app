// Admin > Fixture kinds edits (0138, Mike 10-22): add, change, move and
// archive a kind; add, grade and archive a brand; bad input is turned away.
// Writes only rows named E2E and removes them after.
// Run: node --test scripts/tests/bidComparisonRulesE2e.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { login, get, post, serverUp } from './_auth.mjs';
import { ensureE2eAdmin } from './_e2eAdmin.mjs';

const URL = '/api/admin/bid-comparison';
const BRAND = 'E2E TEST BRAND';

test('bid comparison rules: staff edit kinds and brands', async (t) => {
  if (!(await serverUp())) { t.skip('dev server not reachable'); return; }
  const prisma = new PrismaClient();
  let key = null;
  try {
    const { email, password } = await ensureE2eAdmin(prisma);
    const { cookie } = await login(email, password);

    const anon = await post(URL, { action: 'saveBrand', brand: { brand: BRAND, grade: 'SPEC' } });
    assert.ok(anon.status === 401 || anon.status === 403, `signed out got ${anon.status}`);

    const bad = await post(URL, { action: 'saveKind', kind: { name: 'E2E Puck', match: '' } }, cookie);
    assert.equal(bad.status, 400);
    assert.match(bad.json.error, /at least one word/);
    const badRange = await post(URL, { action: 'saveKind', kind: { name: 'E2E Puck', match: 'PUCK*', builderLow: 90, builderHigh: 40 } }, cookie);
    assert.equal(badRange.status, 400);

    const add = await post(URL, { action: 'saveKind', kind: { name: 'E2E Puck', match: 'E2EPUCK*\nE2E PUCK', builder: 'PLASTIC', builderLow: 20, builderHigh: 40 } }, cookie);
    assert.equal(add.status, 200, add.text);
    key = add.json.key;

    let list = await get(URL, cookie);
    assert.equal(list.json.fromDb.kinds, true, 'the first edit saves every kind');
    let k = list.json.kinds.find((x) => x.key === key);
    assert.deepEqual(k.match, ['E2EPUCK*', 'E2E PUCK']);
    assert.equal(k.source, 'HUMAN');
    assert.match(k.builderRange, /\$20 to \$40/);
    assert.ok(list.json.kinds.some((x) => x.key === 'fan'), 'starting kinds kept');
    const at = list.json.kinds.filter((x) => !x.archived).findIndex((x) => x.key === key);

    const up = await post(URL, { action: 'moveKind', key, dir: -1 }, cookie);
    assert.equal(up.status, 200, up.text);
    list = await get(URL, cookie);
    assert.equal(list.json.kinds.filter((x) => !x.archived).findIndex((x) => x.key === key), at - 1);

    const edit = await post(URL, { action: 'saveKind', kind: { ...k, sageOnly: true, builder: k.builderWords, spec: k.specWords } }, cookie);
    assert.equal(edit.status, 200, edit.text);
    list = await get(URL, cookie);
    k = list.json.kinds.find((x) => x.key === key);
    assert.equal(k.sageOnly, true);
    assert.equal(k.builderLow, null, 'Sage Brands only clears the price ranges');

    assert.equal((await post(URL, { action: 'archiveKind', key, archived: true }, cookie)).status, 200);
    list = await get(URL, cookie);
    assert.equal(list.json.kinds.find((x) => x.key === key).archived, true);

    const brand = await post(URL, { action: 'saveBrand', brand: { brand: 'e2e test brand', grade: 'SPEC', sage: true } }, cookie);
    assert.equal(brand.status, 200, brand.text);
    list = await get(URL, cookie);
    const b = list.json.brands.find((x) => x.brand === BRAND);
    assert.ok(b, 'brand saved under its normal spelling');
    assert.equal(b.grade, 'SPEC');
    assert.equal(b.sage, true);
    assert.equal(b.source, 'HUMAN');
    assert.ok(list.json.brands.some((x) => x.brand === 'SAGE' && x.sage && !x.grade), 'starting brands kept');

    const badGrade = await post(URL, { action: 'saveBrand', brand: { brand: BRAND, grade: 'GOLD' } }, cookie);
    assert.equal(badGrade.status, 400);
    assert.equal((await post(URL, { action: 'archiveBrand', brand: BRAND, archived: true }, cookie)).status, 200);
    list = await get(URL, cookie);
    assert.equal(list.json.brands.find((x) => x.brand === BRAND).archived, true);
  } finally {
    if (key) await prisma.fixtureKind.deleteMany({ where: { key } });
    await prisma.brandGrade.deleteMany({ where: { brand: BRAND } });
    await prisma.$disconnect();
  }
});

// Learning loop (0139): a mark on a real job's line comes back with the job;
// clearing it removes it; an approved suggestion adds the word to the kind.
test('bid comparison learning: marks, clear, approve a suggestion', async (t) => {
  if (!(await serverUp())) { t.skip('dev server not reachable'); return; }
  const prisma = new PrismaClient();
  const KEY = 'e2e-learn-kind';
  const PKEY = `KIND_WORD|${KEY}|E2EWORD`;
  let job = null;
  let lineKey = null;
  let userId = null;
  try {
    const { email, password } = await ensureE2eAdmin(prisma);
    const { cookie } = await login(email, password);
    userId = (await prisma.user.findUnique({ where: { email } })).id;

    const list = await get(URL, cookie);
    assert.ok(Array.isArray(list.json.proposals), 'proposals come with the list');
    job = list.json.jobs[0]?.job;
    if (!job) { t.skip('no past jobs loaded'); return; }
    const tried = await get(`${URL}?job=${encodeURIComponent(job)}`, cookie);
    assert.equal(tried.status, 200, tried.text);
    const row = tried.json.result.rows[0];
    lineKey = row.key;
    const cell = row.cells.ilc || {};
    const line = { job, lineKey, typeTag: row.typeTag, description: row.description, mfr: cell.mfr, catalog: cell.catalog, kindRead: row.kindKey, gradeRead: cell.grade, gradeBy: cell.gradeBy };

    const bad = await post(URL, { action: 'mark', ...line, mark: 'WRONG_KIND', kindShould: 'no-such-kind' }, cookie);
    assert.equal(bad.status, 400);

    const right = await post(URL, { action: 'mark', ...line, mark: 'RIGHT' }, cookie);
    assert.equal(right.status, 200, right.text);
    assert.equal(right.json.mark.mark, 'RIGHT');
    let again = await get(`${URL}?job=${encodeURIComponent(job)}`, cookie);
    assert.equal(again.json.marks[lineKey].mark, 'RIGHT');

    const wrong = await post(URL, { action: 'mark', ...line, mark: 'WRONG_KIND', kindShould: 'fan' }, cookie);
    assert.equal(wrong.status, 200, wrong.text);
    again = await get(`${URL}?job=${encodeURIComponent(job)}`, cookie);
    assert.equal(again.json.marks[lineKey].kindShould, 'fan', 'one mark per person per line, changed in place');

    assert.equal((await post(URL, { action: 'clearMark', job, lineKey }, cookie)).status, 200);
    again = await get(`${URL}?job=${encodeURIComponent(job)}`, cookie);
    assert.equal(again.json.marks[lineKey], undefined);

    // A kind of our own plus a seeded suggestion; approving adds the word.
    const add = await post(URL, { action: 'saveKind', kind: { name: 'E2E Learn', match: 'E2ELEARN*' } }, cookie);
    assert.equal(add.status, 200, add.text);
    const kindKey = add.json.key;
    const seeded = await prisma.ruleProposal.create({ data: { key: PKEY, kind: 'KIND_WORD', kindKey, phrase: 'E2EWORD', marks: 3, sample: 'e2e word sample' } });
    const ok = await post(URL, { action: 'decideProposal', id: seeded.id, status: 'APPROVED', phrase: 'E2EWORD TWO' }, cookie);
    assert.equal(ok.status, 200, ok.text);
    const after = await get(URL, cookie);
    const k = after.json.kinds.find((x) => x.key === kindKey);
    assert.ok(k.match.includes('E2EWORD TWO'), `word added: ${k.match}`);
    const p = after.json.proposals.find((x) => x.id === seeded.id);
    assert.equal(p.status, 'APPROVED');
    assert.equal(p.appliedAs, 'E2EWORD TWO');
    assert.equal((await post(URL, { action: 'decideProposal', id: seeded.id, status: 'REJECTED' }, cookie)).status, 400, 'already decided');
    await prisma.fixtureKind.deleteMany({ where: { key: kindKey } });
  } finally {
    if (job && lineKey && userId) await prisma.bidLineMark.deleteMany({ where: { job, lineKey, userId } });
    await prisma.ruleProposal.deleteMany({ where: { key: PKEY } });
    await prisma.$disconnect();
  }
});
