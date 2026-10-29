// Bid Comparison step 1 (Mike 10-21): kinds, grades, typicals and the check.
// Run: node --test scripts/tests/bidComparison.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { phraseRegex, readLine, brandGrade, defaultBrandGrades, defaultKinds, pricedLike, rangeText, basisOf, isSageBrand, rulesFromRows, defaultBrandRows, DEFAULT_KINDS } from '../../src/lib/bidComparison/kinds.js';
import { levelOf, markBad, buildTypicals, typicalFor, sagePickFor } from '../../src/lib/bidComparison/typicals.js';
import { compareBids, forViewer, PAST_JOBS_WORDING } from '../../src/lib/bidComparison/check.js';
import { familyKey } from '../../src/lib/specSwap/family.js';

const fan = () => defaultKinds().find((k) => k.key === 'fan');

test('phrases match whole words, dashes and run together, trailing * endings', () => {
  assert.ok(phraseRegex('PULL CHAIN').test('PULL-CHAIN FAN'));
  assert.ok(phraseRegex('PULL CHAIN').test('PULLCHAIN'));
  assert.ok(phraseRegex('WRAP*').test('4FT WRAPAROUND'));
  assert.ok(!phraseRegex('FAN').test('FANIMATION'));
});

test('fan grade: pull chain is builder, DC motor is spec, words beat the brand', () => {
  const b = readLine({ description: '52" ceiling fan, pull chain', mfr: 'Minka', catalog: 'F123' });
  assert.equal(b.kind.key, 'fan');
  assert.equal(b.size, '52 in');
  assert.deepEqual(b.grade, { grade: 'BUILDER', by: 'words' });
  const s = readLine({ description: 'Ceiling fan DC motor hugger', mfr: 'Minka Aire', catalog: 'F844' });
  assert.deepEqual(s.grade, { grade: 'SPEC', by: 'words' });
  const h = readLine({ description: 'Ceiling fan', mfr: 'Hunter' });
  assert.deepEqual(h.grade, { grade: 'BUILDER', by: 'brand' });
});

test('a disk rated for a fan brace is a disk, not a fan', () => {
  assert.equal(readLine({ description: 'Disk rated for ceiling fan brace', mfr: 'Halo' }).kind.key, 'disk');
});

test('sizes and price basis', () => {
  assert.equal(readLine({ description: '6" surface disk', mfr: 'Eluma' }).size, '6 in');
  assert.equal(readLine({ description: '4 ft wraparound', mfr: 'Lithonia' }).size, '4 ft');
  assert.equal(basisOf('LF'), 'FT');
  assert.equal(basisOf('EA'), 'EA');
});

test('brand grade matches the brand or a longer name that starts with it; two grade brands stay blank', () => {
  const brands = defaultBrandGrades();
  assert.equal(brandGrade(brands, 'Lithonia Lighting'), 'BUILDER');
  assert.equal(brandGrade(brands, 'Visual Comfort'), 'SPEC');
  assert.equal(brandGrade(brands, 'Minka'), null);
});

test('fan explainer: about $80 builder, $200 spec, and where a price sits', () => {
  assert.match(rangeText(fan(), 'BUILDER'), /^about \$80 to/);
  assert.match(rangeText(fan(), 'SPEC'), /^about \$200 to/);
  assert.equal(pricedLike(100, fan()), 'BUILDER');
  assert.equal(pricedLike(400, fan()), 'SPEC');
});

test('levels: Medium is within 15%', () => {
  assert.equal(levelOf(115, 100), 'MEDIUM');
  assert.equal(levelOf(116, 100), 'HIGH');
  assert.equal(levelOf(84, 100), 'LOW');
  assert.equal(levelOf(0, 100), null);
});

test('bad lines: more than 15% off the family middle are marked', () => {
  const lines = [100, 102, 98, 150].map((price, i) => ({ id: i, family: 'ELUMA|D6', basis: 'EA', price, bad: false }));
  assert.equal(markBad(lines), 1);
  assert.equal(lines[3].bad, true);
  const two = [100, 300].map((price) => ({ family: 'X|Y', basis: 'EA', price, bad: false }));
  assert.equal(markBad(two), 0, 'needs 3 prices');
});

