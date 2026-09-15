// Meeting Prep (sales notes) — the pure fact builder and reply checker.
// Run: node --test scripts/tests/meetingPrep.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFactBlocks, parseTalkingPoints, buildPrepPrompt, mentionsBuyPrice, describeJobsWith, fmtMoney,
  BLOCKS, MAX_POINTS, NEWS_WINDOW_DAYS,
} from '../../src/lib/meetingPrep/brief.js';

const NOW = new Date('2026-09-14T15:00:00Z');
const daysAgo = n => new Date(NOW.getTime() - n * 86_400_000);

const raw = () => ({
  clients: [{ id: 'c1', name: 'Acme Dev', type: 'developer', city: 'Denver', state: 'CO', tier: 'A' }],
  contacts: [
    { id: 'p2', name: 'Bob Lee', clientId: 'c1', lastTouchpointAt: daysAgo(2) },
    { id: 'p1', name: 'Jane Roe', title: 'VP Development', clientId: 'c1', onNote: true,
      lastInPersonAt: daysAgo(43), lastEmailSentAt: daysAgo(5),
      projectLinks: [{ projectId: 'j1', isLead: true }, { projectId: 'j3', isLead: false }, { projectId: 'gone', isLead: true }],
      employment: [
        { company: 'Acme Dev', title: 'VP Development', startYear: 2019, startMonth: 3, isCurrent: true },
        { company: 'Brick Co', title: 'Project Manager', startYear: 2014, endYear: 2019 },
      ] },
  ],
  projects: [
    { id: 'j1', name: 'Lone Tree Ranch', clientId: 'c1', linked: true, serviceType: 'fullDesign',
      procurementStage: 'QUALIFIED', procurementStatus: 'OPEN', designStage: 'QUALIFIED', designStatus: 'WON',
      nextActionType: 'CALL', nextActionDueDate: daysAgo(3), contractValue: 250000, designContractValue: 40000,
      budget: { total: 812345.6, source: 'Bid Matrix' } },
    { id: 'j2', name: 'Old Job', clientId: 'c1', serviceType: 'bidOnly', procurementStatus: 'LOST' },
    { id: 'j3', name: 'Lowell', clientId: 'c1', serviceType: 'bidOnly', procurementStatus: 'COMPLETED' },
  ],
  followUps: [{ id: 'a1', type: 'SEND_MATERIALS', detail: 'Send the fixture deck', contactName: 'Jane Roe',
    dueDate: daysAgo(4), status: 'CONFIRMED', noteTitle: 'Coffee w/ Jane', noteDate: daysAgo(43) }],
  intel: [
    { id: 'i1', detail: 'Acme is starting a student housing arm', company: 'Acme Dev' },
    { id: 'i2', detail: 'Their lighting budget is $40k per building' },
    { id: 'i3', detail: 'They think our DN is too high' },
    { id: 'i4', detail: 'They asked what our margin is' },
  ],
  changeOrders: [{ id: 'co1', projectId: 'j1', coNumber: 'CO-00003', title: 'Add bollards', status: 'SENT', date: daysAgo(10) }],
  rfis: [{ id: 'r1', projectId: 'j1', rfiNumber: 'RFI-00012', subject: 'Fixture substitution', status: 'OPEN', dateDue: daysAgo(1) }],
  news: [
    { id: 'n1', title: 'Acme breaks ground in Aurora', publishedAt: daysAgo(20), linkedClientId: 'c1' },
    { id: 'n2', title: 'Very old story', publishedAt: daysAgo(NEWS_WINDOW_DAYS + 5), linkedClientId: 'c1' },
    { id: 'n3', title: 'Wrong Acme', publishedAt: daysAgo(3), linkedClientId: 'c1', reviewStatus: 'DISMISSED' },
  ],
  standards: [],
  history: [{ id: 'h1', title: 'Coffee w/ Jane', meetingDate: daysAgo(43), activityType: 'COFFEE' }],
});

test('facts are numbered F1… in block order', () => {
  const facts = buildFactBlocks(raw(), NOW);
  facts.forEach((f, i) => assert.equal(f.ref, `F${i + 1}`));
  const order = BLOCKS.map(b => b.key);
  const seen = facts.map(f => order.indexOf(f.block));
  assert.deepEqual(seen, [...seen].sort((a, b) => a - b));
});

