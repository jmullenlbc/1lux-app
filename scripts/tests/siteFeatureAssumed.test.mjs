// Mike 10-14: "Courtyard SF is absurd. We just need # of courtyards." A
// courtyard is a count, 2 pedestrian poles each, never a length. The 0115
// "assumed length" tag stays in the schema (additive) but is never set for
// courtyards any more; rows saved under the old rule read back as a count.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { proposeSiteFeatures } from '../../src/lib/siteFields.js';
import { writeSiteFeature, siteFeaturesForEngine } from '../../src/lib/siteFeatureRows.js';
import { normalizeSiteFeatures } from '../../src/lib/siteFeatureWords.js';
import { planHandoff } from '../../src/lib/intake/handoff.js';

const DASH = /[–—]/;

test('the site read proposes a courtyard count, never a length or an assumed tag', () => {
  const rows = proposeSiteFeatures({ siteFeatures: [{ type: 'courtyard', count: 2 }] }, []);
  const c = rows.find(r => r.type === 'courtyard');
  assert.equal(c.count, 2);
  assert.equal(c.lengthFt ?? null, null);
  assert.ok(!c.lengthAssumed);
  assert.doesNotMatch(c.note || '', /Not measured|60 ft/);
  assert.doesNotMatch(c.note || '', DASH);
  // a length the reader measured off the sheet is ignored
  const m = proposeSiteFeatures({ siteFeatures: [{ type: 'courtyard', count: 1, lengthFt: 90 }] }, []).find(r => r.type === 'courtyard');
  assert.equal(m.count, 1);
  assert.equal(m.lengthFt ?? null, null);
});

test('writeSiteFeature stores the assumed tag on linear kinds only (turf play)', async () => {
  const made = [];
  const client = { siteFeature: { updateMany: async () => ({}), create: async ({ data }) => { made.push(data); return data; } } };
  await writeSiteFeature(client, 'p1', { type: 'turfPlay', lengthFt: 60, source: 'drawing', lengthAssumed: true });
  await writeSiteFeature(client, 'p1', { type: 'courtyard', count: 2, source: 'drawing', lengthAssumed: true });
  await writeSiteFeature(client, 'p1', { type: 'courtyard', count: 1, source: 'typed' });
  assert.deepEqual(made.map(d => d.lengthAssumed), [true, false, false]);
  const eng = siteFeaturesForEngine([{ type: 'turfPlay', count: 1, lengthFt: 60, lengthAssumed: true }, { type: 'dogPark', count: 1 }]);
  assert.equal(eng[0].lengthAssumed, true);
  assert.ok(!('lengthAssumed' in eng[1]));
});

test('a courtyard row saved under the old 60 ft rule reads back as a count', () => {
  const [c] = normalizeSiteFeatures([{ type: 'courtyard', count: 1, lengthFt: 120, lengthAssumed: true }], 2);
  assert.equal(c.count, 2);
  assert.equal(c.lengthFt, null);
  assert.ok(!('lengthAssumed' in c));
});

test('a typed courtyard count hands off as a count; the old feet answer converts', () => {
  const base = { noDrawings: 'yes', projectType: 'Garden (3 Levels)', figureTotalUnits: '200', figureGrossSf: '250000', figureStories: '3', figureSurfaceParking: '300', hasPool: 'no', undercabinet: '120v' };
  const a = planHandoff({ answers: { ...base, figureCourtyards: '2' }, drawings: null });
  const ca = a.features.find(f => f.type === 'courtyard');
  assert.equal(ca.count, 2);
  assert.equal(ca.lengthFt, null);
  assert.ok(!ca.lengthAssumed);
  const b = planHandoff({ answers: { ...base, figureCourtyardFt: '90' }, drawings: null });
  const cb = b.features.find(f => f.type === 'courtyard');
  assert.equal(cb.count, 1);
  assert.equal(cb.lengthFt, null);
});

test('the 0115 migration is additive and the schema still carries the column', () => {
  const sql = readFileSync(new URL('../../prisma/migrations/0115_site_feature_assumed/migration.sql', import.meta.url), 'utf8');
  assert.match(sql, /ADD COLUMN "lengthAssumed" BOOLEAN NOT NULL DEFAULT false/);
  assert.doesNotMatch(sql, /DROP|ALTER COLUMN/);
  assert.match(readFileSync(new URL('../../prisma/schema.prisma', import.meta.url), 'utf8'), /lengthAssumed Boolean @default\(false\)/);
});
