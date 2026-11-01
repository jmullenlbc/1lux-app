// Rules that read a rep quote's words. Every string below is wording from a real quote.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addDays, fobFromText, freightFromText, leadWeeks, paymentTermsFromText, quoteFields, quoteLeadFromText, revisionNoteFromText, rowLead, termsFromText, validUntil,
} from '../../src/lib/rfq/quoteTerms.js';

test('lead times turn into weeks', () => {
  assert.deepEqual(leadWeeks('6-8 Weeks'), { min: 6, max: 8 });
  assert.deepEqual(leadWeeks('LEAD TIME 18-24 WEEKS'), { min: 18, max: 24 });
  assert.deepEqual(leadWeeks('Please allow a 20 week lead-time'), { min: 20, max: 20 });
  assert.deepEqual(leadWeeks('6 to 8 wks'), { min: 6, max: 8 });
  assert.deepEqual(leadWeeks('6\u20138 Weeks'), { min: 6, max: 8 });
  assert.deepEqual(leadWeeks('VC is taking 1-3 Weeks to ship'), { min: 1, max: 3 });
  assert.deepEqual(leadWeeks('10 Production Days'), { min: 2, max: 2 });
  assert.deepEqual(leadWeeks('14 days'), { min: 2, max: 2 });
});

test('in stock is zero weeks, and a stock count alone has no answer', () => {
  assert.deepEqual(leadWeeks('37 in stock'), { min: 0, max: 0 });
  assert.deepEqual(leadWeeks('$488.00 each and in stock'), { min: 0, max: 0 });
  assert.equal(leadWeeks('not in stock'), null);
  assert.equal(leadWeeks('out of stock'), null);
  assert.equal(leadWeeks('25 on 3/9'), null);
  assert.equal(leadWeeks(''), null);
  assert.equal(leadWeeks(null), null);
});

test('the whole quote lead comes from its lead time sentence', () => {
  assert.equal(quoteLeadFromText('Terms apply.\nLead Time: Standard 6-8 weeks\nThanks'), 'Lead Time: Standard 6-8 weeks');
  assert.equal(quoteLeadFromText('Please allow a 20 week lead-time'), 'Please allow a 20 week lead-time');
  assert.equal(quoteLeadFromText('Pricing is valid for 60 days.'), '');
});

test('the expiry date comes from a date or a count of days', () => {
  assert.equal(validUntil('Expires Feb 5, 2026', ''), '2026-02-05');
  assert.equal(validUntil('EXPIRATION DATE: 2026-5-18', ''), '2026-05-18');
  assert.equal(validUntil('Quote Valid for 30 days.', '2026-01-15'), '2026-02-14');
  assert.equal(validUntil('FREIGHT ALLOWED WITH QTY ABOVE AND PRICE GOOD FOR 45 DAYS.', '2026-01-01'), '2026-02-15');
  assert.equal(validUntil('Pricing is valid for 60 days.', '2026-03-01'), '2026-04-30');
  assert.equal(validUntil('Prices firm for orders within 30 days & for shipment within 60 days.', '2026-03-01'), '2026-03-31');
  assert.equal(validUntil('Pricing is valid for 60 days.', ''), '', 'no quote date, no way to count');
  assert.equal(validUntil('Thank you for your business.', '2026-03-01'), '');
  assert.equal(addDays('2024-02-28', 2), '2024-03-01');
});

test('freight allowed', () => {
  for (const s of ['Freight Allowed $0.00', 'This order will ship FFA.', 'FREIGHT ALLOWED WITH QTY ABOVE AND PRICE GOOD FOR 45 DAYS.', 'No Charge for Ground Freight', 'Standard freight to jobsite or contractor shop included']) {
    assert.equal(freightFromText(s).status, 'ALLOWED', s);
  }
});

test('freight not included', () => {
  for (const s of [
    'Prices above: tax & shipping are not included',
    'freight and tax can be determined once the final ship-to address is confirmed',
    'Freight is not included in quote.',
    'FREIGHT NOT INCLUDED',
    'LIGMAN FREIGHT NOT INCLUDED',
    'prices do not include lamps, shipping and handling',
    'Freight is prepaid and FOB Denver Warehouse. Additional freight charges to be determined.',
    'Plus Freight',
  ]) assert.equal(freightFromText(s).status, 'NOT_INCLUDED', s);
});

test('a quote that says both asks a person, and the wording comes along', () => {
  const r = freightFromText('Plus Freight\nStandard freight to jobsite or contractor shop included');
  assert.equal(r.status, 'CONFLICT');
  assert.match(r.wording, /Standard freight/);
  assert.match(r.wording, /Plus Freight/);
});

