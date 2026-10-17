// Unfinished public budgets (migration 0087), the pure pack/unpack layer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { packDraft, unpackDraft, diffFields, draftStage, reachedLabel, MAX_DRAWINGS_CHARS } from '../../src/lib/intake/drafts.js';

const good = {
  firstName: ' Pat ', lastName: 'Example', email: 'Pat@Builder-Co.com', company: 'Builder Co',
  project: 'Lone Tree Test', projCity: 'Denver', projState: 'co', projZip: '80202',
  haveDrawings: 'no', stepId: 'units', completedSteps: ['about', 'drawings', 'bogus'],
  hasClubhouse: 'yes',
  figures: { figureTotalUnits: '1,68', figureGrossSf: 'lots', figureSurfaceParking: '0', notAFigure: '12' },
  corrections: { totalUnits: '168', 'bad key!': '5', grossSf: 'abc' },
  answers: { undercabinet: '120v', islandPendants: 'not an option', madeUp: 'x' },
  drawings: null,
};

test('packDraft needs a name, email and project', () => {
  assert.equal(packDraft({}).ok, false);
  assert.equal(packDraft({ ...good, project: '   ' }).ok, false);
  assert.equal(packDraft(good).ok, true);
});

test('packDraft clamps every value and keeps only known keys', () => {
  const p = packDraft(good);
  assert.equal(p.row.firstName, 'Pat');
  assert.equal(p.row.email, 'pat@builder-co.com');
  assert.equal(p.row.emailDomain, 'builder-co.com');
  assert.equal(p.row.state, 'CO');
  assert.equal(p.row.stepId, 'units');
  assert.equal(p.row.completedSteps, 'about,drawings');
  assert.equal(p.row.hasClubhouse, 'yes');
  const byId = Object.fromEntries(p.fields.map(f => [`${f.kind}:${f.key}`, f.value]));
  assert.equal(byId['figure:figureTotalUnits'], '168');   // comma stripped
  assert.equal(byId['figure:figureSurfaceParking'], '0'); // 0 is a real answer
  assert.equal(byId['figure:figureGrossSf'], undefined);   // not digits
  assert.equal(byId['figure:notAFigure'], undefined);      // not a figure key
  assert.equal(byId['correction:totalUnits'], '168');
  assert.equal(byId['correction:grossSf'], undefined);
  assert.equal(byId['correction:bad key!'], undefined);
  assert.equal(byId['answer:undercabinet'], '120v');
  assert.equal(byId['answer:islandPendants'], undefined);  // not one of the options
  assert.equal(byId['answer:madeUp'], undefined);
});

test('packDraft keeps the drawing read only with "yes" drawings, and drops an oversized one', () => {
  const drawings = { sources: [{ fileName: 'A.pdf' }], projectTotals: { totalUnits: 168 } };
  const no = packDraft({ ...good, haveDrawings: 'no', drawings });
  assert.equal(no.drawingsJson, null);
  const yes = packDraft({ ...good, haveDrawings: 'yes', drawings });
  assert.equal(JSON.parse(yes.drawingsJson).projectTotals.totalUnits, 168);
  const huge = packDraft({ ...good, haveDrawings: 'yes', drawings: { pad: 'x'.repeat(MAX_DRAWINGS_CHARS) } });
  assert.equal(huge.drawingsJson, null);
  assert.equal(huge.drawingsDropped, true);
});

test('unpackDraft round-trips to the wizard shape', () => {
  const p = packDraft({ ...good, haveDrawings: 'yes', drawings: { sources: [] } });
  const row = { ...p.row, drawingsJson: p.drawingsJson, lastSavedAt: new Date('2026-09-15T20:00:00Z') };
  const d = unpackDraft(row, p.fields);
  assert.equal(d.v, 1);
  assert.equal(d.project, 'Lone Tree Test');
  assert.equal(d.projState, 'CO');
  assert.deepEqual(d.completedSteps, ['about', 'drawings']);
  assert.equal(d.figures.figureTotalUnits, '168');
  assert.equal(d.corrections.totalUnits, '168');
  assert.equal(d.answers.undercabinet, '120v');
  assert.deepEqual(d.drawings, { sources: [] });
  assert.equal(d.savedAt, '2026-09-15T20:00:00.000Z');
  assert.equal(d.hasClubhouse, 'yes');
  // A blanked field row reads as unset.
  const d2 = unpackDraft(row, [...p.fields, { kind: 'figure', key: 'figureStories', value: '' }]);
  assert.equal(d2.figures.figureStories, undefined);
});

test('unpackDraft never carries a price and survives bad JSON', () => {
  const d = unpackDraft({ drawingsJson: '{not json', stepId: 'nope' }, null);
  assert.equal(d.drawings, null);
  assert.equal(d.stepId, 'about');
  assert.equal('estimate' in d, false);
  assert.equal('budget' in d, false);
});

test('diffFields sets what arrived and blanks what stopped arriving, never deletes', () => {
  const existing = [
    { kind: 'figure', key: 'figureTotalUnits', value: '100' },
    { kind: 'answer', key: 'undercabinet', value: '120v' },
    { kind: 'answer', key: 'gone', value: '' },
  ];
  const incoming = [{ kind: 'figure', key: 'figureTotalUnits', value: '168' }];
  const writes = diffFields(existing, incoming);
  assert.deepEqual(writes, [
    { kind: 'figure', key: 'figureTotalUnits', value: '168' },
    { kind: 'answer', key: 'undercabinet', value: '' },
  ]);
});

test('draftStage: working for a day, abandoned after', () => {
  const now = Date.parse('2026-09-16T12:00:00Z');
  assert.equal(draftStage('2026-09-16T11:00:00Z', now), 'working');
  assert.equal(draftStage('2026-09-15T11:59:00Z', now), 'abandoned');
  assert.equal(draftStage('garbage', now), 'abandoned');
});

test('reachedLabel reports the furthest step', () => {
  assert.equal(reachedLabel({ stepId: 'units', completedSteps: 'about,drawings' }), 'Residential units');
  assert.equal(reachedLabel({ stepId: 'about', completedSteps: 'about,drawings,units,corridors' }), 'Corridors');
  assert.equal(reachedLabel({}), 'About you');
});
