// Sales expenses (0129): amounts, categories, cost to first project.
// Run: node --test scripts/tests/salesExpenses.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  parseAmountCents, centsToInput, formatMoney, categoryForActivity, normalizeCategory,
  costToFirstProject, summarizeFirstProjectCosts, EXPENSE_CATEGORY_KEYS, expenseTopNumbers,
} from '../../src/lib/sales/expenses.js';
import { bucketByPeriod } from '../../src/lib/activity/byPeriod.js';
import { ARCHIVABLE } from '../../src/lib/archive.js';
import { objects } from '../../src/lib/ontology/index.js';

const ROOT = new URL('../../', import.meta.url);
const read = p => readFileSync(new URL(p, ROOT), 'utf8');

test('parseAmountCents: typed dollars to whole cents', () => {
  assert.equal(parseAmountCents('$1,234.50'), 123450);
  assert.equal(parseAmountCents('42'), 4200);
  assert.equal(parseAmountCents('0.1'), 10);
  assert.equal(parseAmountCents(12.5), 1250);
  assert.equal(parseAmountCents(''), null);
  assert.equal(parseAmountCents('  '), null);
  assert.equal(parseAmountCents(null), null);
  assert.equal(parseAmountCents(undefined), null);
  assert.equal(parseAmountCents('abc'), undefined);
  assert.equal(parseAmountCents('-5'), undefined);
  assert.equal(parseAmountCents('1.234'), undefined);
});

test('centsToInput and formatMoney round-trip', () => {
  assert.equal(centsToInput(123450), '1234.50');
  assert.equal(centsToInput(null), '');
  assert.equal(formatMoney(123450), '$1,234.50');
  assert.equal(formatMoney(120000), '$1,200');
  assert.equal(formatMoney(0), '$0');
});

test('activity type picks the expense category', () => {
  assert.equal(categoryForActivity('COFFEE'), 'MEAL');
  assert.equal(categoryForActivity('LUNCH'), 'MEAL');
  assert.equal(categoryForActivity('HAPPY_HOUR'), 'MEAL');
  assert.equal(categoryForActivity('GOLF'), 'GOLF');
  assert.equal(categoryForActivity('SITE_VISIT'), 'TRAVEL');
  assert.equal(categoryForActivity('EVENT'), 'EVENT');
  assert.equal(categoryForActivity('CALL'), 'OTHER');
  assert.equal(categoryForActivity(null), 'OTHER');
  assert.equal(normalizeCategory('GIFT'), 'GIFT');
  assert.equal(normalizeCategory('nope'), 'OTHER');
  assert.deepEqual(EXPENSE_CATEGORY_KEYS, ['MEAL', 'TRAVEL', 'GOLF', 'EVENT', 'GIFT', 'OTHER']);
});

const notes = [
  { date: '2026-01-10', isInPerson: true,  userId: 'mike' },
  { date: '2026-02-01', isInPerson: false, userId: 'mike' },
  { date: '2026-03-15', isInPerson: true,  userId: 'maram' },
  { date: '2026-06-01', isInPerson: true,  userId: 'mike' },   // after the win
];
const expenses = [
  { spentOn: '2026-01-10', amountCents: 8000 },
  { spentOn: '2026-03-15', amountCents: 25000 },
  { spentOn: '2026-07-01', amountCents: 99900 },               // after the win
];

test('costToFirstProject counts only what came before the win', () => {
  const r = costToFirstProject({ notes, expenses, firstWinAt: '2026-04-01' });
  assert.equal(r.won, true);
  assert.equal(r.approximated, false);
  assert.equal(r.meetings, 3);
  assert.equal(r.inPerson, 2);
  assert.equal(r.spentCents, 33000);
  assert.equal(r.firstTouchAt.slice(0, 10), '2026-01-10');
  assert.equal(r.daysToWin, 81);
});

test('costToFirstProject with no win shows everything so far', () => {
  const r = costToFirstProject({ notes, expenses, firstWinAt: null });
  assert.equal(r.won, false);
  assert.equal(r.meetings, 4);
  assert.equal(r.spentCents, 132900);
  assert.equal(r.daysToWin, null);
  assert.equal(r.firstWinAt, null);
});

test('an approximated win date is flagged and the empty case is safe', () => {
  const r = costToFirstProject({ notes, expenses, firstWinAt: '2026-04-01', approximated: true });
  assert.equal(r.approximated, true);
  const e = costToFirstProject({});
  assert.deepEqual(e, { won: false, approximated: false, firstWinAt: null, firstTouchAt: null, meetings: 0, inPerson: 0, spentCents: 0, daysToWin: null });
});

