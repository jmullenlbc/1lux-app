const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const { seedMasterTypes }      = require('./seeds/masterTypes');
const { seedILCSpecs }         = require('./seeds/ilcSpecs');
const { seedProposalDefaults } = require('./seeds/proposalDefaults');
const { TEMPLATES_BY_SECTION }  = require('./seeds/dashboardTemplates');

// ── Universal dashboard defaults ──────────────────────────────────────────────
// Create the admin-default dashboard per section (Main / Sales / Pre-Con) with
// its template widgets — only if one doesn't already exist, so we never clobber
// a default an admin has since customized. Idempotent: safe on every deploy.
async function seedDashboards(prisma, createdById) {
  if (!prisma.dashboard) { console.log('⚠ Dashboards: prisma.dashboard not in schema — skipping'); return; }
  const SECTION_NAME = { MAIN: 'Main Dashboard', SALES: 'Sales Dashboard', BUDGET: 'Pre-Con Dashboard' };
  let created = 0;
  for (const [section, templates] of Object.entries(TEMPLATES_BY_SECTION)) {
    const existing = await prisma.dashboard.findFirst({ where: { section, ownerUserId: null, isDefault: true } });
    if (existing) continue;
    await prisma.dashboard.create({
      data: {
        name: SECTION_NAME[section] || `${section} Dashboard`, section, createdById,
        isDefault: true, ownerUserId: null,
        widgets: {
          create: templates.map((t, i) => ({
            name: t.name, chartType: t.chartType || 'BAR', width: t.width || 'HALF', position: i,
            dataSpec: JSON.stringify(t.dataSpec || {}),
            category: 'FIELD', metric: 'custom', viewBy: 'none', filters: '[]', // inert legacy NOT-NULL cols
          })),
        },
      },
    });
    created++;
  }
  console.log(`✓ Dashboard defaults ready (${created} created, ${Object.keys(TEMPLATES_BY_SECTION).length - created} already present)`);
}

const prisma = new PrismaClient();

const ADMINS = [
  { email: 'admin@ilcstudios.com',      name: 'ILC Admin',    password: 'ILCadmin2024!'    },
  { email: 'mike@ilcstudios.com',       name: 'Mike Kershner', password: 'ILCstudios2024!' },
  { email: 'operations@ilcstudios.com', name: 'Sean Bothe',    password: 'TempChangeMe2026!' },
];

// ── Knowledge Base categories ─────────────────────────────────────────────────
// Seeded once; users can add/edit/delete via the UI after this.
// isBuiltIn entries (UNCATEGORIZED) can never be deleted through the UI.

const KB_CATEGORIES = [
  { key: 'UNIT',         label: 'Unit',          desc: 'Fixture layout & spacing within residential units',        color: 'blue',   icon: '🏠', position: 0 },
  { key: 'CORRIDOR',     label: 'Corridor',       desc: 'Hallway fixture placement, alignment & spacing',           color: 'violet', icon: '🚶', position: 1 },
  { key: 'BOH',          label: 'Back of House',  desc: 'Utility, storage, mechanical & service area standards',    color: 'slate',  icon: '🏭', position: 2 },
  { key: 'GARAGE',       label: 'Garage',         desc: 'Parking structure spacing, mounting & fixture selection',  color: 'orange', icon: '🚗', position: 3 },
  { key: 'EXTERIOR',     label: 'Exterior',       desc: 'Site lighting, walkways, area & landscape standards',      color: 'green',  icon: '🌿', position: 4 },
  { key: 'CONTROLS',     label: 'Controls',       desc: 'Control intent narratives, sensor rules & dimming',        color: 'indigo', icon: '💡', position: 5 },
  { key: 'FIXTURE_SPEC', label: 'Fixture Specs',  desc: 'ILC standard product selections by space type',           color: 'amber',  icon: '🔦', position: 6 },
  { key: 'QC',           label: 'QC Process',     desc: 'Quality control checklists & review procedures',          color: 'rose',   icon: '✅', position: 7 },
  { key: 'DIMMING',      label: 'Dimming',        desc: 'Dimming standards, percentages & driver requirements',    color: 'cyan',   icon: '🎚️', position: 8 },
  { key: 'PHOTOMETRICS', label: 'Photometrics',   desc: 'Calculation standards, software settings & deliverables', color: 'teal',   icon: '📐', position: 9 },
  { key: 'REVIT',        label: 'Revit',          desc: 'Revit model setup, BIM 360 workflows & project procedures', color: 'sky',  icon: '🏗️', position: 10 },
  { key: 'UNCATEGORIZED', label: 'Uncategorized', desc: 'Standards not yet assigned to a category',               color: 'slate',  icon: '📁', position: 999, isBuiltIn: true },
];

