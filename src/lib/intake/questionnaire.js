/**
 * The public conceptual-budget questionnaire.
 *
 * QUESTIONS AND ANSWERS ARE VERBATIM from Mike's multifamily questionnaire
 * spreadsheet (the dropdown validations on the first tab). Do not shorten,
 * reword, or collapse options — the public page must read exactly like the
 * questionnaire ILC hands out. (Rule set 2026-08-31 after the first pass
 * paraphrased them: "Match these answers.")
 *
 * Each question also carries its ENGINE WIRING: which calculateBudget()
 * section/field it feeds and how each verbatim answer maps onto the engine's
 * internal option keys. answersToEngine() below turns a submission's answers
 * into the same `sections` shape the internal wizard saves, so the public
 * estimate runs through the exact same math as an internal budget.
 *
 * Shared by the public page (renders it), the submit route (validates
 * against it), and the estimate route (maps it into the engine) — one
 * definition, so the three can't drift.
 *
 * @see src/lib/calculations.js — the engine these map into
 * @see src/lib/pricing.js      — the option keys the maps must hit
 */

export const INTAKE_QUESTIONS = [
  // ── RESIDENTIAL UNITS ──────────────────────────────────────────────────────
  {
    key: 'undercabinet',
    section: 'Residential units',
    question: 'Do you want undercabinet lighting?',
    hint: '120v is the more cost-effective option with a larger profile; low voltage has a smaller profile but needs a remote power supply.',
    options: ['None', '120v', 'Low voltage'],
    default: 'None',
    engine: { section: 'units', field: 'undercabinet',
      map: { 'None': 'none', '120v': 'lineVoltage', 'Low voltage': 'lowVoltage' } },
  },
  {
    key: 'islandPendants',
    section: 'Residential units',
    question: 'Are kitchen island pendants desired?',
    hint: 'Pendants replace the standard disks over islands; count and finish level drive the cost.',
    options: [
      'None',
      '3 small pendants (Low finish)',
      '3 small pendants (Medium finish)',
      '2 medium pendants (Low finish)',
      '2 medium pendants (Medium finish)',
      '1 large pendant',
      '1 linear pendant',
    ],
    default: 'None',
    engine: { section: 'units', field: 'kitchenPendants',
      map: {
        'None': 'none',
        '3 small pendants (Low finish)': 'threeSmallLow',
        '3 small pendants (Medium finish)': 'threeSmallMedium',
        '2 medium pendants (Low finish)': 'twoMediumLow',
        '2 medium pendants (Medium finish)': 'twoMediumMedium',
        // Aliases — pre-2026-09 submissions stored the bare finish word.
        '3 small pendants (Low)': 'threeSmallLow',
        '3 small pendants (Medium)': 'threeSmallMedium',
        '2 medium pendants (Low)': 'twoMediumLow',
        '2 medium pendants (Medium)': 'twoMediumMedium',
        '1 large pendant': 'oneLarge',
        '1 linear pendant': 'oneLinear',
      } },
  },
  {
    key: 'ceilingFans',
    section: 'Residential units',
    question: 'Are ceiling fans desired and in what locations in the units?',
    hint: 'A typical fan adds meaningful product and installation cost per unit, so location matters.',
    options: [
      'None',
      'Master bed only',
      'Living room only',
      'Master bed + Living room',
      'Master bed + Secondary bed',
      'Master bed/Secondary bed/Living room',
      'Master bed/Secondary bed/Tertiary bed',
      'Master bed/Secondary bed/Tertiary bed + Living room',
    ],
    default: 'None',
    engine: { section: 'units', field: 'fans',
      map: {
        'None': 'none',
        'Master bed only': 'masterOnly',
        'Living room only': 'livingRoomOnly',
        'Master bed + Living room': 'masterAndLiving',
        'Master bed + Secondary bed': 'masterAndSecondary',
        'Master bed/Secondary bed/Living room': 'masterSecondaryLiving',
        'Master bed/Secondary bed/Tertiary bed': 'masterSecondaryTertiary',
        'Master bed/Secondary bed/Tertiary bed + Living room': 'masterSecondaryTertiaryLiving',
      } },
  },
  {
    key: 'vanityLighting',
    section: 'Residential units',
    question: 'How do you want to light unit bathroom vanities? ("Mirror and bath bar (Low finish)" is already included in the budget if chosen or left blank.)',
    hint: 'Illuminated mirrors often cost the same or less overall and need less coordination between trades.',
    options: [
      'Illuminated mirror (Medium finish)',
      'Illuminated mirror (High finish)',
      'Mirror and bath bar (Low finish)',
      'Mirror and bath bar (Medium finish)',
      'Mirror and bath bar (High finish)',
    ],
    default: 'Mirror and bath bar (Low finish)',
    engine: { section: 'units', field: 'vanity',
      map: {
        'Illuminated mirror (Medium finish)': 'illuminatedMirrorMedium',
        'Illuminated mirror (High finish)': 'illuminatedMirrorHigh',
        'Mirror and bath bar (Low finish)': 'bathBarLow',
        'Mirror and bath bar (Medium finish)': 'bathBarMedium',
        'Mirror and bath bar (High finish)': 'bathBarHigh',
        // Aliases — pre-2026-09 submissions stored the bare finish word.
        'Illuminated mirror (Medium)': 'illuminatedMirrorMedium',
        'Illuminated mirror (High)': 'illuminatedMirrorHigh',
        'Mirror and bath bar (Low)': 'bathBarLow',
        'Mirror and bath bar (Medium)': 'bathBarMedium',
        'Mirror and bath bar (High)': 'bathBarHigh',
      } },
  },
  {
    key: 'balconyLighting',
    section: 'Residential units',
    question: 'How do you want to light unit balconies?',
    hint: 'A small surface-mount disk is the budget option; sconces range from builder-grade to decorative.',
    options: [
      'None',
      '5" surface mount disk',
      'Exterior balcony sconce (Low finish)',
      'Exterior balcony sconce (Medium finish)',
      'Exterior balcony sconce (High finish)',
    ],
    default: 'Exterior balcony sconce (Low finish)',
    engine: { section: 'units', field: 'balcony',
      map: {
        'None': 'none',
        '5" surface mount disk': 'disk5inch',
        'Exterior balcony sconce (Low finish)': 'sconcelow',
        'Exterior balcony sconce (Medium finish)': 'sconceMedium',
        'Exterior balcony sconce (High finish)': 'sconceHigh',
        // Aliases — pre-2026-09 submissions stored the bare finish word.
        'Exterior balcony sconce (Low)': 'sconcelow',
        'Exterior balcony sconce (Medium)': 'sconceMedium',
        'Exterior balcony sconce (High)': 'sconceHigh',
      } },
  },

  // ── EMERGENCY ──────────────────────────────────────────────────────────────
  {
    key: 'egressLighting',
    section: 'Emergency',
    question: 'How do you want to approach emergency egress lighting? (i.e. If you have a building generator that can be used for lighting then you do not need any other emergency lighting.)',
    hint: 'Code still requires backup lighting on every egress path; the strategy decides where the backup power lives.',
    options: [
      'Building generator',
      'Inverters everywhere',
      'Frogeyes everywhere',
      'Frogeyes in corridors + inverters in amenities',
      'Integrated batteries in garage / frogeyes in corridors / inverters in amenity spaces',
      'Integrated batteries in garage / inverters in corridors + amenity spaces',
    ],
    default: 'Frogeyes everywhere',
    engine: { section: 'emergency', field: 'strategy',
      map: {
        'Building generator': 'generator',
        'Inverters everywhere': 'inverters',
        'Frogeyes everywhere': 'frogeyes',
        'Frogeyes in corridors + inverters in amenities': 'frogeyes_inv',
        'Integrated batteries in garage / frogeyes in corridors / inverters in amenity spaces': 'integrated_frogeyes',
        'Integrated batteries in garage / inverters in corridors + amenity spaces': 'integrated_inverters',
      } },
  },

  // ── INTERIOR AMENITIES ─────────────────────────────────────────────────────
  {
    key: 'interiorAmenityFinish',
    section: 'Interior amenities',
    question: 'Please choose what $/SF of interior amenity SF based on the level of finish of the project..',
    hint: 'Interior amenities range from $6/SF on the low end (i.e. garden walk-up) to $15/SF (i.e. high-end mid-rise or high-rise).',
    options: ['3', '6', '7', '8', '9', '10', '11', '12', '13', '14'],
    default: '10',
    format: 'perSf',
    // Numeric answers pass straight through — the engine parseFloats them.
    engine: { section: 'amenities', field: 'interiorLevel', map: null },
  },

  // ── CORRIDORS / STAIRWELLS ─────────────────────────────────────────────────
  {
    key: 'unitEntrySconce',
    section: 'Corridors and stairwells',
    question: 'Would you like a sconce at every unit entry?',
    hint: 'Options run from a simple builder-grade sconce up to an integrated unit-number light.',
    options: [
      'None',
      '1 sconce (Low finish)',
      '1 sconce (Medium finish)',
      '1 sconce (High finish)',
      '1 Integrated unit number/light',
    ],
    default: '1 sconce (Low finish)',
    engine: { section: 'corridors', field: 'unitSconce',
      map: {
        'None': 'none',
        '1 sconce (Low finish)': 'low',
        '1 sconce (Medium finish)': 'medium',
        '1 sconce (High finish)': 'high',
        '1 Integrated unit number/light': 'integrated',
        // Aliases — pre-2026-09 submissions stored the bare finish word.
        '1 sconce (Low)': 'low',
        '1 sconce (Medium)': 'medium',
        '1 sconce (High)': 'high',
      } },
  },

  // ── EXTERIOR ───────────────────────────────────────────────────────────────
  {
    key: 'siteDesignLevel',
    section: 'Exterior',
    question: 'What level of design would you like on the site?',
    hint: 'Base design covers code-required site and parking lighting; upgrades add landscape, path, or solar lighting.',
    options: ['Base design', 'Upgraded landscape and/or path lighting', 'Solar lighting'],
    default: 'Base design',
    // Wired 2026-09-04 (Fulshear review): 'solar' multiplies the area-lighting
    // (surface parking) line by exterior.solarMultiplier in calculations.js.
    // 'upgraded' is still recorded for the reviewer only — pathway lighting has
    // no formula yet.
    engine: { section: 'exterior', field: 'siteDesignLevel', map: {
        'Base design': 'base',
        'Upgraded landscape and/or path lighting': 'upgraded',
        'Solar lighting': 'solar',
      } },
  },
  {
    key: 'exteriorAmenityFinish',
    section: 'Exterior',
    question: 'Please choose what $/SF of exterior amenity SF based on the level of finish of the project..',
    hint: '$1/SF is the low end; $5/SF is the high end and may include facade lighting.',
    options: ['1', '2', '3', '5'],
    default: '1',
    format: 'perSf',
    engine: { section: 'exterior', field: 'amenityLevel', map: null },
  },
  {
    key: 'amenityHours',
    section: 'Exterior',
    question: 'What will be the amenity operational hours? If one exists, does the pool close at or before dusk?',
    hint: 'A pool area open after dark needs much higher light levels around the deck per code and in turn add 2x or more the cost.',
    options: ['24hrs or after dark', 'Dusk to Dawn', 'Other'],
    default: 'Other',
    engine: { section: 'exterior', field: 'amenityHours',
      map: {
        '24hrs or after dark': 'afterSunset',
        'Dusk to Dawn': 'duskToDawn',
        'Other': 'beforeDusk',
      } },
  },

  // ── CONTROLS ───────────────────────────────────────────────────────────────
  {
    key: 'projectType',
    section: 'Controls',
    question: 'What type of project is this?',
    hint: 'Drives the common-area control system requirements (IECC 2021).',
    options: [
      'Single Family (1-2 Levels)',
      'Town Houses (2-3 Levels)',
      'Town House/Stacked Flats (3 Levels)',
      'Garden (3 Levels)',
      'Gurban (4-5 Levels)',
      'Wrap (3-5 Levels)',
      'Podium (3-8 Levels)',
      'Mid Rise (9-12 Levels)',
      'High Rise (12+ Levels)',
    ],
    default: null, // prefilled from the drawing read when possible
    engine: { target: 'buildingTypeKey',
      map: {
        'Single Family (1-2 Levels)': 'singleFamily',
        'Town Houses (2-3 Levels)': 'townHouses',
        'Town House/Stacked Flats (3 Levels)': 'stackedFlats',
        'Garden (3 Levels)': 'garden',
        'Gurban (4-5 Levels)': 'gurban',
        'Wrap (3-5 Levels)': 'wrap',
        'Podium (3-8 Levels)': 'podium',
        'Mid Rise (9-12 Levels)': 'midRise',
        'High Rise (12+ Levels)': 'highRise',
      } },
  },

  // ── ENERGY CODES ───────────────────────────────────────────────────────────
  {
    key: 'energyCredit',
    section: 'Energy codes',
    question: 'Are you trying to achieve better than code allowed LPDs for a lighting energy credit?',
    hint: 'If so, more of the budget goes toward controls and more efficient fixtures. Any program adds a 3% energy credit to the lighting and controls budgets automatically.',
    options: ['None', 'LEED', 'NGBS', 'WELL', 'Other'],
    default: 'None',
    engine: { section: 'controls', field: 'energyCreditProgram',
      map: { 'None': 'none', 'LEED': 'leed', 'NGBS': 'ngbs', 'WELL': 'well', 'Other': 'other' } },
  },
];

