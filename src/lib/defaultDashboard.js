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
    name: 'Open Deals by Organization',
    category: 'DEAL_COUNT',
    metric: 'count',
    viewBy: 'client',
    segmentBy: 'serviceType',
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
    name: 'Lost Deal Analysis',
    category: 'DEAL_COUNT',
    metric: 'count',
    viewBy: 'lostReason',
    segmentBy: 'pipeline',
    filters: JSON.stringify([
      { field: 'dealStatus', operator: 'is_any_of', value: ['LOST'] },
    ]),
    width: 'HALF',
    position: 8,
  },
  {
    name: 'Sales Cycle Duration by Owner',
    category: 'DURATION',
    metric: 'days',
    viewBy: 'owner',
    segmentBy: 'pipeline',
    filters: JSON.stringify([
      { field: 'dealStatus', operator: 'is_any_of', value: ['WON', 'LOST'] },
    ]),
    width: 'HALF',
    position: 9,
  },
];
