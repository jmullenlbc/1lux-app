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

import { ALL_SERVICE_TYPES, BUILDING_TYPES } from '@/lib/utils';
import { WON_STATUSES, DECIDED_STATUSES, ON_HOLD_STATUSES, STAGE_LABEL, WEIGHTED_PROBABILITY_LABEL, WEIGHTED_REVENUE_LABEL } from '@/lib/pipeline';

// Value → layman label maps so dashboards never show raw field values.
// serviceType mirrors the platform-wide SERVICE_TYPES (single source of truth).
// ALL_SERVICE_TYPES, not SERVICE_TYPES: "Other" left the picker on 2026-09-19
// but old rows still hold it, and a dashboard must still be able to name them.
const SERVICE_TYPE_LABELS = Object.fromEntries(ALL_SERVICE_TYPES.map(t => [t.value, t.label]));
const SUBTYPE_LABELS = Object.fromEntries(BUILDING_TYPES.map(t => [t.value, t.label]));
const STATUS_LABELS = { OPEN: 'Open', ON_HOLD: 'On Hold', WON: 'Won', LOST: 'Lost', COMPLETED: 'Completed', ABANDONED: 'Abandoned' };
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
    { key: 'averageProbability', label: WEIGHTED_PROBABILITY_LABEL, type: 'number', unit: '%', tier: 'ilc_only', source: 'averageProbability',
      description: 'Probability to Win and Probability to Move Forward, averaged.' },
    // Maram 9-17 — weighted money, On Hold money, and the buyout tracker.
    { key: 'weightedRevenue',    label: `${WEIGHTED_REVENUE_LABEL} (product)`, type: 'number', unit: '$', tier: 'ilc_only', source: 'weightedRevenue',
      description: 'Product sale × Weighted Probability %, per project.' },
    { key: 'weightedDesignFee',  label: `${WEIGHTED_REVENUE_LABEL} (design fee)`, type: 'number', unit: '$', tier: 'ilc_only', source: 'weightedDesignFee',
      description: 'Design fee × Weighted Probability %, per project.' },
    { key: 'onHoldRevenue',      label: 'On Hold Revenue (product)', type: 'number', unit: '$', tier: 'ilc_only', source: 'contractValue', where: { source: 'procurementStatus', op: 'in', value: ON_HOLD_STATUSES },
      description: 'Product sale on projects whose procurement status is On Hold.' },
    { key: 'onHoldDesignFee',    label: 'On Hold Revenue (design fee)', type: 'number', unit: '$', tier: 'ilc_only', source: 'designContractValue', where: { source: 'designStatus', op: 'in', value: ON_HOLD_STATUSES },
      description: 'Design fee on projects whose design status is On Hold.' },
    { key: 'buyoutDays',         label: 'Buyout Duration (days)', type: 'number', unit: 'days', tier: 'ilc_only', source: 'buyoutDays',
      description: 'Days from the job entering Buyout to the day it entered CA / Procurement, read from the stage history. Blank until both moves have happened.' },
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
    { key: 'projectSubtype',     label: 'Project Subtype',     type: 'dimension', source: 'projectSubtype', valueLabels: SUBTYPE_LABELS },
    { key: 'designStatus',       label: 'Design Status',       type: 'dimension', source: 'designStatus', valueLabels: STATUS_LABELS },
    { key: 'procurementStage',   label: 'Procurement Stage',   type: 'dimension', source: 'procurementStage', valueLabels: STAGE_LABELS },
    { key: 'procurementStatus',  label: 'Procurement Status',  type: 'dimension', source: 'procurementStatus', valueLabels: STATUS_LABELS },
    { key: 'salesOwner',         label: 'Sales Owner',         type: 'dimension', source: 'salesOwner.name' },
    { key: 'probabilityTier',    label: 'Probability Tier',    type: 'bucket',    source: 'averageProbability',
      buckets: [ { max: 24, label: '0–24%' }, { max: 49, label: '25–49%' }, { max: 79, label: '50–79%' }, { max: 100, label: '80–100%' } ] },
    // time
    { key: 'expectedContractExecutionDate', label: 'Expected Contract Execution Date', type: 'date', source: 'expectedContractExecutionDate' },
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