const byKey = new Map(INTAKE_QUESTIONS.map(q => [q.key, q]));

/**
 * Free-number figures the wizard asks for ONLY when the drawings answered
 * nothing ("answer what we can, ask for the rest"). Not INTAKE_QUESTIONS —
 * those are fixed-option questions the wizard always renders; these are
 * number inputs that appear when the takeoff left the quantity blank, and
 * computeQuantities() reads them as the questionnaire-sourced fallback.
 * Values are clamped to plain digits because this is a public endpoint.
 */
export const FIGURE_KEYS = [
  { key: 'figureGrossSf',         section: 'Project figures', question: 'Total building gross SF (entered by the submitter — not found on the drawings)' },
  { key: 'figureTotalUnits',      section: 'Project figures', question: 'Total units (entered by the submitter — not found on the drawings)' },
  { key: 'figureStories',         section: 'Project figures', question: '# Stories (entered by the submitter — not found on the drawings)' },
  { key: 'figureStairwells',      section: 'Project figures', question: '# Egress stairwells (entered by the submitter — not found on the drawings)' },
  { key: 'figureExitDoors',       section: 'Project figures', question: '# Egress/exit doors (entered by the submitter — not found on the drawings)' },
  { key: 'figureSurfaceParking',  section: 'Project figures', question: '# Surface parking stalls (entered by the submitter — not found on the drawings)' },
];

