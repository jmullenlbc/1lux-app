import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const files = await prisma.projectFile.findMany({
  where: { tab: 'takeoffs' },
  select: { id: true, originalName: true, tags: true, takeoffData: true, createdAt: true },
  orderBy: { createdAt: 'asc' },
});

files.forEach(f => {
  const data = f.takeoffData ? JSON.parse(f.takeoffData) : null;
  console.log('\n' + f.originalName);
  console.log('  tags:', f.tags);
  console.log('  takeoffData:', data
    ? `${Object.keys(data).length} types, sample: ${JSON.stringify(Object.entries(data).slice(0, 4))}`
    : 'NULL ← not parsed');
});

await prisma.$disconnect();
