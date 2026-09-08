// Curated, layman-labeled field catalog per dashboard section.
// The picker only ever offers these — never raw schema columns.
//
// `tier` feeds the future MCP redact() layer (ilc_only | client_ok | public).
// Dashboards are internal-only, so the engine reads everything untiered today;
// the tags are recorded now so MCP has one source of truth later.
//
// Field kinds:
//   type:'number'    → a measure (can be aggregated / used in formulas). `source` = dot-path on the section row.
//   type:'dimension' → a group-by category.
//   type:'date'      → a time axis (group by week/month/quarter).

import { SERVICE_TYPES } from '@/lib/utils';
import { WON_STATUSES, DECIDED_STATUSES, STAGE_LABEL } from '@/lib/pipeline';

// Value → layman label maps so dashboards never show raw field values.
// serviceType mirrors the platform-wide SERVICE_TYPES (single source of truth).
const SERVICE_TYPE_LABELS = Object.fromEntries(SERVICE_TYPES.map(t => [t.value, t.label]));
const STATUS_LABELS = { OPEN: 'Open', WON: 'Won', LOST: 'Lost', COMPLETED: 'Completed', ABANDONED: 'Abandoned' };
// Comes from pipeline.js, never a copy. This map used to be typed out here, so a
// stage rename showed up on the boards and not on the dashboards. It also picks
// up the legacy design keys for free, so an un-migrated row still reads properly.
const STAGE_LABELS  = STAGE_LABEL;
const PHASE_LABELS  = { sd: 'Schematic Design', dd: 'Design Development', cd: 'Construction Docs', ifc: 'Issued for Construction', construction: 'Construction', closeout: 'Closeout' };
const BUDGET_TYPE_LABELS = { conceptual: 'Conceptual', design: 'Full Design', peer_review: 'Peer Review' };

export const SECTIONS = [
  { key: 'MAIN',   label: 'Main' },
  { key: 'SALES',  label: 'Sales' },
  { key: 'BUDGET', label: 'Pre-Con · Budget' },
];
export const SECTION_LABEL = Object.fromEntries(SECTIONS.map(s => [s.key, s.label]));