/**
 * Validate submitted answers against the questionnaire.
 * Returns rows ready for ConceptualSubmissionAnswer — unknown keys are
 * dropped, answers are clamped to the question's options (free text is not
 * accepted on option questions: this is a public endpoint), and unanswered
 * questions fall back to their default so the reviewer always sees a full set.
 */
export function validateAnswers(input) {
  const given = input && typeof input === 'object' ? input : {};
  const rows = [];
  for (const q of INTAKE_QUESTIONS) {
    const raw = typeof given[q.key] === 'string' ? given[q.key].trim() : '';
    // Map keys count as valid too — they carry aliases for option strings a
    // stored submission used before a wording change (still a fixed whitelist).
    const known = q.options.includes(raw) ||
      (q.engine?.map != null && Object.prototype.hasOwnProperty.call(q.engine.map, raw));
    const answer = known ? raw : (q.default ?? '');
    if (!answer) continue; // no answer and no default (e.g. projectType left blank)
    rows.push({ section: q.section, questionKey: q.key, question: q.question, answer });
  }
  // Visitor-typed figures ride along under their own whitelist — digits only,
  // commas and spaces tolerated, anything else dropped (public endpoint).
  for (const f of FIGURE_KEYS) {
    const raw = typeof given[f.key] === 'string' ? given[f.key].replace(/[,\s]/g, '') : '';
    if (!/^\d{1,9}$/.test(raw) || Number(raw) <= 0) continue;
    rows.push({ section: f.section, questionKey: f.key, question: f.question, answer: raw });
  }
  return rows;
}

