// "Not relevant" learning (migration 0130, Mike 10-9): seven reasons, only
// Other needs a sentence, rules are proposed after three presses and only an
// admin applies them.
// Run: node --test scripts/tests/signalFeedback.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { REASONS, reasonNeedsText, cleanFeedback, featuresOf, featureKeys, proposeRules, ruleMatches, suppressedBy, describeRule, notRelevantRate, PROPOSE_AFTER } from '../../src/lib/market-intel/feedbackRules.js';
import { ROLE_KEYS } from '../../src/lib/roles.js';

const ROOT = new URL('../../', import.meta.url);
const read = p => readFileSync(new URL(p, ROOT), 'utf8');

test("Mike's seven reasons, in order; only Other needs text", () => {
  assert.deepEqual(REASONS.map(r => r.label), ['Wrong building type', "Don't want to work with client", 'Not about a project', 'Duplicate', 'Too old', 'Already built', 'Other']);
  for (const r of REASONS) assert.equal(reasonNeedsText(r.code), r.code === 'OTHER', r.code);
  assert.deepEqual(cleanFeedback({ reasonCode: 'TOO_OLD' }), { reasonCode: 'TOO_OLD', reasonText: '' });
  assert.equal(cleanFeedback({ reasonCode: 'OTHER' }), null);
  assert.equal(cleanFeedback({ reasonCode: 'OTHER', reasonText: '   ' }), null);
  assert.deepEqual(cleanFeedback({ reasonCode: 'OTHER', reasonText: ' It is a parking garage. ' }), { reasonCode: 'OTHER', reasonText: 'It is a parking garage.' });
  assert.equal(cleanFeedback({ reasonCode: 'NOPE' }), null);
  assert.equal(cleanFeedback({}), null);
});

test('features come off the signal row and its company tag', () => {
  const f = featuresOf({ kind: 'PERMIT', sourceId: 'src1', city: 'Denver', state: 'CO', permitClass: 'Addition', neighborhood: 'C-MX-8', unitCount: 12, valuation: 50000,
    tags: [{ role: 'GC', tag: { kind: 'COMPANY', normalized: 'acme builders' } }, { role: 'DEVELOPER', tag: { kind: 'COMPANY', normalized: 'big dev' } }] });
  assert.equal(f.company, 'big dev');          // owner side first
  assert.equal(f.zone, null);                  // zone only on land sales
  assert.equal(featuresOf({ kind: 'LAND', neighborhood: 'C-MX-8' }).zone, 'C-MX-8');
  const keys = featureKeys({ ...f, reasonCode: 'WRONG_BUILDING_TYPE' });
  assert.deepEqual(keys.map(k => k.field).sort(), ['PERMIT_CLASS', 'SOURCE']);
  assert.deepEqual(featureKeys({ ...f, reasonCode: 'DONT_WANT_CLIENT' }).map(k => k.field), ['COMPANY']);
  assert.deepEqual(featureKeys({ ...f, reasonCode: 'DUPLICATE' }), []);
  assert.deepEqual(featureKeys({ ...f, reasonCode: 'TOO_OLD' }), []);
});

test('a rule is proposed after three presses, not when people mostly keep the rows', () => {
  const fb = n => Array.from({ length: n }, (_, i) => ({ signalId: `s${i}`, reasonCode: 'WRONG_BUILDING_TYPE', kind: 'PERMIT', sourceId: 'src1', permitClass: 'Addition' }));
  assert.equal(proposeRules(fb(PROPOSE_AFTER - 1)).length, 0);
  const rules = proposeRules(fb(3));
  assert.equal(rules.length, 2);
  assert.ok(rules.every(r => r.dismissals === 3 && r.reasonCode === 'WRONG_BUILDING_TYPE'));
  // Two presses on one row count once.
  assert.equal(proposeRules([...fb(2), { ...fb(1)[0] }]).length, 0);
  // Kept share over a quarter blocks the rule.
  assert.equal(proposeRules(fb(3), { 'PERMIT|SOURCE|src1': 2, 'PERMIT|PERMIT_CLASS|Addition': 2 }).length, 0);
  assert.equal(proposeRules(fb(3), { 'PERMIT|SOURCE|src1': 1, 'PERMIT|PERMIT_CLASS|Addition': 1 }).length, 2);
});

test('an applied rule matches by field, case-insensitive, and only once applied', () => {
  const f = featuresOf({ kind: 'PERMIT', sourceId: 'src1', permitClass: 'Addition', city: 'Denver' });
  assert.ok(ruleMatches({ kind: 'PERMIT', field: 'PERMIT_CLASS', value: 'addition' }, f));
  assert.ok(ruleMatches({ kind: 'ALL', field: 'SOURCE', value: 'src1' }, f));
  assert.equal(ruleMatches({ kind: 'CONCEPT', field: 'SOURCE', value: 'src1' }, f), false);
  assert.equal(ruleMatches({ kind: 'PERMIT', field: 'CITY', value: 'Austin' }, f), false);
  const rules = [
    { id: 'a', status: 'PROPOSED', kind: 'PERMIT', field: 'SOURCE', value: 'src1' },
    { id: 'b', status: 'APPLIED', archivedAt: new Date(), kind: 'PERMIT', field: 'SOURCE', value: 'src1' },
    { id: 'c', status: 'APPLIED', kind: 'PERMIT', field: 'CITY', value: 'denver' },
  ];
  assert.equal(suppressedBy(rules, f)?.id, 'c');
  assert.equal(suppressedBy([], f), null);
  assert.match(describeRule({ field: 'SOURCE', kind: 'PERMIT', dismissals: 3, reasonCode: 'NOT_A_PROJECT' }, { sourceName: 'Denver permits' }), /Skip everything from Denver permits/);
  assert.equal(notRelevantRate({ dismissed: 1, reviewed: 3 }), 0.25);
  assert.equal(notRelevantRate({}), null);
});

test('the button is Not relevant on every card; the Dismiss button is gone; the roles exist', () => {
  const card = read('src/components/market-intel/SignalCard.jsx');
  assert.match(card, /Not relevant/);
  assert.match(card, /NotRelevantPicker/);
  assert.doesNotMatch(card, />\s*Dismiss\s*</);
  for (const page of ['src/app/(app)/market-intel/page.jsx', 'src/app/(app)/market-intel/permits/page.jsx']) {
    assert.match(read(page), /onNotRelevant=\{notRelevant\}/, page);
    assert.match(read(page), /\/feedback/, page);
  }
  const rulesRoute = read('src/app/api/market-intel/rules/route.js');
  assert.match(rulesRoute, /isSalesAdmin\(user\)/);
  assert.match(rulesRoute, /canDecide/);                 // Sales sees the list, only admins decide (Mike 10-9)
  assert.match(read('src/app/(app)/market-intel/sources/page.jsx'), /canDecide && <div/);
  assert.match(read('src/lib/market-intel/permits.js'), /suppressedBy/);
  assert.match(read('src/app/(app)/market-intel/sources/page.jsx'), /Learned rules/);
  assert.ok(ROLE_KEYS.includes('SALES_ADMIN') && ROLE_KEYS.includes('SALES'));
  const auth = read('src/lib/auth.js');
  assert.match(auth, /user\.role === 'SALES_ADMIN'/);
  assert.match(auth, /user\.role === 'SALES'/);
  const permitsPage = read('src/app/(app)/market-intel/permits/page.jsx');
  assert.match(permitsPage, /By company/);
  assert.match(read('src/app/api/market-intel/signals/route.js'), /view'\) === 'company'/);
});
