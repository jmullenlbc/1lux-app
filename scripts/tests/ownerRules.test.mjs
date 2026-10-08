/**
 * Pins the permit owner lookup rules (0126, Mike 10-8: "if the permit doesn't
 * say a client, our system should be smart enough to quickly search the web").
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ownerPrompt, readOwnerAnswer, ownerExtraction, ownerCandidateNames, mergeDeveloperNames, MAX_OWNER_SEARCHES } from '../../src/lib/market-intel/ownerRules.js';

const permit = {
  title: 'New building, 533 units: 965 E University Dr, Tempe', address: '965 E University Dr', metro: 'Phoenix, AZ', state: 'AZ',
  unitCount: 533, valuation: 144_000_000, permitClass: 'New Building', permitNumber: 'BP250302', contractorName: 'Acme Builders',
  publishedAt: '2026-09-30T00:00:00Z',
};

test('the prompt carries the address, units, value and says the contractor is not the owner', () => {
  const p = ownerPrompt(permit);
  for (const s of ['965 E University Dr', 'Phoenix, AZ', '533', '$144M', 'BP250302', 'Acme Builders (the builder, not the owner)', `at most ${MAX_OWNER_SEARCHES} searches`]) {
    assert.ok(p.includes(s), `missing ${s}`);
  }
  assert.ok(!/—|–|--/.test(p), 'no dashes in the prompt');
});

test('a found answer is read, roles validated, bad url dropped, dashes stripped', () => {
  const text = `Here is what I found:\n{"found": true, "projectName": "The Mark at Tempe", "companies": [{"name": "Empire Group", "role": "DEVELOPER"}, {"name": "Empire Group", "role": "OWNER"}, {"name": "Studio X", "role": "DESIGNER"}], "note": "A 533 unit community — $288M, groundbreaking in 2026.", "source": {"url": "https://www.connectcre.com/stories/empire", "title": "Empire Group starts work"}}`;
  const a = readOwnerAnswer(text);
  assert.equal(a.found, true);
  assert.equal(a.projectName, 'The Mark at Tempe');
  assert.deepEqual(a.companies, [{ name: 'Empire Group', role: 'DEVELOPER' }, { name: 'Studio X', role: 'OTHER' }]);
  assert.equal(a.note, 'A 533 unit community, $288M, groundbreaking in 2026.');
  assert.equal(a.source.url, 'https://www.connectcre.com/stories/empire');
  assert.deepEqual(ownerCandidateNames(a), ['Empire Group']);
  const ex = ownerExtraction(a, permit);
  assert.deepEqual(ex.projectNames, ['The Mark at Tempe']);
  assert.equal(ex.metro, 'Phoenix, AZ');
});

test('found is false when no company survives, and a non-JSON answer is null', () => {
  assert.equal(readOwnerAnswer('{"found": true, "companies": [], "source": {"url": "not a url"}}').found, false);
  assert.equal(readOwnerAnswer('{"found": true, "companies": []}').source, null);
  assert.equal(readOwnerAnswer('I could not find anything.'), null);
  assert.deepEqual(ownerExtraction({ found: false }), { companies: [], projectNames: [] });
});

test('developer names merge without duplicates and keep the contractor', () => {
  const a = readOwnerAnswer('{"found": true, "companies": [{"name": "Empire Group", "role": "DEVELOPER"}, {"name": "Acme Builders", "role": "GC"}]}');
  assert.equal(mergeDeveloperNames('["Acme Builders"]', a), '["Acme Builders","Empire Group"]');
  assert.equal(mergeDeveloperNames('["empire group"]', a), '["empire group"]');
  assert.equal(mergeDeveloperNames('not json', a), '["Empire Group"]');
});