// ── Knowledge Base seed entries ───────────────────────────────────────────────
// Stable IDs make every upsert idempotent — safe to run on every deploy.
// To hide an entry without deleting it, set isActive: false in the update block.

const KB_ENTRIES = [
  {
    id: 'kb-seed-revit-model-setup',
    category: 'REVIT',
    title: 'Setting Up a Revit Model',
    severity: 'REQUIRED',
    tags: JSON.stringify(['Revit', 'BIM 360', 'Model Setup', 'Worksets']),
    sourceUrl: null,
    content: `<h2>1. Create Project in BIM 360</h2>
<ul>
  <li>If internal model: Project Admin → Add Project → Activate Model → Add Users</li>
  <li>Add Arch models to BIM 360:
    <ul>
      <li>Open Arch's model in Revit</li>
      <li>Go to <strong>Collaboration</strong> tab → <em>Collaborate in Cloud</em></li>
      <li>Navigate to the appropriate project folder</li>
    </ul>
  </li>
</ul>
<h2>2. Create Project in Revit</h2>
<ul>
  <li>New Project from Template</li>
  <li>Navigate to the <strong>3 – REVIT</strong> folder on the drive (SOFTWARE folder)</li>
  <li>Use the most current model — current version shown in parentheses after the year</li>
  <li>Floor Plan Level 1 → delete everything except the Section and Elevation</li>
  <li>Ceiling Plan Level 1 → delete everything except the Section and Elevation</li>
</ul>
<h2>3. Link the Arch Model</h2>
<ul>
  <li>Manage tab → <strong>Manage Links</strong> → Insert Revit Links from BIM 360</li>
  <li>Positioning: <em>Auto – By Shared Coordinates</em></li>
</ul>
<h2>4. Save the Model</h2>
<ul>
  <li>Collaborate tab → Save Model as <strong>Base Model</strong> in the project folder</li>
  <li>Save to the cloud: navigate to the project folder in BIM 360</li>
  <li>Save model in the <strong>Lighting</strong> folder</li>
</ul>
<h2>5. Create Worksets</h2>
<ul>
  <li>Revit Links</li>
  <li>Hidden Controls</li>
  <li>Hidden Photometrics</li>
</ul>
<h2>6. Copy/Monitor Levels &amp; Grids</h2>
<ul>
  <li>Move Section and Elevation to be in view of the linked model</li>
  <li>Elevation view → select link → move to the <em>Revit Link</em> workset</li>
  <li>Collaborate tab → <strong>Copy/Monitor</strong> → Copy → select levels needed → Finish</li>
  <li>Verify new levels exist; delete existing Level 1 from template if still present</li>
  <li>Collaborate tab → Copy/Monitor → Copy → select grids as needed</li>
  <li>Select all grids and levels → move to <strong>Shared Levels and Grids</strong> workset</li>
  <li>View → Plan Views → Ceiling Plan → select all views to create</li>
  <li>Go to base level, Copy Monitor all other grids → move to Shared Levels workset</li>
</ul>
<h2>7. Set Up Views</h2>
<ul>
  <li>Apply <strong>Lighting Plans view template</strong> to all views; clean up views</li>
  <li>Adjust view plane on each view as needed (Associated Level)</li>
  <li>Tag rooms</li>
  <li>Delete all extra sheets not in use</li>
  <li>Rename views to match Architectural view names — <em>do not rename the Level, only the View</em></li>
  <li>Can also use <strong>DiRoots – View Manager</strong> for bulk renaming</li>
</ul>
<h2>8. Set Up First Sheet</h2>
<ul>
  <li>Open Arch model → select Sheet → Edit Family → add ILC logo → load into new project</li>
  <li>Apply new sheet to Luminaire sheet</li>
  <li>Match sheet naming conventions with the Arch</li>
  <li>Add sheet notes to each sheet</li>
</ul>
<h2>9. Create Unit Typicals</h2>
<ul>
  <li>Open Arch model and locate where typicals are positioned</li>
  <li>Duplicate view with detailing that contains the typical</li>
  <li>Crop view to show only the typical</li>
</ul>
<h2>10. Fixture Standards</h2>
<h3>Closet Lights</h3>
<ul>
  <li><strong>"S" type linear</strong> for ceiling mounted</li>
  <li><strong>"W" type linear</strong> for wall mounted</li>
  <li>Show correct linear length</li>
  <li>Use porcelain socket and lamp for cost-effective solution — EC to provide; check with Procurement on purchasing</li>
</ul>
<h3>Wall Mounts</h3>
<ul>
  <li>All decorative and vanity lights → use <strong>Vanity</strong> symbol</li>
  <li>All architectural linears mounted to wall → use <strong>Linear</strong> symbol</li>
</ul>
<h3>Dimensions</h3>
<ul>
  <li>Half-tone</li>
  <li>Pull dimensions to outside if possible, or dimension off of corners</li>
  <li>Be consistent with dimensioning across the project</li>
</ul>
<h3>Tape</h3>
<ul>
  <li>Around a curved section: keep lengths consistent</li>
  <li>Uncheck <em>Left and Right End Visible</em></li>
</ul>
<h2>11. Final Step</h2>
<ul>
  <li>Verify updated phases in <strong>Trackvia</strong> after submissions: Project Page → Projects → Active → Phase</li>
</ul>`,
  },
];