const row = (job, i, over = {}) => ({
  id: `${job}-${i}`, sourceName: job, outcome: 'SWAPPED', description: '6" surface disk', origMfr: 'Lithonia', origCatalog: 'FMML6',
  origFamily: familyKey('Lithonia', 'FMML6'), propMfr: 'Eluma', propCatalog: 'ELD6-930', propFamily: familyKey('Eluma', 'ELD6-930'),
  qty: 100, uom: 'EA', unitCn: 10, ...over,
});

test('typicals: same product first, a tight kind group next, else not enough data', () => {
  const rows = [
    row('A', 1), row('A', 2, { unitCn: 10.5 }), row('B', 1, { unitCn: 9.8 }), row('B', 2, { unitCn: 10.2 }), row('C', 1, { unitCn: 10 }),
  ];
  const t = buildTypicals(rows);
  const read = readLine({ description: '6" surface disk', mfr: 'Eluma', catalog: 'ELD6-930' });
  const p = typicalFor({ mfr: 'Eluma', catalog: 'ELD6-930' }, read, t);
  assert.equal(p.source, 'PRODUCT');
  assert.equal(p.price, 10);
  // Sage lines carry no grade (Mike 10-22), so the kind group is the no-grade one.
  const other = readLine({ description: '6" surface disk', mfr: 'Newco', catalog: 'SMD6' });
  assert.equal(other.grade, null);
  assert.equal(typicalFor({ mfr: 'Newco', catalog: 'SMD6' }, other, t)?.source, 'KIND');
  const pend = readLine({ description: 'Pendant', mfr: 'Arteriors', catalog: 'P1' });
  assert.equal(typicalFor({ mfr: 'Arteriors', catalog: 'P1' }, pend, t), null);
});

test('compareBids rates each bid against the others and folds a repeated type', () => {
  const t = buildTypicals([]);
  const line = (typeTag, unitPrice, qty = 10) => ({ typeTag, description: '52" ceiling fan', mfr: 'Hunter', catalog: 'H1', qty, uom: 'EA', unitPrice });
  const r = compareBids([
    { id: 'a', name: 'Rep A', lines: [line('F1', 100), line('F1', 100, 5)] },
    { id: 'b', name: 'Rep B', lines: [line('F1', 150)] },
    { id: 'c', name: 'Rep C', lines: [line('F1', 110)] },
  ], t);
  assert.equal(r.rows.length, 1);
  const cells = r.rows[0].cells;
  assert.equal(cells.a.qty, 15);
  assert.equal(cells.a.vsBids.level, 'LOW', '$100 vs the middle of $150 and $110');
  assert.equal(cells.b.vsBids.level, 'HIGH');
  assert.equal(cells.c.vsBids.level, 'MEDIUM', '$110 vs the middle of $100 and $150');
  assert.equal(cells.a.vsTypical, null, 'no past jobs, not enough data');
  assert.equal(r.rows[0].explainer.builder.label, 'Builder grade');
  assert.ok(r.multiBid);
});

test('forViewer: outside users get levels only, reps get bid vs bid only', () => {
  const rows = [row('A', 1), row('A', 2), row('B', 1), row('B', 2)];
  const t = buildTypicals(rows);
  const full = compareBids([
    { id: 'a', name: 'A', lines: [{ typeTag: 'D1', description: '6" surface disk', mfr: 'Lithonia', catalog: 'FMML6', qty: 10, uom: 'EA', unitPrice: 30 }] },
    { id: 'b', name: 'B', lines: [{ typeTag: 'D1', description: '6" surface disk', mfr: 'Eluma', catalog: 'ELD6-930', qty: 10, uom: 'EA', unitPrice: 10 }] },
  ], t);
  assert.ok(full.rows[0].sage, 'staff see the Eluma pick');
  assert.equal(full.rows[0].cells.b.vsTypical.level, 'MEDIUM');

  const out = forViewer(full, 'OUTSIDE');
  const cb = out.rows[0].cells.b;
  assert.deepEqual(cb.vsTypical, { level: 'MEDIUM', wording: PAST_JOBS_WORDING });
  assert.equal(cb.family, undefined);
  assert.equal(out.rows[0].sage, undefined);
  assert.equal(out.bids[0].sageSavings, undefined);

  const rep = forViewer(full, 'REP');
  assert.equal(rep.rows[0].cells.b.vsTypical, null);
  assert.ok(rep.rows[0].cells.a.vsBids);
  assert.equal(rep.bids[0].counts.vsTypical, undefined);
});

