#!/usr/bin/env node
/**
 * A starter pool of decorative options, so the Unit Selections survey has
 * something to show the day it turns on.
 *
 * ── Read this before you trust the prices ───────────────────────────────────
 * The cnPrice figures here are PLACEHOLDERS. They are shaped like real budget
 * fixtures, a few under each target, a few over, so the budget filter has
 * something to bite on and so the screens can be looked at. They are not quoted
 * numbers. Replace them from the pool admin (ILC Admin → Decorative Options)
 * before anyone outside ILC sees a survey.
 *
 * dnPrice is deliberately left empty. Buy prices get typed in by a person who
 * has the real sheet in front of them; nothing is invented here.
 *
 * ── What it does ────────────────────────────────────────────────────────────
 * Idempotent. An option is identified by (category, bodyKey), so re-running
 * updates the body and its finishes rather than making a second copy. It never
 * deletes anything, retiring an option is isActive: false, done from the admin
 * screen, and this script will not undo that.
 *
 * Run: node --env-file=.env scripts/seed-decorative-options.mjs
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/** The finish set. Fans are the exception, they are normally white. */
const F = (finishKey, cnPrice, isDefault = false) => ({ finishKey, cnPrice, isDefault });

const POOL = [
  // ── P1 · kitchen island pendants ──────────────────────────────────────────
  // Targets run from about $40 each (three smalls, low finish) to $275 (one
  // large), so the pool has to cover that whole spread.
  { category: 'p1', bodyKey: 'mini-glass-cone', name: 'Mini glass cone pendant',
    shape: 'round', style: 'modern', dimLabel: '4in dia x 7in H', sortOrder: 2,
    finishes: [F('matte_black', 28, true), F('brushed_nickel', 28)] },
  { category: 'p1', bodyKey: 'mini-metal-dome', name: 'Mini metal dome pendant',
    shape: 'round', style: 'industrial', dimLabel: '5in dia x 6in H', sortOrder: 4,
    finishes: [F('matte_black', 34, true), F('white', 34), F('bronze', 34)] },
  { category: 'p1', bodyKey: 'small-clear-cylinder', name: 'Small clear cylinder pendant',
    shape: 'round', style: 'modern', dimLabel: '4in dia x 10in H', sortOrder: 6,
    finishes: [F('brushed_nickel', 40, true), F('matte_black', 40)] },
  { category: 'p1', bodyKey: 'small-round-glass', name: 'Small round glass pendant',
    shape: 'round', style: 'modern', dimLabel: '5in dia x 9in H', sortOrder: 10,
    finishes: [F('matte_black', 45, true), F('brushed_nickel', 45), F('aged_brass', 58)] },
  { category: 'p1', bodyKey: 'small-metal-cone', name: 'Small metal cone pendant',
    shape: 'round', style: 'industrial', dimLabel: '6in dia x 8in H', sortOrder: 20,
    finishes: [F('matte_black', 52, true), F('bronze', 52), F('white', 52)] },
  { category: 'p1', bodyKey: 'clear-globe', name: 'Clear globe pendant',
    shape: 'globe', style: 'transitional', dimLabel: '8in dia x 10in H', sortOrder: 30,
    finishes: [F('brushed_nickel', 95, true), F('matte_black', 95), F('aged_brass', 112)] },
  { category: 'p1', bodyKey: 'seeded-schoolhouse', name: 'Seeded glass schoolhouse pendant',
    shape: 'globe', style: 'farmhouse', dimLabel: '9in dia x 12in H', sortOrder: 40,
    finishes: [F('bronze', 120, true), F('matte_black', 120), F('aged_brass', 138)] },
  { category: 'p1', bodyKey: 'medium-drum', name: 'Medium drum pendant',
    shape: 'drum', style: 'transitional', dimLabel: '12in dia x 11in H', sortOrder: 50,
    finishes: [F('brushed_nickel', 165, true), F('matte_black', 165), F('aged_brass', 186)] },
  { category: 'p1', bodyKey: 'caged-lantern', name: 'Caged lantern pendant',
    shape: 'lantern', style: 'industrial', dimLabel: '10in sq x 16in H', sortOrder: 60,
    finishes: [F('matte_black', 185, true), F('bronze', 185)] },
  { category: 'p1', bodyKey: 'large-dome', name: 'Large dome pendant',
    shape: 'round', style: 'modern', dimLabel: '16in dia x 13in H', sortOrder: 70,
    finishes: [F('matte_black', 260, true), F('white', 260), F('aged_brass', 295)] },
  { category: 'p1', bodyKey: 'linear-3-light', name: '3-light linear pendant',
    shape: 'linear', style: 'modern', dimLabel: '30in W x 6in H', sortOrder: 80,
    finishes: [F('matte_black', 240, true), F('brushed_nickel', 240), F('aged_brass', 268)] },

  // ── V1 · bath vanity ──────────────────────────────────────────────────────
  // Damp rated, every one of them. The low-finish target is the $45 bath bar
  // credit, so the cheapest bodies have to sit under that or the category
  // comes up empty on a value job.
  { category: 'v1', bodyKey: 'bath-bar-1', name: '1-light bath sconce',
    shape: 'bar', style: 'modern', dimLabel: '5in W x 9in H', dampRated: true, sortOrder: 2,
    finishes: [F('brushed_nickel', 29, true), F('chrome', 29), F('matte_black', 29)] },
  { category: 'v1', bodyKey: 'bath-bar-2-glass', name: '2-light glass bath bar',
    shape: 'bar', style: 'transitional', dimLabel: '16in W x 6in H', dampRated: true, sortOrder: 4,
    finishes: [F('chrome', 44, true), F('brushed_nickel', 44)] },
  { category: 'v1', bodyKey: 'bath-bar-2', name: '2-light bath bar',
    shape: 'bar', style: 'modern', dimLabel: '14in W x 5in H', dampRated: true, sortOrder: 10,
    finishes: [F('brushed_nickel', 38, true), F('matte_black', 38), F('chrome', 38)] },
  { category: 'v1', bodyKey: 'bath-bar-3', name: '3-light bath bar',
    shape: 'bar', style: 'transitional', dimLabel: '22in W x 6in H', dampRated: true, sortOrder: 20,
    finishes: [F('brushed_nickel', 58, true), F('matte_black', 58), F('aged_brass', 72)] },
  { category: 'v1', bodyKey: 'bath-bar-4-glass', name: '4-light glass bath bar',
    shape: 'bar', style: 'traditional', dimLabel: '30in W x 8in H', dampRated: true, sortOrder: 30,
    finishes: [F('chrome', 96, true), F('brushed_nickel', 96), F('bronze', 108)] },
  { category: 'v1', bodyKey: 'vanity-sconce-pair', name: 'Vanity sconce, pair',
    shape: 'bar', style: 'transitional', dimLabel: '5in W x 11in H each', dampRated: true, sortOrder: 40,
    finishes: [F('matte_black', 130, true), F('aged_brass', 145), F('chrome', 130)] },
  { category: 'v1', bodyKey: 'led-mirror-24', name: '24in LED illuminated mirror',
    shape: 'mirror', style: 'modern', dimLabel: '24in W x 32in H', dampRated: true, sortOrder: 50,
    finishes: [F('white', 168, true)] },
  { category: 'v1', bodyKey: 'led-mirror-round-28', name: '28in round lighted mirror',
    shape: 'mirror', style: 'modern', dimLabel: '28in dia', dampRated: true, sortOrder: 60,
    finishes: [F('white', 180, true), F('matte_black', 196)] },
  { category: 'v1', bodyKey: 'led-mirror-30', name: '30in LED illuminated mirror',
    shape: 'mirror', style: 'modern', dimLabel: '30in W x 36in H', dampRated: true, sortOrder: 70,
    finishes: [F('white', 210, true)] },
  { category: 'v1', bodyKey: 'led-mirror-36-backlit', name: '36in backlit LED mirror',
    shape: 'mirror', style: 'modern', dimLabel: '36in W x 36in H', dampRated: true, sortOrder: 80,
    finishes: [F('white', 245, true)] },

  // ── EW1 · balcony sconce ──────────────────────────────────────────────────
  // A balcony is outdoors. Every one of these is wet rated; anything that is
  // not never reaches the survey.
  { category: 'ew1', bodyKey: 'outdoor-disk-wall', name: 'Outdoor disk wall light',
    shape: 'round', style: 'modern', dimLabel: '5in dia x 2in D', projectionIn: 2, wetRated: true, sortOrder: 2,
    finishes: [F('matte_black', 36, true), F('bronze', 36), F('white', 36)] },
  { category: 'ew1', bodyKey: 'outdoor-cylinder-mini', name: 'Mini outdoor cylinder',
    shape: 'round', style: 'modern', dimLabel: '3in dia x 7in H', projectionIn: 3, wetRated: true, sortOrder: 4,
    finishes: [F('matte_black', 54, true), F('bronze', 54)] },
  { category: 'ew1', bodyKey: 'outdoor-box-small', name: 'Small outdoor box sconce',
    shape: 'bar', style: 'modern', dimLabel: '4in W x 8in H', projectionIn: 4, wetRated: true, sortOrder: 10,
    finishes: [F('matte_black', 48, true), F('bronze', 48)] },
  { category: 'ew1', bodyKey: 'outdoor-cylinder-down', name: 'Outdoor downlight cylinder',
    shape: 'round', style: 'modern', dimLabel: '4in dia x 9in H', projectionIn: 4.5, wetRated: true, sortOrder: 20,
    finishes: [F('matte_black', 62, true), F('bronze', 62), F('white', 62)] },
  { category: 'ew1', bodyKey: 'outdoor-cylinder-updown', name: 'Outdoor up/down cylinder',
    shape: 'round', style: 'modern', dimLabel: '4in dia x 10in H', projectionIn: 4.5, wetRated: true, sortOrder: 30,
    finishes: [F('matte_black', 88, true), F('bronze', 88)] },
  { category: 'ew1', bodyKey: 'outdoor-half-moon', name: 'Outdoor half-moon wall light',
    shape: 'round', style: 'transitional', dimLabel: '7in W x 5in H', projectionIn: 3.5, wetRated: true, sortOrder: 40,
    finishes: [F('matte_black', 112, true), F('bronze', 112), F('aged_brass', 128)] },
  { category: 'ew1', bodyKey: 'outdoor-lantern-small', name: 'Small outdoor wall lantern',
    shape: 'lantern', style: 'traditional', dimLabel: '6in W x 14in H', projectionIn: 7, wetRated: true, sortOrder: 50,
    finishes: [F('bronze', 135, true), F('matte_black', 135)] },
  { category: 'ew1', bodyKey: 'outdoor-lantern-caged', name: 'Caged outdoor lantern',
    shape: 'lantern', style: 'farmhouse', dimLabel: '7in W x 16in H', projectionIn: 8, wetRated: true, sortOrder: 60,
    finishes: [F('matte_black', 175, true), F('aged_brass', 198)] },
  { category: 'ew1', bodyKey: 'outdoor-seeded-globe', name: 'Outdoor seeded globe sconce',
    shape: 'globe', style: 'transitional', dimLabel: '8in dia x 12in H', projectionIn: 9, wetRated: true, sortOrder: 70,
    finishes: [F('aged_brass', 225, true), F('matte_black', 225)] },
  { category: 'ew1', bodyKey: 'outdoor-architectural-bar', name: 'Architectural outdoor bar',
    shape: 'linear', style: 'modern', dimLabel: '24in W x 3in H', projectionIn: 3, wetRated: true, sortOrder: 80,
    finishes: [F('matte_black', 305, true)] },

  // ── W1 · unit entry sconce ────────────────────────────────────────────────
  // The projection figures are the point of this list. If the sconce mounts at
  // or below 6'-8", anything over 4in reaches into the corridor and the filter
  // takes it away. Half this pool sits either side of that line on purpose.
  { category: 'w1', bodyKey: 'entry-mini-square', name: 'Mini flush square sconce',
    shape: 'bar', style: 'modern', dimLabel: '4in sq x 2.5in D', projectionIn: 2.5, sortOrder: 2,
    finishes: [F('matte_black', 38, true), F('white', 38), F('brushed_nickel', 38)] },
  { category: 'w1', bodyKey: 'entry-slim-flat', name: 'Slim flat wall sconce',
    shape: 'linear', style: 'modern', dimLabel: '12in W x 3in D', projectionIn: 3, sortOrder: 4,
    finishes: [F('matte_black', 54, true), F('brushed_nickel', 54)] },
  { category: 'w1', bodyKey: 'entry-flush-square', name: 'Flush square sconce',
    shape: 'bar', style: 'modern', dimLabel: '5in sq x 3in D', projectionIn: 3, sortOrder: 10,
    finishes: [F('matte_black', 48, true), F('brushed_nickel', 48), F('white', 48)] },
  { category: 'w1', bodyKey: 'entry-slim-cylinder', name: 'Slim up/down cylinder',
    shape: 'round', style: 'modern', dimLabel: '3in dia x 10in H', projectionIn: 3.5, sortOrder: 20,
    finishes: [F('matte_black', 78, true), F('bronze', 78)] },
  { category: 'w1', bodyKey: 'entry-tapered-shade', name: 'Tapered shade sconce',
    shape: 'drum', style: 'transitional', dimLabel: '6in W x 9in H', projectionIn: 4, sortOrder: 30,
    finishes: [F('brushed_nickel', 95, true), F('matte_black', 95), F('aged_brass', 110)] },
  { category: 'w1', bodyKey: 'entry-half-moon', name: 'Half-moon wall light',
    shape: 'round', style: 'transitional', dimLabel: '7in W x 5in H', projectionIn: 4.5, sortOrder: 40,
    finishes: [F('matte_black', 115, true), F('aged_brass', 132)] },
  { category: 'w1', bodyKey: 'entry-wall-lantern', name: 'Wall lantern',
    shape: 'lantern', style: 'traditional', dimLabel: '6in W x 15in H', projectionIn: 6.5, sortOrder: 50,
    finishes: [F('bronze', 140, true), F('matte_black', 140)] },
  { category: 'w1', bodyKey: 'entry-swing-arm', name: 'Swing-arm sconce',
    shape: 'bar', style: 'traditional', dimLabel: '9in projection x 12in H', projectionIn: 9, sortOrder: 60,
    finishes: [F('aged_brass', 165, true), F('bronze', 165)] },
  { category: 'w1', bodyKey: 'entry-unit-number', name: 'Integrated unit number light',
    shape: 'bar', style: 'modern', dimLabel: '5in W x 10in H', projectionIn: 2.5, sortOrder: 70,
    finishes: [F('matte_black', 195, true), F('brushed_nickel', 195)] },
  { category: 'w1', bodyKey: 'entry-deep-drum', name: 'Deep drum wall sconce',
    shape: 'drum', style: 'transitional', dimLabel: '10in dia x 8in H', projectionIn: 7, sortOrder: 80,
    finishes: [F('aged_brass', 280, true), F('matte_black', 280)] },

  // ── F1 · ceiling fan with light kit ───────────────────────────────────────
  // The target is one figure off the master sheet, the same for every fan on
  // the job, so this pool straddles it rather than laddering.
  { category: 'f1', bodyKey: 'fan-42-hugger', name: '42in hugger fan with light',
    style: 'modern', dimLabel: '42in span', bladeSpanIn: 42, sortOrder: 10,
    finishes: [F('white', 128, true), F('brushed_nickel', 136)] },
  { category: 'f1', bodyKey: 'fan-52-hugger', name: '52in hugger fan with light',
    style: 'transitional', dimLabel: '52in span', bladeSpanIn: 52, sortOrder: 20,
    finishes: [F('white', 132, true), F('brushed_nickel', 140), F('bronze', 140)] },
  { category: 'f1', bodyKey: 'fan-52-5blade', name: '52in 5-blade fan with light',
    style: 'traditional', dimLabel: '52in span', bladeSpanIn: 52, sortOrder: 30,
    finishes: [F('white', 140, true), F('bronze', 148)] },
  { category: 'f1', bodyKey: 'fan-44-3blade', name: '44in 3-blade fan with light',
    style: 'modern', dimLabel: '44in span', bladeSpanIn: 44, sortOrder: 40,
    finishes: [F('white', 155, true), F('matte_black', 162)] },
  { category: 'f1', bodyKey: 'fan-52-3blade', name: '52in 3-blade fan with light',
    style: 'modern', dimLabel: '52in span', bladeSpanIn: 52, sortOrder: 50,
    finishes: [F('white', 165, true), F('matte_black', 172), F('brushed_nickel', 172)] },
  { category: 'f1', bodyKey: 'fan-60-3blade', name: '60in 3-blade fan with light',
    style: 'modern', dimLabel: '60in span', bladeSpanIn: 60, sortOrder: 60,
    finishes: [F('white', 195, true), F('matte_black', 205)] },
  { category: 'f1', bodyKey: 'fan-52-caged', name: '52in caged farmhouse fan with light',
    style: 'farmhouse', dimLabel: '52in span', bladeSpanIn: 52, sortOrder: 70,
    finishes: [F('matte_black', 210, true), F('bronze', 210)] },
  { category: 'f1', bodyKey: 'fan-56-dc', name: '56in DC-motor fan with light',
    style: 'modern', dimLabel: '56in span', bladeSpanIn: 56, sortOrder: 80,
    finishes: [F('white', 235, true), F('matte_black', 246)] },
];

