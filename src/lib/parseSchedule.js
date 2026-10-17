/**
 * Construction schedule milestone extractor.
 *
 * Two complementary approaches:
 *  1. classifyActivity(name), fast keyword classifier for structured row-by-row
 *     parsing (Primavera / MS Project / Asta exports where you have activity names).
 *  2. parseScheduleMilestones(text), proximity scanner for unstructured PDF text
 *     (finds keyword near a date on the same/adjacent lines).
 *
 * The AI extractor in files/route.js is the primary path for uploads; these are
 * used as fallback and for any client-side pre-processing.
 */

// ── 8-milestone canonical set ─────────────────────────────────────────────────
// Matches MILESTONE_ORDER in CAScheduleCard.jsx and MILESTONE_IDS in files/route.js.

const MILESTONES = [
  {
    id: 'construction-start',
    label: 'Construction Start',
    keywords: [
      /\bNTP\b/,
      /notice\s+to\s+proceed/i,
      /mobiliz(?:ation|e)/i,
      /construction\s+start/i,
      /start\s+(?:of\s+)?construction/i,
      /commence\s+construction/i,
      /ground\s*break/i,
      /begin\s+(?:foundations?|construction)/i,
      /project\s+start/i,
    ],
  },
  {
    id: 'electrical-rough',
    label: 'Electrical Rough-In',
    keywords: [
      /overhead\s+electrical\s+rough/i,
      /electrical\s+rough[-\s]?in/i,
      /electrical\s+rough\s+ceiling/i,
      /in[-\s]?wall\s+electrical/i,
      /electrical\s+in[-\s]?wall/i,
      /elec(?:trical)?\s+rough\b/i,
      /elecrtical\s+overhead/i,  // intentional typo seen in real Haselden schedules
      /electrical\s+overhead/i,
      /\bE\.?R\.?I\.?\b/,
    ],
  },
  {
    id: 'mep-rough',
    label: 'MEP Rough-In',
    keywords: [
      /\bMEP\s+rough[-\s]?in/i,
      /\bMEP\s+rough\b/i,
      /overhead\s+mechanical/i,
      /mechanical\s+rough[-\s]?in/i,
      /mech(?:anical)?\s+above\s+ceiling/i,
      /mech(?:anical)?\s+rough\b/i,
      /plumbing\s+overhead/i,
      /waste\s+and\s+vent/i,
      /overhead\s+fire\s+suppression/i,
      /start\s+mep/i,
      /mep\s+start/i,
    ],
  },
  {
    id: 'light-fixtures',
    label: 'Interior Light Fixtures',
    keywords: [
      /light\s+fixtures?\s*\/?\s*fans?/i,
      /fans?\s*\/?\s*devic(?:ing)?/i,
      /install\s+lighting/i,
      /light\s+fixture\s+install/i,
      /install\s+light\s+fixtures?/i,
    ],
  },
  {
    id: 'site-lighting',
    label: 'Exterior / Site Lighting',
    keywords: [
      /site\s+lighting\s+conduit/i,
      /install\s+site\s+lighting/i,
      /\bsite\s+lighting\b/i,
      /railing\s+lights?/i,
      /install\s+railing\s+lights?/i,
      /bollard\s+install/i,
      /exterior\s+lighting/i,
      /parking\s+lot\s+light/i,
      /pole\s+light(?:ing)?/i,
    ],
  },
  {
    id: 'electrical-devicing',
    label: 'Electrical Devicing / Trim',
    keywords: [
      /electrical\s+devicing/i,
      /devicing\s*\/\s*trims?/i,
      /electrical\s+trim\b/i,
    ],
  },
  {
    id: 'tco',
    label: 'TCO',
    keywords: [
      /\bTCO\b/,
      /temp(?:orary)?\s+certificate\s+of\s+occupanc/i,
      /temp(?:orary)?\s+C\.?O\.?\b/i,
      /temp(?:orary)?\s+occupanc/i,
      /building\s+final/i,
    ],
  },
  {
    id: 'construction-end',
    label: 'Final Completion',
    keywords: [
      /substantial\s+completion/i,
      /final\s+completion/i,
      /project\s+(?:final|closeout|close[-\s]out)\b/i,
      /owner\s+move[-\s]?in/i,
      /unit\s+turnover/i,
      /punch\s+complete/i,
      /homeowner\s+punch/i,
      /certificate\s+of\s+(?:substantial\s+)?completion/i,
    ],
  },
];

// ── Keyword classifier (row-by-row, for structured exports) ───────────────────
// Maps include/exclude keyword lists from the brief; used when you have individual
// activity name strings (e.g. from a parsed P6 or MS Project XML/CSV export).

