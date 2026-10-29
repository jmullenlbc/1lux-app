/**
 * Staff edits to the Bid Comparison rules (FixtureKind, FixtureKindWord,
 * BrandGrade, 0138; Mike 10-22). Server only. The tables start empty and read
 * as the code defaults; the first edit copies the defaults in so nothing is
 * lost. Kinds and brands are archive only; a kind's words are replaced whole.
 */
import { prisma } from '@/lib/db';
import { normMfr } from '../specSwap/family.js';
import { DEFAULT_KINDS, WORD_LISTS, defaultBrandRows, phraseRegex } from './kinds.js';
import { clearRulesCache } from './load.js';

const SIZE_UNITS = new Set(['IN', 'FT', 'GRID']);
const BRAND_GRADES = new Set(['BUILDER', 'SPEC', 'BOTH']);
const BRAND_STATUS = new Set(['APPROVED', 'REJECTED']);
const TX = { timeout: 30000, maxWait: 10000 };

export class RuleError extends Error {}

const wordRows = (k) =>
  Object.entries(WORD_LISTS).flatMap(([list, field]) => (k[field] || []).map((phrase, i) => ({ list, phrase, sortOrder: i })));

const kindData = (k) => ({
  name: k.name,
  sizeUnit: k.sizeUnit ?? null,
  sizeMin: k.sizeMin ?? null,
  sizeMax: k.sizeMax ?? null,
  sageOnly: !!k.sageOnly,
  noTypical: !!k.noTypical,
  builderNote: k.builderNote || '',
  specNote: k.specNote || '',
  builderLow: k.builderLow ?? null,
  builderHigh: k.builderHigh ?? null,
  specLow: k.specLow ?? null,
  specHigh: k.specHigh ?? null,
});

async function seedKinds(tx) {
  if (await tx.fixtureKind.count()) return;
  for (const [i, k] of DEFAULT_KINDS.entries()) {
    await tx.fixtureKind.create({
      data: { key: k.key, sortOrder: (i + 1) * 10, source: 'DEFAULT', ...kindData(k), words: { create: wordRows(k) } },
    });
  }
}

async function seedBrands(tx) {
  if (await tx.brandGrade.count()) return;
  await tx.brandGrade.createMany({
    data: defaultBrandRows().map((b) => ({ brand: b.brand, grade: b.grade, sage: b.sage, status: 'APPROVED', source: 'DEFAULT' })),
  });
}

const num = (v, label) => {
  if (v === '' || v == null) return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) throw new RuleError(`${label} must be a number, 0 or more`);
  return n;
};

/** Words typed one per line or comma separated, upper case, no repeats. */
function cleanWords(list, label) {
  const raw = Array.isArray(list) ? list : String(list ?? '').split(/[\n,]/);
  const out = [];
  for (const w of raw) {
    const p = String(w).trim().toUpperCase().replace(/\s+/g, ' ');
    if (!p || out.includes(p)) continue;
    if (p.length > 60) throw new RuleError(`${label}: "${p.slice(0, 20)}..." is too long`);
    phraseRegex(p);
    out.push(p);
  }
  if (out.length > 120) throw new RuleError(`${label}: 120 phrases at most`);
  return out;
}

function cleanKind(input) {
  const name = String(input.name ?? '').trim();
  if (!name) throw new RuleError('A kind needs a name');
  const sizeUnit = input.sizeUnit ? String(input.sizeUnit).toUpperCase() : null;
  if (sizeUnit && !SIZE_UNITS.has(sizeUnit)) throw new RuleError('Size must be inches, feet, grid or none');
  const k = {
    name: name.slice(0, 80),
    sizeUnit,
    sizeMin: sizeUnit ? num(input.sizeMin, 'Smallest size') : null,
    sizeMax: sizeUnit ? num(input.sizeMax, 'Largest size') : null,
    sageOnly: !!input.sageOnly,
    noTypical: !!input.noTypical,
    builderNote: String(input.builderNote ?? '').trim().slice(0, 400),
    specNote: String(input.specNote ?? '').trim().slice(0, 400),
    builderLow: num(input.builderLow, 'Builder low'),
    builderHigh: num(input.builderHigh, 'Builder high'),
    specLow: num(input.specLow, 'Spec low'),
    specHigh: num(input.specHigh, 'Spec high'),
    match: cleanWords(input.match, 'Reads it from'),
    not: cleanWords(input.not, 'Not'),
    builder: cleanWords(input.builder, 'Builder words'),
    spec: cleanWords(input.spec, 'Spec words'),
  };
  if (!k.match.length) throw new RuleError('A kind needs at least one word to read it from');
  if (k.sizeMin != null && k.sizeMax != null && k.sizeMin > k.sizeMax) throw new RuleError('Smallest size is over the largest');
  for (const g of ['builder', 'spec']) {
    const lo = k[`${g}Low`];
    const hi = k[`${g}High`];
    if (lo != null && hi != null && lo > hi) throw new RuleError(`${g === 'builder' ? 'Builder' : 'Spec'} low is over the high`);
  }
  if (k.sageOnly) Object.assign(k, { builderLow: null, builderHigh: null, specLow: null, specHigh: null, builder: [], spec: [] });
  return k;
}

const keyFor = (name) => {
  const words = name.replace(/[^A-Za-z0-9 ]/g, ' ').trim().split(/\s+/).filter(Boolean);
  const key = words.map((w, i) => (i ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w.toLowerCase())).join('');
  return (key || 'kind').slice(0, 40);
};

