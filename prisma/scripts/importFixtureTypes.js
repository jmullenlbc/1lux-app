// ── Import FixtureType records from Trackvia CSV ──────────────────────────────
// Source: ILC_-_Types_2026-05-21.csv (or future exports)
//
// CSV expected columns (case-insensitive header match):
//   Type Code  |  Master Type  |  Family  |  Description  |  Active
//
// Usage:
//   node prisma/scripts/importFixtureTypes.js <path-to-csv>
//
// The script is idempotent — re-running with the same file does upserts.
// Missing master_type_id values are skipped with a warning.

const fs           = require('fs');
const path         = require('path');
const readline     = require('readline');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// ── CSV parser (handles quoted fields with embedded commas) ───────────────────
function parseCSVLine(line) {
  const result = [];
  let current  = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

// ── Normalise header names → camelCase keys ───────────────────────────────────
function normaliseHeader(h) {
  return h.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

async function main() {
  const csvPath = process.argv[2];
  if (!csvPath) {
    console.error('Usage: node prisma/scripts/importFixtureTypes.js <path-to-csv>');
    process.exit(1);
  }
  if (!fs.existsSync(csvPath)) {
    console.error(`File not found: ${csvPath}`);
    process.exit(1);
  }

  // Load all known MasterType codes so we can validate FKs
  const masterTypes = await prisma.masterType.findMany({ select: { code: true } });
  const validCodes  = new Set(masterTypes.map(m => m.code));
  console.log(`Loaded ${validCodes.size} MasterType codes for FK validation.`);

  const rl = readline.createInterface({ input: fs.createReadStream(csvPath) });
  const lines = [];
  for await (const line of rl) lines.push(line);

  if (lines.length < 2) {
    console.error('CSV has no data rows.');
    process.exit(1);
  }

  const headers    = parseCSVLine(lines[0]).map(normaliseHeader);
  // Column index map
  const col = key => headers.indexOf(key);
  const iCode   = col('type_code')    !== -1 ? col('type_code')    : col('code');
  const iMaster = col('master_type')  !== -1 ? col('master_type')  : col('master_type_id');
  const iFamily = col('family');
  const iDesc   = col('description');
  const iActive = col('active')       !== -1 ? col('active')       : col('is_active');

  if (iCode === -1 || iMaster === -1) {
    console.error('Required columns not found. Expected: "Type Code", "Master Type"');
    console.error('Found headers:', headers);
    process.exit(1);
  }

  let upserted = 0;
  let skipped  = 0;

  for (let i = 1; i < lines.length; i++) {
    const row = parseCSVLine(lines[i]);
    if (row.every(c => c === '')) continue; // blank line

    const code           = row[iCode]?.trim().toUpperCase();
    const master_type_id = row[iMaster]?.trim().toUpperCase();
    const family         = iFamily !== -1 ? row[iFamily]?.trim() : '';
    const description    = iDesc   !== -1 ? row[iDesc]?.trim()   : null;
    const activeRaw      = iActive !== -1 ? row[iActive]?.trim().toLowerCase() : 'yes';
    const is_active      = !['no', 'false', '0', 'inactive', ''].includes(activeRaw);

    if (!code) { console.warn(`Row ${i + 1}: missing type code — skipped.`); skipped++; continue; }
    if (!master_type_id) { console.warn(`Row ${i + 1}: missing master_type for "${code}" — skipped.`); skipped++; continue; }
    if (!validCodes.has(master_type_id)) {
      console.warn(`Row ${i + 1}: MasterType "${master_type_id}" not found for type "${code}" — skipped.`);
      skipped++; continue;
    }

    await prisma.fixtureType.upsert({
      where:  { code },
      update: { master_type_id, family, description, is_active },
      create: { code, master_type_id, family, description, is_active },
    });
    upserted++;
  }

  console.log(`✓ FixtureTypes: ${upserted} upserted, ${skipped} skipped.`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
