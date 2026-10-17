// ── Import MasterType records from Trackvia CSV ───────────────────────────────
// Source: ILC_-_Master_Types_2026-05-21.csv (or future exports)
//
// CSV expected columns (case-insensitive header match):
//   Code  |  Description  |  Fixture Family  |  Active
//
// Usage:
//   node prisma/scripts/importMasterTypes.js <path-to-csv>
//
// The script is idempotent, re-running with the same file does upserts.
// UNIT_TYPE_CODES is hard-coded here to match the business rule; override by
// passing --unit-types=C,D,F,G,L,P,S,UC,V,W,X,Z as a second argument.

const fs           = require('fs');
const readline     = require('readline');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const DEFAULT_UNIT_TYPE_CODES = new Set(['C','D','F','G','L','P','S','UC','V','W','X','Z']);

function parseCSVLine(line) {
  const result = [];
  let current  = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"')                    { inQuotes = !inQuotes; }
    else if (ch === ',' && !inQuotes)  { result.push(current.trim()); current = ''; }
    else                               { current += ch; }
  }
  result.push(current.trim());
  return result;
}

function normaliseHeader(h) {
  return h.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

async function main() {
  const csvPath = process.argv[2];
  if (!csvPath) {
    console.error('Usage: node prisma/scripts/importMasterTypes.js <path-to-csv>');
    process.exit(1);
  }
  if (!fs.existsSync(csvPath)) {
    console.error(`File not found: ${csvPath}`);
    process.exit(1);
  }

  // Optional override: --unit-types=C,D,F
  const utArg = process.argv.find(a => a.startsWith('--unit-types='));
  const UNIT_TYPE_CODES = utArg
    ? new Set(utArg.replace('--unit-types=', '').split(',').map(s => s.trim().toUpperCase()))
    : DEFAULT_UNIT_TYPE_CODES;

  const rl    = readline.createInterface({ input: fs.createReadStream(csvPath) });
  const lines = [];
  for await (const line of rl) lines.push(line);

  if (lines.length < 2) { console.error('CSV has no data rows.'); process.exit(1); }

  const headers = parseCSVLine(lines[0]).map(normaliseHeader);
  const col     = key => headers.indexOf(key);
  const iCode   = col('code');
  const iDesc   = col('description') !== -1 ? col('description') : col('desc');
  const iFamily = col('fixture_family') !== -1 ? col('fixture_family') : col('family');
  const iActive = col('active') !== -1 ? col('active') : col('is_active');

  if (iCode === -1 || iFamily === -1) {
    console.error('Required columns not found. Expected: "Code", "Fixture Family"');
    console.error('Found headers:', headers);
    process.exit(1);
  }

  let upserted = 0;
  let skipped  = 0;

  for (let i = 1; i < lines.length; i++) {
    const row = parseCSVLine(lines[i]);
    if (row.every(c => c === '')) continue;

    const code           = row[iCode]?.trim().toUpperCase();
    const description    = iDesc   !== -1 ? (row[iDesc]?.trim()   || 'FIXTURE') : 'FIXTURE';
    const fixture_family = iFamily !== -1 ? (row[iFamily]?.trim() || '')        : '';
    const activeRaw      = iActive !== -1 ? row[iActive]?.trim().toLowerCase() : 'yes';
    const is_active      = !['no', 'false', '0', 'inactive', ''].includes(activeRaw);
    const is_unit_type   = UNIT_TYPE_CODES.has(code);

    if (!code) { console.warn(`Row ${i + 1}: missing code, skipped.`); skipped++; continue; }

    await prisma.masterType.upsert({
      where:  { code },
      update: { description, fixture_family, is_unit_type, is_active },
      create: { code, description, fixture_family, is_unit_type, is_active, symbol_svg: '' },
    });
    upserted++;
  }

  console.log(`✓ MasterTypes: ${upserted} upserted, ${skipped} skipped.`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
