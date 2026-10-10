// Municipal tab (Mike 10-9): filings filter by stage, permit cards show the
// filer, owner and units as fields, articles get a "Read tags now" pass.
// Run: node --test scripts/tests/municipalStages.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { municipalStage, stageWhere, isEntitlementClass, STAGES } from '../../src/lib/market-intel/stages.js';
import { readOwnerAnswer } from '../../src/lib/market-intel/ownerRules.js';

const ROOT = new URL('../../', import.meta.url);
const read = p => readFileSync(new URL(p, ROOT), 'utf8');

test('a filing gets the right stage', () => {
  assert.equal(municipalStage({ kind: 'PERMIT' }), 'PERMIT');
  assert.equal(municipalStage({ kind: 'COUNCIL' }), 'COUNCIL');
  assert.equal(municipalStage({ kind: 'CONCEPT', permitClass: 'Rezoning' }), 'ENTITLEMENT');
  assert.equal(municipalStage({ kind: 'CONCEPT', permitClass: 'Planned Unit Development' }), 'ENTITLEMENT');
  assert.equal(municipalStage({ kind: 'CONCEPT', permitClass: 'Site Development Plan' }), 'CONCEPT');
  assert.equal(municipalStage({ kind: 'CONCEPT', permitClass: null }), 'CONCEPT');
  assert.equal(municipalStage({ kind: 'ARTICLE' }), null);
  assert.equal(isEntitlementClass(''), false);
  assert.equal(municipalStage({ kind: 'LAND' }), 'LAND');
  assert.deepEqual(STAGES.map(s => s.value), ['CONCEPT', 'ENTITLEMENT', 'COUNCIL', 'PERMIT', 'LAND']);
});

test('the stage filter builds the right query', () => {
  assert.deepEqual(stageWhere('PERMIT'), { kind: 'PERMIT' });
  assert.deepEqual(stageWhere('CONCEPT,ENTITLEMENT'), { kind: 'CONCEPT' });
  const all = stageWhere('ALL');
  assert.equal(all.OR.length, 4);
  // Concept alone keeps a blank case type and drops entitlement words.
  const c = stageWhere('CONCEPT');
  assert.equal(c.kind, 'CONCEPT');
  assert.deepEqual(c.OR[0], { permitClass: null });
  assert.ok(c.OR[1].NOT.OR.some(o => o.permitClass.contains === 'rezon'));
  const e = stageWhere('ENTITLEMENT');
  assert.equal(e.kind, 'CONCEPT');
  assert.ok(e.OR.every(o => o.permitClass.mode === 'insensitive'));
  // Junk falls back to every municipal kind, never to articles.
  assert.deepEqual(stageWhere('NONSENSE'), { kind: { in: ['PERMIT', 'CONCEPT', 'COUNCIL', 'LAND'] } });
});

test('the owner web lookup returns a unit count', () => {
  const a = readOwnerAnswer(JSON.stringify({ found: true, ownerName: 'Greystar', unitCount: 312 }));
  assert.equal(a.unitCount, 312);
  const b = readOwnerAnswer(JSON.stringify({ found: true, ownerName: 'Greystar', unitCount: null }));
  assert.equal(b.unitCount ?? null, null);
});

test('permit cards show fields, not a narrative; tab is Municipal; articles can be read', () => {
  const card = read('src/components/market-intel/SignalCard.jsx');
  for (const label of ['Owner / developer', 'Units', 'Project', 'Filed by']) assert.ok(card.includes(`"${label}"`) || card.includes(`'${label}'`), label);
  assert.match(card, /onProjectTypeClick/);
  assert.match(read('src/components/ui/SectionTabs.jsx'), /'Municipal'/);
  const page = read('src/app/(app)/market-intel/permits/page.jsx');
  assert.match(page, /Municipal filings/);
  assert.match(page, /stage/);
  const articles = read('src/app/(app)/market-intel/page.jsx');
  assert.match(articles, /Read tags now/);
  assert.match(articles, /res\.json\(\)\.catch\(/);
  const fetcher = read('src/lib/market-intel/rss-fetcher.js');
  assert.ok(fetcher.includes('[\\s\\S]*?<\\/\\1>'), 'the backreference survived');
});