const ACTIVITY_RULES = {
  'construction-start': {
    include: ['ntp', 'notice to proceed', 'mobiliz', 'begin foundations', 'start construction'],
    exclude: [],
  },
  'electrical-rough': {
    include: [
      'overhead electrical rough', 'electrical rough ceilings', 'electrical in wall',
      'inwall electrical rough', 'inwall electrical', 'electrical rough-in',
      'electrical rough in', 'elecrtical overhead', 'electrical overhead', 'electrical rough',
    ],
    exclude: [
      'switchgear', 'switch gear', 'panelboard', 'fire alarm', 'generator', 'transformer',
      'txfmr', 'primary power', 'secondary power', 'underground', 'conduit', 'fabricate',
      'review & approve', 'shop drawings', 'ug electrical', 'underslab', 'deep electrical',
    ],
  },
  'mep-rough': {
    include: [
      'mep rough', 'mep rough-in', 'mep rough in', 'overhead mechanical', 'mechanical rough',
      'mech above ceiling', 'mech rough', 'plumbing overhead', 'waste and vent',
      'overhead fire suppression',
    ],
    exclude: [
      'fire alarm', 'switchgear', 'switch gear', 'panelboard', 'generator',
      'transformer', 'fabricate', 'review & approve', 'shop drawings',
    ],
  },
  'light-fixtures': {
    include: [
      'light fixtures', 'light fixture', 'light fixtures / fans', 'fans /devicing',
      'fans / devicing', 'install lighting',
    ],
    exclude: ['site lighting', 'railing lights', 'bollard', 'exterior lighting', 'switchgear', 'fire alarm'],
  },
  'site-lighting': {
    include: [
      'site lighting conduit', 'install site lighting', 'site lighting',
      'railing lights', 'install railing lights', 'bollard install', 'exterior lighting',
    ],
    exclude: ['switchgear', 'fire alarm', 'panelboard'],
  },
  'electrical-devicing': {
    include: [
      'electrical devicing', 'electrical devicing / trims', 'devicing / trims', 'electrical trim',
    ],
    exclude: ['fire alarm', 'switchgear', 'mechanical devicing'],
  },
  'tco': {
    include: [
      'tco', 'temp certificate', 'temporary certificate',
      'certificate of occupancy', 'building final', 'final inspection',
    ],
    exclude: [],
  },
  'construction-end': {
    include: [
      'substantial completion', 'final completion', 'project final',
      'owner move-in', 'owner move in', 'unit turnover',
      'punch complete', 'homeowner punch', 'home owner punch',
    ],
    exclude: [],
  },
};

/**
 * Classify a single activity name string into one of the 8 milestone IDs.
 * Returns the milestone id string, or null if unmatched.
 * Exclude keywords are checked first so they always win.
 */
export function classifyActivity(activityName) {
  const lower = activityName.toLowerCase();
  for (const [id, { include, exclude }] of Object.entries(ACTIVITY_RULES)) {
    if (exclude.some(kw => lower.includes(kw))) continue;
    if (include.some(kw => lower.includes(kw))) return id;
  }
  return null;
}

/**
 * Given an array of { start: 'YYYY-MM-DD' } activity objects for one milestone
 * category, return the earliest start date as an ISO string. Handles the common
 * case where one milestone (e.g. electrical rough) spans 20+ floor-level rows.
 */
export function collapseToEarliestStart(activities) {
  if (!activities.length) return null;
  return activities.map(a => a.start).sort().at(0);
}

// ── Date extraction (for unstructured PDF text) ───────────────────────────────

const MON_ABB  = { jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12 };
const MON_FULL = {
  january:1,february:2,march:3,april:4,may:5,june:6,
  july:7,august:8,september:9,october:10,november:11,december:12,
};
const ALL_MON = { ...MON_ABB, ...MON_FULL };
const MON_RE  = Object.keys(MON_FULL).concat(Object.keys(MON_ABB)).join('|');

function pad(n) { return String(parseInt(n)).padStart(2, '0'); }

function toIso(y, m, d) {
  const yr = typeof y === 'string' && y.length === 2 ? 2000 + parseInt(y) : parseInt(y);
  const mo = parseInt(m), dy = parseInt(d);
  if (yr < 2020 || yr > 2040 || mo < 1 || mo > 12 || dy < 1 || dy > 31) return null;
  return `${yr}-${pad(mo)}-${pad(dy)}`;
}

function extractDates(text) {
  const results = [];
  const patterns = [
    { re: /\b(\d{1,2})-(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)-(\d{2,4})\b/gi,
      fn: (m) => toIso(m[3], MON_ABB[m[2].toLowerCase()], m[1]) },
    { re: /\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/g,
      fn: (m) => toIso(m[3], m[1], m[2]) },
    { re: /\b(20\d{2})-(\d{2})-(\d{2})\b/g,
      fn: (m) => toIso(m[1], m[2], m[3]) },
    { re: new RegExp(`\\b(${MON_RE})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?[,\\s]+(20\\d{2})\\b`, 'gi'),
      fn: (m) => toIso(m[3], ALL_MON[m[1].toLowerCase()], m[2]) },
  ];
  for (const { re, fn } of patterns) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text)) !== null) {
      const iso = fn(m);
      if (iso) results.push({ iso, index: m.index });
    }
  }
  return results.sort((a, b) => a.index - b.index);
}

// ── Proximity scanner (for unstructured PDF text) ─────────────────────────────

export function parseScheduleMilestones(text) {
  if (!text || text.length < 20) return [];

  const lines = text.split(/\r?\n/);
  const found = {};

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    for (const milestone of MILESTONES) {
      if (found[milestone.id]) continue;
      if (!milestone.keywords.some(re => { re.lastIndex = 0; return re.test(line); })) continue;

      const candidates = [
        line,
        lines[i + 1] || '',
        lines[i + 2] || '',
        lines[i - 1] || '',
        lines[i + 3] || '',
      ];

      for (const candidate of candidates) {
        const dates = extractDates(candidate);
        if (dates.length > 0) {
          found[milestone.id] = { label: milestone.label, date: dates[0].iso };
          break;
        }
      }
    }
  }

  return MILESTONES
    .filter(m => found[m.id])
    .map(m => ({ id: m.id, label: m.label, date: found[m.id].date }));
}

// ── Legacy wrapper, keeps any existing callers working ───────────────────────
export function parseScheduleFields(text) {
  const milestones = parseScheduleMilestones(text);
  const get = (id) => milestones.find(m => m.id === id)?.date ?? null;
  return {
    constructionStartDate: get('construction-start'),
    mepRoughInDate:        get('mep-rough'),
    constructionEndDate:   get('construction-end'),
  };
}
