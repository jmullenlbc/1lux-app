// Voice recency weighting + counted insights (Mike 9-27). Pure, no DB.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bandOf, allocate, keepByAge, pickWeighted, KEEP_PER_MAILBOX, AGE_BANDS } from '../../src/lib/tone/voiceAge.js';
import { periodStats, topPhrases, recurringEmails, topSentences, personalLines } from '../../src/lib/tone/voiceInsights.js';

const NOW = Date.UTC(2026, 8, 27);
const DAY = 86_400_000;
const ago = d => NOW - d * DAY;
const mail = (days, body, subject = 'Hi') => ({ subject, body, date: ago(days) });

test('bands: newest counts most, undated counts 1', () => {
  assert.equal(bandOf(ago(10), NOW).key, 'M3');
  assert.equal(bandOf(ago(200), NOW).key, 'M12');
  assert.equal(bandOf(ago(500), NOW).key, 'Y2');
  assert.equal(bandOf(ago(3000), NOW).key, 'OLD');
  assert.equal(bandOf(null, NOW).key, 'NONE');
  const w = AGE_BANDS.map(b => b.weight);
  assert.deepEqual([...w].sort((a, b) => b - a), w);
});

test('allocate never gives more than a period has, and hands leftovers on', () => {
  const s = allocate({ M3: 2, OLD: 1000 }, 100, b => b.keep);
  assert.equal(s.M3, 2);
  assert.equal(s.OLD, 98);
});

test('a big mailbox keeps every year, tilted to the newest', () => {
  const rows = [];
  for (let d = 0; d < 3650; d++) rows.push(mail(d, 'x'));
  const kept = keepByAge(rows, { now: NOW });
  assert.equal(kept.length, KEEP_PER_MAILBOX); // the unused undated slots go to other years
  assert.ok(kept.some(r => bandOf(r.date, NOW).key === 'OLD'));
  assert.ok(kept[0].date >= kept[kept.length - 1].date);
  const recent = kept.filter(r => bandOf(r.date, NOW).key === 'M3').length;
  assert.equal(recent, 91); // all of them: fewer than the 300 kept
});

test('study picks lean to the newest but still include old years', () => {
  const rows = [];
  for (let i = 0; i < 100; i++) rows.push(mail(i % 90, 'new'));
  for (let i = 0; i < 100; i++) rows.push(mail(2000 + i, 'old'));
  const { picks, plan } = pickWeighted(rows, 60, { now: NOW });
  assert.equal(picks.length, 60);
  const m3 = plan.find(p => p.key === 'M3'), old = plan.find(p => p.key === 'OLD');
  assert.ok(m3.studied > old.studied * 10, JSON.stringify(plan));
  assert.ok(old.studied >= 1);
});

test('period stats count words, questions and soft words', () => {
  const rows = [mail(5, 'Can we meet Tuesday? I think it helps.'), mail(5, 'Sending the budget now.')];
  const [m3] = periodStats(rows, { now: NOW });
  assert.equal(m3.emails, 2);
  assert.equal(m3.questionPct, 50);
  assert.equal(m3.softPerEmail, 0.5);
});

test('top phrases: counted once per email, longer phrase wins, no numbers', () => {
  const rows = [];
  for (let i = 0; i < 6; i++) rows.push(mail(i * 10, `Let me know if you have questions. Call me at 555 ${i}. Random words ${i} here.`));
  const top = topPhrases(rows, { now: NOW });
  assert.ok(/let me know if you have|me know if you have questions/.test(top[0].phrase), top[0].phrase);
  assert.equal(top[0].emails, 6);
  assert.equal(top.filter(t => /know if you have/.test(t.phrase)).length, 1);
  assert.ok(!top.some(t => /know if you$/.test(t.phrase)));
  assert.ok(!top.some(t => /call me at/.test(t.phrase)));
});

test('recurring emails group near-identical ones and ignore one-offs', () => {
  const rows = [];
  for (let i = 0; i < 4; i++) rows.push(mail(i * 20, `Hi team, following up on the lighting budget we sent over for Project ${i}. Happy to walk through the numbers whenever works for you this week.`, `Budget follow-up ${i}`));
  rows.push(mail(3, 'Totally different note about the golf outing next month and who is bringing the cart and the snacks.'));
  const groups = recurringEmails(rows, { now: NOW });
  assert.equal(groups.length, 1);
  assert.equal(groups[0].size, 4);
  assert.equal(groups[0].recent, 4);
  assert.equal(groups[0].examples.length, 4);
});

test('recurring emails group by topic even when the wording differs (Mike 10-1)', () => {
  const rows = [
    mail(1, 'Can you send the updated lighting drawings when the architect issues them? We need the revised fixture schedule to update pricing.', 'Revised drawings'),
    mail(9, 'Still waiting on the revised drawings and fixture schedule from the architect. Once we have them our pricing gets updated.', 'Drawings update'),
    mail(30, 'Any word on revised drawings? The fixture schedule changed and the architect said a new set is coming.', 'Any word on drawings'),
    mail(40, 'Great seeing you at the golf outing, hope the family is doing well and the boat is back in the water.', 'Golf'),
    mail(50, 'Our invoice for the warehouse retrofit is attached, payment terms net thirty as usual for accounting.', 'Invoice'),
    mail(60, 'Totally separate note on the parking garage controls and the sensor spacing on level two.', 'Garage'),
  ];
  const groups = recurringEmails(rows, { now: NOW });
  assert.equal(groups.length, 1);
  assert.equal(groups[0].size, 3);
  assert.ok(groups[0].topic.some(w => /drawings|revised|architect|schedule/.test(w)), groups[0].topic.join(','));
});

test('recurring emails never group out-of-office replies', () => {
  const rows = [];
  for (let i = 0; i < 5; i++) rows.push(mail(i * 5, `I am currently out of the office until Monday ${i} with limited access to email. I will respond when I return.`, 'Out of Office'));
  assert.equal(recurringEmails(rows, { now: NOW }).length, 0);
});

test('top sentences: whole sentences, once per email, numbers aside, no greetings', () => {
  const rows = [];
  for (let i = 0; i < 5; i++) rows.push(mail(i * 10, `Hi Lee, Thanks for the call today. The walk is on the ${i + 1}th. Let me know if you have any questions.`));
  const top = topSentences(rows, { now: NOW });
  const said = top.map(t => t.sentence);
  assert.ok(said.includes('Let me know if you have any questions.'), said.join(' | '));
  assert.ok(said.some(x => /walk is on/.test(x)), "numbers aside, the same sentence");
  assert.ok(!said.some(x => /^Hi Lee/.test(x)));
  assert.equal(top.find(t => /any questions/.test(t.sentence)).emails, 5);
});

test('personal lines: family, weekend and congratulations, not shop talk', () => {
  const rows = [
    mail(1, 'Hope the kids had a great first week of school. Sending the revised budget now.'),
    mail(2, 'Congrats on the new baby! Pricing is attached.'),
    mail(3, 'Have a great weekend. The fixture schedule is attached.'),
  ];
  const said = personalLines(rows, { now: NOW }).map(t => t.sentence);
  assert.equal(said.length, 3, said.join(' | '));
  assert.ok(!said.some(x => /budget|pricing|fixture/i.test(x)));
});

test('top sentences leave out dollar amounts and job names', () => {
  const rows = [];
  for (let i = 0; i < 4; i++) rows.push(mail(i * 10, `The budget is $${i}00k. We sent a copy to Brinkmann as well. Talk to you soon!`));
  const said = topSentences(rows, { now: NOW }).map(t => t.sentence);
  assert.deepEqual(said, ['Talk to you soon!']);
});
