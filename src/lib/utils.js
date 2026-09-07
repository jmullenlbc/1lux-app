import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

export function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

// Client Type — Mike's 8 (2026-09-06). A client can be several of these at once,
// so the UI is a multi-select stored in Client.orgTypes as label strings; the
// single `Client.type` column is derived from the first tick and kept for the
// colour tags, stats and anything else already reading it.
export const CLIENT_TYPES = [
  { value: 'developer',                 label: 'Developer' },
  { value: 'architect',                 label: 'Architect' },
  { value: 'generalContractor',         label: 'General Contractor' },
  { value: 'selfPerformingGc',          label: 'Self-Performing GC' },
  { value: 'electricalContractor',      label: 'Electrical Contractor' },
  { value: 'electricalEngineer',        label: 'Electrical Engineer' },
  { value: 'interiorDesigner',          label: 'Interior Designer' },
  { value: 'clientRep',                 label: 'Client Rep' },
];

// Retired combined value — a client that was both is now two ticks. Kept so old
// rows still render a label instead of a raw key.
const LEGACY_CLIENT_TYPE_LABELS = {
  developerSelfPerformingGc: 'Developer / Self-Performing GC',
};

// The multi-select's option list, as the label strings stored in orgTypes.
export const ORG_TYPE_OPTIONS = CLIENT_TYPES.map(t => t.label);

// orgTypes holds labels; Client.type holds a key. This bridges the two.
export function clientTypeKeyFromLabel(label) {
  if (!label) return null;
  const current = CLIENT_TYPES.find(t => t.label === label)?.value;
  if (current) return current;
  // A client saved before the combined option was retired still has the old
  // label in orgTypes; without this it would come back as "no type at all".
  const legacy = Object.entries(LEGACY_CLIENT_TYPE_LABELS).find(([, l]) => l === label);
  return legacy ? legacy[0] : null;
}

export const LOCATION_TYPES = [
  { value: 'national',    label: 'National' },
  { value: 'localBranch', label: 'Local Branch' },
  { value: 'standalone',  label: 'Standalone' },
];

// Developer Type — multi-select (a builder can be both). Mike 2026-09-06.
export const DEVELOPER_TYPES = [
  { value: 'merchant',     label: 'Merchant' },
  { value: 'longTermHold', label: 'Long-Term Hold' },
];

export function developerTypeLabel(key) {
  return DEVELOPER_TYPES.find(t => t.value === key)?.label || key || '—';
}

export const PROJECT_PHASES = [
  { value: 'sd',           label: 'SD',           long: 'Schematic Design' },
  { value: 'dd',           label: 'DD',           long: 'Design Development' },
  { value: 'cd',           label: 'CD',           long: 'Construction Documents' },
  { value: 'ifc',          label: 'IFC',          long: 'Issued for Construction' },
  { value: 'construction', label: 'Construction', long: 'Construction Administration' },
  { value: 'closeout',     label: 'Closeout',     long: 'Project Closeout' },
];

export function clientTypeLabel(key) {
  return CLIENT_TYPES.find(t => t.value === key)?.label
    || LEGACY_CLIENT_TYPE_LABELS[key]
    || key || '—';
}

export function locationTypeLabel(key) {
  if (!key || key === 'none') return '—';
  return LOCATION_TYPES.find(t => t.value === key)?.label || key;
}

export function phaseLabel(key, long = false) {
  const p = PROJECT_PHASES.find(p => p.value === key);
  if (!p) return key || '—';
  return long ? p.long : p.label;
}

export const SERVICE_TYPES = [
  { value: 'fullDesign',   label: 'Full Design' },
  { value: 'designAssist', label: 'Design Assist' },
  { value: 'peerReview',   label: 'Peer Review' },
  { value: 'bidOnly',      label: 'Bid Only' },
  { value: 'other',        label: 'Other' },
];

export function serviceTypeLabel(key) {
  return SERVICE_TYPES.find(t => t.value === key)?.label || key || '—';
}

// Project's asset/product type — one controlled vocabulary used across the platform
// (Sales Details editor, dashboards). Distinct from BUILDING_TYPES (construction form).
// Mike's six (2026-09-06). Stored values are unchanged where one already
// existed — 'BTR' stays the value behind "Single Family For Rent" so no project
// row has to be rewritten.
export const PROJECT_TYPES = [
  { value: 'Multi-Family',  label: 'Multi-Family' },
  { value: 'Senior',        label: 'Senior Living' },
  { value: 'BTR',           label: 'Single Family For Rent' },
  { value: 'SFS',           label: 'Single Family For Sale' },
  { value: 'Affordable',    label: 'Affordable Housing' },
  { value: 'Hospitality',   label: 'Hospitality' },
];

// Retired choices. Rows still holding one keep a readable label; the picker no
// longer offers them.
const LEGACY_PROJECT_TYPE_LABELS = {
  'Student':   'Student Housing',
  'Mixed-Use': 'Mixed-Use',
  'Other':     'Other',
};

export function projectTypeLabel(key) {
  return PROJECT_TYPES.find(t => t.value === key)?.label
    || LEGACY_PROJECT_TYPE_LABELS[key]
    || key || '—';
}

