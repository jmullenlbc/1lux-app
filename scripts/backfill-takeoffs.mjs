import { PrismaClient } from '@prisma/client';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname   = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const prisma      = new PrismaClient();
const require     = createRequire(import.meta.url);

function parseTakeoffBuffer(buffer) {
  const XLSX = require('xlsx');
  const wb = XLSX.read(buffer, { type: 'buffer', cellFormula: true });
  if (!wb.SheetNames.length) return null;

  const ws = wb.Sheets[wb.SheetNames[wb.SheetNames.length - 1]];
  const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  // Format 3: simple two-column summary [fixtureType, qty]
  const firstDataRow = data.find(row => String(row[0]).trim() !== '');
  const looksLikeSummary = firstDataRow
    && typeof firstDataRow[0] === 'string'
    && typeof firstDataRow[1] === 'number'
    && !String(firstDataRow[0]).trim().match(/^count$/i)
    && !String(firstDataRow[1]).toString().match(/^(point|measure|type)$/i);

  if (looksLikeSummary) {
    const quantities = {};
    for (const row of data) {
      const name = String(row[0] ?? '').trim();
      const qty  = Number(row[1]);
      if (!name || isNaN(qty) || qty <= 0) continue;
      if (name.includes('(IN LFT)') || name.includes('(IN LF)')) continue;
      if (name.toUpperCase().startsWith('UNTAGGED')) continue;
      quantities[name] = (quantities[name] ?? 0) + qty;
    }
    return Object.keys(quantities).length > 0 ? quantities : null;
  }

  let headerRowIdx = data.findIndex(row => String(row[0]).trim() === 'Count');
  let col = 0;
  if (headerRowIdx === -1) {
    headerRowIdx = data.findIndex(row => String(row[1]).trim() === 'Count');
    col = 1;
  }
  if (headerRowIdx === -1) return null;

  const headerRow = data[headerRowIdx];
  const totalColIdx = headerRow.findIndex(cell => String(cell).trim() === 'Total');
  if (totalColIdx === -1) return null;

  const quantities = {};
  for (let i = headerRowIdx + 1; i < data.length; i++) {
    const row = data[i];
    const firstContent = String(row[col] ?? '').trim();
    if (firstContent === 'Measure' || firstContent === 'Count') break;
    const fixtureType = firstContent;
    const rowType = String(row[col + 1] ?? '').trim();
    if (!fixtureType || rowType !== 'Point') continue;

    let qty = Number(row[totalColIdx]) || 0;
    if (qty === 0) {
      const cellAddr = XLSX.utils.encode_cell({ r: i, c: totalColIdx });
      const cell = ws[cellAddr];
      if (cell && cell.f) {
        for (let c = col + 2; c < totalColIdx; c++) qty += Number(row[c]) || 0;
      }
    }

    quantities[fixtureType] = qty;
  }
  return Object.keys(quantities).length > 0 ? quantities : null;
}

// Re-parse ALL takeoff files to clean up any junk rows
const files = await prisma.projectFile.findMany({
  where: { tab: 'takeoffs' },
  select: { id: true, originalName: true, storedPath: true },
});

console.log(`Re-parsing ${files.length} takeoff file(s).\n`);

for (const file of files) {
  const fullPath = path.join(projectRoot, 'uploads', file.storedPath);
  console.log(`Processing: ${file.originalName}`);
  if (!existsSync(fullPath)) { console.log('  → MISSING on disk\n'); continue; }
  const ext = file.originalName.split('.').pop()?.toLowerCase();
  if (!['xlsx', 'xls'].includes(ext)) { console.log('  → skipped\n'); continue; }
  try {
    const buffer = await readFile(fullPath);
    const parsed = parseTakeoffBuffer(buffer);
    if (parsed) {
      await prisma.projectFile.update({ where: { id: file.id }, data: { takeoffData: JSON.stringify(parsed) } });
      console.log(`  → OK, ${Object.keys(parsed).length} fixture types: ${Object.keys(parsed).join(', ')}\n`);
    } else {
      console.log(`  → Could not parse\n`);
    }
  } catch (e) {
    console.log(`  → ERROR: ${e.message}\n`);
  }
}

await prisma.$disconnect();