/** Add or change a kind. `key` blank adds a new kind at the bottom. */
export async function saveKind(input, user) {
  const k = cleanKind(input);
  const out = await prisma.$transaction(async (tx) => {
    await seedKinds(tx);
    const data = { ...kindData(k), source: 'HUMAN', updatedById: user.id };
    if (input.key) {
      const found = await tx.fixtureKind.findUnique({ where: { key: String(input.key) } });
      if (!found) throw new RuleError('No kind by that key');
      await tx.fixtureKindWord.deleteMany({ where: { kindId: found.id } });
      return tx.fixtureKind.update({ where: { id: found.id }, data: { ...data, archivedAt: null, words: { create: wordRows(k) } } });
    }
    let key = keyFor(k.name);
    for (let n = 2; await tx.fixtureKind.findUnique({ where: { key } }); n++) key = `${keyFor(k.name)}${n}`;
    const last = await tx.fixtureKind.aggregate({ _max: { sortOrder: true } });
    return tx.fixtureKind.create({ data: { key, sortOrder: (last._max.sortOrder ?? 0) + 10, ...data, words: { create: wordRows(k) } } });
  }, TX);
  clearRulesCache();
  return { key: out.key };
}

/** Add one "reads it from" phrase to a kind (a learned word a person approved). */
export async function addKindWord(key, phrase, user) {
  const [p] = cleanWords([phrase], 'Word');
  if (!p) throw new RuleError('A word is needed');
  await prisma.$transaction(async (tx) => {
    await seedKinds(tx);
    const found = await tx.fixtureKind.findUnique({ where: { key: String(key) }, include: { words: true } });
    if (!found) throw new RuleError('No kind by that key');
    const match = found.words.filter((w) => w.list === 'MATCH');
    if (match.some((w) => w.phrase === p)) return;
    await tx.fixtureKindWord.create({ data: { kindId: found.id, list: 'MATCH', phrase: p, sortOrder: Math.max(-1, ...match.map((w) => w.sortOrder)) + 1 } });
    await tx.fixtureKind.update({ where: { id: found.id }, data: { source: 'HUMAN', updatedById: user.id } });
  }, TX);
  clearRulesCache();
}

/** Archive or bring back a kind. */
export async function archiveKind(key, archived, user) {
  await prisma.$transaction(async (tx) => {
    await seedKinds(tx);
    const found = await tx.fixtureKind.findUnique({ where: { key: String(key) } });
    if (!found) throw new RuleError('No kind by that key');
    await tx.fixtureKind.update({ where: { id: found.id }, data: { archivedAt: archived ? new Date() : null, updatedById: user.id } });
  }, TX);
  clearRulesCache();
}

/** Move a kind one place up (-1) or down (1); the first kind that matches wins. */
export async function moveKind(key, dir, user) {
  await prisma.$transaction(async (tx) => {
    await seedKinds(tx);
    const all = await tx.fixtureKind.findMany({ where: { archivedAt: null }, orderBy: { sortOrder: 'asc' } });
    const i = all.findIndex((k) => k.key === key);
    const j = i + (dir < 0 ? -1 : 1);
    if (i < 0 || j < 0 || j >= all.length) return;
    [all[i], all[j]] = [all[j], all[i]];
    for (const [n, k] of all.entries()) {
      const sortOrder = (n + 1) * 10;
      if (k.sortOrder !== sortOrder) await tx.fixtureKind.update({ where: { id: k.id }, data: { sortOrder, updatedById: user.id } });
    }
  }, TX);
  clearRulesCache();
}

/**
 * Set a brand's grade and Sage Brands flag, or decide a suggested one
 * (status APPROVED | REJECTED). A person deciding makes it a HUMAN row.
 */
export async function saveBrand(input, user) {
  const brand = normMfr(input.brand);
  if (!brand) throw new RuleError('A brand needs a name');
  const grade = input.grade ? String(input.grade).toUpperCase() : null;
  if (grade && !BRAND_GRADES.has(grade)) throw new RuleError('Grade must be builder, spec or both');
  const status = input.status ? String(input.status).toUpperCase() : 'APPROVED';
  if (!BRAND_STATUS.has(status)) throw new RuleError('Status must be approved or rejected');
  const data = {
    grade,
    sage: !!input.sage,
    status,
    source: 'HUMAN',
    note: String(input.note ?? '').trim().slice(0, 300),
    decidedById: user.id,
    decidedAt: new Date(),
    archivedAt: null,
  };
  await prisma.$transaction(async (tx) => {
    await seedBrands(tx);
    await tx.brandGrade.upsert({ where: { brand }, create: { brand, ...data }, update: data });
  }, TX);
  clearRulesCache();
  return { brand };
}

/** Archive or bring back a brand row. */
export async function archiveBrand(brandName, archived, user) {
  const brand = normMfr(brandName);
  await prisma.$transaction(async (tx) => {
    await seedBrands(tx);
    const found = await tx.brandGrade.findUnique({ where: { brand } });
    if (!found) throw new RuleError('No brand by that name');
    await tx.brandGrade.update({ where: { brand }, data: { archivedAt: archived ? new Date() : null, decidedById: user.id, decidedAt: new Date() } });
  }, TX);
  clearRulesCache();
}
