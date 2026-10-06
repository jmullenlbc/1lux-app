/**
 * Proposals list filters (Mike 10-5): Won / Lost wording, and the time window
 * measured from sentAt with createdAt as the fallback.
 *
 * Run: node --test scripts/tests/proposalsFilters.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STATUS_LABELS, TIME_WINDOWS, DEFAULT_TIME_WINDOW,
  withinWindow, proposalDate, distinctClients, proposalClientName,
} from '../../src/lib/proposals/listFilters.js';

const now = new Date('2026-10-05T12:00:00Z');
const daysAgo = n => new Date(now.getTime() - n * 86_400_000).toISOString();

test('accepted reads Won and declined reads Lost; keys unchanged', () => {
  assert.equal(STATUS_LABELS.ACCEPTED, 'Won');
  assert.equal(STATUS_LABELS.DECLINED, 'Lost');
  assert.equal(STATUS_LABELS.DRAFT, 'Draft');
  assert.equal(STATUS_LABELS.SENT, 'Sent');
});

test('the default window is 60 days and the picker has the five choices', () => {
  assert.equal(DEFAULT_TIME_WINDOW, '60');
  assert.deepEqual(TIME_WINDOWS.map(w => w.label),
    ['Last 30 days', 'Last 60 days', 'Last 90 days', 'This year', 'All time']);
});

test('withinWindow measures from sentAt', () => {
  assert.equal(withinWindow({ sentAt: daysAgo(10), createdAt: daysAgo(400) }, 60, now), true);
  assert.equal(withinWindow({ sentAt: daysAgo(70), createdAt: daysAgo(5) }, 60, now), false);
});

test('withinWindow falls back to createdAt when sentAt is null', () => {
  assert.equal(withinWindow({ sentAt: null, createdAt: daysAgo(20) }, 30, now), true);
  assert.equal(withinWindow({ sentAt: null, createdAt: daysAgo(40) }, 30, now), false);
  assert.equal(proposalDate({ sentAt: null, createdAt: daysAgo(1) }), new Date(daysAgo(1)).getTime());
});

test('all time keeps everything, even rows with no date', () => {
  assert.equal(withinWindow({ sentAt: null, createdAt: null }, null, now), true);
  assert.equal(withinWindow({ sentAt: null, createdAt: null }, 60, now), false);
});

test('this year starts on January 1', () => {
  assert.equal(withinWindow({ createdAt: '2026-01-02T00:00:00Z' }, 'year', now), true);
  assert.equal(withinWindow({ createdAt: '2025-12-30T00:00:00Z' }, 'year', now), false);
});

test('the client picker lists distinct names, project client first', () => {
  const rows = [
    { project: { client: { name: 'Greystar' } }, clientName: 'Old name' },
    { clientName: 'Alliance' },
    { clientName: 'Greystar' },
    { clientName: '' },
  ];
  assert.equal(proposalClientName(rows[0]), 'Greystar');
  assert.deepEqual(distinctClients(rows), ['Alliance', 'Greystar']);
});