test('summarizeFirstProjectCosts averages won clients and leaves out guessed dates', () => {
  const rows = [
    { won: true,  approximated: false, meetings: 2, inPerson: 1, spentCents: 10000, daysToWin: 30 },
    { won: true,  approximated: false, meetings: 4, inPerson: 3, spentCents: 30000, daysToWin: 90 },
    { won: true,  approximated: true,  meetings: 40, inPerson: 40, spentCents: 900000, daysToWin: 900 },
    { won: false, approximated: false, meetings: 1, inPerson: 0, spentCents: 5000, daysToWin: null },
  ];
  const s = summarizeFirstProjectCosts(rows);
  assert.equal(s.clients, 4);
  assert.equal(s.wonClients, 2);
  assert.equal(s.approximatedClients, 1);
  assert.equal(s.openClients, 1);
  assert.equal(s.avgMeetings, 3);
  assert.equal(s.medianMeetings, 3);
  assert.equal(s.avgInPerson, 2);
  assert.equal(s.avgSpentCents, 20000);
  assert.equal(s.avgDaysToWin, 60);
  assert.equal(s.openMeetings, 1);
  assert.equal(s.openSpentCents, 5000);
  const empty = summarizeFirstProjectCosts([]);
  assert.equal(empty.wonClients, 0);
  assert.equal(empty.avgMeetings, null);
});

test('bucketByPeriod sums a weight (dollars) per salesperson', () => {
  const now = new Date(2026, 9, 20);
  const rows = [
    { spentOn: '2026-10-15', userId: 'mike',  amountCents: 5000 },
    { spentOn: '2026-10-16', userId: 'maram', amountCents: 2500 },
    { spentOn: '2026-09-20', userId: 'mike',  amountCents: 100 },
    { spentOn: '2024-01-01', userId: 'mike',  amountCents: 999999 },  // outside the window
  ];
  const out = bucketByPeriod(rows, { period: 'month', months: 12, now, weight: e => e.amountCents });
  const oct = out.find(b => b.key === '2026-10');
  assert.equal(oct.team, 7500);
  assert.deepEqual(oct.perUser, { mike: 5000, maram: 2500 });
  assert.equal(out.find(b => b.key === '2026-09').team, 100);
  // Without a weight it still counts rows.
  assert.equal(bucketByPeriod(rows, { period: 'month', months: 12, now }).find(b => b.key === '2026-10').team, 2);
});

test('expenses are archive-only and known to the ontology', () => {
  assert.ok(ARCHIVABLE.includes('salesExpense'));
  assert.equal(objects.SalesExpense.model, 'salesExpense');
  assert.equal(objects.Note.links.expense.object, 'SalesExpense');
  const route = read('src/app/api/sales/expenses/[id]/route.js');
  assert.match(route, /status: 405/);
  assert.match(route, /archiveData\(archived, user\)/);
});

test('migration 0129 only adds', () => {
  const sql = read('prisma/migrations/0129_sales_expenses/migration.sql');
  const code = sql.replace(/--.*$/gm, '');
  assert.doesNotMatch(code, /\bDROP\b/i);
  assert.match(sql, /CREATE TABLE "SalesExpense"/);
  assert.match(sql, /"SalesExpense_noteId_key"/);
});

test('the note editor and both note routes carry Amount spent', () => {
  assert.match(read('src/app/(app)/crm/notes/NotesClient.jsx'), /amountSpent/);
  assert.match(read('src/app/api/crm/notes/[id]/route.js'), /syncNoteExpense\(/);
  assert.match(read('src/app/api/crm/notes/route.js'), /syncNoteExpense\(/);
});

test('expenseTopNumbers: last year, YTD stops today, top client', () => {
  const r = (spentOn, amountCents, clientId, name) => ({ spentOn, amountCents, clientId, client: name ? { name } : null });
  const rows = [
    r('2025-06-01T12:00:00Z', 10000),
    r('2026-02-01T12:00:00Z', 2000, 'a', 'Alpha'),
    r('2026-03-01T12:00:00Z', 3000, 'a', 'Alpha'),
    r('2026-04-01T12:00:00Z', 4000, 'b', 'Beta'),
    r('2026-05-01T12:00:00Z', 700),
    r('2026-12-01T12:00:00Z', 90000, 'b', 'Beta'),
  ];
  const n = expenseTopNumbers(rows, 2026, '2026-11-02');
  assert.equal(n.lastYearCents, 10000);
  assert.equal(n.ytdCents, 9700);
  assert.deepEqual(n.topClient, { name: 'Alpha', cents: 5000 });
  assert.equal(expenseTopNumbers([r('2026-05-01T12:00:00Z', 700)], 2026, '2026-11-02').topClient, null);
});