export const FIELD_CATALOG = {
  SALES: [
    // measures
    { key: 'projectCount',       label: 'Projects',            type: 'number', unit: 'count', tier: 'ilc_only', source: '_count' },
    { key: 'productSaleTotal',   label: 'Product Sale Total',  type: 'number', unit: '$',     tier: 'ilc_only', source: 'contractValue' },
    { key: 'designFeeTotal',     label: 'Design Fee Total',    type: 'number', unit: '$',     tier: 'ilc_only', source: 'designContractValue' },
    { key: 'probabilityToWin',   label: 'Probability to Win',  type: 'number', unit: '%',     tier: 'ilc_only', source: 'probabilityToWin' },
    { key: 'probabilityToMoveForward', label: 'Probability to Move Forward', type: 'number', unit: '%', tier: 'ilc_only', source: 'probabilityToMoveForward' },
    { key: 'averageProbability', label: 'Average Probability', type: 'number', unit: '%',     tier: 'ilc_only', source: 'averageProbability' },
    // status-conditional counts — power win rate & loss analysis
    { key: 'wonCount',           label: 'Won',                 type: 'number', unit: 'count', tier: 'ilc_only', source: '_count', where: { source: 'procurementStatus', op: 'in', value: WON_STATUSES },
      description: 'Projects won (includes Completed — a completed job was won).' },
    { key: 'lostCount',          label: 'Lost',                type: 'number', unit: 'count', tier: 'ilc_only', source: '_count', where: { source: 'procurementStatus', op: 'in', value: ['LOST'] } },
    { key: 'abandonedCount',     label: 'Abandoned',           type: 'number', unit: 'count', tier: 'ilc_only', source: '_count', where: { source: 'procurementStatus', op: 'in', value: ['ABANDONED'] } },
    { key: 'lostAbandonedCount', label: 'Lost + Abandoned',    type: 'number', unit: 'count', tier: 'ilc_only', source: '_count', where: { source: 'procurementStatus', op: 'in', value: ['LOST', 'ABANDONED'] } },
    { key: 'decidedCount',       label: 'Past Open (decided)', type: 'number', unit: 'count', tier: 'ilc_only', source: '_count', where: { source: 'procurementStatus', op: 'in', value: DECIDED_STATUSES },
      description: 'Every project that has moved past Open: won, completed, lost or abandoned.' },
    // dimensions
    { key: 'client',             label: 'Client',              type: 'dimension', source: 'client.name' },
    { key: 'serviceType',        label: 'Service Type',        type: 'dimension', source: 'serviceType', valueLabels: SERVICE_TYPE_LABELS },
    { key: 'projectType',        label: 'Project Type',        type: 'dimension', source: 'projectType' },
    { key: 'procurementStage',   label: 'Procurement Stage',   type: 'dimension', source: 'procurementStage', valueLabels: STAGE_LABELS },
    { key: 'procurementStatus',  label: 'Procurement Status',  type: 'dimension', source: 'procurementStatus', valueLabels: STATUS_LABELS },
    { key: 'salesOwner',         label: 'Sales Owner',         type: 'dimension', source: 'salesOwner.name' },
    { key: 'probabilityTier',    label: 'Probability Tier',    type: 'bucket',    source: 'averageProbability',
      buckets: [ { max: 24, label: '0–24%' }, { max: 49, label: '25–49%' }, { max: 79, label: '50–79%' }, { max: 100, label: '80–100%' } ] },
    // time
    { key: 'expectedOrderDate',  label: 'Expected Order Date', type: 'date', source: 'expectedOrderDate' },
    { key: 'createdAt',          label: 'Created Date',        type: 'date', source: 'createdAt' },
  ],
  BUDGET: [
    // measures
    { key: 'budgetsCount',       label: 'Budgets',             type: 'number', unit: 'count', tier: 'ilc_only', source: '_count' },
    { key: 'budgetValue',        label: 'Budget Value',        type: 'number', unit: '$',     tier: 'ilc_only', source: 'budgetValue' },
    { key: 'conceptualTotal',    label: 'Conceptual / Design Total', type: 'number', unit: '$', tier: 'ilc_only', source: 'conceptualTotal' },
    { key: 'bidMatrixTotal',     label: 'Bid Matrix Total',    type: 'number', unit: '$',     tier: 'ilc_only', source: 'bidMatrixTotal' },
    // dimensions
    { key: 'budgetType',         label: 'Budget Type',         type: 'dimension', source: 'budgetType', valueLabels: BUDGET_TYPE_LABELS },
    { key: 'budgetSource',       label: 'Budget Source',       type: 'dimension', source: 'budgetSource' },
    { key: 'client',             label: 'Client',              type: 'dimension', source: 'client.name' },
    { key: 'serviceType',        label: 'Service Type',        type: 'dimension', source: 'serviceType', valueLabels: SERVICE_TYPE_LABELS },
    { key: 'projectType',        label: 'Project Type',        type: 'dimension', source: 'projectType' },
    { key: 'hasBidMatrix',       label: 'Has Bid Matrix',      type: 'dimension', source: 'hasBidMatrix' },
    // time
    { key: 'createdAt',          label: 'Created Date',        type: 'date', source: 'createdAt' },
    { key: 'sentDate',           label: 'Budget Sent Date',    type: 'date', source: 'budgetSentDate' },
  ],
  MAIN: [
    // measures
    { key: 'projectCount',       label: 'Projects',            type: 'number', unit: 'count', tier: 'ilc_only', source: '_count' },
    { key: 'productSaleTotal',   label: 'Product Sale Total',  type: 'number', unit: '$',     tier: 'ilc_only', source: 'contractValue' },
    { key: 'designFeeTotal',     label: 'Design Fee Total',    type: 'number', unit: '$',     tier: 'ilc_only', source: 'designContractValue' },
    { key: 'wonCount',           label: 'Won',                 type: 'number', unit: 'count', tier: 'ilc_only', source: '_count', where: { source: 'procurementStatus', op: 'in', value: WON_STATUSES },
      description: 'Projects won (includes Completed — a completed job was won).' },
    { key: 'decidedCount',       label: 'Past Open (decided)', type: 'number', unit: 'count', tier: 'ilc_only', source: '_count', where: { source: 'procurementStatus', op: 'in', value: DECIDED_STATUSES },
      description: 'Every project that has moved past Open: won, completed, lost or abandoned.' },
    // dimensions
    { key: 'client',             label: 'Client',              type: 'dimension', source: 'client.name' },
    { key: 'serviceType',        label: 'Service Type',        type: 'dimension', source: 'serviceType', valueLabels: SERVICE_TYPE_LABELS },
    { key: 'projectType',        label: 'Project Type',        type: 'dimension', source: 'projectType' },
    { key: 'phase',              label: 'Phase',               type: 'dimension', source: 'phase', valueLabels: PHASE_LABELS },
    { key: 'procurementStatus',  label: 'Status',              type: 'dimension', source: 'procurementStatus', valueLabels: STATUS_LABELS },
    { key: 'salesOwner',         label: 'Sales Owner',         type: 'dimension', source: 'salesOwner.name' },
    // time
    { key: 'createdAt',          label: 'Created Date',        type: 'date', source: 'createdAt' },
  ],
};

export function fieldsFor(section)  { return FIELD_CATALOG[section] || []; }
export function measuresFor(section){ return fieldsFor(section).filter(f => f.type === 'number'); }
export function dimensionsFor(section){ return fieldsFor(section).filter(f => f.type === 'dimension' || f.type === 'date' || f.type === 'bucket'); }
export function fieldByKey(section, key){ return fieldsFor(section).find(f => f.key === key) || null; }

// Read a dot-path (e.g. "client.name") off a row.
export function readField(row, source) {
  if (!source || source === '_count') return 1; // count sentinel
  return source.split('.').reduce((v, k) => (v == null ? null : v[k]), row);
}