test('sell figures show — budget, product sale, design fee', () => {
  const deals = buildFactBlocks(raw(), NOW).filter(f => f.block === 'deals').map(f => f.text);
  const lt = deals.find(t => t.startsWith('Lone Tree Ranch'));
  assert.match(lt, /Budget \$812,346 \(Bid Matrix\); product sale \$250,000; design fee \$40,000\./);
  const intel = buildFactBlocks(raw(), NOW).filter(f => f.block === 'intel').map(f => f.text);
  assert.ok(intel.some(t => t.includes('$40k per building')), 'a dollar figure in intel is kept as typed');
});

test('DN, buy price and margin never show', () => {
  const r = raw();
  r.projects[0].flagged = true;
  r.projects[0].flagNote = 'dealer net came in late';
  const facts = buildFactBlocks(r, NOW);
  for (const f of facts) assert.ok(!mentionsBuyPrice(f.text), f.text);
  const intel = facts.filter(f => f.block === 'intel').map(f => f.text);
  assert.ok(!intel.some(t => t.includes('too high')), 'a line about DN is dropped outright');
  assert.ok(!intel.some(t => t.includes('margin')), 'a line about margin is dropped outright');
  assert.ok(!facts.some(f => f.sourceId === 'j1' && f.block === 'deals'), 'a job line with buy-price words is dropped whole');
  assert.ok(!JSON.stringify(facts).match(/originalDN|pricingSnapshot|pipelinePerUnit|marginPct|dnPerUnit/));
});

test('people on the meeting come first, with their last in-person date', () => {
  const people = buildFactBlocks(raw(), NOW).filter(f => f.block === 'people');
  assert.match(people[0].text, /^Jane Roe, VP Development \(Acme Dev\) — on this meeting/);
  assert.match(people[0].text, /43 days ago/);
  assert.match(people[0].text, /Last email to them Sep 9, 2026\./);
  assert.match(people[1].text, /No in-person meeting on file/);
});

test('work history reads as years at each place', () => {
  const wh = buildFactBlocks(raw(), NOW).filter(f => f.block === 'workHistory');
  assert.equal(wh.length, 1, 'Bob has none on file, so he gets no line');
  assert.equal(wh[0].sourceId, 'p1');
  assert.equal(wh[0].text,
    'Jane Roe — Acme Dev, VP Development, Mar 2019 – now (7 yrs 7 mos); Brick Co, Project Manager, 2014 – 2019 (about 5 yrs).');
});

test('jobs with them: count, lead, boards and stages, budgets', () => {
  const jobs = buildFactBlocks(raw(), NOW).filter(f => f.block === 'jobs');
  assert.equal(jobs.length, 1);
  const t = jobs[0].text;
  assert.match(t, /^Jane Roe — on 2 jobs with us \(lead on 1\)\./, 'an archived or unknown job is not counted');
  assert.match(t, /Procurement: 1 open \(.+ 1\), 1 won/);
  assert.match(t, /Design: 1 won/);
  assert.match(t, /Budgets on those jobs total \$812,346\./);
  assert.match(t, /Jobs: Lone Tree Ranch \(\$812,346 budget\); Lowell \(no budget yet\)\./);
  assert.equal(describeJobsWith('Nobody', [], {}), null);
});

test('deals show each board, the track record, and overdue next actions', () => {
  const deals = buildFactBlocks(raw(), NOW).filter(f => f.block === 'deals').map(f => f.text);
  assert.match(deals[0], /Procurement 1 won, 1 lost, 0 abandoned, 1 open; Design 1 won/);
  const lt = deals.find(t => t.startsWith('Lone Tree Ranch'));
  assert.match(lt, /Procurement: .* \/ Open; Design: .* \/ Won/);
  assert.match(lt, /overdue/);
  assert.ok(!deals.some(t => t.startsWith('Old Job')), 'a closed job not on the note is left out');
});

