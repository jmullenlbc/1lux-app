#!/usr/bin/env node
/**
 * check-sensitivity-coverage — the ontology is a claim about the real schema.
 *
 * The registry in src/lib/ontology/ is hand-written; prisma/schema.prisma is
 * pushed separately. Nothing structurally prevents them from drifting apart, and
 * both directions of drift are bad in different ways:
 *
 *   registry says a field exists, schema does not
 *       → the declaration is a no-op. `sensitivity: 'ilc_only'` on a field name
 *         with a typo protects nothing, and reads as protection in review.
 *         THIS IS AN ERROR.
 *
 *   schema has a field, registry does not
 *       → fails closed (undeclared defaults to ilc_only), so nothing leaks. But
 *         it is invisible to ILC introspection too, so an agent asking
 *         describe_model gets an incomplete picture. WARNING.
 *
 *   a buy-price-shaped field is declared client-visible
 *       → this is the leak the whole layer exists to prevent. ERROR.
 *
 * Read via `Prisma.dmmf.datamodel`, not by parsing schema.prisma. The DMMF is
 * generated from the schema and is always in sync with the client that the app
 * actually runs; a regex over the .prisma file is a second parser that can be
 * wrong. (It was — two attempts at regexing this file returned zero models
 * before switching to the DMMF.)
 *
 *   node scripts/check-sensitivity-coverage.mjs
 */
import { Prisma } from '@prisma/client';
import { objects, objectKeys, validateRegistry } from '../src/lib/ontology/index.js';
import { NEVER_READABLE } from '../src/lib/ontology/sensitivity.js';

const models = Prisma.dmmf.datamodel.models;
const byLowerName = new Map(models.map(m => [m.name.toLowerCase(), m]));

const errors = [];
const warnings = [];

// ─────────────────────────────────────────────────────────────────────────────
// 0. The registry has to be internally valid before comparing it to anything.
// ─────────────────────────────────────────────────────────────────────────────
for (const problem of validateRegistry()) errors.push(`registry: ${problem}`);

// ─────────────────────────────────────────────────────────────────────────────
// 1. Registry → schema. Every declared model and property must be real.
// ─────────────────────────────────────────────────────────────────────────────
for (const key of objectKeys) {
  const obj = models.find(m => m.name.toLowerCase() === objects[key].model.toLowerCase())
    || byLowerName.get(objects[key].model.toLowerCase());

  if (!obj) {
    errors.push(`${key}: prisma model "${objects[key].model}" does not exist in the schema`);
    continue;
  }

  const realFields = new Set(obj.fields.map(f => f.name));

  for (const prop of Object.keys(objects[key].properties)) {
    if (!realFields.has(prop)) {
      errors.push(
        `${key}.${prop}: declared in the ontology but not a field on prisma model "${obj.name}". ` +
        `A sensitivity declaration on a nonexistent field protects nothing.`,
      );
    }
  }

  for (const linkName of Object.keys(objects[key].links || {})) {
    if (!realFields.has(linkName)) {
      errors.push(`${key}.links.${linkName}: not a relation on prisma model "${obj.name}"`);
    }
  }

  // 2. Schema → registry. Undeclared scalars fail closed but go dark to ILC.
  const declared = new Set([
    ...Object.keys(objects[key].properties),
    ...Object.keys(objects[key].links || {}),
  ]);
  const undeclared = obj.fields
    .filter(f => f.kind === 'scalar' || f.kind === 'enum')
    .map(f => f.name)
    .filter(n => !declared.has(n) && !NEVER_READABLE.has(n));

  if (undeclared.length) {
    warnings.push(
      `${key}: ${undeclared.length} field(s) on "${obj.name}" are undeclared and therefore ilc_only ` +
      `(safe, but invisible to introspection): ${undeclared.join(', ')}`,
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Buy-price sweep across the WHOLE schema, registered or not.
//
// Patterns, not a list, because the point is to catch the column added next
// month that nobody told this file about. Explicit regexes rather than one broad
// one — a single loose pattern produced three false positives on this schema
// (`mustChangePassword`, `buildingFootprintSf`, `isAlternate`).
// ─────────────────────────────────────────────────────────────────────────────
const MONEY_PATTERNS = [
  { re: /(^|[a-z])DN([A-Z]|$)/,        why: 'dealer net — ILC buy price' },
  { re: /^dn[A-Z]/,                    why: 'dealer net — ILC buy price' },
  { re: /margin/i,                     why: 'margin reverses every CN into a DN' },
  { re: /(^|[a-z])[Aa]dder(s)?([A-Z]|$)/, why: 'pricing adder — ILC internal' },
  { re: /^cost$|_cost$|[a-z]Cost$/,    why: 'buy cost' },
  { re: /[Ss]napshot$/,                why: 'frozen rate blob — typically contains margin' },
  { re: /internalNotes/,               why: 'ILC-internal annotation' },
  { re: /rfqStatus|salesRep/,          why: 'ILC procurement state' },
];

/**
 * Matches that are deliberately NOT ILC-only, with the reason. Each entry here
 * is a decision someone made on purpose; an unreviewed match is an error.
 */
const ACKNOWLEDGED = new Map([
  ['ProjectData.salesTaxPct',    'a tax rate the client is quoted — not ILC pricing'],
  ['ProjectData.freightPct',     'quoted to the client on the budget'],
  ['ProjectData.warehousingPct', 'quoted to the client on the budget'],
]);

const registeredModels = new Set(objectKeys.map(k => objects[k].model.toLowerCase()));
const unregisteredHits = [];

for (const model of models) {
  const isRegistered = registeredModels.has(model.name.toLowerCase());
  const objKey = objectKeys.find(k => objects[k].model.toLowerCase() === model.name.toLowerCase());

  for (const field of model.fields) {
    if (field.kind === 'object') continue;
    const hit = MONEY_PATTERNS.find(p => p.re.test(field.name));
    if (!hit) continue;

    const path = `${model.name}.${field.name}`;
    if (ACKNOWLEDGED.has(path)) continue;

    if (!isRegistered) {
      unregisteredHits.push(`${path} — ${hit.why}`);
      continue;
    }

    const def = objects[objKey].properties[field.name];
    if (!def) continue;   // undeclared → ilc_only by default → safe; already warned above
    if (def.sensitivity !== 'ilc_only') {
      errors.push(
        `${objKey}.${field.name}: declared "${def.sensitivity}" but looks like ${hit.why}. ` +
        `If that is deliberate, add it to ACKNOWLEDGED in this file with the reason.`,
      );
    }
  }
}

if (unregisteredHits.length) {
  warnings.push(
    `${unregisteredHits.length} buy-price-shaped field(s) live on models with no ontology definition. ` +
    `They are unreachable through MCP (unregistered objects are refused to non-ILC callers), but they ` +
    `are NOT covered by the transport redactor on hand-built payloads:\n     ` +
    unregisteredHits.join('\n     '),
  );
}

// ─────────────────────────────────────────────────────────────────────────────

for (const w of warnings) console.warn(`   ⚠ ${w}`);

if (errors.length) {
  console.error('\n❌ BUILD BLOCKED — ontology / schema drift:\n');
  for (const e of errors) console.error(`   ${e}\n`);
  process.exit(1);
}

console.log(
  `✓ check-sensitivity-coverage: ${objectKeys.length} objects match the schema across ` +
  `${models.length} models${warnings.length ? ` (${warnings.length} warning${warnings.length > 1 ? 's' : ''})` : ''}`,
);
