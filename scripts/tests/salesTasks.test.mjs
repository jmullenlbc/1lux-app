// Sales tasks on My Desk (Mike 11-1): the rules that decide columns, days and permissions.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  NOTE_TASK_TAG, canChangeTask, cleanTagName, cleanTaskInput, dayOf, dueLabel, filterTasks, groupByStatus,
  listGroups, parseDay, sortTasks, stepTitle, taskDue, taskOverdue, taskStatusOf, tasksDueByPerson, weekEnd,
} from '../../src/lib/desk/tasks.js';

test('a picked day stays that day, and a made up day is refused', () => {
  assert.equal(parseDay('2026-11-05').toISOString(), '2026-11-05T12:00:00.000Z');
  assert.equal(dayOf(parseDay('2026-11-05')), '2026-11-05');
  assert.equal(dueLabel(parseDay('2026-11-05')), 'Nov 5');
  assert.equal(parseDay('2026-02-31'), null);
  assert.equal(parseDay('tomorrow'), null);
});

test('overdue goes by day, and done is never overdue', () => {
  const dueDate = parseDay('2026-11-01');
  assert.equal(taskOverdue({ dueDate, status: 'TODO' }, '2026-11-01'), false);
  assert.equal(taskOverdue({ dueDate, status: 'TODO' }, '2026-11-02'), true);
  assert.equal(taskOverdue({ dueDate, status: 'DONE' }, '2026-11-02'), false);
  assert.equal(taskOverdue({ status: 'TODO' }, '2026-11-02'), false);
});

test('a new task needs a title; an edit only changes what was sent', () => {
  assert.match(cleanTaskInput({ title: '  ' }, { creating: true }).error, /title/);
  assert.deepEqual(cleanTaskInput({ detail: ' call them ' }).data, { detail: 'call them' });
  assert.match(cleanTaskInput({ status: 'NOPE' }).error, /columns/);
  assert.match(cleanTaskInput({ dueDate: 'soon' }).error, /real date/);
  assert.equal(cleanTaskInput({ dueDate: null }).data.dueDate, null);
  assert.equal(cleanTaskInput({ assigneeId: '' }).data.assigneeId, null);
});

test('links are kept separate and repeats drop out', () => {
  const { data } = cleanTaskInput({ clientIds: ['a', 'a', '', 7], contactIds: ['b'], projectIds: [], tagIds: ['t'] });
  assert.deepEqual(data, { clientIds: ['a'], contactIds: ['b'], projectIds: [], tagIds: ['t'] });
});

test('tag names are tidied and need something in them', () => {
  assert.equal(cleanTagName('  Hot   lead ').name, 'Hot lead');
  assert.match(cleanTagName(' ').error, /name/);
  assert.match(cleanTagName('x'.repeat(41)).error, /under/);
});

test('the step decides done, the row decides the other columns', () => {
  const open = { status: 'CONFIRMED', fulfilledAt: null };
  assert.equal(taskStatusOf({ status: 'DOING' }, open), 'DOING');
  assert.equal(taskStatusOf({ status: 'DONE' }, open), 'TODO');
  assert.equal(taskStatusOf({ status: 'DOING' }, { status: 'DONE' }), 'DONE');
  assert.equal(taskStatusOf({ status: 'WAITING' }, { status: 'CONFIRMED', fulfilledAt: new Date() }), 'DONE');
  assert.equal(taskStatusOf({ status: 'DOING' }, null), 'DOING');
});

test('wording and due date come from the step when there is one', () => {
  assert.equal(stepTitle({ detail: 'Call Pat', rawText: 'call pat maybe' }), 'Call Pat');
  assert.equal(stepTitle({ rawText: 'call pat maybe' }), 'call pat maybe');
  const remindAt = new Date('2026-11-09T12:00:00Z');
  assert.equal(taskDue({ dueDate: new Date('2026-12-01') }, { remindAt }).getTime(), remindAt.getTime());
  assert.equal(taskDue({ dueDate: remindAt }, null).getTime(), remindAt.getTime());
  assert.equal(taskDue({}, null), null);
});

