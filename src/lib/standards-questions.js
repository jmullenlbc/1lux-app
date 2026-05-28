// ── Client Standards — Question Definitions ────────────────────────────────────
// Keys use flat snake_case. DB stores answers only; questions live here.
// question_key format: snake_case string (e.g. 'unit_disk_style')
// CCT keys use 'cct_*' prefix and are handled by the CCT renderer.

// ── Project types ─────────────────────────────────────────────────────────────

export const PROJECT_TYPES = [
  { value: 'BTR',      label: 'BTR / Townhome'      },
  { value: 'GARDEN',   label: 'Garden walk-up'       },
  { value: 'PODIUM',   label: 'Podium / Wrap'        },
  { value: 'HIGHRISE', label: 'High-rise'            },
  { value: 'LIHTC',    label: 'Affordable (LIHTC)'   },
];

// ── CCT options (used by CCT renderer) ────────────────────────────────────────

export const CCT_OPTIONS          = ['2700K', '3000K', '3500K', '4000K'];
export const CCT_EXTERIOR_OPTIONS = ['2700K', '3000K', '3500K', '4000K', '5000K'];

export const CCT_INTERIOR_AREAS = [
  { key: 'cct_unit_living',   label: 'Unit — Living / Dining'   },
  { key: 'cct_unit_bedroom',  label: 'Unit — Bedroom'           },
  { key: 'cct_unit_bathroom', label: 'Unit — Bathroom / Vanity' },
  { key: 'cct_unit_kitchen',  label: 'Unit — Kitchen'           },
  { key: 'cct_corridors',     label: 'Corridors / Stairwells'   },
  { key: 'cct_amenities',     label: 'Interior Amenities'       },
  { key: 'cct_garage',        label: 'Garage'                   },
];

// ── Cascade map ───────────────────────────────────────────────────────────────

export const CASCADE_MAP = {
  unit_disk_style: [
    'unit_bedroom_ceiling',
    'unit_living_ceiling',
    'unit_closet_ceiling',
    'unit_hvac_ceiling',
    'unit_kitchen_ceiling',
    'unit_bath_ceiling',
  ],
};

// ── Question sections ─────────────────────────────────────────────────────────