export const BUILDING_TYPES = [
  { value: 'singleFamily', label: 'Single Family (1-2 Levels)'         },
  { value: 'townHouses',   label: 'Town Houses (2-3 Levels)'           },
  { value: 'stackedFlats', label: 'Town House / Stacked Flats (3 Levels)' },
  { value: 'garden',       label: 'Garden (3 Levels)'                  },
  { value: 'gurban',       label: 'Gurban (4-5 Levels)'                },
  { value: 'wrap',         label: 'Wrap (3-5 Levels)'                  },
  { value: 'podium',       label: 'Podium (3-8 Levels)'                },
  { value: 'midRise',      label: 'Mid Rise (9-12 Levels)'             },
  { value: 'highRise',     label: 'High Rise (12+ Levels)'             },
];

export function buildingTypeLabel(key) {
  return BUILDING_TYPES.find(t => t.value === key)?.label || key || '—';
}

export const WIZARD_STEPS = [
  { id: 'project-data', label: 'Project Data',          short: 'Project',    icon: 'Building2',   designOnly: false },
  { id: 'units',        label: 'Residential Units',      short: 'Units',      icon: 'Home',        designOnly: false },
  { id: 'corridors',    label: 'Corridors & Stairwells', short: 'Corridors',  icon: 'ArrowRight',  designOnly: false },
  { id: 'amenities',    label: 'Interior Amenities',     short: 'Amenities',  icon: 'Sparkles',    designOnly: false },
  { id: 'exterior',     label: 'Exterior & Site',        short: 'Exterior',   icon: 'Trees',       designOnly: false },
  { id: 'emergency',    label: 'Emergency Lighting',     short: 'Emergency',  icon: 'ShieldAlert', designOnly: false },
  { id: 'exit-signs',   label: 'Exit Signs',             short: 'Exit Signs', icon: 'DoorOpen',    designOnly: true  },
  { id: 'controls',     label: 'Controls & Energy',      short: 'Controls',   icon: 'Zap',         designOnly: false },
  { id: 'summary',      label: 'Summary & Budget',       short: 'Summary',    icon: 'BarChart3',   designOnly: false },
];

/** Returns the steps active for the current mode */
export function getActiveSteps(isDesign = false) {
  return isDesign ? WIZARD_STEPS : WIZARD_STEPS.filter(s => !s.designOnly);
}

export const DESIGN_WIZARD_STEPS = [
  { id: 'project-data',       label: 'Project Data',           short: 'Project',   icon: 'Building2'   },
  { id: 'design-units',       label: 'Residential Units',      short: 'Units',     icon: 'Home'        },
  { id: 'design-garage',      label: 'Garage',                 short: 'Garage',    icon: 'Car'         },
  { id: 'design-corridors',   label: 'Corridors & Stairwells', short: 'Corridors', icon: 'ArrowRight'  },
  { id: 'interior-amenities', label: 'Interior Amenities',     short: 'Amenities', icon: 'Sparkles'    },
  { id: 'exterior',           label: 'Exterior & Site',        short: 'Exterior',  icon: 'Trees'       },
  { id: 'design-emergency',   label: 'Emergency Lighting',     short: 'Emergency', icon: 'ShieldAlert' },
  { id: 'design-exit-signs',  label: 'Exit Signs',             short: 'Exit Signs',icon: 'DoorOpen'    },
  { id: 'controls',           label: 'Controls & Energy',      short: 'Controls',  icon: 'Zap'         },
  { id: 'summary',            label: 'Summary & Budget',       short: 'Summary',   icon: 'BarChart3'   },
];

export function getDesignStepIndex(stepId) {
  return DESIGN_WIZARD_STEPS.findIndex(s => s.id === stepId);
}

export function getDesignNextStep(stepId) {
  const idx = getDesignStepIndex(stepId);
  return idx >= 0 && idx < DESIGN_WIZARD_STEPS.length - 1 ? DESIGN_WIZARD_STEPS[idx + 1].id : null;
}

export function getDesignPrevStep(stepId) {
  const idx = getDesignStepIndex(stepId);
  return idx > 0 ? DESIGN_WIZARD_STEPS[idx - 1].id : null;
}

export function getStepIndex(stepId, isDesign = false) {
  return getActiveSteps(isDesign).findIndex(s => s.id === stepId);
}

export function getNextStep(stepId, isDesign = false) {
  const steps = getActiveSteps(isDesign);
  const idx = steps.findIndex(s => s.id === stepId);
  return idx >= 0 && idx < steps.length - 1 ? steps[idx + 1].id : null;
}

export function getPrevStep(stepId, isDesign = false) {
  const steps = getActiveSteps(isDesign);
  const idx = steps.findIndex(s => s.id === stepId);
  return idx > 0 ? steps[idx - 1].id : null;
}

export function responsesToSections(responseArray) {
  const sections = {};
  for (const r of responseArray) {
    if (!sections[r.section]) sections[r.section] = {};
    sections[r.section][r.questionKey] = r.answerValue;
  }
  return sections;
}