test('a job at another company names that company', () => {
  const r = raw();
  r.projects.push({ id: 'j9', name: 'Far Job', clientId: 'cX', client: { name: 'Other Co' }, linked: false,
    serviceType: 'bidOnly', procurementStatus: 'OPEN' });
  const deals = buildFactBlocks(r, NOW).filter(f => f.block === 'deals').map(f => f.text);
  assert.ok(deals.some(t => t.startsWith('Far Job (Other Co)')));
});

test('news is recent and not dismissed; standards say when none are on file', () => {
  const facts = buildFactBlocks(raw(), NOW);
  const news = facts.filter(f => f.block === 'news').map(f => f.text);
  assert.equal(news.length, 1);
  assert.match(news[0], /breaks ground/);
  assert.match(facts.find(f => f.block === 'standards').text, /no client standards on file/);
});

test('each block is capped', () => {
  const r = raw();
  r.intel = Array.from({ length: 30 }, (_, i) => ({ id: `x${i}`, detail: `fact ${i}` }));
  const cap = BLOCKS.find(b => b.key === 'intel').cap;
  assert.equal(buildFactBlocks(r, NOW).filter(f => f.block === 'intel').length, cap);
});

test('an empty input gives no facts and does not throw', () => {
  assert.deepEqual(buildFactBlocks({}, NOW), []);
});

test('the prompt allows sell figures, forbids buy price, and seals two documents', () => {
  const facts = buildFactBlocks(raw(), NOW);
  const { instructions, documents } = buildPrepPrompt(facts, { title: 'Lunch w/ Jane', meetingDate: NOW });
  assert.match(instructions, /You may mention budgets, product sale totals and design fees/);
  assert.match(instructions, /Never mention DN, dealer net, buy price, net cost, margin/);
  assert.equal(documents.length, 2);
  assert.match(documents[0].text, /^F1 \[/);
  assert.match(documents[0].text, /\[Work history\]/);
  assert.match(documents[1].text, /Lunch w\/ Jane/);
});

test('talking points keep only real citations, drop buy price, cap at five', () => {
  const facts = buildFactBlocks(raw(), NOW);
  const reply = '```json\n' + JSON.stringify({ points: [
    { text: 'Ask Jane about the fixture deck you owe her [F3].', refs: ['F3'] },
    { text: 'Congratulate them on breaking ground.', refs: ['F99'] },
    { text: 'Tell them our margin is already thin.', refs: ['F1'] },
    { text: 'Chase the open RFI (F2, F4).' },
    { text: 'Their $812,346 budget is healthy.', refs: ['F1'] },
    { text: 'Point five', refs: ['F1'] },
    { text: 'Point six', refs: ['F1'] },
    { text: 'Point seven', refs: ['F1'] },
  ] }) + '\n```';
  const points = parseTalkingPoints(reply, facts);
  assert.equal(points.length, MAX_POINTS);
  assert.deepEqual(points[0], { text: 'Ask Jane about the fixture deck you owe her.', refs: ['F3'] });
  assert.ok(!points.some(p => p.text.includes('breaking ground')), 'a point citing nothing real is dropped');
  assert.ok(!points.some(p => mentionsBuyPrice(p.text)), 'a point about margin is dropped');
  assert.deepEqual(points[1].refs, ['F2', 'F4']);
  assert.equal(points[1].text, 'Chase the open RFI.');
  assert.equal(points[2].text, 'Their $812,346 budget is healthy.', 'a budget point is kept');
});

test('a garbage reply gives no points', () => {
  const facts = buildFactBlocks(raw(), NOW);
  assert.deepEqual(parseTalkingPoints('sorry, I cannot help', facts), []);
  assert.deepEqual(parseTalkingPoints(null, facts), []);
});

test('the buy-price guard', () => {
  for (const t of ['our margin is thin', 'the DN went up', 'dealer net', 'dealer-net pricing', 'their buy price',
    'net cost per fixture', 'our cost on that', 'cost basis', 'a rebate from the rep', 'spiffs']) {
    assert.ok(mentionsBuyPrice(t), t);
  }
  for (const t of ['Budget $812,346 (Bid Matrix)', 'Ask about the Aurora groundbreaking', 'send the drawing markups',
    'the dn gap in the ceiling', 'design fee $40,000']) {
    assert.ok(!mentionsBuyPrice(t), t);
  }
  assert.equal(fmtMoney(812345.6), '$812,346');
});
