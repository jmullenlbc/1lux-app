import { PrismaClient } from '@prisma/client';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname   = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const prisma      = new PrismaClient();
const require     = createRequire(import.meta.url);
const XLSX        = require('xlsx');

const files = await prisma.projectFile.findMany({
  where: { tab: 'takeoffs', projectId: 'cmoknz6sx0003f997opo516hf' },
  select: { id: true, originalName: true, storedPath: true },
  orderBy: { createdAt: 'asc' },
});

for (const file of files) {
  console.log('\n==============================');
  console.log('File:', file.originalName);

  const fullPath = path.join(projectRoot, 'uploads', file.storedPath);
  const buffer = await readFile(fullPath);
  const wb = XLSX.read(buffer, { type: 'buffer', cellFormula: true });
  console.log('Sheets:', wb.SheetNames);

  // Check last sheet
  const ws = wb.Sheets[wb.SheetNames[wb.SheetNames.length - 1]];
  const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  console.log(`Last sheet rows: ${data.length}`);
  data.forEach((row, i) => console.log(`  [${i}]:`, JSON.stringify(row)));
}

await prisma.$disconnect();
