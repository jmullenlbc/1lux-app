// Pre-application meetings (Mike 10-9, land offer plan Phase 1): Mesa
// pre-submittals and Orlando planning applications. Rules only, no AI.
// Run: node --test scripts/tests/preApplication.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { PERMIT_PROFILES, permitToSignal, permitQueryUrl } from '../../src/lib/market-intel/permitRules.js';
import { SOURCES } from '../../src/lib/market-intel/sourceCatalog.js';

const mesa = (desc, extra = {}) => ({ record_id: 'PRS26-00651', record_type: 'Pre-Submittal', record_description: desc, record_status: 'Closed', opened_date: '2026-09-01T00:00:00', street_address: '17 W UNIVERSITY DR', ...extra });
const orl = (name, comments = '', extra = {}) => ({ application_number: 'MPL2026-10001', application_name: name, application_description: 'Master Plan', application_comments: comments, application_status: 'Pending', application_date: '2026-09-01T00:00:00', address: '7149 S KIRKMAN RD', applicant: 'Acme Development LLC', neighborhood: 'Kirkman', ...extra });

test('Mesa keeps only named apartment, condo and multifamily projects', () => {
  const p = PERMIT_PROFILES.MESA_PRESUB;
  assert.equal(p.kind, 'CONCEPT');
  assert.ok(permitToSignal(p, mesa('Helix Apartments')));
  assert.ok(permitToSignal(p, mesa('706 E Marilyn Ave Condo')));
  assert.equal(permitToSignal(p, mesa('Chick-fil-A Remodel')), null);
  assert.equal(permitToSignal(p, mesa('Helix Apartments', { record_status: 'Withdrawn' })), null);
});

test('Orlando reads units from staff notes and needs the type', () => {
  const p = PERMIT_PROFILES.ORLANDO_PLANNING;
  const s = permitToSignal(p, orl('Kirkman Point - Admin MPL', 'Admin MPL Amend New Apartments, 314 du'));
  assert.equal(s.unitCount, 314);
  assert.equal(s.kind, 'CONCEPT');
  assert.equal(permitToSignal(p, orl('Mosby Lake Conway Apts.', 'Master Plan request 600 multi family units')).unitCount, 600);
  // type only in the notes without a count: dropped
  assert.equal(permitToSignal(p, orl('5000 Main St Car Wash', 'near existing apartments')), null);
  // small counts drop
  assert.equal(permitToSignal(p, orl('Small Apts', '12 unit apartment building')), null);
});

test('Orlando skip words: signs, variances, plats, storage', () => {
  const p = PERMIT_PROFILES.ORLANDO_PLANNING;
  for (const n of ['Lake Apts Sign Variance', 'Apartments Replat', 'Apartments Storage Building', 'Lake Apts DET']) {
    assert.equal(permitToSignal(p, orl(n, '300 unit multifamily')), null, n);
  }
});

test('both feeds are sources with keyless queries', () => {
  for (const k of ['MESA_PRESUB', 'ORLANDO_PLANNING']) {
    const p = PERMIT_PROFILES[k];
    assert.ok(SOURCES.some(s => s.feedUrl === p.layerUrl), k);
    const url = permitQueryUrl(p, new Date('2026-01-01'), {});
    assert.match(url, /^https:\/\/data\./);
    assert.doesNotMatch(url, /key|token/i);
  }
});
