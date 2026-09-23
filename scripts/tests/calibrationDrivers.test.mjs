/**
 * Phase 3 driver analysis — the guard rails, not the arithmetic.
 *
 * What these pin down is the thing that would actually hurt: saying something
 * confident off three jobs, dropping a job, or telling somebody to change a
 * rate on a driver that wobbles worse than the one they already use.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DRIVERS, MIN_DRIVER_PROJECTS, MIN_FIT, SPREAD_IMPROVEMENT,
  correlation, spreadOf, projectDrivers, driverFit,
  driverAnalysis, betterDriverSuggestions, driverFindings, describeSpread,
} from '../../src/lib/calibration/drivers.js';

/** Build one project's samples: a driver row per driver, plus the line under test. */
function project(id, { units, grossSf, netLotSf, pathwayActual }) {
  const rows = [];
  if (units != null)    rows.push({ projectId: id, lineKey: 'exterior.pathway',   quantity: units,    actualAmount: pathwayActual ?? null, modelAmount: 1000 });
  if (grossSf != null)  rows.push({ projectId: id, lineKey: 'total',              quantity: grossSf,  actualAmount: null, modelAmount: 1000 });
  if (netLotSf != null) rows.push({ projectId: id, lineKey: 'exterior.landscape', quantity: netLotSf, actualAmount: null, modelAmount: 1000 });
  return rows;
}

test('nothing is reported until there are enough jobs behind it', () => {
  // Four jobs, perfectly behaved. Still silent, because four is not enough.
  const samples = [1, 2, 3, 4].flatMap(i =>
    project(`p${i}`, { units: i * 100, netLotSf: i * 5000, pathwayActual: i * 5000 * 2 }));

  assert.equal(driverAnalysis(samples).length, 0);
  assert.equal(driverFindings(samples).suggestions.length, 0);
  assert.ok(MIN_DRIVER_PROJECTS >= 5, 'the floor should never be loosened below five');
});

test('a line priced off the wrong thing gets found, and the right thing gets named', () => {
  // Pathway dollars follow the LOT, exactly $2/SF. The unit count is noise
  // that happens to move in the same general direction — which is precisely
  // the trap a plain correlation would fall into.
  const lots   = [40000, 55000, 62000, 31000, 90000, 47000];
  const units  = [210,   180,   340,   150,   260,   400];
  const samples = lots.flatMap((lot, i) =>
    project(`p${i}`, { units: units[i], netLotSf: lot, pathwayActual: lot * 2 }));

  const found = driverFindings(samples);
  const hit   = found.suggestions.find(s => s.lineKey === 'exterior.pathway');

  assert.ok(hit, 'the pathway line should be flagged');
  assert.equal(hit.to.driver, 'Net lot SF');
  assert.equal(hit.from.unit, 'units', 'it should say what the line is priced off today');
  assert.equal(hit.to.rate, 2, 'the implied rate should be the real one');
  assert.equal(hit.to.spread, 0, 'a perfect driver has no wobble at all');
  assert.ok(found.sentences[0].includes('Net lot SF'.toLowerCase()) || found.sentences[0].includes('net lot sf'),
    'the plain-English sentence should name the driver');
});

test('a line already priced off the right thing stays quiet', () => {
  // Pathway dollars follow the unit count, which is what the engine uses.
  const units = [210, 180, 340, 150, 260, 400];
  const samples = units.flatMap((u, i) =>
    project(`p${i}`, { units: u, netLotSf: 40000 + i * 3000, pathwayActual: u * 300 }));

  assert.deepEqual(betterDriverSuggestions(driverAnalysis(samples)), []);
});

test('a job is counted once no matter how many samples it has on a line', () => {
  const base = [1, 2, 3, 4, 5].flatMap(i =>
    project(`p${i}`, { units: i * 100, netLotSf: i * 5000, pathwayActual: i * 5000 * 2 }));
  // Same job, a second actual on the same line — a re-captured figure.
  const dupes = base.concat([
    { projectId: 'p1', lineKey: 'exterior.pathway', quantity: 100, actualAmount: 10000, modelAmount: 1000 },
  ]);

  const drivers = projectDrivers(dupes);
  const rows    = dupes.filter(r => r.lineKey === 'exterior.pathway' && r.actualAmount);
  const fit     = driverFit(rows, drivers, 'netLotSf');
  assert.equal(fit.projects, 5, 'five jobs, not six samples');
});