test('who can change a task', () => {
  const own = { assigneeId: 'a', createdById: 'b', isStep: false };
  assert.equal(canChangeTask(own, 'a'), true);
  assert.equal(canChangeTask(own, 'b'), true);
  assert.equal(canChangeTask(own, 'c'), false);
  assert.equal(canChangeTask(own, 'c', true), true);
  const step = { noteOwnerIds: ['a'], isStep: true };
  assert.equal(canChangeTask(step, 'a'), true);
  assert.equal(canChangeTask(step, 'b'), false);
});

test('soonest first, no date last, done at the bottom', () => {
  const t = (title, due, status = 'TODO') => ({ title, status, dueDate: due && parseDay(due) });
  const order = sortTasks([t('none'), t('finished', '2026-01-01', 'DONE'), t('later', '2026-11-09'), t('soon', '2026-11-02')]).map(x => x.title);
  assert.deepEqual(order, ['soon', 'later', 'none', 'finished']);
});

test('filters and columns', () => {
  const a = { title: 'Call Pat', status: 'TODO', clients: [{ name: 'Acme' }], contacts: [], projects: [], tags: [{ id: 't', name: 'Hot' }] };
  const b = { title: 'Send plan', status: 'DONE', clients: [], contacts: [], projects: [{ name: 'Modera' }], tags: [], fromNote: { title: 'Lunch' } };
  assert.deepEqual(filterTasks([a, b], { q: 'acme' }), [a]);
  assert.deepEqual(filterTasks([a, b], { q: 'MODERA' }), [b]);
  assert.deepEqual(filterTasks([a, b], { tag: 't' }), [a]);
  assert.deepEqual(filterTasks([a, b], { status: 'DONE' }), [b]);
  assert.deepEqual(filterTasks([a, b], { source: 'note' }), [b]);
  assert.deepEqual(filterTasks([a, b], { source: 'mine' }), [a]);
  assert.deepEqual(groupByStatus([a, b]).map(c => c.tasks.length), [1, 0, 0, 1]);
});

const NOW = new Date('2026-11-04T15:00:00.000Z'); // a Wednesday
const task = (over = {}) => ({
  id: 't', title: 'Call Dana', status: 'TODO', dueDate: '2026-11-06T12:00:00.000Z', paused: false,
  people: [{ id: 'u1', name: 'Pat' }], clients: [], projects: [], ...over,
});

test('the note tag has one spelling', () => {
  assert.equal(NOTE_TASK_TAG, 'In-person follow-up');
});

test('the list keeps the desk headings, with Done last and empty headings gone', () => {
  const groups = listGroups([
    task({ id: 'late', dueDate: '2026-11-01T12:00:00.000Z' }),
    task({ id: 'wait', status: 'WAITING' }),
    task({ id: 'done', status: 'DONE' }),
  ], { now: NOW });
  assert.deepEqual(groups.map(g => g.key), ['OVERDUE', 'WAITING', 'DONE']);
});

test('the week ends on Sunday, and Sunday is its own end', () => {
  assert.equal(weekEnd(new Date('2026-11-02T15:00:00.000Z')), '2026-11-08');
  assert.equal(weekEnd(new Date('2026-11-08T15:00:00.000Z')), '2026-11-08');
});

test('the meeting card is this week and late ones, by salesperson, with no one last', () => {
  const rows = tasksDueByPerson([
    task({ id: 'next', dueDate: '2026-11-09T12:00:00.000Z' }),
    task({ id: 'done', status: 'DONE' }),
    task({ id: 'paused', paused: true }),
    task({ id: 'nodate', dueDate: null }),
    task({ id: 'nobody', people: [] }),
    task({ id: 'b', title: 'Later this week', people: [{ id: 'u2', name: 'Sam' }] }),
    task({ id: 'a', title: 'Late', dueDate: '2026-11-02T12:00:00.000Z', fromNote: { id: 'n' } }),
    task({ id: 'c', title: 'Both', people: [{ id: 'u1', name: 'Pat' }, { id: 'u2', name: 'Sam' }] }),
  ], { now: NOW });
  assert.deepEqual(rows.map(r => `${r.salesperson}:${r.taskId}`), ['Pat:a', 'Pat:c', 'Sam:b', 'Sam:c', 'No one yet:nobody']);
  assert.equal(rows[0].overdue, true);
  assert.equal(rows[0].fromNote, true);
  assert.equal(rows[1].overdue, false);
});
