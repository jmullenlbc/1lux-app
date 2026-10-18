// Building type tags (Mike 10-17): hotel, condo, rental apartments, senior
// living, student housing, build to rent, townhomes, by rules. Pure.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildingTypes, signalBuildingTypes, tagsFromExtraction, BUILDING_TYPE_OPTIONS, TAG_KINDS } from '../../src/lib/market-intel/tagRules.js';

const bt = (text, opts) => buildingTypes(text, opts).sort();

test('BUILDING is a tag kind and every label is a filter option', () => {
  assert.ok(TAG_KINDS.includes('BUILDING'));
  for (const l of ['Hotel', 'Condo', 'Rental apartments', 'Senior living', 'Student housing', 'Build to rent', 'Townhomes', 'Other']) assert.ok(BUILDING_TYPE_OPTIONS.includes(l), l);
});

test('hotels are tagged on their own', () => {
  assert.deepEqual(bt('New 5 story Hampton Inn & Suites, 120 keys', { units: 120 }), ['Hotel']);
  assert.deepEqual(bt('Courtyard by Marriott'), ['Hotel']);
  assert.deepEqual(bt('NEW HOTEL'), ['Hotel']);
});

test('condos apart from apartments; condo hotel carries both', () => {
  assert.deepEqual(bt('Residential condominium tower, 200 units', { units: 200 }), ['Condo']);
  assert.deepEqual(bt('Condo hotel with 80 keys'), ['Condo', 'Hotel']);
  assert.deepEqual(bt('Apartments and condos'), ['Condo', 'Rental apartments']);
});

test('multifamily splits into rental apartments, senior, student', () => {
  assert.deepEqual(bt('New 300 unit apartment community', { units: 300 }), ['Rental apartments']);
  assert.deepEqual(bt('MULTI-FAMILY R-2'), ['Rental apartments']);
  assert.deepEqual(bt('Senior living community, assisted living and memory care'), ['Senior living']);
  assert.deepEqual(bt('Purpose-built student housing, 800 beds'), ['Student housing']);
  assert.deepEqual(bt('Senior apartments', { units: 120 }), ['Senior living']);
  // Not senior housing: a job title in an article.
  assert.deepEqual(bt('Named senior vice president of development'), ['Other']);
});

test('build to rent and single family for rent', () => {
  assert.deepEqual(bt('Build-to-rent community of 180 homes', { units: 180 }), ['Build to rent']);
  assert.deepEqual(bt('Single family for rent subdivision'), ['Build to rent']);
  assert.deepEqual(bt('BTR townhomes'), ['Build to rent', 'Townhomes']);
});

test('units alone read as apartments, but not on a hotel; nothing gives Other', () => {
  assert.deepEqual(bt('New construction', { units: 40 }), ['Rental apartments']);
  assert.deepEqual(bt('Office building'), ['Other']);
  assert.deepEqual(bt('', {}), ['Other']);
});

test('article project type counts', () => {
  assert.deepEqual(bt('Developer breaks ground', { projectType: 'STUDENT_HOUSING' }), ['Student housing']);
  assert.deepEqual(bt('Developer breaks ground', { projectType: 'AFFORDABLE' }), ['Rental apartments']);
  assert.deepEqual(bt('Developer breaks ground', { projectType: 'HOSPITALITY' }), ['Hotel']);
});

test('saved row reads class, title, summary, project names; tags come out as BUILDING', () => {
  assert.deepEqual(signalBuildingTypes({ permitClass: 'Commercial', title: 'New building', unitCount: null }, ['The Grove Senior Residences']), ['Senior living']);
  const tags = tagsFromExtraction({ buildingTypes: ['Condo', 'Hotel'] });
  assert.deepEqual(tags.map(t => [t.kind, t.name]), [['BUILDING', 'Condo'], ['BUILDING', 'Hotel']]);
});

import { buildingTags, affordability, AFFORDABILITY_OPTIONS } from '../../src/lib/market-intel/tagRules.js';

test('Affordable or Market rate rides on housing only', () => {
  assert.ok(TAG_KINDS.includes('AFFORDABILITY'));
  assert.deepEqual(AFFORDABILITY_OPTIONS, ['Affordable', 'Market rate']);
  assert.deepEqual(buildingTags('LIHTC apartments, 60% AMI', { units: 200 }).affordability, ['Affordable']);
  assert.deepEqual(buildingTags('Workforce housing senior living community').affordability, ['Affordable']);
  assert.deepEqual(buildingTags('Dallas Public Facility Corporation deal, 350 units', { units: 350 }).affordability, ['Affordable']);
  assert.deepEqual(buildingTags('Luxury apartment tower', { units: 300 }).affordability, ['Market rate']);
  assert.deepEqual(buildingTags('Build-to-rent community').affordability, ['Market rate']);
  // Not housing: no second tag.
  assert.deepEqual(buildingTags('Hampton Inn, 120 keys').affordability, []);
  assert.deepEqual(buildingTags('Office building').affordability, []);
  // A condo hotel is housing too.
  assert.deepEqual(buildingTags('Condo hotel').affordability, ['Market rate']);
  assert.deepEqual(affordability('', ['Rental apartments'], { projectType: 'AFFORDABLE' }), ['Affordable']);
  const tags = tagsFromExtraction(buildingTags('Affordable apartments', { units: 100 }));
  assert.deepEqual(tags.map(t => [t.kind, t.name]), [['BUILDING', 'Rental apartments'], ['AFFORDABILITY', 'Affordable']]);
});

test('mixed income is Market rate, even with affordable units named', () => {
  assert.deepEqual(buildingTags('Mixed-income apartments with 20% affordable units', { units: 300 }).affordability, ['Market rate']);
});
