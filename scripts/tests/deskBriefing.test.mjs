// My Desk morning briefing, the pure facts builder and reply checker.
// Run: node --test scripts/tests/deskBriefing.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { briefingFacts, buildBriefingPrompt, parseBriefing, plainBriefing, briefingDay, MAX_LINES } from '../../src/lib/desk/briefing.js';

const step = (id, extra = {}) => ({ id, label: 'Call', detail: 'Call about the lobby', who: 'Jane Roe', company: 'Acme Dev', dueDate: '2026-10-20T00:00:00Z', ...extra });
const desk = () => ({
  groups: [
    { key: 'OVERDUE', items: [step('a1'), step('a2', { who: 'Bob Lee' })] },
    { key: 'TODAY', items: [step('a3', { detail: 'Send the budget' })] },
    { key: 'LATER', items: [step('a4')] },
  ],
  drafts: [{ id: 'd1', toName: 'Jane Roe', subject: 'Checking in' }],
  meetings: [],
  budgetsNotSent: [{ id: 'p1', name: 'Trailhead', client: { name: 'Acme Dev' } }],
  pool: [{ id: 'p2', name: 'Web budget', city: 'Boise', state: 'ID' }],
  reviews: [],
});

test('facts come in urgency order, each with a place to go', () => {
  const facts = briefingFacts(desk(), {
    todaysMeetings: [{ id: 'n1', title: 'Lunch with Acme', meetingDate: '2026-10-23T19:00:00Z' }],
    checkIns: [{ id: 'c1', name: 'Sam Poe', company: 'Poe GC', daysOverdue: 12 }],
  });
  assert.deepEqual(facts.map(f => f.section), ['meetings', 'overdue', 'today', 'drafts', 'checkIns', 'budgetsNotSent', 'pool']);
  assert.deepEqual(facts.map(f => f.ref), ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7']);
  assert.equal(facts.find(f => f.section === 'overdue').go, '#group-OVERDUE');
  assert.equal(facts.find(f => f.section === 'pool').go, 'tab:pool');
  assert.match(facts.find(f => f.section === 'overdue').text, /Overdue steps: 2\. Call about the lobby, Jane Roe at Acme Dev \(due Oct 20\)/);
  assert.match(facts.find(f => f.section === 'checkIns').text, /Sam Poe at Poe GC, 12 days past due/);
  assert.match(facts[0].text, /Lunch with Acme at 12:00 PM/);
});

test('an empty desk has no facts and no lines', () => {
  assert.deepEqual(briefingFacts({ groups: [] }, {}), []);
  assert.deepEqual(plainBriefing([]), []);
});

test('the prompt carries every fact by ref', () => {
  const facts = briefingFacts(desk());
  const { instructions, documents } = buildBriefingPrompt(facts);
  assert.match(instructions, /Return ONLY JSON/);
  assert.match(instructions, /never use em dashes/i);
  for (const f of facts) assert.ok(documents[0].text.includes(`${f.ref}: `));
});

test('reply checker keeps cited lines, drops made up refs and buy prices, strips dashes', () => {
  const facts = briefingFacts(desk());
  const raw = '```json\n' + JSON.stringify({ lines: [
    { text: 'Two steps are overdue — start with Jane Roe.', refs: ['F1'] },
    { text: 'Nothing to cite here.', refs: ['F99'] },
    { text: 'Trailhead DN is $40k, send it.', refs: ['F4'] },
    { text: 'Send the budget today.', refs: ['F2', 'F1'] },
  ] }) + '\n```';
  const lines = parseBriefing(raw, facts);
  assert.equal(lines.length, 2);
  assert.ok(!/—/.test(lines[0].text));
  assert.equal(lines[0].go, '#group-OVERDUE');
  assert.equal(lines[1].go, '#group-TODAY');
});

test('reply checker caps the lines and survives junk', () => {
  const facts = briefingFacts(desk());
  const many = { lines: Array.from({ length: 9 }, (_, i) => ({ text: `Line ${i}`, refs: ['F1'] })) };
  assert.equal(parseBriefing(JSON.stringify(many), facts).length, MAX_LINES);
  assert.deepEqual(parseBriefing('not json at all', facts), []);
});

test('plain lines stand in when the writer fails', () => {
  const lines = plainBriefing(briefingFacts(desk()));
  assert.equal(lines.length, MAX_LINES);
  assert.match(lines[0].text, /^2 steps are overdue, starting with Call about the lobby/);
  assert.equal(lines[0].go, '#group-OVERDUE');
});

test('the briefing day is the Pacific date', () => {
  assert.equal(briefingDay(new Date('2026-10-24T03:00:00Z')), '2026-10-23');
  assert.equal(briefingDay(new Date('2026-10-24T08:00:00Z')), '2026-10-24');
});
