/**
 * Pipeline status vocabulary + the weighted figures (Maram's list, 2026-09-17,
 * confirmed by Mike 2026-09-18).
 *
 * What this pins:
 *   1. "On Hold" is in the picker; "Completed" is not, but a row that already
 *      says COMPLETED still reads as "Completed" and still counts as won.
 *   2. On Hold is neither open nor decided, it never lands in the win-rate
 *      denominator.
 *   3. A Peer Review with a design fee sits on the Design board; one without
 *      a fee does not. Full Design / Design Assist always do.
 *   4. Weighted Revenue, the weighted 90-day forecast, Buyout Duration and the
 *      second win rate all come from the one definition in pipeline.js.
 *      Buyout Duration (Mike 9-19) = days from the job ENTERING Buyout to the
 *      day it entered CA / Procurement, read from the deal_stage history rows,
 *      never from the two expected dates.
 *   5. The calendar gate drops declined / unanswered / tentative invites and
 *      keeps accepted ones, the owner's own events, and events with no
 *      response field at all.
 *
 * Run: node --test scripts/tests/pipelineStatus.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PIPELINE_STATUS, LEGACY_STATUS, STATUS_LABEL, SETTABLE_STATUS_KEYS, ALL_STATUS_KEYS,
  ON_HOLD_STATUSES, isOnHold, WON_STATUSES, DECIDED_STATUSES,
  winRate, winRateAllProjects, inDesignPipeline, FEE_OPTIONAL_DESIGN_TYPES,
  averageProbability, weightedRevenue, isWithinDays, weightedForecast, buyoutDays, stageEventsFromActivities,
  BUYOUT_STAGE, BUYOUT_END_STAGE,
  WEIGHTED_PROBABILITY_LABEL, WEIGHTED_REVENUE_LABEL, FORECAST_WINDOW_DAYS,
  WIN_RATE_DESCRIPTION, WIN_RATE_ALL_DESCRIPTION,
} from '../../src/lib/pipeline.js';
import { isWorthANote, notAcceptedReason } from '../../src/lib/calendar/worthANote.js';
import { fromGraphEvent } from '../../src/lib/calendar/normalize.js';
import { MEETING_CARDS, MEETING_LEVELS, cardLevel } from '../../src/lib/meeting/cards.js';

// ── 1. The picker ─────────────────────────────────────────────────────────────
test('the picker offers Open, On Hold, Won, Lost, Abandoned, and not Completed', () => {
  assert.deepEqual(PIPELINE_STATUS.map(s => s.key), ['OPEN', 'ON_HOLD', 'WON', 'LOST', 'ABANDONED']);
  assert.deepEqual(SETTABLE_STATUS_KEYS, ['OPEN', 'ON_HOLD', 'WON', 'LOST', 'ABANDONED']);
  assert.ok(!SETTABLE_STATUS_KEYS.includes('COMPLETED'));
  assert.equal(STATUS_LABEL.ON_HOLD, 'On Hold');
});

test('Completed is legacy: still labelled, still readable, still won', () => {
  assert.deepEqual(LEGACY_STATUS.map(s => s.key), ['COMPLETED']);
  assert.equal(STATUS_LABEL.COMPLETED, 'Completed');
  assert.ok(ALL_STATUS_KEYS.includes('COMPLETED'));
  assert.ok(WON_STATUSES.includes('COMPLETED'));
});

// ── 2. On Hold is neither open nor decided ────────────────────────────────────
test('On Hold stays out of the win-rate denominator', () => {
  assert.deepEqual(ON_HOLD_STATUSES, ['ON_HOLD']);
  assert.ok(isOnHold('ON_HOLD'));
  assert.ok(!isOnHold('OPEN'));
  assert.ok(!DECIDED_STATUSES.includes('ON_HOLD'));
  const rows = [
    { procurementStatus: 'WON' },
    { procurementStatus: 'LOST' },
    { procurementStatus: 'ON_HOLD' },
    { procurementStatus: 'ON_HOLD' },
    { procurementStatus: 'OPEN' },
  ];
  assert.equal(winRate(rows), 50);              // 1 won ÷ (won + lost)
  assert.equal(winRateAllProjects(rows), 20);   // 1 won ÷ 5 on the board
  assert.equal(winRateAllProjects([]), null);
  assert.match(WIN_RATE_DESCRIPTION, /On Hold are left out/);
  assert.match(WIN_RATE_ALL_DESCRIPTION, /including the ones still open or on hold/);
});

// ── 3. Peer Review with a design fee ──────────────────────────────────────────
test('a Peer Review joins the Design board only when it carries a design fee', () => {
  assert.deepEqual(FEE_OPTIONAL_DESIGN_TYPES, ['peerReview']);
  assert.ok(inDesignPipeline({ serviceType: 'peerReview', designContractValue: 12000 }));
  assert.ok(!inDesignPipeline({ serviceType: 'peerReview', designContractValue: 0 }));
  assert.ok(!inDesignPipeline({ serviceType: 'peerReview', designContractValue: null }));
  assert.ok(inDesignPipeline({ serviceType: 'fullDesign' }));
  assert.ok(inDesignPipeline({ serviceType: 'designAssist', designContractValue: 0 }));
  assert.ok(!inDesignPipeline({ serviceType: 'bid', designContractValue: 9999 }));
  // A bare string still works for the two always-design types, never for peer review.
  assert.ok(inDesignPipeline('fullDesign'));
  assert.ok(!inDesignPipeline('peerReview'));
});

// ── 4. The weighted figures ───────────────────────────────────────────────────
test('labels are the words Maram asked for', () => {
  assert.equal(WEIGHTED_PROBABILITY_LABEL, 'Weighted Probability %');
  assert.equal(WEIGHTED_REVENUE_LABEL, 'Weighted Revenue');
  assert.equal(FORECAST_WINDOW_DAYS, 90);
});

test('weighted revenue = board revenue × Weighted Probability %', () => {
  const p = { contractValue: 100000, designContractValue: 20000, probabilityToWin: 80, probabilityToMoveForward: 40 };
  assert.equal(averageProbability(p), 60);
  assert.equal(weightedRevenue(p, 'PROCUREMENT'), 60000);
  assert.equal(weightedRevenue(p, 'DESIGN'), 12000);
  assert.equal(weightedRevenue({ contractValue: 5000 }, 'PROCUREMENT'), 0);       // no probability → 0
  assert.equal(weightedRevenue({ probabilityToWin: 50 }, 'PROCUREMENT'), 0);      // no revenue → 0
});

test('the 90-day forecast is weighted and only counts OPEN orders landing in the window', () => {
  const now = new Date('2026-09-18T12:00:00');
  assert.ok(isWithinDays('2026-09-18', 90, now));
  assert.ok(isWithinDays('2026-12-17', 90, now));
  assert.ok(!isWithinDays('2026-12-18', 90, now));
  assert.ok(!isWithinDays('2026-09-17', 90, now));
  assert.ok(!isWithinDays(null, 90, now));
  const rows = [
    { procurementStatus: 'OPEN',    contractValue: 100000, probabilityToWin: 50, expectedOrderDate: '2026-10-01' }, // 50,000
    { procurementStatus: 'OPEN',    contractValue: 100000, probabilityToWin: 50, expectedOrderDate: '2027-03-01' }, // outside
    { procurementStatus: 'ON_HOLD', contractValue: 100000, probabilityToWin: 50, expectedOrderDate: '2026-10-01' }, // not open
    { procurementStatus: 'WON',     contractValue: 100000, probabilityToWin: 50, expectedOrderDate: '2026-10-01' }, // not open
    { procurementStatus: 'OPEN',    contractValue: 40000,  probabilityToWin: 25, expectedOrderDate: '2026-11-15' }, // 10,000
  ];
  assert.equal(weightedForecast(rows, 'PROCUREMENT', 90, now), 60000);
});

test('buyout duration = days from entering Buyout to entering CA / Procurement, from the stage history', () => {
  assert.equal(BUYOUT_STAGE, 'BUYOUT');
  assert.equal(BUYOUT_END_STAGE, 'CONSTRUCTION');
  // History rows exactly as the API stores them: metadata is a JSON string.
  const row = (toStage, at, pipeline = 'PROCUREMENT', type = 'deal_stage') =>
    ({ type, metadata: JSON.stringify({ pipeline, fromStage: null, toStage }), createdAt: at });
  const history = [
    row('CONSTRUCTION', '2026-10-01T15:00:00Z'),        // out of order on purpose
    row('QUALIFIED',    '2026-08-01T15:00:00Z'),
    row('BUYOUT',       '2026-09-01T15:00:00Z'),
    { type: 'note_added', metadata: null, createdAt: '2026-09-02T15:00:00Z' },   // ignored
  ];
  assert.deepEqual(stageEventsFromActivities(history).map(e => e.toStage), ['QUALIFIED', 'BUYOUT', 'CONSTRUCTION']);
  assert.equal(buyoutDays({ activities: history }), 30);
  assert.equal(buyoutDays(null, history), 30);
  // The two expected dates play no part any more.
  assert.equal(buyoutDays({ expectedContractExecutionDate: '2026-09-01', expectedOrderDate: '2026-10-01' }), null);
  // Still sitting in Buyout → no duration yet.
  assert.equal(buyoutDays(null, [row('BUYOUT', '2026-09-01T15:00:00Z')]), null);
  // Went to CA / Procurement WITHOUT ever entering Buyout → nothing to measure.
  assert.equal(buyoutDays(null, [row('CONSTRUCTION', '2026-09-01T15:00:00Z')]), null);
  // Same day → 0. A later second trip through Buyout does not change the first answer.
  assert.equal(buyoutDays(null, [row('BUYOUT', '2026-09-01T09:00:00Z'), row('CONSTRUCTION', '2026-09-01T17:00:00Z'), row('BUYOUT', '2026-11-01T09:00:00Z')]), 0);
  // A move back to Buyout AFTER CA / Procurement, then forward again: measured from the FIRST entry.
  assert.equal(buyoutDays(null, [row('CONSTRUCTION', '2026-08-01T15:00:00Z'), row('BUYOUT', '2026-09-01T15:00:00Z'), row('CONSTRUCTION', '2026-09-11T15:00:00Z')]), 10);
  // Procurement board wins; a design-only job falls back to the Design board, legacy keys included.
  assert.equal(buyoutDays(null, [row('BUYOUT', '2026-09-01T15:00:00Z', 'DESIGN'), row('CONSTRUCTION_ADMIN', '2026-09-21T15:00:00Z', 'DESIGN')]), 20);
  assert.equal(buyoutDays(null, [
    row('BUYOUT', '2026-09-01T15:00:00Z', 'DESIGN'), row('CONSTRUCTION', '2026-09-21T15:00:00Z', 'DESIGN'),
    row('BUYOUT', '2026-09-05T15:00:00Z'),           row('CONSTRUCTION', '2026-09-10T15:00:00Z'),
  ]), 5);
  assert.equal(buyoutDays({}), null);
  assert.equal(buyoutDays(null), null);
});

// ── 5. Accepted invites only ──────────────────────────────────────────────────
test('the Graph reader keeps the response status, lower-cased', () => {
  const base = { id: 'e1', subject: 'Lunch with Dana', start: { dateTime: '2026-09-20T12:00:00', timeZone: 'UTC' }, end: { dateTime: '2026-09-20T13:00:00', timeZone: 'UTC' } };
  assert.equal(fromGraphEvent({ ...base, responseStatus: { response: 'tentativelyAccepted' } }, 'mike@ilcstudios.com').responseStatus, 'tentativelyaccepted');
  assert.equal(fromGraphEvent({ ...base, responseStatus: { response: 'accepted' } }, 'mike@ilcstudios.com').responseStatus, 'accepted');
  assert.equal(fromGraphEvent(base, 'mike@ilcstudios.com').responseStatus, null);
});

test('declined, unanswered and tentative invites never become notes; accepted and own events do', () => {
  const ev = r => ({ title: 'Golf with the Trailhead team', location: 'Catalina', attendeeEmails: ['a@developer.com'], attendeeCount: 2, responseStatus: r });
  assert.equal(isWorthANote(ev('declined')).bucket, 'not accepted');
  assert.equal(isWorthANote(ev('notResponded')).bucket, 'not accepted');
  assert.equal(isWorthANote(ev('tentativelyAccepted')).bucket, 'not accepted');
  assert.ok(isWorthANote(ev('accepted')).keep);
  assert.ok(isWorthANote(ev('organizer')).keep);
  assert.ok(isWorthANote(ev('none')).keep);
  assert.ok(isWorthANote(ev(undefined)).keep);
  assert.equal(notAcceptedReason({ responseStatus: 'declined' }), 'the invite was declined');
  assert.equal(notAcceptedReason({}), null);
});

// ── 6. Meeting screen tabs ────────────────────────────────────────────────────
test('every meeting card belongs to exactly one tab', () => {
  assert.deepEqual(MEETING_LEVELS.map(l => l.key), ['project', 'people']);
  for (const c of MEETING_CARDS) assert.ok(['project', 'people'].includes(c.level), `${c.key} has no level`);
  assert.equal(cardLevel('wentQuiet'), 'people');
  assert.equal(cardLevel('newLeads'), 'people');
  assert.equal(cardLevel('whosOut'), 'people');
  assert.equal(cardLevel('awaitingSignature'), 'project');
  assert.equal(cardLevel('closingSoon'), 'project');
});
