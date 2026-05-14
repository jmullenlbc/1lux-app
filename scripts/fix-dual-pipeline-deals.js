/**
 * fix-dual-pipeline-deals.js
 *
 * Full Design and Design Assist projects belong in BOTH pipelines:
 *   - One PROCUREMENT deal (product supply → contractValue)
 *   - One DESIGN deal      (design fee     → designContractValue)
 *
 * This script:
 *   1. Finds migrated deals that are DESIGN pipeline but are missing a linked PROCUREMENT deal
 *   2. Corrects the DESIGN deal revenue to use designContractValue
 *   3. Creates a paired PROCUREMENT deal using contractValue
 *   4. Links the two deals to each other via linkedDealId
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const DESIGN_SERVICE_TYPES = ['fullDesign', 'designAssist'];

async function main() {
  console.log('─────────────────────────────────────────');
  console.log(' Fix Dual-Pipeline Deals');
  console.log('─────────────────────────────────────────\n');

  // Find all migrated DESIGN deals that have a linkedProjectId
  const designDeals = await prisma.deal.findMany({
    where: {
      pipeline:        'DESIGN',
      linkedProjectId: { not: null },
    },
    include: {
      linkedProject: true,
    },
  });

  console.log(`Found ${designDeals.length} DESIGN deal(s) with a linked project\n`);

  // Current max dealNumber
  const maxDeal = await prisma.deal.findFirst({
    orderBy: { dealNumber: 'desc' },
    select:  { dealNumber: true },
  });
  let nextNum = (maxDeal?.dealNumber ?? 0) + 1;

  let fixed   = 0;
  let skipped = 0;
  const today = new Date().toISOString().split('T')[0];

  for (const deal of designDeals) {
    const p = deal.linkedProject;
    if (!p) { console.log(`  ⚠ SKIP deal #${deal.dealNumber} — no linked project found`); skipped++; continue; }

    // Only process Full Design / Design Assist
    if (!DESIGN_SERVICE_TYPES.includes(p.serviceType)) {
      console.log(`  ⚠ SKIP deal #${deal.dealNumber} ${p.name} — serviceType is "${p.serviceType}", not a dual-pipeline type`);
      skipped++;
      continue;
    }

    // Check if a PROCUREMENT deal is already linked to this project
    const existingProcurement = await prisma.deal.findFirst({
      where: { linkedProjectId: p.id, pipeline: 'PROCUREMENT' },
    });
    if (existingProcurement) {
      console.log(`  ⚠ SKIP ${p.name} — PROCUREMENT deal already exists (#${existingProcurement.dealNumber})`);
      skipped++;
      continue;
    }

    // 1. Fix the DESIGN deal to use designContractValue (or fall back to contractValue)
    const designRevenue     = p.designContractValue || null;
    const procurementRevenue = p.contractValue      || null;

    await prisma.deal.update({
      where: { id: deal.id },
      data:  { totalRevenue: designRevenue },
    });

    // 2. Create paired PROCUREMENT deal
    const procDeal = await prisma.deal.create({
      data: {
        dealNumber:      nextNum,
        title:           p.name,
        pipeline:        'PROCUREMENT',
        stage:           deal.stage,
        dealStatus:      'WON',
        wonAt:           p.createdAt,
        probability:     100,
        city:            p.city         || null,
        state:           p.state        || null,
        buildingType:    p.buildingType || null,
        serviceType:     p.serviceType  || null,
        totalRevenue:    procurementRevenue,
        clientId:        p.clientId     || null,
        linkedProjectId: p.id,
        linkedDealId:    deal.id,       // ← links to DESIGN deal
        createdById:     deal.createdById,
        notes: `Procurement side of dual-pipeline deal — migrated from PRJ on ${today}`,
      },
    });

    // 3. Link DESIGN deal back to the new PROCUREMENT deal
    await prisma.deal.update({
      where: { id: deal.id },
      data:  { linkedDealId: procDeal.id },
    });

    console.log(`  ✓ ${p.name}`);
    console.log(`      DESIGN      deal #${deal.dealNumber}  revenue: ${designRevenue ? `$${designRevenue.toLocaleString()}` : '—'}`);
    console.log(`      PROCUREMENT deal #${nextNum}          revenue: ${procurementRevenue ? `$${procurementRevenue.toLocaleString()}` : '—'}`);

    nextNum++;
    fixed++;
  }

  console.log(`\n─────────────────────────────────────────`);
  console.log(` Fixed: ${fixed}   Skipped: ${skipped}`);
  console.log('─────────────────────────────────────────');
}

main()
  .catch(e => { console.error('\n❌ Script failed:', e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
