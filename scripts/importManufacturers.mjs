import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const prisma = new PrismaClient();

function parseNum(v) {
  if (!v || v === '') return null;
  // Strip commas, dollar signs
  const n = parseFloat(String(v).replace(/[$,]/g, ''));
  return isNaN(n) ? null : n;
}

function parseStr(v) {
  if (!v || String(v).trim() === '') return null;
  return String(v).trim();
}

async function main() {
  const raw = readFileSync(join(__dirname, 'manufacturers_import.json'), 'utf8').replace(/^﻿/, '');
  const rows = JSON.parse(raw);

  console.log(`Importing ${rows.length} manufacturers...`);

  let created = 0, skipped = 0;
  let numericId = 1;

  for (const row of rows) {
    const name = parseStr(row.name);
    if (!name) { skipped++; continue; }

    const existing = await prisma.manufacturer.findFirst({ where: { name } });
    if (existing) {
      // Update with data from import if fields are blank
      skipped++;
      continue;
    }

    await prisma.manufacturer.create({
      data: {
        numericId:       numericId++,
        name,
        acctLastUpdated: parseStr(row.acctLastUpdated),
        setupToSell:     Boolean(row.setupToSell),
        terms:           parseStr(row.terms),
        credit:          parseNum(row.credit),
        notes:           parseStr(row.notes),
        accountingEmail: parseStr(row.accountingEmail),
        ffa:             parseNum(row.ffa),
        paymentInfo:     parseStr(row.paymentInfo),
        website:         parseStr(row.website),
        mainPhone:       parseStr(row.mainPhone),
        address:         parseStr(row.address),
        address2:        parseStr(row.address2),
        city:            parseStr(row.city),
        state:           parseStr(row.state),
        zip:             parseStr(row.zip),
      },
    });
    created++;
    if (created % 50 === 0) console.log(`  ${created} created...`);
  }

  console.log(`Done. Created: ${created}, Skipped (already existed): ${skipped}`);
  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