async function main() {
  let bodiesAdded = 0, bodiesUpdated = 0, finishesWritten = 0;

  for (const row of POOL) {
    const { finishes, ...body } = row;
    const data = {
      shape: '', style: '', dimLabel: '',
      projectionIn: null, bladeSpanIn: null,
      wetRated: false, dampRated: false,
      ...body,
    };

    const existing = await prisma.decorativeOption.findFirst({
      where: { category: data.category, bodyKey: data.bodyKey },
      select: { id: true },
    });

    let optionId;
    if (existing) {
      // isActive is left alone on purpose, somebody may have retired this one.
      await prisma.decorativeOption.update({ where: { id: existing.id }, data });
      optionId = existing.id;
      bodiesUpdated++;
    } else {
      const created = await prisma.decorativeOption.create({ data });
      optionId = created.id;
      bodiesAdded++;
    }

    for (const f of finishes) {
      // dnPrice is never written here. A real buy price gets typed in by a
      // person with the sheet in front of them.
      await prisma.decorativeOptionFinish.upsert({
        where: { optionId_finishKey: { optionId, finishKey: f.finishKey } },
        create: { optionId, finishKey: f.finishKey, cnPrice: f.cnPrice, isDefault: !!f.isDefault },
        update: { cnPrice: f.cnPrice, isDefault: !!f.isDefault },
      });
      finishesWritten++;
    }
  }

  const byCategory = await prisma.decorativeOption.groupBy({
    by: ['category'],
    _count: { _all: true },
  });

  console.log(`Decorative pool seeded. ${bodiesAdded} added, ${bodiesUpdated} updated, ${finishesWritten} finishes written.`);
  for (const c of byCategory.sort((a, b) => a.category.localeCompare(b.category))) {
    console.log(`  ${c.category.padEnd(4)} ${c._count._all}`);
  }
  console.log('\nThe cnPrice figures are placeholders. Replace them from the pool admin');
  console.log('before a survey goes to anybody outside ILC.');
}

main()
  .catch(e => { console.error(e); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); process.exit(process.exitCode || 0); });
