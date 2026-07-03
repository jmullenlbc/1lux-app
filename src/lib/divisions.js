// Company divisions — users are assigned to one. The Sales Owner dropdown on a
// project pulls users whose division is SALES.
export const DIVISIONS = [
  { key: 'SALES',           label: 'Sales' },
  { key: 'OPERATIONS',      label: 'Operations' },
  { key: 'FINANCE',         label: 'Finance' },
  { key: 'PRECONSTRUCTION', label: 'Pre-Construction' },
  { key: 'CONSTRUCTION',    label: 'Construction' },
];

export const DIVISION_LABEL = Object.fromEntries(DIVISIONS.map(d => [d.key, d.label]));
export const DIVISION_KEYS  = DIVISIONS.map(d => d.key);