test('words that only sound like freight terms stay silent', () => {
  assert.equal(freightFromText('Freight allowances are based upon a single release and shipment.').status, 'SILENT');
  assert.equal(freightFromText('Oversized items over 8 feet ship by truck.').status, 'SILENT');
  assert.equal(freightFromText('').status, 'SILENT');
});

test('clauses worth searching come out one row each, as written', () => {
  const rows = termsFromText('Prices subject to tariff changes.\n(No partials)\nFreight allowances are based upon a single release and shipment.\nBalance must be received prior to shipping.\nACCESSORIAL FEES apply.\nOversized freight applies over 8 feet.\nPrices subject to tariff changes.');
  assert.deepEqual(rows.map((r) => r.kind).sort(), ['ACCESSORIAL', 'DEPOSIT', 'NO_PARTIALS', 'OVERSIZE_FREIGHT', 'SINGLE_RELEASE', 'TARIFF']);
  assert.equal(rows.find((r) => r.kind === 'TARIFF').text, 'Prices subject to tariff changes.');
  assert.deepEqual(termsFromText('Thank you'), []);
});

test('FOB, payment terms and the rep revision note', () => {
  assert.equal(fobFromText('FOB: Lewisville, TX.'), 'Lewisville, TX');
  assert.equal(fobFromText('Freight is prepaid and FOB Denver Warehouse. Additional freight'), 'Denver Warehouse');
  assert.equal(fobFromText('Thank you'), '');
  assert.equal(paymentTermsFromText('Terms are Net 30 from invoice'), 'Net 30');
  assert.equal(paymentTermsFromText('Payment Terms: Due on receipt'), 'Due on receipt');
  assert.equal(revisionNoteFromText('REV 1 : UPDATED QTY AND DIA. OF TYPE EP3 POLE'), 'REV 1 : UPDATED QTY AND DIA. OF TYPE EP3 POLE');
  assert.equal(revisionNoteFromText('Album Castle Pines - REV1'), 'REV1');
  assert.equal(revisionNoteFromText('Revenue 2 is not a revision'), '');
});

test('quoteFields fills what a read left blank from the words', () => {
  const words = 'Terms are Net 30 from invoice\nREV 1 : UPDATED QTY AND DIA. OF TYPE EP3 POLE';
  const got = quoteFields({ words });
  assert.equal(got.paymentTerms, 'Net 30');
  assert.equal(got.revisionNote, 'REV 1 : UPDATED QTY AND DIA. OF TYPE EP3 POLE');
  assert.equal(quoteFields({ paymentTerms: 'Due on receipt', words }).paymentTerms, 'Due on receipt');
});

test('quoteFields takes blanks of every kind', () => {
  const got = quoteFields({ quoteDate: null, expiresAt: null, paymentTerms: null, fob: null, revisionNote: null, leadTime: null, terms: null, words: '' });
  assert.deepEqual(got, { expiresAt: '', paymentTerms: '', fobPoint: '', revisionNote: '', leadTime: '', terms: [] });
  assert.equal(quoteFields({ expiresAt: 'soon' }).expiresAt, '');
  assert.equal(quoteFields({ expiresAt: '2026-03-01' }).expiresAt, '2026-03-01');
});

test('quoteFields keeps known term kinds once', () => {
  const clause = 'A deposit of 50% is required with the order';
  const fromWords = termsFromText(clause);
  assert.ok(fromWords.length > 0);
  const got = quoteFields({ terms: [...fromWords, { kind: 'MADE_UP', text: 'x' }, { kind: 'TARIFF', text: '' }], words: clause });
  assert.deepEqual(got.terms, fromWords);
});

test('a row lead is its own words, else the whole quote unless it is in stock', () => {
  assert.deepEqual(rowLead({ leadTime: '6-8 weeks' }, ''), { leadTime: '6-8 weeks', leadWeeksMin: 6, leadWeeksMax: 8, stockNote: null });
  assert.equal(rowLead({}, '4 weeks').leadWeeksMax, 4);
  assert.deepEqual(rowLead({ stock: '37 in stock' }, '4 weeks'), { leadTime: null, leadWeeksMin: 0, leadWeeksMax: 0, stockNote: '37 in stock' });
  assert.deepEqual(rowLead({ stock: '25 on 3/9' }, '4 weeks'), { leadTime: '4 weeks', leadWeeksMin: 4, leadWeeksMax: 4, stockNote: '25 on 3/9' });
  assert.deepEqual(rowLead({}, ''), { leadTime: null, leadWeeksMin: null, leadWeeksMax: null, stockNote: null });
});
