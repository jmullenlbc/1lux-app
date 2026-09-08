/**
 * Default dashboard widget configs.
 *
 * `DEFAULT_WIDGETS` (legacy, category/metric/viewBy) seeds the old /crm/dashboards.
 * `TEMPLATES_BY_SECTION` (new, field-picker dataSpec) seeds the universal engine —
 * these are the "template charts" every new admin default starts with. Both formats
 * coexist during the migration; the render route bridges any legacy widget.
 */

// Field-picker templates for the universal dashboard engine — canonical list
// lives in prisma/seeds/dashboardTemplates.js so the seed and app never drift.
export { TEMPLATES_BY_SECTION } from '../../prisma/seeds/dashboardTemplates';

export const DEFAULT_WIDGETS = [
  {
    name: 'Procurement Revenue Forecast',
    category: 'REVENUE',
    metric: 'value',
    viewBy: 'month',
    segmentBy: 'dealStatus',
    filters: JSON.stringify([
      { field: 'pipeline', operator: 'is', value: 'PROCUREMENT' },
      { field: 'expectedOrderDate', operator: 'is', value: 'next_12_months' },
    ]),
    width: 'FULL',
    position: 0,
  },
  {
    name: 'Design Fee Forecast',
    category: 'REVENUE',
    metric: 'designFee',
    viewBy: 'month',
    segmentBy: 'dealStatus',
    filters: JSON.stringify([
      { field: 'pipeline', operator: 'is', value: 'DESIGN' },
      { field: 'expectedOrderDate', operator: 'is', value: 'next_12_months' },
    ]),
    width: 'FULL',
    position: 1,
  },
  {
    // Mike, 2026-09-08: "We should see total combined revenue of a design fee
    // and product sales on a job." No pipeline filter, so a full-design job puts
    // both of its boards on this chart — the bar total IS product sales plus
    // design fees, and the split shows which half is which.
    name: 'Combined Revenue Forecast',
    category: 'REVENUE',
    metric: 'value',
    viewBy: 'month',
    segmentBy: 'pipeline',
    filters: JSON.stringify([
      { field: 'expectedOrderDate', operator: 'is', value: 'next_12_months' },
    ]),
    width: 'FULL',
    position: 2,
  },
  {
    name: 'Pipeline Value by Stage',
    category: 'REVENUE',
    metric: 'value',
    viewBy: 'stage',
    segmentBy: 'pipeline',
    filters: JSON.stringify([
      { field: 'dealStatus', operator: 'is_any_of', value: ['OPEN'] },
    ]),
    width: 'HALF',
    position: 3,
  },
  {
    // Split by board on purpose: a full-design job is open on Procurement and on
    // Design at the same time, so it contributes two deals here. Segmenting by
    // pipeline makes that visible instead of leaving a client's count looking
    // mysteriously doubled.
    name: 'Open Deals by Organization',
    category: 'DEAL_COUNT',
    metric: 'count',
    viewBy: 'client',
    segmentBy: 'pipeline',
    filters: JSON.stringify([
      { field: 'dealStatus', operator: 'is_any_of', value: ['OPEN'] },
    ]),
    width: 'HALF',
    position: 4,
  },
  {
    name: 'Win Rate by Owner',
    category: 'CONVERSION',
    metric: 'rate',
    viewBy: 'owner',
    segmentBy: null,
    filters: JSON.stringify([]),
    width: 'HALF',
    position: 5,
  },
  {
    name: 'Win Rate by Project Type',
    category: 'CONVERSION',
    metric: 'rate',
    viewBy: 'projectType',
    segmentBy: null,
    filters: JSON.stringify([]),
    width: 'HALF',
    position: 6,
  },
  {
    name: 'Open Pipeline by Probability',
    category: 'DEAL_COUNT',
    metric: 'count',
    viewBy: 'probabilityTier',
    segmentBy: 'pipeline',
    filters: JSON.stringify([
      { field: 'dealStatus', operator: 'is_any_of', value: ['OPEN'] },
    ]),
    width: 'HALF',
    position: 7,
  },
  {
    // Was grouped by "lost reason", which no longer exists as a picked value —
    // the reason is written out on the project. Grouped by organization instead,
    // which answers the question people actually ask about losses.
    name: 'Lost Deal Analysis',
    category: 'DEAL_COUNT',
    metric: 'count',
    viewBy: 'client',
    segmentBy: 'pipeline',
    filters: JSON.stringify([
      { field: 'dealStatus', operator: 'is_any_of', value: ['LOST'] },
    ]),
    width: 'HALF',
    position: 8,
  },
  {
    // Mike, 2026-09-08: "We need to always break out deals won to design deals
    // won and procurement deals won." Losing the design and later winning the
    // procurement is a real outcome here, so one merged "deals won" number would
    // hide the thing worth knowing.
    name: 'Deals Won by Owner',
    category: 'DEAL_COUNT',
    metric: 'count',
    viewBy: 'owner',
    segmentBy: 'pipeline',
    filters: JSON.stringify([
      { field: 'dealStatus', operator: 'is_any_of', value: ['WON', 'COMPLETED'] },
    ]),
    width: 'HALF',
    position: 9,
  },
  {
    // Runs on the deal history written since 2026-09-08. Deals that closed
    // before that have no recorded closing date, so they are counted and
    // reported rather than averaged in on a guess.
    name: 'Sales Cycle Duration by Owner',
    category: 'DURATION',
    metric: 'days',
    viewBy: 'owner',
    segmentBy: 'pipeline',
    filters: JSON.stringify([
      { field: 'dealStatus', operator: 'is_any_of', value: ['WON', 'COMPLETED', 'LOST'] },
    ]),
    width: 'HALF',
    position: 10,
  },
];