// ── Roadmap priorities ────────────────────────────────────────────────────────
// Stable slug IDs → re-seeding never clobbers Mike's reordering or status changes.

const ROADMAP_PRIORITIES = [
  { id: 'bid-matrix',    name: 'Bid Matrix',                          status: 'done', sortOrder: 0  },
  { id: 'concept-q',     name: 'Conceptual questionnaire',            status: 'wip',  sortOrder: 1  },
  { id: 'design-q',      name: 'Design questionnaire',                status: 'wip',  sortOrder: 2  },
  { id: 'project-data',  name: 'Project data',                        status: 'done', sortOrder: 3  },
  { id: 'client-data',   name: 'Client data',                         status: 'done', sortOrder: 4  },
  { id: 'sales-pipe',    name: 'Sales pipeline',                      status: 'done', sortOrder: 5  },
  { id: 'sales-dash',    name: 'Sales dashboard',                     status: 'wip',  sortOrder: 6  },
  { id: 'sales-notes',   name: 'Sales notes',                         status: 'done', sortOrder: 7  },
  { id: 'sales-auto',    name: 'Sales automation',                    status: 'wip',  sortOrder: 8  },
  { id: 'sales-bot',     name: 'Sales bot queue',                     status: 'wip',  sortOrder: 9  },
  { id: 'meeting-notes', name: 'Project meeting notes',               status: 'done', sortOrder: 10 },
  { id: 'ai-chat',       name: 'Full platform AI chat bot',           status: 'todo', sortOrder: 11 },
  { id: 'main-dash',     name: 'Main dashboard',                      status: 'todo', sortOrder: 12 },
  { id: 'email-parse',   name: 'Email parsing & tagging',             status: 'todo', sortOrder: 13 },
  { id: 'submittal',     name: 'Submittal parsing & tracker',         status: 'wip',  sortOrder: 14 },
  { id: 'ship-sched',    name: 'Ship schedule',                       status: 'done', sortOrder: 15 },
  { id: 'change-orders', name: 'Change orders',                       status: 'done', sortOrder: 16 },
  { id: 'portal',        name: 'Client portal',                       status: 'done', sortOrder: 17 },
  { id: 'alt-spec',      name: 'Fixture sched + alternate spec tool', status: 'todo', sortOrder: 18 },
  { id: 'drawing',       name: 'Drawing markup tool',                 status: 'wip',  sortOrder: 19 },
  { id: 'rfi',           name: 'RFI module',                          status: 'done', sortOrder: 20 },
];

