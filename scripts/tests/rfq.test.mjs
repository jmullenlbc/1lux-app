/**
 * Sales Reps and RFQs (Mike 10-29, 0144).
 *
 *   1. RFQ numbers start at RFQ0001; need by is 3 business days after sending,
 *      weekends and observed office holidays skipped.
 *   2. Quote lines matched at 75% or better are priced without asking; ties,
 *      lines with no price and lower scores ask which line; an RFQ line is
 *      only auto-priced once.
 *   3. The Trackvia rep load drops Logiq and AMPS, maps offices, sets one
 *      default per manufacturer and office, and lists ties for a person. The
 *      marked review workbook loads only KEEP Yes reps and its DEFAULT picks.
 *   4. Dropped quotes (0148): the AI read is cleaned into the check screen shape,
 *      failures say whose side they are on, and a part row with no type stays.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rfqNumber, needByFrom, emailSubject, NEED_BY_BUSINESS_DAYS, holidaysOf, isHoliday } from '../../src/lib/rfq/format.js';
import { scorePair, matchQuote, AUTO_AT } from '../../src/lib/rfq/match.js';
import { kindOf, buildRepLoad, chunks, dropped } from '../../src/lib/salesReps/trackvia.js';
import { parseQuoteReply, quoteReadFailure } from '../../src/lib/rfq/quoteReply.js';
import { lineReasons, cleanCheckedLines } from '../../src/lib/bidLeveling/readQuote.js';

test('RFQ numbers and need by', () => {
  assert.equal(rfqNumber(1), 'RFQ0001');
  assert.equal(rfqNumber(42), 'RFQ0042');
  assert.equal(rfqNumber(12345), 'RFQ12345');
  assert.equal(NEED_BY_BUSINESS_DAYS, 3);
  // Thursday noon Denver: Friday, Monday, Tuesday.
  assert.equal(needByFrom(new Date('2026-10-29T18:00:00Z')).toISOString(), '2026-11-03T18:00:00.000Z');
  // Monday: Tuesday, Wednesday, Thursday.
  assert.equal(needByFrom(new Date('2026-11-02T18:00:00Z')).toISOString(), '2026-11-05T18:00:00.000Z');
  // Saturday: Monday, Tuesday, Wednesday.
  assert.equal(needByFrom(new Date('2026-10-31T18:00:00Z')).toISOString(), '2026-11-04T18:00:00.000Z');
  // Friday 7 pm Denver is already Saturday in UTC; still counts as Friday (Mon, Tue, Wed).
  assert.equal(needByFrom(new Date('2026-10-31T01:00:00Z')).toISOString(), '2026-11-05T01:00:00.000Z');
  // Thanksgiving week: Thu and Fri off, so Mon, Tue, Wed.
  assert.equal(needByFrom(new Date('2026-11-25T18:00:00Z')).toISOString(), '2026-12-02T18:00:00.000Z');
  // Christmas 2026 is a Friday: Thu 12-24, Mon 12-28, Tue 12-29.
  assert.equal(needByFrom(new Date('2026-12-23T18:00:00Z')).toISOString(), '2026-12-29T18:00:00.000Z');
  assert.deepEqual(holidaysOf(2026), ['2026-01-01', '2026-05-25', '2026-07-03', '2026-09-07', '2026-11-26', '2026-11-27', '2026-12-25']);
  assert.ok(isHoliday(new Date('2027-12-24T18:00:00Z')), 'Christmas on a Saturday is taken Friday');
  assert.ok(isHoliday(new Date('2027-12-31T18:00:00Z')), "New Year's 2028 on a Saturday is taken Dec 31");
  assert.ok(!isHoliday(new Date('2026-11-25T18:00:00Z')));
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

test('review workbook: only KEEP Yes reps load, DEFAULT picks set the default', () => {
  const plan = buildRepLoad({
    reps: [
      { KEEP: 'Yes', Name: 'Rep A', 'TRACKVIA SALES REP #': '1' },
      { KEEP: 'yes', Name: 'Rep B', 'TRACKVIA SALES REP #': '2' },
      { KEEP: 'No', Name: 'Rep C', 'TRACKVIA SALES REP #': '3' },
    ],
    mfrReps: [
      { DEFAULT: '', MANUFACTURER: 'Maker One', 'SALES REP': 'Rep A', LOCATION: 'DENVER' },
      { DEFAULT: 'Yes', MANUFACTURER: 'Maker One', 'SALES REP': 'Rep B', LOCATION: 'DENVER' },
      { DEFAULT: '', MANUFACTURER: 'Maker One', 'SALES REP': 'Rep C', LOCATION: 'DENVER' },
      { DEFAULT: '', MANUFACTURER: 'Maker Two', 'SALES REP': 'Rep A', LOCATION: 'DENVER' },
      { DEFAULT: 'Yes', MANUFACTURER: 'Maker Three', 'SALES REP': 'Rep A', LOCATION: 'DENVER' },
      { DEFAULT: 'Yes', MANUFACTURER: 'Maker Three', 'SALES REP': 'Rep B', LOCATION: 'DENVER' },
      { DEFAULT: '', MANUFACTURER: 'Maker Four', 'SALES REP': 'Rep A', LOCATION: 'DENVER' },
      { DEFAULT: '', MANUFACTURER: 'Maker Four', 'SALES REP': 'Rep B', LOCATION: 'DENVER' },
    ],
  });
  assert.ok(plan.summary.review);
  assert.equal(plan.summary.reps, 2);
  assert.deepEqual(plan.summary.skipped.notKept, ['Rep C']);
  assert.equal(plan.summary.skipped.noRep.length, 0, 'links of a KEEP No rep are dropped quietly');
  assert.ok(!plan.links.some((l) => l.repName === 'Rep C'));
  const def = (m, rep) => plan.links.find((l) => l.manufacturer === m && l.repName === rep).isDefault;
  assert.equal(def('Maker One', 'Rep B'), true); // marked Yes, no job counts needed
  assert.equal(def('Maker One', 'Rep A'), false);
  assert.equal(def('Maker Two', 'Rep A'), true); // only link
  assert.equal(def('Maker Three', 'Rep A'), false); // two marked: no default
  assert.equal(def('Maker Four', 'Rep A'), false); // none marked: no default
  assert.equal(plan.summary.ties.length, 2);
  assert.ok(plan.summary.ties.some((x) => /Maker Three.*all marked Yes/.test(x)));
  assert.ok(plan.links.every((l) => !('marked' in l)));
});

test('chunks splits a list into batches', () => {
  assert.deepEqual(chunks([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  assert.deepEqual(chunks([], 3), []);
});

test('an AI read of a quote comes back in the check screen shape', () => {
  const r = parseQuoteReply('Here it is: {"bidderName":"Porter Lighting Sales","quoteNumber":"PLS24-8490-1","quoteDate":"2024-06-28","expiresAt":"06/28/2025",'
    + '"lines":[{"typeTag":"D1","mfr":"Nora","catalog":"NHIC-27","qty":"12","uom":"ea","unitPrice":"$125.00","extPrice":"1,500.00"},'
    + '{"typeTag":"","catalog":"TRIM-4","qty":12,"unitPrice":10},{"typeTag":"","catalog":"","description":""}],'
    + '"totals":{"FREIGHT":"189.99","GRAND":-5,"OTHER":3},"notes":"6 weeks"} thanks');
  assert.equal(r.ok, true);
  assert.equal(r.bidderName, 'Porter Lighting Sales');
  assert.equal(r.info.quoteNumber, 'PLS24-8490-1');
  assert.equal(r.info.quoteDate, '2024-06-28');
  assert.equal(r.info.expiresAt, ''); // not a clean date: left blank, never guessed
  assert.equal(r.lines.length, 2); // the empty row is dropped
  assert.equal(r.lines[0].qty, 12);
  assert.equal(r.lines[0].unitPrice, 125);
  assert.equal(r.lines[0].uom, 'EA');
  assert.equal(r.lines[1].typeTag, ''); // a part row with no type stays
  assert.deepEqual(r.totals, { FREIGHT: 189.99 }); // a negative or unknown total is left out
});

test('a garbled or empty AI read says so plainly', () => {
  assert.match(parseQuoteReply('sorry, no').message, /RFQ_READ_GARBLED/);
  assert.match(parseQuoteReply('{ not json }').message, /RFQ_READ_GARBLED/);
  assert.match(parseQuoteReply('{"lines":[]}').message, /RFQ_READ_NO_LINES/);
});

test('a failed AI call says whose side it is on and that the file is safe', () => {
  const says = (e) => quoteReadFailure(e);
  assert.match(says({ message: 'Your credit balance is too low' }), /RFQ_READ_CREDIT/);
  assert.match(says({ status: 401 }), /RFQ_READ_401/);
  assert.match(says({ status: 429 }), /their side.*RFQ_READ_429/);
  assert.match(says({ status: 529 }), /RFQ_READ_529/);
  assert.match(says({ status: 400 }), /RFQ_READ_400/);
  assert.match(says({}), /RFQ_READ_LOST/);
  for (const e of [{ status: 401 }, { status: 429 }, { status: 400 }, {}]) assert.match(says(e), /The file is saved on the project/);
});

test('a rep quote keeps part rows with no type, a bid does not', () => {
  const part = { typeTag: '', typeTagRaw: '', catalog: 'TRIM-4', description: '', qty: 2, unitPrice: 10 };
  const empty = { typeTag: '', typeTagRaw: '', catalog: '', description: '', qty: 2, unitPrice: 10 };

  const blocks = (lines, opts) => lineReasons(lines, opts).flat().filter((x) => x.blocking).length;
  assert.equal(blocks([part], { repQuote: true }), 0);
  assert.equal(blocks([empty], { repQuote: true }), 1);
  assert.equal(blocks([part]), 1); // Bid Leveling stays as it was

  assert.equal(cleanCheckedLines([part], { repQuote: true }).lines.length, 1);
  assert.equal(cleanCheckedLines([empty], { repQuote: true }).lines.length, 0);
  assert.equal(cleanCheckedLines([part]).lines.length, 0);
});
