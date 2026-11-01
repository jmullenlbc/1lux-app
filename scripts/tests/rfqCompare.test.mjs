// RFQ versions, rounds and the compare math.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  compareSentence, compareSnapshots, currentLineIds, familyBefore, lineKey, revisionChanges, roundsFor, snapshotAt, snapshotOfRound, snapshotTotal,
} from '../../src/lib/rfq/compare.js';

const line = (id, item, typeCode, qty, dnPrice = null, extra = {}) => ({ id, peerReviewItemId: item, typeCode, manufacturer: 'Lithonia', partNumber: `P-${typeCode}`, qty, dnPrice, ...extra });
const rfq = (number, roundNumber, version, lines, extra = {}) => ({ id: `r${number}`, number, familyNumber: extra.familyNumber ?? number, version, addOn: false, roundNumber, toName: 'Rep A', lines, ...extra });

test('a rep left out of a round carries their prices forward', () => {
  const rfqs = [
    rfq(1, 1, 1, [line('a', 'A', 'A1', 10, 100)]),
    rfq(2, 1, 1, [line('b', 'B', 'B1', 5, 200)], { toName: 'Rep B' }),
    rfq(3, 2, 2, [line('c', 'A', 'A1', 12, 110)], { familyNumber: 1 }),
  ];
  const r2 = snapshotAt(rfqs, 2);
  assert.equal(snapshotTotal(r2), 2320, '12 x 110 + 5 x 200');
  assert.equal(snapshotTotal(snapshotAt(rfqs, 1)), 2000);
});

test('a full revision drops what it leaves off, an add-on keeps everything', () => {
  const v1 = rfq(1, 1, 1, [line('a', 'A', 'A1', 10, 100), line('b', 'B', 'B1', 2, 50)]);
  const full = rfq(2, 2, 2, [line('c', 'A', 'A1', 10, 100)], { familyNumber: 1 });
  assert.deepEqual([...snapshotAt([v1, full]).keys()], ['A']);
  const addOn = rfq(2, 2, 2, [line('d', 'D', 'D1', 1, 25)], { familyNumber: 1, addOn: true });
  assert.deepEqual([...snapshotAt([v1, addOn]).keys()].sort(), ['A', 'B', 'D']);
});

test('a line waiting on a new price keeps the last one and says so', () => {
  const snap = snapshotAt([rfq(1, 1, 1, [line('a', 'A', 'A1', 10, 100)]), rfq(2, 2, 2, [line('b', 'A', 'A1', 12)], { familyNumber: 1 })]);
  const e = snap.get('A');
  assert.equal(e.price, 100);
  assert.equal(e.waiting, true);
  assert.equal(e.lineId, 'b');
  assert.equal(snapshotTotal(snap), 1200);
});

test('a new rep on a line takes it over, and the old rep revision leaves it alone', () => {
  const rfqs = [
    rfq(1, 1, 1, [line('a', 'A', 'A1', 1, 10), line('b', 'B', 'B1', 1, 10)]),
    rfq(2, 2, 1, [line('c', 'A', 'A1', 1, 12)], { toName: 'Rep B' }),
    rfq(3, 2, 2, [line('d', 'B', 'B1', 1, 11)], { familyNumber: 1 }),
  ];
  const snap = snapshotAt(rfqs);
  assert.equal(snap.get('A').repName, 'Rep B');
  assert.equal(snap.get('A').price, 12);
  assert.equal(snap.get('B').price, 11);
});

test('rows with no round count by their version', () => {
  const rfqs = [{ id: 'x', number: 1, version: 1, lines: [line('a', 'A', 'A1', 1, 10)] }, { id: 'y', number: 2, familyNumber: 1, version: 2, lines: [line('b', 'A', 'A1', 1, 20)] }];
  assert.equal(snapshotTotal(snapshotAt(rfqs, 1)), 10);
  assert.equal(snapshotTotal(snapshotAt(rfqs, 2)), 20);
});

test('only the newest picture counts as current for a new quote', () => {
  const ids = currentLineIds([rfq(1, 1, 1, [line('a', 'A', 'A1', 1)]), rfq(2, 2, 2, [line('b', 'A', 'A1', 1)], { familyNumber: 1 })]);
  assert.deepEqual([...ids], ['b']);
});

test('the compare parts add up to the total change to the cent', () => {
  const a = snapshotAt([rfq(1, 1, 1, [
    line('a', 'A', 'A1', 10, 19.99), line('b', 'B', 'B1', 7, 33.33), line('c', 'C', 'C1', 3, 101.01), line('e', 'E', 'E1', 4), line('f', 'F', 'F1', 2, 9.5),
  ])]);
  const b = snapshotAt([rfq(1, 1, 1, [
    line('a2', 'A', 'A1', 11, 21.13), line('b2', 'B', 'B1', 7, 35.17), line('e2', 'E', 'E1', 4, 12.25), line('d', 'D', 'D1', 6, 17.77), line('f2', 'F', 'F1', 2, 9.5),
  ])]);
  const c = compareSnapshots(a, b);
  assert.equal(c.change, Number((c.b - c.a).toFixed(2)));
  const sum = c.price + c.quantity + c.added + c.removed + c.firstPriced;
  assert.equal(Number(sum.toFixed(2)), c.change);
  assert.equal(c.removed, -303.03);
  assert.equal(c.added, 106.62);
  assert.equal(c.firstPriced, 49);
  assert.equal(c.quantity, 19.99);
  assert.equal(Number(c.rows.reduce((s, r) => s + r.difference, 0).toFixed(2)), c.change);
});

