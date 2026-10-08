// Market Intel tags and the units rollup (migration 0122, Mike 10-7). Pure, no DB.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTagName, stateCode, metroTag, unitCountFrom, tagsFromExtraction, developerNamesFrom } from '../../src/lib/market-intel/tagRules.js';
import { rollupUnits, withinMonths } from '../../src/lib/market-intel/forecast.js';

test('company names normalize to one row', () => {
  assert.equal(normalizeTagName('Lincoln Avenue Communities, Inc.'), 'lincoln avenue communities');
  assert.equal(normalizeTagName('LINCOLN AVENUE COMMUNITIES'), 'lincoln avenue communities');
  assert.equal(normalizeTagName('  '), '');
  // Places keep "CO": it is a state, not a corporate suffix.
  assert.equal(normalizeTagName('Denver, CO', 'METRO'), 'denver co');
  assert.equal(normalizeTagName('CO', 'STATE'), 'co');
});

test('states read as codes however they are written', () => {
  assert.equal(stateCode('Colorado'), 'CO');
  assert.equal(stateCode('co'), 'CO');
  assert.equal(stateCode('Texas '), 'TX');
  assert.equal(stateCode('Narnia'), null);
});

test('metros become "City, ST"', () => {
  assert.deepEqual(metroTag('Denver, Colorado'), { name: 'Denver, CO', state: 'CO' });
  assert.deepEqual(metroTag('denver co'), { name: 'Denver, CO', state: 'CO' });
  assert.deepEqual(metroTag('Denver metro', 'CO'), { name: 'Denver, CO', state: 'CO' });
  assert.deepEqual(metroTag('Houston'), { name: 'Houston', state: null });
  assert.equal(metroTag(''), null);
});

test('unit counts are whole positive numbers', () => {
  assert.equal(unitCountFrom('342 units'), 342);
  assert.equal(unitCountFrom('1,200'), 1200);
  assert.equal(unitCountFrom(0), null);
  assert.equal(unitCountFrom(null), null);
  assert.equal(unitCountFrom(999999), null);
});

test('one extraction becomes deduped tag rows with roles', () => {
  const tags = tagsFromExtraction({
    companies:    [{ name: 'Lincoln Avenue Communities', role: 'DEVELOPER' }, { name: 'Lincoln Avenue Communities Inc', role: 'OWNER' }, { name: 'Brinkmann Constructors', role: 'GC' }],
    projectNames: ['The Approach'],
    metro:        'Denver, CO',
    state:        'Colorado',
  });
  assert.deepEqual(tags.map(t => [t.kind, t.name, t.role]), [
    ['COMPANY', 'Lincoln Avenue Communities', 'DEVELOPER'],
    ['COMPANY', 'Brinkmann Constructors', 'GC'],
    ['PROJECT', 'The Approach', null],
    ['METRO', 'Denver, CO', null],
    ['STATE', 'CO', null],
  ]);
  // Old shape still works
  assert.deepEqual(tagsFromExtraction({ developerNames: ['Zocalo'] }).map(t => t.kind), ['COMPANY']);
});

test('developer names for the matcher skip GCs and architects', () => {
  assert.deepEqual(developerNamesFrom({ companies: [{ name: 'Zocalo', role: 'DEVELOPER' }, { name: 'Brinkmann', role: 'GC' }, { name: 'Loose' }] }), ['Zocalo', 'Loose']);
});

const tag = (kind, name, extra = {}) => ({ tag: { kind, name, normalized: name.toLowerCase(), ...extra } });

test('rollup counts a project once at its biggest figure', () => {
  const signals = [
    { unitCount: 342, tags: [tag('COMPANY', 'Zocalo', { clientId: 'c1' }), tag('PROJECT', 'The Approach'), tag('METRO', 'Denver, CO'), tag('STATE', 'CO')] },
    { unitCount: 350, tags: [tag('COMPANY', 'Zocalo'), tag('PROJECT', 'The Approach'), tag('METRO', 'Denver, CO')] },
    { unitCount: 100, tags: [tag('COMPANY', 'Zocalo'), tag('METRO', 'Austin, TX'), tag('STATE', 'TX')] },
    { unitCount: null, tags: [tag('COMPANY', 'Zocalo')] },
  ];
  const byCompany = rollupUnits(signals, 'company');
  assert.deepEqual(byCompany, [{ key: 'zocalo', label: 'Zocalo', clientId: 'c1', units: 450, articles: 3, projects: 1, metros: ['Austin, TX', 'Denver, CO'] }]);
  const byMetro = rollupUnits(signals, 'metro');
  assert.deepEqual(byMetro.map(r => [r.label, r.units]), [['Denver, CO', 350], ['Austin, TX', 100]]);
  // Only the first Approach article carries a STATE tag, so CO sees 342 once.
  assert.deepEqual(rollupUnits(signals, 'state').map(r => [r.label, r.units]), [['CO', 342], ['TX', 100]]);
});

test('time window keeps undated signals', () => {
  const now = Date.UTC(2026, 9, 7);
  const rows = withinMonths([{ publishedAt: '2026-09-01' }, { publishedAt: '2025-01-01' }, { publishedAt: null }], 12, now);
  assert.equal(rows.length, 2);
});
