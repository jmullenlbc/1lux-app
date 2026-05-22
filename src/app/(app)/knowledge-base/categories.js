// Shared constants — no 'use client' so server components can import these too

export const CATEGORIES = [
  { key: 'UNIT',         label: 'Unit',          desc: 'Fixture layout & spacing within residential units',        color: 'blue',   icon: '🏠' },
  { key: 'CORRIDOR',     label: 'Corridor',       desc: 'Hallway fixture placement, alignment & spacing',           color: 'violet', icon: '🚶' },
  { key: 'BOH',          label: 'Back of House',  desc: 'Utility, storage, mechanical & service area standards',    color: 'slate',  icon: '🏭' },
  { key: 'GARAGE',       label: 'Garage',         desc: 'Parking structure spacing, mounting & fixture selection',  color: 'orange', icon: '🚗' },
  { key: 'EXTERIOR',     label: 'Exterior',       desc: 'Site lighting, walkways, area & landscape standards',      color: 'green',  icon: '🌿' },
  { key: 'CONTROLS',     label: 'Controls',       desc: 'Control intent narratives, sensor rules & dimming',        color: 'indigo', icon: '💡' },
  { key: 'FIXTURE_SPEC', label: 'Fixture Specs',  desc: 'ILC standard product selections by space type',           color: 'amber',  icon: '🔦' },
  { key: 'QC',           label: 'QC Process',     desc: 'Quality control checklists & review procedures',          color: 'rose',   icon: '✅' },
  { key: 'DIMMING',      label: 'Dimming',        desc: 'Dimming standards, percentages & driver requirements',    color: 'cyan',   icon: '🎚️' },
  { key: 'PHOTOMETRICS', label: 'Photometrics',   desc: 'Calculation standards, software settings & deliverables', color: 'teal',   icon: '📐' },
  { key: 'REVIT',        label: 'Revit',           desc: 'Revit model setup, BIM 360 workflows & project procedures',  color: 'sky',  icon: '🏗️' },
];

export const COLOR_MAP = {
  blue:   { bg: 'bg-blue-50',   border: 'border-blue-200',   text: 'text-blue-700',   dot: 'bg-blue-500',   badge: 'bg-blue-100 text-blue-700'   },
  violet: { bg: 'bg-violet-50', border: 'border-violet-200', text: 'text-violet-700', dot: 'bg-violet-500', badge: 'bg-violet-100 text-violet-700' },
  slate:  { bg: 'bg-slate-50',  border: 'border-slate-200',  text: 'text-slate-700',  dot: 'bg-slate-500',  badge: 'bg-slate-100 text-slate-700'  },
  orange: { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700', dot: 'bg-orange-500', badge: 'bg-orange-100 text-orange-700' },
  green:  { bg: 'bg-green-50',  border: 'border-green-200',  text: 'text-green-700',  dot: 'bg-green-500',  badge: 'bg-green-100 text-green-700'  },
  indigo: { bg: 'bg-indigo-50', border: 'border-indigo-200', text: 'text-indigo-700', dot: 'bg-indigo-500', badge: 'bg-indigo-100 text-indigo-700' },
  amber:  { bg: 'bg-amber-50',  border: 'border-amber-200',  text: 'text-amber-700',  dot: 'bg-amber-500',  badge: 'bg-amber-100 text-amber-700'  },
  rose:   { bg: 'bg-rose-50',   border: 'border-rose-200',   text: 'text-rose-700',   dot: 'bg-rose-500',   badge: 'bg-rose-100 text-rose-700'   },
  cyan:   { bg: 'bg-cyan-50',   border: 'border-cyan-200',   text: 'text-cyan-700',   dot: 'bg-cyan-500',   badge: 'bg-cyan-100 text-cyan-700'   },
  teal:   { bg: 'bg-teal-50',   border: 'border-teal-200',   text: 'text-teal-700',   dot: 'bg-teal-500',   badge: 'bg-teal-100 text-teal-700'   },
  sky:    { bg: 'bg-sky-50',    border: 'border-sky-200',    text: 'text-sky-700',    dot: 'bg-sky-500',    badge: 'bg-sky-100 text-sky-700'    },
};
