import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';
// parse CSV manually, no external dep needed for this simple format
function parseCSV(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(l => l.trim());
  const headers = lines[0].split(',').map(h => h.replace(/^﻿/, '').trim());
  return lines.slice(1).map(line => {
    const vals = line.split(',');
    const obj = {};
    headers.forEach((h, i) => { obj[h] = (vals[i] || '').trim(); });
    return obj;
  });
}

const prisma = new PrismaClient();
const CSV_PATH = 'C:/ilc-lighting-app/Trackvia tables/ILC - Products_2026-05-05.csv';
const ELUMA_MFR_ID = 'cmosuot09004d914wkou13esx';

function parseNum(s) {
  if (!s || !s.trim()) return null;
  const n = parseFloat(s.replace(/[^0-9.-]/g, ''));
  return isNaN(n) ? null : n;
}

async function main() {
  const raw = readFileSync(CSV_PATH, 'utf-8');
  const rows = parseCSV(raw);

  const filtered = rows
    .map(r => ({ ...r, 'CATALOG #': (r['CATALOG #'] || '').trim() }))
    .filter(r => {
      const cat = r['CATALOG #'];
      if (!cat) return false;
      if (cat.includes('*')) return false;       // skip wildcards
      if (cat === 'DL EMCASE') return false;     // deduplicate, DL-EMCASE is canonical
      return true;
    });

  const singles = filtered.filter(r => !r['CATALOG #'].includes('+') && !r['CATALOG #'].startsWith('('));
  const combos  = filtered.filter(r =>  r['CATALOG #'].includes('+') || r['CATALOG #'].startsWith('('));

  // Upload singles + first 2 combos only (per instructions)
  const toUpload = [...singles, ...combos.slice(0, 2)];

  console.log(`Singles: ${singles.length}, Combos total: ${combos.length}`);
  console.log(`Uploading: ${toUpload.length} products`);
  console.log(`First 2 combos being uploaded:`);
  combos.slice(0, 2).forEach(r => console.log('  ', r['CATALOG #']));

  // Get current max numericId
  const maxResult = await prisma.manufacturerProduct.aggregate({ _max: { numericId: true } });
  let nextId = (maxResult._max.numericId ?? 0) + 1;

  let created = 0, skipped = 0;

  for (const row of toUpload) {
    const partNumber = row['CATALOG #'];
    try {
      await prisma.manufacturerProduct.upsert({
        where: { manufacturerId_partNumber: { manufacturerId: ELUMA_MFR_ID, partNumber } },
        create: {
          numericId:      nextId++,
          manufacturerId: ELUMA_MFR_ID,
          partNumber,
          finish:         row['FINISH']    || null,
          cct:            row['CCT']       || null,
          wattage:        parseNum(row['WATTAGE']),
          dimming:        row['DIM']       || null,
          voltage:        row['VOLTAGE']   || null,
          mounting:       row['MOUNTING']  || null,
          cost:           parseNum(row['COST']),
          salePrice:      parseNum(row['SALE PRICE']),
        },
        update: {},  // don't overwrite if already exists
      });
      created++;
    } catch (e) {
      console.warn(`  SKIP ${partNumber}: ${e.message}`);
      skipped++;
    }
  }

  console.log(`\nDone. Created: ${created}, Skipped/errors: ${skipped}`);
  console.log(`\nRemaining combos NOT uploaded yet (${combos.length - 2}):`);
  combos.slice(2).forEach(r => console.log('  ', r['CATALOG #']));
}

main().catch(console.error).finally(() => prisma.$disconnect());