test('each line names its change', () => {
  const a = snapshotAt([rfq(1, 1, 1, [line('a', 'A', 'A1', 10, 5), line('b', 'B', 'B1', 10, 5), line('c', 'C', 'C1', 1, 5), line('d', 'D', 'D1', 1, 5)])]);
  const b = snapshotAt([rfq(1, 1, 1, [line('a2', 'A', 'A1', 12, 5), line('b2', 'B', 'B1', 12, 6), line('c2', 'C', 'C1', 1, 5, { partNumber: 'NEW' }), line('d2', 'D', 'D1', 1, 5)])]);
  const by = Object.fromEntries(compareSnapshots(a, b).rows.map((r) => [r.typeCode, r.change]));
  assert.deepEqual(by, { A1: 'Quantity', B1: 'Price and quantity', C1: 'Part changed', D1: 'Unchanged' });
});

test('unchanged rows sort last', () => {
  const a = snapshotAt([rfq(1, 1, 1, [line('a', 'A', 'A1', 1, 5), line('z', 'Z', 'Z1', 1, 5)])]);
  const b = snapshotAt([rfq(1, 1, 1, [line('a2', 'A', 'A1', 1, 5), line('z2', 'Z', 'Z1', 1, 6)])]);
  assert.deepEqual(compareSnapshots(a, b).rows.map((r) => r.typeCode), ['Z1', 'A1']);
});

test('a line that lost its matrix link still pairs on type and manufacturer', () => {
  const a = snapshotAt([rfq(1, 1, 1, [line('a', 'A', 'A1', 1, 5)])]);
  const b = snapshotAt([rfq(1, 1, 1, [line('b', null, 'a1', 1, 6)])]);
  const { rows } = compareSnapshots(a, b);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].change, 'Price');
});

test('the top sentence reads like a person wrote it', () => {
  const a = snapshotAt([rfq(1, 1, 1, [line('a', 'A', 'A1', 10, 100), line('b', 'B', 'B1', 1, 800)])]);
  const b = snapshotAt([rfq(1, 1, 1, [line('a2', 'A', 'A1', 12, 110)])]);
  assert.equal(compareSentence(compareSnapshots(a, b), 'Round 1 Bid Set', 'Round 2 VE'), 'Round 2 VE is $1,320, down $480 from Round 1 Bid Set: +$120 price, +$200 quantity, -$800 removed lines.');
  assert.equal(compareSentence(compareSnapshots(a, a), 'V1', 'V2'), 'V2 is $1,800, the same as V1.');
});

test('the rep sees what changed, with no prices', () => {
  const before = snapshotAt([rfq(1, 1, 1, [line('a', 'A', 'A1', 10, 100), line('b', 'B', 'B1', 2, 50), line('c', 'C', 'C1', 1, 5)])]);
  const after = [line('n', 'A', 'A1', 12), line('m', 'C', 'C1', 1, null, { partNumber: 'NEW' }), line('o', 'D', 'D1', 3)];
  const got = revisionChanges(before, after).map((c) => c.text);
  assert.deepEqual(got, ['A1: quantity 10 to 12', 'C1: part number now NEW', 'D1: added', 'B1: removed']);
  assert.ok(!JSON.stringify(got).includes('100'));
  assert.deepEqual(revisionChanges(before, [line('o', 'D', 'D1', 3)], { addOn: true }).map((c) => c.text), ['D1: added']);
});

test('a family looks back only at its own earlier sends', () => {
  const rfqs = [rfq(1, 1, 1, [line('a', 'A', 'A1', 1, 5)]), rfq(2, 1, 1, [line('b', 'B', 'B1', 1, 5)]), rfq(3, 2, 2, [line('c', 'A', 'A1', 2)], { familyNumber: 1 })];
  assert.deepEqual([...familyBefore(rfqs, rfqs[2]).keys()], ['A']);
});

test('rounds list who was sent and who carried, and travel as plain lists', () => {
  const rfqs = [
    rfq(1, 1, 1, [line('a', 'A', 'A1', 10, 100)]),
    rfq(2, 1, 1, [line('b', 'B', 'B1', 5, 200)], { toName: 'Rep B' }),
    rfq(3, 2, 2, [line('c', 'A', 'A1', 10)], { familyNumber: 1 }),
  ];
  const [r1, r2] = roundsFor([{ id: 'x2', number: 2, name: 'VE' }, { id: 'x1', number: 1, name: 'Bid Set' }], rfqs);
  assert.equal(r1.name, 'Bid Set');
  assert.equal(r1.total, 2000);
  assert.deepEqual(r2.sentReps, ['Rep A']);
  assert.deepEqual(r2.carriedReps, ['Rep B']);
  assert.equal(r2.waiting, 1);
  assert.equal(snapshotTotal(snapshotOfRound(r2)), 2000);
  assert.equal(lineKey({ typeCode: 'a1', manufacturer: 'Lithonia Lighting' }), 'A1|LITHONIA');
});
