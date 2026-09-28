// Voice recency weighting + counted insights (Mike 9-27). Pure, no DB.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bandOf, allocate, keepByAge, pickWeighted, KEEP_PER_MAILBOX, AGE_BANDS } from '../../src/lib/tone/voiceAge.js';
import { periodStats, topPhrases, recurringEmails } from '../../src/lib/tone/voiceInsights.js';

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
  assert.equal(groups[0].examples.length, 3);
});
