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

// Building types — values are pricing keys, labels match the Google Sheet master
export const CLIENT_TYPES = [
  { value: 'developer',                 label: 'Developer' },
  { value: 'architect',                 label: 'Architect' },
  { value: 'interiorDesigner',          label: 'Interior Designer' },
  { value: 'generalContractor',         label: 'General Contractor' },
  { value: 'electricalEngineer',        label: 'Electrical Engineer' },
  { value: 'electricalContractor',      label: 'Electrical Contractor' },
  { value: 'clientRep',                 label: 'Client Rep' },
  { value: 'selfPerformingGc',          label: 'Self-Performing GC' },
  { value: 'developerSelfPerformingGc', label: 'Developer / Self-Performing GC' },
];

export const LOCATION_TYPES = [
  { value: 'none',        label: '(None)' },
  { value: 'localBranch', label: 'Local Branch' },
  { value: 'national',    label: 'National' },
  { value: 'standalone',  label: 'Standalone' },
];

export const PROJECT_PHASES = [
  { value: 'sd',           label: 'SD',           long: 'Schematic Design' },
  { value: 'dd',           label: 'DD',           long: 'Design Development' },
  { value: 'cd',           label: 'CD',           long: 'Construction Documents' },
  { value: 'ifc',          label: 'IFC',          long: 'Issued for Construction' },
  { value: 'construction', label: 'Construction', long: 'Construction Administration' },
  { value: 'closeout',     label: 'Closeout',     long: 'Project Closeout' },
];

export function clientTypeLabel(key) {
  return CLIENT_TYPES.find(t => t.value === key)?.label || key || '—';
}

export function locationTypeLabel(key) {
  return LOCATION_TYPES.find(t => t.value === key)?.label || key || '—';
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
