import { regionFor } from './constants.js';

// Turns one row of the research file into the shape the engine and the loader
// use. No database, so the test checks this mapping too.

const VERTICAL = {
  Multifamily: 'MULTIFAMILY', BTR: 'BTR', Affordable: 'AFFORDABLE',
  Seniors: 'SENIORS', Student: 'STUDENT', 'Lighting/Design': 'LIGHTING_DESIGN',
};
const ACCESS = {
  Ticket: 'TICKET',
  'Members-only (NMHC)': 'MEMBERS_ONLY',
  'Sponsor-only': 'SPONSOR_ONLY',
  'Sponsor/exhibit only': 'EXHIBIT_ONLY',
  'Exhibit (sessions members-only)': 'EXHIBIT_ONLY',
  'Members-only (suppliers barred)': 'BARRED',
};
const FORMAT = { Mixed: 'MIXED', Education: 'EDUCATION', 'Deal-making': 'DEAL_MAKING', Expo: 'EXPO' };
const SCOPE  = { National: 'NATIONAL', Regional: 'REGIONAL', Colorado: 'COLORADO' };
const BASIS  = { Published: 'PUBLISHED', Indicative: 'INDICATIVE', Estimated: 'ESTIMATED' };

export function seriesFromSeed(s) {
  return {
    slug: s.slug,
    name: s.name,
    organizer: s.organizer ?? null,
    vertical: VERTICAL[s.vertical],
    format: FORMAT[s.format] ?? null,
    audience: s.audience ?? null,
    description: s.description ?? null,
    url: s.url ?? null,
    accessRoute: ACCESS[s.accessRoute],
    supplierEligible: !!s.supplierEligible,
    regCostPerCompany: !!s.regCostPerCompany,
    membershipRequired: s.membershipRequired ?? null,
    supplierRestrictions: s.supplierRestrictions ?? null,
    buyerDensity: s.buyerDensity,
    supplierAccess: s.supplierAccess,
  };
}

// Dollars, as the engine reads them. The loader turns them into cents.
export function editionFromSeed(e) {
  return {
    key: e.key,
    year: e.year,
    name: e.name,
    startDate: e.startDate ?? null,
    endDate: e.endDate ?? null,
    dateStatus: e.dateStatus,
    priorDates: e.priorDates ?? null,
    city: e.city ?? null,
    state: e.state ?? null,
    region: regionFor(e.state),
    scope: SCOPE[e.scope],
    isLocal: !!e.isLocal,
    attendance: e.attendance ?? null,
    regCost: e.regCost ?? null,
    regCostBasis: BASIS[e.regCostBasis],
    regCostDetail: e.regCostDetail ?? null,
    sponsorMinText: e.sponsorMinText ?? null,
    hotelRateOverride: e.hotelRateOverride ?? null,
    researchNotes: e.researchNotes ?? null,
    addedFrom: e.addedFrom ?? null,
  };
}

export const PLAN_YEAR = 2027;

// Dues in dollars. unlocks are series slugs: going to one of these needs it.
export const SEED_MEMBERSHIPS = [
  {
    orgName: 'NMHC Board level supplier',
    annualDues: 10000,
    include: 'AUTO',
    notes: 'Year 1 intro price. $16,500 a year after that.',
    unlocks: ['nmhc-annual-meeting', 'nmhc-spring-meeting', 'nmhc-fall-board-of-directors-meeting'],
  },
  { orgName: 'Argentum Industry Partner', annualDues: null, include: 'N', notes: null, unlocks: [] },
  { orgName: 'AAMD/CAA supplier',         annualDues: null, include: 'N', notes: null, unlocks: [] },
  { orgName: 'ULI',                       annualDues: null, include: 'N', notes: null, unlocks: [] },
  { orgName: 'NH&RA/NCSHA associate',     annualDues: null, include: 'N', notes: null, unlocks: [] },
];
