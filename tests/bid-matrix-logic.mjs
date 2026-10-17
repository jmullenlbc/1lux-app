/**
 * Characterization tests for the bid-matrix publish logic.
 *
 * NOTE: these mirror the pure helpers inside
 *   src/app/api/projects/[id]/fixture-schedule/publish/route.js
 * which are not currently exported. When that route isn't being actively edited,
 * the right move is to extract splitCatalogNumber + the carry-forward key builder
 * into src/lib/bidMatrix.js and import them here for a true (non-drifting) test.
 * For now this documents the expected behavior and guards the contract.
 *
 * Run: npm test  (or npx tsx tests/bid-matrix-logic.mjs)
 */

let pass = 0, fail = 0; const fails = [];
const eq = (a, b, msg) => {
  const ok = JSON.stringify(a) === JSON.stringify(b);
  if (ok) { pass++; console.log('  ✓ ' + msg); }
  else { fail++; fails.push(`${msg}: got ${JSON.stringify(a)}, expected ${JSON.stringify(b)}`); console.log('  ✗ ' + msg); }
};

// --- mirror of splitCatalogNumber from publish/route.js ---
function splitCatalogNumber(raw) {
  if (!raw) return [null];
  const parts = raw.split(' + ').map(s => s.trim()).filter(Boolean);
  return parts.length > 0 ? parts : [raw];
}
// --- mirror of carry-forward key builder ---
const cfKey = (type, part) => `${(type || '').toLowerCase()}|${(part || '').toLowerCase()}`;

console.log('\nBID MATRIX: splitCatalogNumber');
eq(splitCatalogNumber('ABC-123'),              ['ABC-123'],            'single part, no delimiter');
eq(splitCatalogNumber('ABC + DEF'),            ['ABC', 'DEF'],         'two parts split on " + "');
eq(splitCatalogNumber('ABC + DEF + GHI'),      ['ABC', 'DEF', 'GHI'],  'three parts');
eq(splitCatalogNumber('  ABC  +  DEF  '),      ['ABC', 'DEF'],         'trims whitespace around parts');
eq(splitCatalogNumber(null),                   [null],                 'null -> [null]');
eq(splitCatalogNumber(''),                     [null],                 'empty string -> [null]');

console.log('\nBID MATRIX, known gotcha: only exact " + " (space-plus-space) splits');
eq(splitCatalogNumber('ABC+DEF'),              ['ABC+DEF'],            'GOTCHA: "ABC+DEF" (no spaces) does NOT split');
eq(splitCatalogNumber('ABC +DEF'),             ['ABC +DEF'],           'GOTCHA: "ABC +DEF" (one space) does NOT split');
eq(splitCatalogNumber('ABC+ DEF'),             ['ABC+ DEF'],           'GOTCHA: "ABC+ DEF" (one space) does NOT split');

console.log('\nBID MATRIX: carry-forward key (case-insensitive type|part)');
eq(cfKey('C2', 'DL-7-3000'),                   'c2|dl-7-3000',         'lowercases type and part');
eq(cfKey('C2', 'DL-7-3000') === cfKey('c2', 'dl-7-3000'), true, 'matches across case differences');
eq(cfKey('F', null),                           'f|',                   'null part -> empty (all no-catalog items of a type share a key)');

console.log('\n' + '='.repeat(60));
console.log(`  BID MATRIX LOGIC: ${pass}/${pass + fail} checks passed`);
console.log('='.repeat(60));
if (fail) { console.log('\n  FAILURES:'); fails.forEach((f,i)=>console.log(`   ${i+1}. ${f}`)); process.exit(1); }
