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
const XLSX        = require('xlsx');

const files = await prisma.projectFile.findMany({
  where: { tab: 'takeoffs' },
  select: { id: true, originalName: true, storedPath: true, takeoffData: true },
});

for (const file of files) {
  const fullPath = path.join(projectRoot, 'uploads', file.storedPath);
  const altPath  = path.join(projectRoot, 'uploads', file.storedPath.replace(/\//g, '\\'));
  const usePath  = existsSync(fullPath) ? fullPath : existsSync(altPath) ? altPath : null;

  console.log(`\n=== ${file.originalName} ===`);
  console.log('storedPath:', file.storedPath);
  console.log('resolved:', fullPath);
  console.log('exists:', !!usePath);

  if (!usePath) { console.log('MISSING, skip'); continue; }
  const ext = file.originalName.split('.').pop()?.toLowerCase();
  if (!['xlsx', 'xls'].includes(ext)) { console.log('not xlsx, skip'); continue; }

  const buffer = await readFile(usePath);
  const wb = XLSX.read(buffer, { type: 'buffer', cellFormula: true, WTF: false });
  const ws = wb.Sheets[wb.SheetNames[wb.SheetNames.length - 1]];
  const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  // Find header row
  let headerRowIdx = data.findIndex(row => String(row[0]).trim() === 'Count');
  let col = 0;
  if (headerRowIdx === -1) {
    headerRowIdx = data.findIndex(row => String(row[1]).trim() === 'Count');
    col = 1;
  }

  if (headerRowIdx === -1) { console.log('No header found'); continue; }
  console.log(`Header row: ${headerRowIdx}, col offset: ${col}`);

  const headerRow = data[headerRowIdx];
  const totalColIdx = headerRow.findIndex(cell => String(cell).trim() === 'Total');
  console.log(`Total col idx: ${totalColIdx}, header value: "${headerRow[totalColIdx]}"`);

  // Show 3 rows before header (might show multiplier rows)
  for (let i = Math.max(0, headerRowIdx - 3); i <= headerRowIdx; i++) {
    console.log(`  data[${i}]:`, JSON.stringify(data[i]?.slice(0, 8)), '... length:', data[i]?.length);
  }

  // Find first "Point" row after header and inspect it
  for (let i = headerRowIdx + 1; i < Math.min(headerRowIdx + 10, data.length); i++) {
    const row = data[i];
    const fixtureName = String(row[col] ?? '').trim();
    const rowType = String(row[col + 1] ?? '').trim();
    console.log(`  data[${i}]: fixture="${fixtureName}" type="${rowType}" totalCol=${row[totalColIdx]}`);
    if (fixtureName === 'Measure' || fixtureName === 'Count') break;

    if (rowType === 'Point') {
      // Found first fixture row, inspect Total cell directly
      const rowLetterIdx = i; // 0-based
      const colLetter = XLSX.utils.encode_col(totalColIdx);
      const cellAddr = `${colLetter}${rowLetterIdx + 1}`; // XLSX rows are 1-based
      const cell = ws[cellAddr];
      console.log(`  Raw cell ${cellAddr}:`, JSON.stringify(cell));

      // Also show col+2 through col+5 raw cells for context
      for (let c = col + 2; c <= col + 5 && c < headerRow.length; c++) {
        const ca = `${XLSX.utils.encode_col(c)}${rowLetterIdx + 1}`;
        console.log(`    raw cell ${ca}:`, JSON.stringify(ws[ca]));
      }

      // Sum all non-Total columns (col+2 to totalColIdx-1)
      let rawSum = 0;
      for (let c = col + 2; c < totalColIdx; c++) rawSum += Number(row[c]) || 0;
      console.log(`  Summed cols ${col+2}..${totalColIdx-1}: ${rawSum}`);

      // Show full row for first fixture
      console.log(`  Full row: ${JSON.stringify(row)}`);
      break;
    }
  }
}

await prisma.$disconnect();
