// ── Client National Standards — Section & Subsection Definitions ──────────────
// Source: "National standards items to discuss.xlsx"
//
// These are the fixed sections and subsections ILC asks for every client.
// Specific questions within each subsection are added in a later sprint.
// question_key format: SECTION_KEY.SUBSECTION_KEY  (e.g. RESIDENTIAL_UNITS.ENTRYWAYS)

export const STANDARDS_SECTIONS = [
  {
    key:   'RESIDENTIAL_UNITS',
    label: 'Residential Units',
    icon:  '🏠',
    color: 'blue',
    subsections: [
      { key: 'DISK_STYLE',        label: 'Disk Style'                  },
      { key: 'HVAC_CLOSET',       label: 'HVAC / Mechanical Closet'    },
      { key: 'SWITCHES',          label: 'Switches'                    },
      { key: 'ENTRYWAYS',         label: 'Entryways'                   },
      { key: 'UNDERCABINET',      label: 'Undercabinet'                },
      { key: 'KITCHEN_PENDANTS',  label: 'Kitchen Pendants'            },
      { key: 'CEILING_FANS',      label: 'Ceiling Fans'                },
      { key: 'BEDROOMS',          label: 'Bedrooms'                    },
      { key: 'LIVING_ROOM',       label: 'Living Room'                 },
      { key: 'CLOSETS',           label: 'Closets'                     },
      { key: 'VANITIES',          label: 'Vanities'                    },
      { key: 'BALCONIES',         label: 'Balconies'                   },
      { key: 'ATTACHED_GARAGES',  label: 'Attached Garages'            },
    ],
  },
  {
    key:   'CORRIDORS_STAIRWELLS',
    label: 'Corridors & Stairwells',
    icon:  '🚶',
    color: 'violet',
    subsections: [
      { key: 'GENERAL_LIGHTING',   label: 'General Lighting'   },
      { key: 'UNIT_ENTRY',         label: 'Unit Entry'         },
      { key: 'ENDS_OF_CORRIDORS',  label: 'Ends of Corridors'  },
      { key: 'ELEVATOR_LOBBIES',   label: 'Elevator Lobbies'   },
      { key: 'STAIRWELLS',         label: 'Stairwells'         },
    ],
  },
  {
    key:   'INTERIOR_AMENITIES',
    label: 'Interior Amenities',
    icon:  '🏛️',
    color: 'indigo',
    subsections: [
      { key: 'BUDGET_PLACEHOLDER', label: 'Budget Placeholder Range' },
    ],
  },
  {
    key:   'GARAGE',
    label: 'Garage',
    icon:  '🚗',
    color: 'orange',
    subsections: [
      { key: 'GENERAL_LIGHTING', label: 'General Lighting' },
      { key: 'EGRESS_LIGHTING',  label: 'Egress Lighting'  },
      { key: 'CONTROLS',         label: 'Controls'         },
    ],
  },
  {
    key:   'SITE_EXTERIOR',
    label: 'Site & Exterior',
    icon:  '🌿',
    color: 'green',
    subsections: [
      { key: 'SURFACE_PARKING',    label: 'Surface Parking'    },
      { key: 'COURTYARDS',         label: 'Courtyards'         },
      { key: 'EXTERIOR_AMENITIES', label: 'Exterior Amenities' },
      { key: 'PARKS',              label: 'Parks'              },
      { key: 'CARPORTS',           label: 'Carports'           },
      { key: 'DETACHED_GARAGES',   label: 'Detached Garages'   },
      { key: 'EXTERIOR_BOH',       label: 'Exterior BOH'       },
      { key: 'CONTROLS',           label: 'Controls'           },
    ],
  },
  {
    key:   'CONTROLS',
    label: 'Controls',
    icon:  '💡',
    color: 'amber',
    subsections: [
      { key: 'CORRIDORS',           label: 'Corridors'              },
      { key: 'INTERIOR_AMENITIES',  label: 'Interior Amenities'     },
      { key: 'GARAGE',              label: 'Garage'                 },
      { key: 'BOH',                 label: 'BOH'                    },
      { key: 'EXTERIOR_EGRESS',     label: 'Exterior Egress Doors'  },
      { key: 'SITE',                label: 'Site'                   },
    ],
  },
  {
    key:   'EMERGENCY',
    label: 'Emergency',
    icon:  '🚨',
    color: 'rose',
    subsections: [
      { key: 'CORRIDORS',          label: 'Corridors'             },
      { key: 'INTERIOR_AMENITIES', label: 'Interior Amenities'    },
      { key: 'GARAGE',             label: 'Garage'                },
      { key: 'BOH',                label: 'BOH'                   },
      { key: 'EXTERIOR_EGRESS',    label: 'Exterior Egress Doors' },
    ],
  },
  {
    key:   'EXIT_SIGNS',
    label: 'Exit Signs',
    icon:  '🚪',
    color: 'slate',
    subsections: [
      { key: 'CORRIDORS',          label: 'Corridors'          },
      { key: 'INTERIOR_AMENITIES', label: 'Interior Amenities' },
      { key: 'GARAGE',             label: 'Garage'             },
    ],
  },
];

// Flat map: question_key → { section, subsection, sectionLabel, subsectionLabel }
export const STANDARDS_KEY_MAP = {};
for (const section of STANDARDS_SECTIONS) {
  for (const sub of section.subsections) {
    const key = `${section.key}.${sub.key}`;
    STANDARDS_KEY_MAP[key] = {
      section:          section.key,
      subsection:       sub.key,
      sectionLabel:     section.label,
      subsectionLabel:  sub.label,
    };
  }
}

export const TOTAL_SUBSECTIONS = Object.keys(STANDARDS_KEY_MAP).length;

// Color classes for section chips
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
