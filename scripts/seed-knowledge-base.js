// Run with: node scripts/seed-knowledge-base.js
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const STANDARDS = [
  // ── UNIT ──────────────────────────────────────────────────────────────────
  { category: 'UNIT', severity: 'REQUIRED',    title: 'Default Disk Size',
    content: 'Use 7" disks in all units as the standard starting point. Moving forward, 7" is the default for both units and corridors.',
    tags: JSON.stringify(['disk', 'fixture-spec', 'units']) },

  { category: 'UNIT', severity: 'REQUIRED',    title: 'Spacing With Under-Cabinet Lighting',
    content: 'With under-cabinet lighting present: space disk fixtures 6–7\' apart.',
    tags: JSON.stringify(['spacing', 'under-cabinet']) },

  { category: 'UNIT', severity: 'REQUIRED',    title: 'Spacing Without Under-Cabinet Lighting',
    content: 'Without under-cabinet lighting: space disk fixtures 4–5\' apart.',
    tags: JSON.stringify(['spacing', 'under-cabinet']) },

  { category: 'UNIT', severity: 'NOTE',        title: 'Washer/Dryer Calc Procedure',
    content: 'For non-stacked washer/dryer alcoves: run one calculation with the disk inside the space (points at top of W/D), then run a second calc with the disk just outside the space. Use the better-performing layout.',
    tags: JSON.stringify(['calc', 'washer-dryer', 'photometrics']) },

  { category: 'UNIT', severity: 'NOTE',        title: 'Walk-In Closet Sizing',
    content: 'Walk-in closets: use 7" Contour Disk as standard. Reference ILC\'s standard closet-size photometric calcs (two or three size templates) to confirm fixture count.',
    tags: JSON.stringify(['closet', 'wic', 'photometrics']) },

  // ── CORRIDOR ──────────────────────────────────────────────────────────────
  { category: 'CORRIDOR', severity: 'REQUIRED', title: 'End Wall & Door Clearance',
    content: 'Locate the first and last fixture 3\' from end walls or doors. This applies to all corridor runs.',
    tags: JSON.stringify(['spacing', 'placement', 'end-wall']) },

  { category: 'CORRIDOR', severity: 'REQUIRED', title: 'Alignment Across Intersections',
    content: 'Where corridors meet or intersect, line all fixtures up across the intersection. Space fixtures equally from the intersection point to the end of each hall.',
    tags: JSON.stringify(['alignment', 'intersection', 'spacing']) },

  { category: 'CORRIDOR', severity: 'REQUIRED', title: 'Intersection Centering',
    content: 'Place one fixture centered at each hallway intersection. Space remaining fixtures between that centered fixture and the end-of-hall fixture as close to the target spacing as possible.',
    tags: JSON.stringify(['intersection', 'centering', 'spacing']) },

  { category: 'CORRIDOR', severity: 'REQUIRED', title: 'Ceiling Height Drives Spacing',
    content: 'Use ILC standard photometrics to determine fixture diameter and spacing based on the corridor ceiling height. Do not use a fixed rule — run the calc for each ceiling height variant.',
    tags: JSON.stringify(['photometrics', 'ceiling-height', 'spacing']) },

  // ── BOH ───────────────────────────────────────────────────────────────────
  { category: 'BOH', severity: 'REQUIRED', title: 'Small Room Strip Sizing',
    content: 'Rooms under 6\'×6\': use (1) 4\' strip. Rooms under 3\'×3\': use (1) 2\' strip.',
    tags: JSON.stringify(['small-room', 'strip', 'sizing']) },

  { category: 'BOH', severity: 'REQUIRED', title: 'Standard Strip Spacing',
    content: 'Larger rooms: use 4\' or 8\' strips as best fit. Typical spacing is 10\' between fixtures. No fixture farther than 5\' from end walls.',
    tags: JSON.stringify(['spacing', 'strip', 'standard']) },

  { category: 'BOH', severity: 'REQUIRED', title: 'Narrow Long Room Layout',
    content: 'For narrow but long rooms: locate end fixtures 5\' from the walls and space remaining fixtures to achieve 8–12\' spacing throughout.',
    tags: JSON.stringify(['narrow', 'long-room', 'spacing']) },

  { category: 'BOH', severity: 'REQUIRED', title: 'Sensor Control by Room Type',
    content: 'Storage rooms: must have vacancy sensor switches. Electrical, mechanical, and other utility rooms: on/off switch only (no sensor required).',
    tags: JSON.stringify(['controls', 'sensor', 'vacancy', 'storage']) },

  // ── GARAGE ────────────────────────────────────────────────────────────────
  { category: 'GARAGE', severity: 'REQUIRED', title: 'Standard Spacing Rule',
    content: 'ILC standard garage fixture: ~25\'–30\' on-center at 8\'–9\' mounting height. All garages must be calculated — use this as the starting layout, not a final answer.',
    tags: JSON.stringify(['spacing', 'mounting-height', 'standard']) },

  { category: 'GARAGE', severity: 'REQUIRED', title: 'Wall Clearance',
    content: 'Locate fixtures no closer than 4\' from any wall, and no farther than 10\' from any wall.',
    tags: JSON.stringify(['placement', 'wall-clearance']) },

  { category: 'GARAGE', severity: 'REQUIRED', title: 'Open-Side Garage Fixture',
    content: 'If the garage has open side walls (not fully enclosed), the ILC standard fixture will cause visible glare off-property. Use Acuity VCPG for these garages instead.',
    tags: JSON.stringify(['open-garage', 'glare', 'fixture-spec', 'acuity']) },

  { category: 'GARAGE', severity: 'RECOMMENDED', title: 'High Ceiling Spacing Adjustment',
    content: 'Higher mounting heights allow wider fixture spacing — up to 33\'×35\' or more. Always confirm with photometric calculations.',
    tags: JSON.stringify(['ceiling-height', 'spacing', 'photometrics']) },

  { category: 'GARAGE', severity: 'REQUIRED', title: 'ACT / Grid Ceiling Garages',
    content: 'For garages with ACT or grid ceilings: use flat panel LED 2×2 at 16\' OC spacing. These garages must be calculated.',
    tags: JSON.stringify(['act', 'grid-ceiling', 'flat-panel', 'spacing']) },

  { category: 'GARAGE', severity: 'REQUIRED', title: 'Exposed Structure Mounting',
    content: 'If there is no ceiling in the garage, a conduit stem for the fixture must be called out on the drawings for proper mounting.',
    tags: JSON.stringify(['mounting', 'conduit-stem', 'exposed-structure']) },

  // ── CONTROLS ─────────────────────────────────────────────────────────────
  { category: 'CONTROLS', severity: 'REQUIRED', title: 'Entry Vestibule Control',
    content: 'Entry vestibules remain ON 24/7 for safety and security of occupants. Fixtures dim with available daylight. Light level shall never fall below 100 lux at floor.',
    tags: JSON.stringify(['vestibule', '24-7', 'daylight', 'lux']) },

  { category: 'CONTROLS', severity: 'REQUIRED', title: 'Corridor & Elevator Lobby Control',
    content: 'Sensor(s) to activate and maintain lighting before and after operational hours. Lighting remains at 100% during primary hours to ensure occupant safety. Lighting dims after hours when space is unoccupied. Never fall below 50 lux at floor.',
    tags: JSON.stringify(['corridor', 'elevator-lobby', 'sensor', 'dimming', 'lux']) },

  { category: 'CONTROLS', severity: 'REQUIRED', title: 'Stair Control',
    content: 'Lighting activated and maintained by integral sensor(s). Raise to full output upon motion. Dim to 50% of total load within 20 minutes of vacancy. Stair lighting never falls below 100 lux on stair. Lighting is never fully off for safety.',
    tags: JSON.stringify(['stairs', 'sensor', 'dimming', 'safety', 'lux']) },

  { category: 'CONTROLS', severity: 'REQUIRED', title: 'Storage / Trash / Janitor Control',
    content: 'Manual on / auto off with sensor-enabled wall mounted switch. Vacancy sensor turns off lighting within 20 minutes of vacancy.',
    tags: JSON.stringify(['storage', 'trash', 'janitor', 'vacancy-sensor', 'auto-off']) },

  { category: 'CONTROLS', severity: 'NOTE', title: 'Amenity Common Control System Symbol',
    content: 'Any device that ties into the amenity common control system must be marked with the ¢ (cent) symbol on the drawings.',
    tags: JSON.stringify(['amenity', 'common-control', 'drawing-symbol', 'notation']) },

  // ── EXTERIOR ──────────────────────────────────────────────────────────────
  { category: 'EXTERIOR', severity: 'REQUIRED', title: 'Reflectance Values',
    content: 'Use 80/50/20 reflectance values (ceiling/wall/floor) in all exterior photometric calculations.',
    tags: JSON.stringify(['photometrics', 'reflectance', 'calculation']) },

  { category: 'EXTERIOR', severity: 'RECOMMENDED', title: 'Standard Area Lighting',
    content: 'Standard area lighting: Acuity RSX / DSX. Mounting height: 12\' for pedestrian scale; 20–24\' for general area lighting. Verify against city requirements.',
    tags: JSON.stringify(['area-lighting', 'acuity', 'mounting-height', 'fixture-spec']) },

  { category: 'EXTERIOR', severity: 'RECOMMENDED', title: 'Standard Wall Pack',
    content: 'Standard wall pack options: Maxim Pathfinder or Acuity Wedge.',
    tags: JSON.stringify(['wall-pack', 'maxim', 'acuity', 'fixture-spec']) },

  { category: 'EXTERIOR', severity: 'RECOMMENDED', title: 'Standard Catenary',
    content: 'Standard catenary fixture: Primus with cone at 4\' OC spacing.',
    tags: JSON.stringify(['catenary', 'primus', 'spacing', 'fixture-spec']) },

  { category: 'EXTERIOR', severity: 'RECOMMENDED', title: 'Standard Step Light',
    content: 'Standard step light: SPJ SGR. Mounting: 18" AFG (above finished grade).',
    tags: JSON.stringify(['step-light', 'spj', 'mounting', 'fixture-spec']) },

  { category: 'EXTERIOR', severity: 'RECOMMENDED', title: 'Standard Handrail Light',
    content: 'Standard handrail lighting: Klik USA LEDPOD at 3\' OC spacing.',
    tags: JSON.stringify(['handrail', 'klik', 'spacing', 'fixture-spec']) },

  { category: 'EXTERIOR', severity: 'RECOMMENDED', title: 'Tree Uplighting / Accent Directional',
    content: 'Standard tree uplighting and accent directional: SPJ MR Universe.',
    tags: JSON.stringify(['tree-uplighting', 'accent', 'spj', 'landscape', 'fixture-spec']) },

  { category: 'EXTERIOR', severity: 'REQUIRED', title: 'Denver City Requirements',
    content: 'Denver: 8 FC max at any point on site. Dark sky requirements apply. Aurora: 1 FC min at all crosswalks or pedestrian/vehicular conflict areas. Dark sky requirements apply.',
    tags: JSON.stringify(['denver', 'aurora', 'city-code', 'dark-sky', 'foot-candles']) },

  // ── FIXTURE_SPEC ─────────────────────────────────────────────────────────
  { category: 'FIXTURE_SPEC', severity: 'RECOMMENDED', title: 'Landscape Lighting Default Brand',
    content: 'Landscape lighting should always be Hinkley as the default manufacturer. Only substitute SPJ when code, dark sky requirements, or other constraints make Hinkley unsuitable.',
    tags: JSON.stringify(['landscape', 'hinkley', 'spj', 'brand', 'default']) },

  { category: 'FIXTURE_SPEC', severity: 'NOTE', title: 'Standard Products Reference Spreadsheet',
    content: 'ILC standard products list (spec-grade fixture selections by space type):\nhttps://docs.google.com/spreadsheets/d/1-udG0X2cu98uRJVMPEeOyZJYSKUy-s5x/edit#gid=8298883',
    tags: JSON.stringify(['reference', 'spreadsheet', 'standard-products']),
    sourceUrl: 'https://docs.google.com/spreadsheets/d/1-udG0X2cu98uRJVMPEeOyZJYSKUy-s5x/edit#gid=8298883' },

  { category: 'FIXTURE_SPEC', severity: 'NOTE', title: 'Tape & Channel Reference Spreadsheet',
    content: 'ILC tape and channel standard specifications:\nhttps://docs.google.com/spreadsheets/d/1O2UxCTiwxBbi3WqVKdxuF5KPR0QPnWkfG7UlEf61vkk/edit#gid=1241785505',
    tags: JSON.stringify(['tape', 'channel', 'reference', 'spreadsheet']),
    sourceUrl: 'https://docs.google.com/spreadsheets/d/1O2UxCTiwxBbi3WqVKdxuF5KPR0QPnWkfG7UlEf61vkk/edit#gid=1241785505' },
];

async function main() {
  // Find a super admin to attribute the seed records to
  const admin = await prisma.user.findFirst({
    where: { role: { in: ['SUPER_ADMIN', 'ILC_ADMIN'] } },
  });
  if (!admin) { console.error('No admin user found — run the main seed first.'); process.exit(1); }

  // Clear existing standards (clean slate)
  await prisma.designStandard.deleteMany({});
  console.log('Cleared existing standards.');

  let created = 0;
  for (const std of STANDARDS) {
    await prisma.designStandard.create({
      data: {
        category:    std.category,
        title:       std.title,
        content:     std.content,
        severity:    std.severity,
        tags:        std.tags || '[]',
        sourceUrl:   std.sourceUrl || null,
        isActive:    true,
        createdById: admin.id,
      },
    });
    created++;
    console.log(`  ✓ [${std.category}] ${std.title}`);
  }

  console.log(`\nDone — seeded ${created} standards.`);
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
