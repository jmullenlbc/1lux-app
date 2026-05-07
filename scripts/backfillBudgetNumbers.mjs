import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Get all projects without a budget number, ordered by creation date
  const projects = await prisma.project.findMany({
    where: { budgetNumber: null },
    orderBy: { createdAt: 'asc' },
    select: { id: true, budgetType: true, createdAt: true, name: true },
  });

  console.log(`Found ${projects.length} projects without a budget number`);

  // Get the current max sequence for each prefix
  const existing = await prisma.project.findMany({
    where: { budgetNumber: { not: null } },
    select: { budgetNumber: true },
  });

  const maxSeq = { C: 0, D: 0, B: 0 };
  for (const p of existing) {
    const prefix = p.budgetNumber[0];
    const n = parseInt(p.budgetNumber.slice(1), 10);
    if (prefix in maxSeq && n > maxSeq[prefix]) maxSeq[prefix] = n;
  }

  let updated = 0;
  for (const p of projects) {
    const prefix = p.budgetType === 'peer_review' ? 'B' : p.budgetType === 'design' ? 'D' : 'C';
    maxSeq[prefix]++;
    const budgetNumber = `${prefix}${String(maxSeq[prefix]).padStart(5, '0')}`;

    await prisma.project.update({
      where: { id: p.id },
      data: { budgetNumber },
    });

    console.log(`  ${p.name} → ${budgetNumber}`);
    updated++;
  }

  console.log(`\nDone. Assigned budget numbers to ${updated} projects.`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