test('a missing figure is absent, never a zero', () => {
  // This job has no lot figure recorded. "No lot" and "we never measured it"
  // price completely differently, so it must not become a zero.
  const samples = [
    ...project('p1', { units: 100, netLotSf: 20000 }),
    ...project('p2', { units: 200 }),
  ];
  const drivers = projectDrivers(samples);
  assert.equal(drivers.get('p1').netLotSf, 20000);
  assert.equal('netLotSf' in drivers.get('p2'), false);
});

test('correlation refuses to answer when there is nothing to correlate', () => {
  assert.equal(correlation([[1, 2], [2, 4]]), null, 'two points is not a trend');
  assert.equal(correlation([[5, 1], [5, 9], [5, 3]]), null, 'one repeated value has no direction');
  assert.equal(correlation([[1, 1], [2, 2], [3, 3]]), 1);
});

test('spread is measured off the middle, so one strange job cannot decide anything', () => {
  assert.equal(spreadOf([10, 10, 10, 10]), 0);
  const steady = spreadOf([10, 10, 10, 10, 10, 90]);
  assert.ok(steady < 0.2, `one wild job should barely move it, got ${steady}`);
  assert.equal(spreadOf([10]), null, 'one job is not a spread');
});

test('every driver reads from a real budget line, and the words are plain', () => {
  const seen = new Set();
  for (const d of DRIVERS) {
    assert.ok(d.key && d.label && d.unit && d.from, `driver ${d.key} is missing a field`);
    assert.equal(seen.has(d.from), false, `two drivers both read ${d.from}`);
    seen.add(d.from);
  }
  assert.equal(describeSpread(null), 'not enough jobs to say');
  assert.equal(describeSpread(0.05), 'very steady');
  assert.equal(describeSpread(0.9), 'all over the place');
  assert.ok(MIN_FIT >= 0.7 && SPREAD_IMPROVEMENT >= 0.25, 'the bars should never be lowered quietly');
});

test('empty input is an empty answer, not a crash', () => {
  for (const input of [null, undefined, [], [{}]]) {
    const found = driverFindings(input);
    assert.deepEqual(found.suggestions, []);
    assert.deepEqual(found.sentences, []);
  }
});

// ── What the dashboard card actually receives ────────────────────────────────

test('both driver cards hand the screen a table it can render', async () => {
  const { runCalibrationWidget } = await import('../../src/lib/calibration/report.js');

  const lots  = [40000, 55000, 62000, 31000, 90000, 47000];
  const units = [210,   180,   340,   150,   260,   400];
  const samples = lots.flatMap((lot, i) =>
    project(`p${i}`, { units: units[i], netLotSf: lot, pathwayActual: lot * 2 }));

  for (const report of ['driverFit', 'driverSuggestions']) {
    const out = runCalibrationWidget({ kind: 'calibration', report }, samples);
    assert.equal(out.chartType, 'TABLE');
    assert.equal(out.table.kind, 'plain', 'the generic renderer is picked by kind, not by guessing');
    assert.ok(out.table.rows.length, `${report} produced no rows`);
    // Every column has to exist on every row, or the screen shows blanks.
    for (const row of out.table.rows) {
      for (const c of out.table.columns) {
        assert.ok(c.key in row, `${report} row is missing ${c.key}`);
      }
    }
  }
});

test('an empty card says whether nothing is wrong or nothing is known', async () => {
  const { runCalibrationWidget } = await import('../../src/lib/calibration/report.js');

  // Nothing to go on at all.
  const blank = runCalibrationWidget({ kind: 'calibration', report: 'driverSuggestions' }, []);
  assert.match(blank.table.empty, /Not enough jobs/);

  // Six jobs, all already priced off the right thing — a genuinely clean bill.
  const units = [210, 180, 340, 150, 260, 400];
  const clean = units.flatMap((u, i) =>
    project(`p${i}`, { units: u, netLotSf: 40000 + i * 3000, pathwayActual: u * 300 }));
  const out = runCalibrationWidget({ kind: 'calibration', report: 'driverSuggestions' }, clean);
  assert.equal(out.table.rows.length, 0);
  assert.match(out.table.empty, /Nothing to report/);
});