export const STANDARDS_SECTIONS = [
  // COLOR_TEMPERATURE — special section rendered by CCTRenderer, not question list
  {
    key:   'COLOR_TEMPERATURE',
    label: 'Color Temperature',
    icon:  '🌡️',
    color: 'amber',
    isCCT: true,
    questions: [],
  },

  {
    key:   'RESIDENTIAL_UNITS',
    label: 'Residential Units',
    icon:  '🏠',
    color: 'blue',
    questions: [
      {
        key:        'unit_disk_style',
        label:      'Disk style — standard ceiling fixture',
        hint:       'Primary ceiling disk used across all rooms. Auto-fills bedrooms, living rooms, closets, HVAC closet, kitchen, bathroom.',
        tags:       ['REQUIRED', 'CASCADE'],
        inputType:  'CHIPS',
        options: [
          { value: 'EDGE_5',    label: '5" Edge-lit',  price: '$9'     },
          { value: 'EDGE_7',    label: '7" Edge-lit',  price: '$10.50' },
          { value: 'EDGE_12',   label: '12" Edge-lit', price: '$26'    },
          { value: 'BACKLIT_6', label: '6" Back-lit',  price: '$6.50'  },
        ],
        cascadeTargets: [
          'unit_bedroom_ceiling', 'unit_living_ceiling', 'unit_closet_ceiling',
          'unit_hvac_ceiling', 'unit_kitchen_ceiling', 'unit_bath_ceiling',
        ],
      },
      {
        key:       'unit_entryway',
        label:     'Entryway fixture',
        hint:      'Unit entry — statement fixture or same disk as unit?',
        tags:      ['REQUIRED'],
        inputType: 'CHIPS',
        options: [
          { value: 'SAME_AS_UNIT', label: 'Same disk as unit'        },
          { value: 'DISK_12',      label: '12" edge-lit disk', price: '$26'    },
          { value: 'DECORATIVE',   label: 'Decorative surface mount', price: 'Varies' },
        ],
      },
      {
        key:       'unit_vanity',
        label:     'Vanity fixture',
        hint:      'Bathroom vanity standard. Lit mirrors can offset a separate mirror + bath bar.',
        tags:      ['REQUIRED'],
        inputType: 'CHIPS',
        options: [
          { value: 'BATH_BAR',   label: 'Round bath bar', price: '$27–$30'    },
          { value: 'LIT_MIRROR', label: 'Lit mirror',     price: '$138–$305'  },
        ],
      },
      {
        key:       'unit_fan_include',
        label:     'Ceiling fans included?',
        hint:      'Cost adder. Common in Southeast / Southwest. Consider regional overrides.',
        tags:      ['ADDER', 'REGIONAL'],
        inputType: 'BOOLEAN',
      },
      {
        key:       'unit_fan_blades',
        label:     'Fan blade count',
        hint:      '3-blade = modern/minimal. 4-blade = balanced. 5-blade = max airflow.',
        tags:      ['ADDER'],
        inputType: 'CHIPS',
        dependsOn: { key: 'unit_fan_include', value: 'true' },
        options: [
          { value: '3', label: '3-blade' },
          { value: '4', label: '4-blade' },
          { value: '5', label: '5-blade' },
        ],
      },
      {
        key:       'unit_undercab',
        label:     'Undercabinet lighting',
        hint:      'Typical in Class A and B+. $15–$19 per fixture, 2–3 per unit.',
        tags:      ['ADDER'],
        inputType: 'BOOLEAN',
      },
      {
        key:       'unit_kitchen_pendants',
        label:     'Kitchen island pendants',
        hint:      'Pendants over kitchen islands. If yes, which finish tier?',
        tags:      ['ADDER'],
        inputType: 'CHIPS',
        options: [
          { value: 'NONE',        label: 'No pendants'              },
          { value: 'BUDGET',      label: 'Budget pendant',     price: '$40–$80'   },
          { value: 'MID',         label: 'Mid-range pendant',  price: '$100–$200' },
          { value: 'PER_PROJECT', label: 'Per project',        price: 'Varies'    },
        ],
      },
      {
        key:       'unit_balcony',
        label:     'Balcony / patio fixture',
        hint:      'Units with balconies — disk, sconce, or nothing?',
        tags:      ['REQUIRED'],
        inputType: 'CHIPS',
        options: [
          { value: 'NONE',   label: 'Nothing'                              },
          { value: 'DISK',   label: 'Ceiling disk (wet-listed)', price: '$9–$26' },
          { value: 'SCONCE', label: 'Wall sconce',               price: 'Varies' },
        ],
      },
    ],
  },

  {
    key:   'EMERGENCY',
    label: 'Emergency',
    icon:  '🚨',
    color: 'rose',
    questions: [
      {
        key:       'em_corridors',
        label:     'Corridors — emergency approach',
        hint:      'No generator assumed. Three approaches trade off cost, aesthetics, and complexity.',
        tags:      ['REQUIRED'],
        inputType: 'CHIPS',
        options: [
          { value: 'FROGEYES',   label: 'EM Frog-eyes',                price: '$18 ea' },
          { value: 'INVERTER',   label: 'Inverter on corridor circuit', price: 'Varies' },
          { value: 'INTEGRATED', label: 'Integrated battery fixtures',  price: '+adder' },
        ],
      },
      {
        key:       'em_amenities',
        label:     'Interior amenities — emergency approach',
        hint:      'Clubhouse, fitness, leasing — often different from corridors.',
        tags:      ['REQUIRED'],
        inputType: 'CHIPS',
        options: [
          { value: 'FROGEYES',   label: 'EM Frog-eyes',               price: '$18 ea' },
          { value: 'INVERTER',   label: 'Inverter on amenity circuit', price: 'Varies' },
          { value: 'INTEGRATED', label: 'Integrated battery fixtures', price: '+adder' },
        ],
      },
      {
        key:       'em_garage',
        label:     'Garage — emergency approach',
        hint:      'GL-R series supports integrated EM battery adder.',
        tags:      ['REQUIRED'],
        inputType: 'CHIPS',
        options: [
          { value: 'INTEGRATED', label: 'Integrated battery on GL-R', price: '+adder' },
          { value: 'FROGEYES',   label: 'Separate EM frog-eyes',      price: '$18 ea' },
          { value: 'INVERTER',   label: 'Inverter circuit',           price: 'Varies' },
        ],
      },
      {
        key:       'em_boh',
        label:     'BOH — emergency approach',
        hint:      'Mechanical, electrical, storage rooms.',
        tags:      ['REQUIRED'],
        inputType: 'CHIPS',
        options: [
          { value: 'FROGEYES',   label: 'EM Frog-eyes',             price: '$18 ea' },
          { value: 'INTEGRATED', label: 'Integrated battery strip',  price: '+adder' },
          { value: 'INVERTER',   label: 'Inverter circuit',         price: 'Varies' },
        ],
      },
      {
        key:       'em_exterior',
        label:     'Exterior egress doors — emergency approach',
        hint:      'Must be wet-listed. Exit doors leading outside.',
        tags:      ['REQUIRED'],
        inputType: 'CHIPS',
        options: [
          { value: 'INTEGRATED', label: 'Integrated battery (wet-listed)', price: '+adder' },
          { value: 'FROGEYES',   label: 'NEMA-rated EM unit',              price: 'Varies' },
          { value: 'INVERTER',   label: 'Inverter on exterior circuit',    price: 'Varies' },
        ],
      },
    ],
  },

  {
    key:   'EXIT_SIGNS',
    label: 'Exit Signs',
    icon:  '🚪',
    color: 'slate',
    questions: [
      {
        key:       'exit_corridors',
        label:     'Corridors — exit sign type',
        hint:      'Thermoplastic = cost-effective default. Edge-lit = design upgrade.',
        tags:      ['REQUIRED'],
        inputType: 'CHIPS',
        options: [
          { value: 'THERMOPLASTIC', label: 'Thermoplastic',  price: '$19', series: 'EX'  },
          { value: 'EDGE_LIT',      label: 'Edge-lit glass', price: '$88', series: 'EXU' },
        ],
      },
      {
        key:       'exit_amenities',
        label:     'Interior amenities — exit sign type',
        hint:      'Clubhouse, fitness, leasing. Usually matches corridors.',
        tags:      ['REQUIRED'],
        inputType: 'CHIPS',
        options: [
          { value: 'THERMOPLASTIC', label: 'Thermoplastic',  price: '$19' },
          { value: 'EDGE_LIT',      label: 'Edge-lit glass', price: '$88' },
        ],
      },
      {
        key:       'exit_color',
        label:     'Exit sign letter color',
        hint:      'Some municipalities require red. Green is the modern default.',
        tags:      ['REQUIRED'],
        inputType: 'CHIPS',
        options: [
          { value: 'GREEN', label: 'Green' },
          { value: 'RED',   label: 'Red'   },
        ],
      },
    ],
  },

  // Stub sections — questions added in next iteration
  { key: 'CORRIDORS_STAIRWELLS', label: 'Corridors & Stairwells', icon: '🚶', color: 'violet',  questions: [] },
  { key: 'INTERIOR_AMENITIES',   label: 'Interior Amenities',     icon: '🏛️', color: 'indigo', questions: [] },
  { key: 'GARAGE',               label: 'Garage',                 icon: '🚗', color: 'orange', questions: [] },
  { key: 'SITE_EXTERIOR',        label: 'Site & Exterior',        icon: '🌿', color: 'green',  questions: [] },
  { key: 'CONTROLS',             label: 'Controls',               icon: '💡', color: 'amber',  questions: [] },
];

