// ── Client Standards — Question Definitions ────────────────────────────────────
// Keys use flat snake_case. DB stores answers only; questions live here.
// question_key format: snake_case string (e.g. 'unit_disk_style')
// CCT keys use 'cct_*' prefix and are handled by the CCT renderer.

// ── Project types ─────────────────────────────────────────────────────────────

export const PROJECT_TYPES = [
  { value: 'BTR',      label: 'BTR / Townhome'  },
  { value: 'GARDEN',   label: 'Garden walk-up'   },
  { value: 'PODIUM',   label: 'Podium / Wrap'    },
  { value: 'HIGHRISE', label: 'High-rise'        },
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
          { value: 'EDGE_5',    label: '5" Edge-lit'  },
          { value: 'EDGE_7',    label: '7" Edge-lit'  },
          { value: 'BACKLIT_6', label: '6" Back-lit'  },
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
          { value: 'SAME_AS_UNIT', label: 'Same disk as unit'          },
          { value: 'DISK_12',      label: '12" edge-lit disk'          },
          { value: 'DECORATIVE',   label: 'Decorative surface mount'   },
        ],
      },
      {
        key:       'unit_vanity',
        label:     'Vanity fixture',
        hint:      'Bathroom vanity standard. Lit mirrors can offset a separate mirror + bath bar.',
        tags:      ['REQUIRED'],
        inputType: 'CHIPS',
        options: [
          { value: 'BATH_BAR',          label: 'Round bath bar'               },
          { value: 'LIT_MIRROR',        label: 'Lit mirror'                   },
          { value: 'SQUARE_BATH_BAR',   label: 'Square bath bar'              },
          { value: 'SHADED_2_3',        label: '2 or 3 Light Shaded Light'    },
          { value: 'DOUBLE_TUBE',       label: 'Double Tube Bath Bar'         },
          { value: 'CUSTOM',            label: 'Custom Per Project'           },
        ],
      },
      {
        key:       'unit_vanity_finish',
        label:     'Vanity finish preferences',
        inputType: 'MULTI_CHIPS',
        options: [
          { value: 'BLACK',          label: 'Black'            },
          { value: 'CHROME',         label: 'Chrome'           },
          { value: 'BRUSHED_NICKEL', label: 'Brushed Nickel'   },
          { value: 'WHITE',          label: 'White'            },
          { value: 'CUSTOM',         label: 'Custom Per Project' },
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
        key:       'unit_fan_light_kit',
        label:     'Light kit included on fan?',
        tags:      ['ADDER'],
        inputType: 'BOOLEAN',
        dependsOn: { key: 'unit_fan_include', value: 'true' },
      },
      {
        key:       'unit_fan_finish',
        label:     'Fan finish preferences',
        inputType: 'MULTI_CHIPS',
        dependsOn: { key: 'unit_fan_include', value: 'true' },
        options: [
          { value: 'WHITE',          label: 'White'          },
          { value: 'BLACK',          label: 'Black'          },
          { value: 'BRUSHED_NICKEL', label: 'Brushed Nickel' },
          { value: 'WOOD',           label: 'Wood'           },
        ],
      },
      {
        key:       'unit_fan_wall_controller',
        label:     'Wall controller?',
        hint:      'Standard wall switch (not remote/app)',
        inputType: 'BOOLEAN',
        dependsOn: { key: 'unit_fan_include', value: 'true' },
      },
      {
        key:       'unit_fan_dimming',
        label:     'Fan dimming?',
        inputType: 'BOOLEAN',
        dependsOn: { key: 'unit_fan_include', value: 'true' },
      },
      {
        key:       'unit_undercab',
        label:     'Undercabinet lighting',
        hint:      'Typical in Class A and B+. 2–3 per unit.',
        tags:      ['ADDER'],
        inputType: 'MULTI_CHIPS',
        options: [
          { value: '120V',        label: '120v'                       },
          { value: 'LOW_VOLTAGE', label: 'Low-Voltage w/Remote Driver' },
        ],
      },
      {
        key:       'unit_kitchen_pendants',
        label:     'Kitchen island pendants',
        hint:      'Pendants over kitchen islands. If yes, which finish tier?',
        tags:      ['ADDER'],
        inputType: 'CHIPS',
        options: [
          { value: 'NONE',        label: 'No pendants'    },
          { value: 'BUDGET',      label: 'Budget pendant' },
          { value: 'MID',         label: 'Mid-range'      },
          { value: 'PER_PROJECT', label: 'Per project'    },
        ],
      },
      {
        key:       'unit_kitchen_pendants_styles',
        label:     'Preferred pendant styles',
        hint:      'Pick 5 styles',
        inputType: 'TEXT',
      },
      {
        key:       'unit_balcony',
        label:     'Balcony / patio fixture',
        hint:      'Units with balconies — disk, sconce, or nothing?',
        tags:      ['REQUIRED'],
        inputType: 'CHIPS',
        options: [
          { value: 'NONE',   label: 'Nothing'                    },
          { value: 'DISK',   label: 'Ceiling disk (wet-listed)'  },
          { value: 'SCONCE', label: 'Wall sconce'                },
        ],
      },
      {
        key:       'unit_balcony_styles',
        label:     'Preferred balcony fixture styles',
        hint:      'Pick 3 styles',
        inputType: 'TEXT',
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
          { value: 'FROGEYES',   label: 'EM Frog-eyes'               },
          { value: 'INVERTER',   label: 'Inverter on corridor circuit' },
          { value: 'INTEGRATED', label: 'Integrated battery fixtures'  },
        ],
      },
      {
        key:       'em_amenities',
        label:     'Interior amenities — emergency approach',
        hint:      'Clubhouse, fitness, leasing — often different from corridors.',
        tags:      ['REQUIRED'],
        inputType: 'CHIPS',
        options: [
          { value: 'FROGEYES',   label: 'EM Frog-eyes'               },
          { value: 'INVERTER',   label: 'Inverter on amenity circuit' },
          { value: 'INTEGRATED', label: 'Integrated battery fixtures' },
        ],
      },
      {
        key:       'em_garage',
        label:     'Garage — emergency approach',
        hint:      'GL-R series supports integrated EM battery adder.',
        tags:      ['REQUIRED'],
        inputType: 'CHIPS',
        options: [
          { value: 'INTEGRATED', label: 'Integrated battery on GL-R' },
          { value: 'FROGEYES',   label: 'Separate EM frog-eyes'      },
          { value: 'INVERTER',   label: 'Inverter circuit'           },
        ],
      },
      {
        key:       'em_garage_motion',
        label:     'Integrated motion sensor?',
        hint:      'Garage fixtures with integrated motion sensing.',
        inputType: 'BOOLEAN',
      },
      {
        key:       'em_boh',
        label:     'BOH — emergency approach',
        hint:      'Mechanical, electrical, storage rooms.',
        tags:      ['REQUIRED'],
        inputType: 'CHIPS',
        options: [
          { value: 'FROGEYES',   label: 'EM Frog-eyes'            },
          { value: 'INTEGRATED', label: 'Integrated battery strip' },
          { value: 'INVERTER',   label: 'Inverter circuit'        },
        ],
      },
      {
        key:       'em_exterior',
        label:     'Exterior egress doors — emergency approach',
        hint:      'Must be wet-listed. Exit doors leading outside.',
        tags:      ['REQUIRED'],
        inputType: 'CHIPS',
        options: [
          { value: 'INTEGRATED', label: 'Utilitarian wallpack w/ Integrated Battery' },
          { value: 'INVERTER',   label: 'Any wall sconce with remote inverter'       },
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
          { value: 'THERMOPLASTIC', label: 'Thermoplastic',  series: 'EX'  },
          { value: 'EDGE_LIT',      label: 'Edge-lit glass', series: 'EXU' },
        ],
      },
      {
        key:       'exit_amenities',
        label:     'Interior amenities — exit sign type',
        hint:      'Clubhouse, fitness, leasing. Usually matches corridors.',
        tags:      ['REQUIRED'],
        inputType: 'CHIPS',
        options: [
          { value: 'THERMOPLASTIC', label: 'Thermoplastic'  },
          { value: 'EDGE_LIT',      label: 'Edge-lit glass' },
        ],
      },
    ],
  },

  {
    key:      'CORRIDORS_STAIRWELLS',
    label:    'Corridors & Stairwells',
    icon:     '🚶',
    color:    'violet',
    questions: [
      {
        key:       'corridor_general_lighting',
        label:     'General lighting type',
        tags:      ['REQUIRED'],
        inputType: 'CHIPS',
        options: [
          { value: 'SURFACE_MOUNT', label: 'Surface mount 7" disks' },
          { value: 'RECESSED',      label: 'Recessed downlights'    },
        ],
      },
      {
        key:       'corridor_spacing_surface',
        label:     'Fixture spacing',
        hint:      'Dynamic spacing for surface mount fixtures',
        inputType: 'CHIPS',
        dependsOn: { key: 'corridor_general_lighting', value: 'SURFACE_MOUNT' },
        options: [
          { value: '8FT',  label: '8 ft'  },
          { value: '9FT',  label: '9 ft'  },
          { value: '10FT', label: '10 ft' },
          { value: '11FT', label: '11 ft' },
          { value: '12FT', label: '12 ft' },
        ],
      },
      {
        key:       'corridor_spacing_recessed',
        label:     'Fixture spacing',
        hint:      'Dynamic spacing for recessed downlights',
        inputType: 'CHIPS',
        dependsOn: { key: 'corridor_general_lighting', value: 'RECESSED' },
        options: [
          { value: '6FT', label: '6 ft' },
          { value: '7FT', label: '7 ft' },
          { value: '8FT', label: '8 ft' },
          { value: '9FT', label: '9 ft' },
        ],
      },
      {
        key:       'corridor_entry_sconce_styles',
        label:     'Unit entry sconce — preferred styles',
        hint:      'Pick 5 styles',
        inputType: 'TEXT',
      },
      {
        key:       'corridor_light_ends',
        label:     'Light ends of corridors?',
        hint:      'Additional fixture at dead-end walls',
        inputType: 'BOOLEAN',
      },
    ],
  },

  {
    key:      'INTERIOR_AMENITIES',
    label:    'Interior Amenities',
    icon:     '🏛️',
    color:    'indigo',
    questions: [
      {
        key:       'amenities_avg_per_sf',
        label:     'Average $/SF lighting budget',
        hint:      'Clubhouse, fitness, leasing, and other common areas',
        tags:      ['REQUIRED'],
        inputType: 'MULTI_CHIPS',
        options: [
          { value: '$5',  label: '$5'  },
          { value: '$6',  label: '$6'  },
          { value: '$7',  label: '$7'  },
          { value: '$8',  label: '$8'  },
          { value: '$9',  label: '$9'  },
          { value: '$10', label: '$10' },
          { value: '$11', label: '$11' },
          { value: '$12', label: '$12' },
          { value: '$13', label: '$13' },
        ],
      },
    ],
  },

  {
    key:      'GARAGE',
    label:    'Garage',
    icon:     '🚗',
    color:    'orange',
    questions: [
      {
        key:       'garage_typical_fixture',
        label:     'Typical garage fixture',
        hint:      'Paste product link or describe',
        tags:      ['REQUIRED'],
        inputType: 'TEXT',
      },
    ],
  },

  {
    key:      'SITE_EXTERIOR',
    label:    'Site & Exterior',
    icon:     '🌿',
    color:    'green',
    questions: [],
    subsections: [
      'Solar powered lighting',
      'Surface Parking',
      'Courtyards',
      'Exterior pool areas',
      'Parks',
      'Carports',
      'Detached garages',
      'Attached garages',
    ],
  },

  {
    key:      'CONTROLS',
    label:    'Controls',
    icon:     '💡',
    color:    'amber',
    questions: [],
    subsections: [
      'Corridors',
      'Interior amenities',
      'Garage',
      'BOH',
      'Exterior pool area',
      'Site',
    ],
  },
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