async function main() {
  // ── Admin users ──────────────────────────────────────────────────────────────
  for (const admin of ADMINS) {
    const passwordHash = await bcrypt.hash(admin.password, 10);
    const user = await prisma.user.upsert({
      where:  { email: admin.email },
      update: { role: 'ILC_ADMIN' },  // always ensure admin role is correct
      create: {
        email: admin.email,
        name:  admin.name,
        passwordHash,
        role: 'ILC_ADMIN',
        mustChangePassword: false,
      },
    });
    console.log('✓ Admin user ready:', user.email);
  }

  // ── Knowledge Base categories ────────────────────────────────────────────────
  // Defensive: skip if the model isn't in schema yet (WIP feature per Mike).
  // Without this guard the seed crashes and every Amplify build fails.
  if (prisma.kbCategory) {
    for (const cat of KB_CATEGORIES) {
      await prisma.kbCategory.upsert({
        where:  { key: cat.key },
        update: {}, // never overwrite user customisations after first seed
        create: { key: cat.key, label: cat.label, desc: cat.desc, color: cat.color, icon: cat.icon, position: cat.position, isBuiltIn: cat.isBuiltIn ?? false },
      });
    }
    console.log(`✓ KB categories ready (${KB_CATEGORIES.length})`);
  } else {
    console.log('⚠ KB categories: prisma.kbCategory not in schema — skipping');
  }

  // ── Knowledge Base entries ───────────────────────────────────────────────────
  // Get any ILC_ADMIN to use as createdById
  const adminUser = await prisma.user.findFirst({
    where: { role: { in: ['ILC_ADMIN', 'SUPER_ADMIN'] } },
  });

  if (adminUser && prisma.designStandard) {
    for (const entry of KB_ENTRIES) {
      const { id, ...data } = entry;
      await prisma.designStandard.upsert({
        where:  { id },
        update: { title: data.title, content: data.content, tags: data.tags, severity: data.severity },
        create: { id, ...data, isActive: true, createdById: adminUser.id },
      });
      console.log('✓ KB entry ready:', entry.title);
    }
  } else if (!prisma.designStandard) {
    console.log('⚠ KB entries: prisma.designStandard not in schema — skipping');
  }

  // ── Master Types ─────────────────────────────────────────────────────────────
  if (prisma.masterType) {
    await seedMasterTypes(prisma);
  } else {
    console.log('⚠ Master types: prisma.masterType not in schema — skipping');
  }

  // ── ILC Specs ────────────────────────────────────────────────────────────────
  if (prisma.iLCSpec) {
    await seedILCSpecs(prisma);
  } else {
    console.log('⚠ ILC specs: prisma.iLCSpec not in schema — skipping');
  }

  // ── Proposal Rates + Default Templates ───────────────────────────────────────
  await seedProposalDefaults(prisma, adminUser.id);

  // ── Roadmap priorities ───────────────────────────────────────────────────────
  if (prisma.roadmapPriority) {
    for (const p of ROADMAP_PRIORITIES) {
      await prisma.roadmapPriority.upsert({
        where:  { id: p.id },
        update: {}, // never overwrite Mike's reordering or status changes
        create: { id: p.id, name: p.name, status: p.status, sortOrder: p.sortOrder },
      });
    }
    console.log(`✓ Roadmap priorities ready (${ROADMAP_PRIORITIES.length})`);
  } else {
    console.log('⚠ Roadmap priorities: prisma.roadmapPriority not in schema — skipping');
  }

  // ── Universal dashboard defaults (Main / Sales / Pre-Con) ────────────────────
  await seedDashboards(prisma, adminUser.id);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