test('fans: 56 in and up is a large amenity fan, 55 in or no size is the regular fan', () => {
  assert.equal(readLine({ description: '60" ceiling fan' }).kind.key, 'fanLarge');
  assert.equal(readLine({ description: '52" ceiling fan' }).kind.key, 'fan');
  assert.equal(readLine({ description: 'Ceiling fan, white' }).kind.key, 'fan');
});

test('garage is Sage Brands only: no grade', () => {
  const r = readLine({ description: 'Garage vapor tight 4ft', mfr: 'Lithonia' });
  assert.equal(r.kind.key, 'garage');
  assert.equal(r.kind.sageOnly, true);
  assert.equal(r.grade, null);
});

test('Sage Brands: every brand counts, a longer name too, and staff can change the list', () => {
  assert.ok(isSageBrand('Eluma'));
  assert.ok(isSageBrand('Ascent Architectural Lighting'));
  assert.ok(isSageBrand('Peacock'));
  assert.ok(!isSageBrand('Lithonia'));
  assert.ok(isSageBrand('Lithonia', ['LITHONIA']));
  assert.ok(!isSageBrand('Eluma', ['SAGE']));
  const t = buildTypicals([]);
  assert.equal(sagePickFor({ mfr: 'Candela', catalog: 'X1' }, readLine({ description: '6" disk' }), t), null);
});

test('rules from table rows: empty means the defaults; rows replace them', () => {
  const d = rulesFromRows([], []);
  assert.equal(d.fromDb.kinds, false);
  assert.equal(d.kinds.length, DEFAULT_KINDS.length);
  assert.equal(brandGrade(d.brands, 'Lithonia'), 'BUILDER');
  assert.ok(d.sage.includes('ELUMA'));

  const kindRows = [{ key: 'puck', name: 'Puck', sortOrder: 10, sizeUnit: null, archivedAt: null,
    words: [{ list: 'MATCH', phrase: 'PUCK*', sortOrder: 0 }, { list: 'BUILDER', phrase: 'PLASTIC', sortOrder: 0 }] },
  { key: 'old', name: 'Old', sortOrder: 20, archivedAt: new Date(), words: [{ list: 'MATCH', phrase: 'DISK', sortOrder: 0 }] }];
  const brandRows = [
    { brand: 'LITHONIA', grade: 'SPEC', sage: false, status: 'APPROVED' },
    { brand: 'KICHLER', grade: 'BUILDER', sage: false, status: 'PROPOSED' },
    { brand: 'HALO', grade: 'BUILDER', sage: false, status: 'APPROVED', archivedAt: new Date() },
    { brand: 'NEWCO', grade: null, sage: true, status: 'APPROVED' },
  ];
  const r = rulesFromRows(kindRows, brandRows);
  assert.deepEqual(r.fromDb, { kinds: true, brands: true });
  assert.equal(r.kinds.length, 1);
  assert.equal(readLine({ description: 'Pucklight plastic' }, r).kind.key, 'puck');
  assert.equal(readLine({ description: 'Pucklight plastic' }, r).grade.grade, 'BUILDER');
  assert.equal(readLine({ description: '6" disk' }, r).kind, null, 'archived kind is not read');
  assert.equal(brandGrade(r.brands, 'Lithonia'), 'SPEC');
  assert.equal(brandGrade(r.brands, 'Kichler'), null, 'a suggestion waiting on a decision does not grade');
  assert.equal(brandGrade(r.brands, 'Halo'), null, 'an archived brand does not grade');
  assert.ok(r.sage.includes('NEWCO') && r.sage.includes('ELUMA'), 'a flagged row adds a Sage name; the code names stay');
});

test('default brand rows: Both brands listed, Sage is one unrated row, sub brands still read as Sage', () => {
  const rows = defaultBrandRows();
  assert.equal(rows.find((b) => b.brand === 'MINKA AIRE').grade, 'BOTH');
  assert.deepEqual(rows.find((b) => b.brand === 'SAGE'), { brand: 'SAGE', grade: null, sage: true });
  assert.ok(!rows.some((b) => b.brand === 'ELUMA' || b.brand === 'ASCENT'), 'sub brands are not rated');
  assert.ok(isSageBrand('Eluma') && isSageBrand('Ascent Architectural'));
  assert.equal(new Set(rows.map((b) => b.brand)).size, rows.length, 'no repeats');
});
