// Mike 2026-10-02: a courtyard nobody measured is priced at 60 ft each (2
// poles). The row says "assumed" (0115) so the team confirms it and the tool
// never learns from a standard length as if it were measured.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { proposeSiteFeatures } from '../../src/lib/siteFields.js';
import { writeSiteFeature, siteFeaturesForEngine } from '../../src/lib/siteFeatureRows.js';
import { planHandoff } from '../../src/lib/intake/handoff.js';

const DASH = /[–—]/;

test('the site read tags an unmeasured courtyard as assumed, with an honest note', () => {
  const rows = proposeSiteFeatures({ siteFeatures: [{ type: 'courtyard', count: 2 }] }, []);
  const c = rows.find(r => r.type === 'courtyard');
  assert.equal(c.lengthFt, 120);
  assert.equal(c.lengthAssumed, true);
  assert.match(c.note, /Not measured/);
  assert.doesNotMatch(c.note, /measured off the sheet/);
  assert.doesNotMatch(c.note, DASH);
  const m = proposeSiteFeatures({ siteFeatures: [{ type: 'courtyard', count: 1, lengthFt: 90 }] }, []).find(r => r.type === 'courtyard');
  assert.equal(m.lengthAssumed, false);
});

test('writeSiteFeature stores the tag on linear kinds only', async () => {
  const made = [];
  const client = { siteFeature: { updateMany: async () => ({}), create: async ({ data }) => { made.push(data); return data; } } };
  await writeSiteFeature(client, 'p1', { type: 'courtyard', lengthFt: 60, source: 'drawing', lengthAssumed: true });
  await writeSiteFeature(client, 'p1', { type: 'dogPark', count: 1, source: 'drawing', lengthAssumed: true });
  await writeSiteFeature(client, 'p1', { type: 'courtyard', lengthFt: 75, source: 'typed' });
  assert.deepEqual(made.map(d => d.lengthAssumed), [true, false, false]);
  const eng = siteFeaturesForEngine([{ type: 'courtyard', count: 1, lengthFt: 60, lengthAssumed: true }, { type: 'dogPark', count: 1 }]);
  assert.equal(eng[0].lengthAssumed, true);
  assert.ok(!('lengthAssumed' in eng[1]));
});

test('a typed courtyard count hands off as assumed; a typed length does not', () => {
  const base = { noDrawings: 'yes', projectType: 'Garden (3 Levels)', figureTotalUnits: '200', figureGrossSf: '250000', figureStories: '3', figureSurfaceParking: '300', figureExteriorAmenitySf: '5000', undercabinet: '120v' };
  const a = planHandoff({ answers: { ...base, figureCourtyards: '2' }, drawings: null });
  const ca = a.features.find(f => f.type === 'courtyard');
  assert.equal(ca.lengthFt, 120);
  assert.equal(ca.lengthAssumed, true);
  const b = planHandoff({ answers: { ...base, figureCourtyardFt: '90' }, drawings: null });
  assert.ok(!b.features.find(f => f.type === 'courtyard').lengthAssumed);
});

test('the migration is additive and the schema carries the column', () => {
  const sql = readFileSync(new URL('../../prisma/migrations/0115_site_feature_assumed/migration.sql', import.meta.url), 'utf8');
  assert.match(sql, /ADD COLUMN "lengthAssumed" BOOLEAN NOT NULL DEFAULT false/);
  assert.doesNotMatch(sql, /DROP|ALTER COLUMN/);
  assert.match(readFileSync(new URL('../../prisma/schema.prisma', import.meta.url), 'utf8'), /lengthAssumed Boolean @default\(false\)/);
});
