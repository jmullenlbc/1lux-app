/**
 * migrate-projects-to-deals.js
 *
 * One-time migration: creates a WON Deal record for every Project
 * that doesn't already have one linked to it.
 *
 * Inference rules:
 *   pipeline, serviceType fullDesign/designAssist → DESIGN, else PROCUREMENT
 *   stage, phase closeout → COMPLETED, else CONSTRUCTION
 *   revenue, contractValue (PROCUREMENT) or designContractValue (DESIGN)
 *   dealStatus, WON (all existing projects are won jobs)
 *   probability, 100
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const DESIGN_SERVICE_TYPES = ['fullDesign', 'designAssist'];

function inferPipeline(serviceType) {
  return DESIGN_SERVICE_TYPES.includes(serviceType) ? 'DESIGN' : 'PROCUREMENT';
}

function inferStage(phase, pipeline) {
  if (phase === 'closeout') return 'COMPLETED';
  if (phase === 'construction') return 'CONSTRUCTION';
  // Earlier phases still active
  if (pipeline === 'DESIGN') return 'DESIGN';
  return 'CONSTRUCTION';
}

async function main() {
  console.log('─────────────────────────────────────────');
  console.log(' Project → Deal Migration');
  console.log('─────────────────────────────────────────\n');

  // All projects
  const projects = await prisma.project.findMany({
    orderBy: { projectNumber: 'asc' },
  });

  // Projects already linked to a deal
  const linked = await prisma.deal.findMany({
    where:  { linkedProjectId: { not: null } },
    select: { linkedProjectId: true },
  });
  const linkedIds = new Set(linked.map(d => d.linkedProjectId));

  const toMigrate = projects.filter(p => !linkedIds.has(p.id));

  console.log(`Total projects:       ${projects.length}`);
  console.log(`Already linked:       ${linked.length}`);
  console.log(`To migrate:           ${toMigrate.length}\n`);

  if (toMigrate.length === 0) {
    console.log('Nothing to do, all projects already have deals.');
    return;
  }

  // Current max dealNumber
  const maxDeal = await prisma.deal.findFirst({
    orderBy: { dealNumber: 'desc' },
    select:  { dealNumber: true },
  });
  let nextNum = (maxDeal?.dealNumber ?? 0) + 1;

  // Fallback createdBy (oldest admin)
  const fallbackUser = await prisma.user.findFirst({
    where:   { role: { in: ['SUPER_ADMIN', 'ILC_ADMIN', 'ADMIN', 'COMPANY_ADMIN'] } },
    orderBy: { createdAt: 'asc' },
    select:  { id: true, name: true },
  });
  console.log(`Fallback user for createdById: ${fallbackUser?.name ?? 'none'}\n`);

  let created = 0;
  let skipped = 0;
  const today = new Date().toISOString().split('T')[0];

  for (const p of toMigrate) {
    const createdById = p.createdById || fallbackUser?.id;
    if (!createdById) {
      console.log(`  ⚠ SKIP  ${p.name}, no createdById and no fallback user`);
      skipped++;
      continue;
    }

    const pipeline    = inferPipeline(p.serviceType);
    const stage       = inferStage(p.phase, pipeline);
    const totalRevenue = pipeline === 'DESIGN'
      ? (p.designContractValue || p.contractValue || null)
      : (p.contractValue || null);

    const prjLabel = p.projectNumber
      ? `PRJ-${String(p.projectNumber).padStart(4, '0')}`
      : p.id.slice(0, 8);

    await prisma.deal.create({
      data: {
        dealNumber:      nextNum,
        title:           p.name,
        pipeline,
        stage,
        dealStatus:      'WON',
        wonAt:           p.createdAt,
        probability:     100,
        city:            p.city          || null,
        state:           p.state         || null,
        buildingType:    p.buildingType  || null,
        serviceType:     p.serviceType   || null,
        totalRevenue:    totalRevenue    ?? null,
        clientId:        p.clientId      || null,
        linkedProjectId: p.id,
        createdById,
        notes: `Migrated from ${prjLabel} on ${today}`,
      },
    });

    console.log(`  ✓ Deal #${nextNum}  ${p.name}  [${pipeline} / ${stage}]${totalRevenue ? `  $${totalRevenue.toLocaleString()}` : ''}`);
    nextNum++;
    created++;
  }

  console.log(`\n─────────────────────────────────────────`);
  console.log(` Created: ${created}   Skipped: ${skipped}`);
  console.log('─────────────────────────────────────────');
}

main()
  .catch(e => { console.error('\n❌ Migration failed:', e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
