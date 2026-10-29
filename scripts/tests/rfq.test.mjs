/**
 * Sales Reps and RFQs (Mike 10-29, 0144).
 *
 *   1. RFQ numbers start at RFQ0001; need by is 72 hours after sending.
 *   2. Quote lines matched at 75% or better are priced without asking; ties,
 *      lines with no price and lower scores ask which line; an RFQ line is
 *      only auto-priced once.
 *   3. The Trackvia rep load drops Logiq and AMPS, maps offices, sets one
 *      default per manufacturer and office, and lists ties for a person.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rfqNumber, needByFrom, emailSubject, NEED_BY_HOURS } from '../../src/lib/rfq/format.js';
import { scorePair, matchQuote, AUTO_AT } from '../../src/lib/rfq/match.js';
import { kindOf, buildRepLoad, chunks, dropped } from '../../src/lib/salesReps/trackvia.js';

test('RFQ numbers and need by', () => {
  assert.equal(rfqNumber(1), 'RFQ0001');
  assert.equal(rfqNumber(42), 'RFQ0042');
  assert.equal(rfqNumber(12345), 'RFQ12345');
  assert.equal(NEED_BY_HOURS, 72);
  const sent = new Date('2026-10-29T12:00:00Z');
  assert.equal(needByFrom(sent).toISOString(), '2026-11-01T12:00:00.000Z');
  assert.equal(emailSubject({ number: 7, projectName: 'Sun Valley' }), 'ILC RFQ RFQ0007 | Sun Valley');
});

const RFQ = [
  { id: 'a', typeCode: 'A1', partNumber: 'LDN6 35/15 LO6', manufacturer: 'Lithonia', qty: 40 },
  { id: 'b', typeCode: 'B2', partNumber: 'WST LED P1', manufacturer: 'Lithonia', qty: 12 },
  { id: 'c', typeCode: 'C1', partNumber: 'XYZ-100', manufacturer: 'Acme', qty: 5 },
];

test('type, maker and count together reach the 75% line', () => {
  const s = scorePair({ typeTag: 'A1', catalog: '', manufacturer: 'Lithonia Lighting', qty: 40 }, RFQ[0]);
  assert.equal(s, AUTO_AT);
  assert.equal(scorePair({ typeTag: 'A1', catalog: 'LDN6 35/15 LO6', manufacturer: 'Lithonia', qty: 40 }, RFQ[0]), 1);
  assert.ok(scorePair({ typeTag: 'A1', catalog: '', manufacturer: 'Other', qty: 1 }, RFQ[0]) < AUTO_AT);
});

test('matchQuote auto prices good matches and asks about the rest', () => {
  const quote = [
    { typeTag: 'A1', catalog: 'LDN6 35/15 LO6', manufacturer: 'Lithonia', qty: 40, unitPrice: 88 },
    { typeTag: 'B2', catalog: 'WST LED P1', manufacturer: 'Lithonia', qty: 12, unitPrice: null }, // no price
    { typeTag: 'Z9', catalog: 'XYZ-100', manufacturer: '', qty: null, unitPrice: 10 }, // part only
  ];
  const [a, b, z] = matchQuote(quote, RFQ);
  assert.equal(a.status, 'AUTO');
  assert.equal(a.rfqLineId, 'a');
  assert.equal(b.status, 'OPEN');
  assert.equal(b.options[0].rfqLineId, 'b');
  assert.equal(z.status, 'OPEN');
  assert.equal(z.options[0].rfqLineId, 'c');
});

test('an RFQ line is auto priced once, and a tie at the top asks', () => {
  const twice = [
    { typeTag: 'A1', catalog: 'LDN6 35/15 LO6', manufacturer: 'Lithonia', qty: 40, unitPrice: 88 },
    { typeTag: 'A1', catalog: 'LDN6 35/15 LO6', manufacturer: 'Lithonia', qty: 40, unitPrice: 90 },
  ];
  const r = matchQuote(twice, RFQ);
  assert.deepEqual(r.map((x) => x.status).sort(), ['AUTO', 'OPEN']);

  const tied = [
    { id: 'x', typeCode: 'A1', partNumber: '', manufacturer: 'Lithonia', qty: 40 },
    { id: 'y', typeCode: 'A1', partNumber: '', manufacturer: 'Lithonia', qty: 40 },
  ];
  const [t] = matchQuote([{ typeTag: 'A1', catalog: '', manufacturer: 'Lithonia', qty: 40, unitPrice: 5 }], tied);
  assert.equal(t.status, 'OPEN');
  assert.equal(t.options.length, 2);
});

test('Trackvia export kinds come from the headers', () => {
  assert.equal(kindOf(['Project', 'Sales Rep', 'Location']), 'projectReps');
  assert.equal(kindOf(['MANUFACTURER', 'SALES REP']), 'mfrReps');
  assert.equal(kindOf(['Name', 'TRACKVIA SALES REP #']), 'reps');
  assert.equal(kindOf(['Something']), null);
});

test('rep load drops Logiq and AMPS, maps offices, sets defaults and lists ties', () => {
  assert.ok(dropped('Logiq Lighting'));
  assert.ok(dropped('AMPS'));
  assert.ok(!dropped('Lampsplus'));
  const plan = buildRepLoad({
    reps: [
      { Name: 'Rep A', 'TRACKVIA SALES REP #': '1', 'EMAILS FOR QUOTES': 'q@a.test' },
      { Name: 'Rep B', 'TRACKVIA SALES REP #': '2' },
      { Name: 'Logiq Agency', 'TRACKVIA SALES REP #': '3' },
    ],
    mfrReps: [
      { MANUFACTURER: 'Maker One', 'SALES REP': 'Rep A', LOCATION: 'DENVER' },
      { MANUFACTURER: 'Maker One', 'SALES REP': 'Rep B', LOCATION: 'DENVER' },
      { MANUFACTURER: 'Maker Two', 'SALES REP': 'Rep A', LOCATION: 'LOS ANGELES' },
      { MANUFACTURER: 'Maker Three', 'SALES REP': 'Rep A', LOCATION: 'DENVER' },
      { MANUFACTURER: 'Maker Three', 'SALES REP': 'Rep B', LOCATION: 'DENVER' },
      { MANUFACTURER: 'AMPS', 'SALES REP': 'Rep A', LOCATION: 'DENVER' },
      { MANUFACTURER: 'Maker Four', 'SALES REP': 'Nobody', LOCATION: 'DENVER' },
    ],
    projectReps: [
      { PROJECT: 'Job 1', 'SALES REP': 'Rep A - Maker One', LOCATION: 'DENVER' },
      { PROJECT: 'Job 2', 'SALES REP': 'Rep A - Maker One', LOCATION: 'DENVER' },
      { PROJECT: 'Job 3', 'SALES REP': 'Rep B - Maker One', LOCATION: 'DENVER' },
    ],
  });
  assert.equal(plan.summary.reps, 2);
  assert.deepEqual(plan.summary.skipped.reps, ['Logiq Agency']);
  assert.equal(plan.summary.skipped.links, 1);
  assert.equal(plan.summary.skipped.noRep.length, 1);
  const def = (m, rep) => plan.links.find((l) => l.manufacturer === m && l.repName === rep).isDefault;
  assert.equal(def('Maker One', 'Rep A'), true); // two jobs beats one
  assert.equal(def('Maker One', 'Rep B'), false);
  assert.equal(def('Maker Two', 'Rep A'), true); // only link
  assert.equal(plan.links.find((l) => l.manufacturer === 'Maker Two').office, 'Long Beach');
  assert.equal(def('Maker Three', 'Rep A'), false); // no jobs either side: a tie
  assert.equal(plan.summary.ties.length, 1);
  assert.match(plan.summary.ties[0], /Maker Three/);
});

test('chunks splits a list into batches', () => {
  assert.deepEqual(chunks([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  assert.deepEqual(chunks([], 3), []);
});