/**
 * Map a submission's answers into the engine's `sections` shape — the same
 * shape the internal wizard saves — plus the buildingTypeKey the controls
 * math keys off. Answers are clamped to known options first (this feeds
 * calculateBudget on a public endpoint), and unanswered questions fall back
 * to their default, so the result always runs.
 *
 * @param {object|Array} answers  {key: answer} map or ConceptualSubmissionAnswer rows
 * @returns {{sections: object, buildingTypeKey: ?string}}
 */
export function answersToEngine(answers) {
  // Normalize rows → map (same tolerance as quantities.answersToMap, kept
  // local to avoid an import cycle).
  const given = {};
  if (Array.isArray(answers)) {
    for (const a of answers) {
      if (a && typeof a.questionKey === 'string' && typeof a.answer === 'string') given[a.questionKey] = a.answer;
    }
  } else if (answers && typeof answers === 'object') {
    for (const [k, v] of Object.entries(answers)) {
      if (typeof v === 'string') given[k] = v;
    }
  }

  const sections = {};
  let buildingTypeKey = null;
  for (const q of INTAKE_QUESTIONS) {
    if (!q.engine) continue;
    const raw = typeof given[q.key] === 'string' ? given[q.key].trim() : '';
    // Map keys count as valid too — they carry aliases for option strings a
    // stored submission used before a wording change (still a fixed whitelist).
    const known = q.options.includes(raw) ||
      (q.engine?.map != null && Object.prototype.hasOwnProperty.call(q.engine.map, raw));
    const answer = known ? raw : (q.default ?? '');
    if (!answer) continue;
    const value = q.engine.map ? q.engine.map[answer] : answer;
    if (value == null) continue;
    if (q.engine.target === 'buildingTypeKey') {
      buildingTypeKey = value;
    } else {
      if (!sections[q.engine.section]) sections[q.engine.section] = {};
      sections[q.engine.section][q.engine.field] = value;
    }
  }

  // The engine reads the yes/no energy credit separately from the program.
  if (sections.controls) {
    sections.controls.energyCredit = sections.controls.energyCreditProgram === 'none' ? 'no' : 'yes';
  }

  return { sections, buildingTypeKey };
}
