// Conference planner (0160, Mike 11-1): the fixed lists. No imports, so browser
// pages can use this.

export const VERTICALS = [
  { key: 'MULTIFAMILY',     label: 'Multifamily' },
  { key: 'BTR',             label: 'Build-to-Rent' },
  { key: 'AFFORDABLE',      label: 'Affordable / LIHTC' },
  { key: 'SENIORS',         label: 'Seniors Housing' },
  { key: 'STUDENT',         label: 'Student Housing' },
  { key: 'LIGHTING_DESIGN', label: 'Lighting / Design' },
];

export const FOCUS_TAGS = [
  { key: 'EXECUTIVE_NETWORKING',     label: 'Executive networking' },
  { key: 'DEVELOPMENT_CONSTRUCTION', label: 'Development & construction' },
  { key: 'DESIGN_ARCHITECTURE',      label: 'Design & architecture' },
  { key: 'CAPITAL_INVESTMENT',       label: 'Capital & investment' },
  { key: 'OPERATIONS_TECH',          label: 'Operations & proptech' },
  { key: 'POLICY_ADVOCACY',          label: 'Policy & advocacy' },
  { key: 'CODES_SUSTAINABILITY',     label: 'Codes & sustainability' },
  { key: 'LIGHTING',                 label: 'Lighting industry' },
  { key: 'CAMPUS_P3',                label: 'Campus / P3' },
];

export const FORMATS = [
  { key: 'DEAL_MAKING', label: 'Deal making' },
  { key: 'EDUCATION',   label: 'Education' },
  { key: 'EXPO',        label: 'Expo' },
  { key: 'MIXED',       label: 'Mixed' },
];

export const ACCESS_ROUTES = [
  { key: 'TICKET',       label: 'Ticket' },
  { key: 'MEMBERS_ONLY', label: 'Members only' },
  { key: 'SPONSOR_ONLY', label: 'Sponsor only' },
  { key: 'EXHIBIT_ONLY', label: 'Exhibit only' },
  { key: 'BARRED',       label: 'Suppliers barred' },
];

export const SCOPES = [
  { key: 'COLORADO', label: 'Colorado' },
  { key: 'NATIONAL', label: 'National' },
  { key: 'REGIONAL', label: 'Regional' },
];

export const EDITION_STATUSES = [
  { key: 'CONSIDERING', label: 'Considering' },
  { key: 'PLANNED',     label: 'Planned' },
  { key: 'REGISTERED',  label: 'Registered' },
  { key: 'ATTENDED',    label: 'Attended' },
  { key: 'SKIPPED',     label: 'Skipped' },
  { key: 'CANCELLED',   label: 'Cancelled' },
];

export const PRICE_BASES = [
  { key: 'PUBLISHED',  label: 'Published' },
  { key: 'INDICATIVE', label: 'Indicative' },
  { key: 'ESTIMATED',  label: 'Rough' },
];

export const MEMBERSHIP_INCLUDE = [
  { key: 'AUTO', label: 'Auto' },
  { key: 'Y',    label: 'Yes' },
  { key: 'N',    label: 'No' },
];

export const TIERS = ['A', 'B', 'C', 'X'];

export const REGIONS = {
  MOUNTAIN:  ['CO', 'UT', 'WY', 'MT', 'ID', 'NV', 'NM', 'AZ'],
  WEST:      ['CA', 'WA', 'OR', 'HI', 'AK'],
  SOUTHWEST: ['TX', 'OK'],
  MIDWEST:   ['IL', 'MN', 'MO', 'WI', 'MI', 'IN', 'OH', 'IA', 'KS', 'NE', 'SD', 'ND'],
  SOUTHEAST: ['FL', 'GA', 'NC', 'SC', 'TN', 'AL', 'MS', 'LA', 'AR', 'KY', 'VA', 'WV'],
  NORTHEAST: ['NY', 'MA', 'PA', 'NJ', 'MD', 'DC', 'CT', 'RI', 'NH', 'ME', 'VT', 'DE'],
};

export const regionFor = (state) => Object.keys(REGIONS).find(r => REGIONS[r].includes(state)) || 'TBD';

const REGION_LABELS = {
  MOUNTAIN: 'Mountain', WEST: 'West', SOUTHWEST: 'Southwest', MIDWEST: 'Midwest',
  SOUTHEAST: 'Southeast', NORTHEAST: 'Northeast', TBD: 'To be set',
};
export const regionLabel = (key) => REGION_LABELS[key] || key || '';

const labelFrom = (list) => (key) => list.find(x => x.key === key)?.label || key || '';
export const verticalLabel = labelFrom(VERTICALS);
export const focusLabel    = labelFrom(FOCUS_TAGS);
export const formatLabel   = labelFrom(FORMATS);
export const accessLabel   = labelFrom(ACCESS_ROUTES);
export const scopeLabel    = labelFrom(SCOPES);
export const statusLabel   = labelFrom(EDITION_STATUSES);
export const priceLabel    = labelFrom(PRICE_BASES);