// ── Answer resolution ─────────────────────────────────────────────────────────
// answers = array of ClientStandardsAnswer records for this client
// Returns the most-specific matching answer record, or null.

export function resolveAnswer(answers, questionKey, projectType = '', region = '') {
  // Skip records where answer_value is null — allows "clear override" by nulling a record
  const match = (pt, r) =>
    answers.find(a =>
      a.question_key === questionKey &&
      a.projectType === pt &&
      a.region === r &&
      a.answer_value != null
    );
  return (
    match(projectType, region) ||  // most specific
    match(projectType, '')     ||  // project type, all regions
    match('', '')              ||  // global default
    null
  );
}

// ── Color map for section chips ───────────────────────────────────────────────

export const SECTION_COLOR_MAP = {
  blue:   { bg: 'bg-blue-50',   border: 'border-blue-200',   text: 'text-blue-700',   dot: 'bg-blue-400'   },
  violet: { bg: 'bg-violet-50', border: 'border-violet-200', text: 'text-violet-700', dot: 'bg-violet-400' },
  indigo: { bg: 'bg-indigo-50', border: 'border-indigo-200', text: 'text-indigo-700', dot: 'bg-indigo-400' },
  orange: { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700', dot: 'bg-orange-400' },
  green:  { bg: 'bg-green-50',  border: 'border-green-200',  text: 'text-green-700',  dot: 'bg-green-400'  },
  amber:  { bg: 'bg-amber-50',  border: 'border-amber-200',  text: 'text-amber-700',  dot: 'bg-amber-400'  },
  rose:   { bg: 'bg-rose-50',   border: 'border-rose-200',   text: 'text-rose-700',   dot: 'bg-rose-400'   },
  slate:  { bg: 'bg-slate-50',  border: 'border-slate-200',  text: 'text-slate-600',  dot: 'bg-slate-400'  },
};

export const TAG_COLORS = {
  REQUIRED:  'bg-blue-50 text-blue-600 border border-blue-200',
  ADDER:     'bg-amber-50 text-amber-700 border border-amber-200',
  CASCADE:   'bg-purple-50 text-purple-700 border border-purple-200',
  REGIONAL:  'bg-green-50 text-green-700 border border-green-200',
};
