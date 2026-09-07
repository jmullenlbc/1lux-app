// Canonical default-dashboard widget lineups for the universal engine.
// SINGLE SOURCE OF TRUTH — consumed by both:
//   • the app  → src/lib/defaultDashboard.js re-exports this (create-default seeding)
//   • the seed → prisma/seed.js requires this (creates admin defaults on deploy)
// Field-picker dataSpec format: { groupBy, timeBucket?, terms:[{field,agg}], op }.

const TEMPLATES_BY_SECTION = {
  SALES: [
    { name: 'Combined Revenue Forecast',   chartType: 'BAR',  width: 'FULL', dataSpec: { groupBy: 'expectedOrderDate', timeBucket: 'month', terms: [{ field: 'productSaleTotal', agg: 'sum' }, { field: 'designFeeTotal', agg: 'sum' }], op: 'add' } },
    { name: 'Pipeline Value by Stage',     chartType: 'BAR',  width: 'HALF', dataSpec: { groupBy: 'procurementStage', terms: [{ field: 'productSaleTotal', agg: 'sum' }], op: 'single' } },
    { name: 'Open Deals by Organization',  chartType: 'BAR',  width: 'HALF', dataSpec: { groupBy: 'client', terms: [{ field: 'projectCount', agg: 'count' }], op: 'single' } },
    { name: 'Win Rate by Owner',           chartType: 'BAR',  width: 'HALF', dataSpec: { groupBy: 'salesOwner', terms: [{ field: 'wonCount', agg: 'count' }, { field: 'decidedCount', agg: 'count' }], op: 'percent' } },
    { name: 'Win Rate by Project Type',    chartType: 'BAR',  width: 'HALF', dataSpec: { groupBy: 'projectType', terms: [{ field: 'wonCount', agg: 'count' }, { field: 'decidedCount', agg: 'count' }], op: 'percent' } },
    { name: 'Open Pipeline by Probability',chartType: 'BAR',  width: 'HALF', dataSpec: { groupBy: 'probabilityTier', terms: [{ field: 'projectCount', agg: 'count' }], op: 'single' } },
    { name: 'Deals by Service Type',       chartType: 'BAR',  width: 'HALF', dataSpec: { groupBy: 'serviceType', terms: [{ field: 'projectCount', agg: 'count' }], op: 'single' } },
    { name: 'Lost + Abandoned by Stage',   chartType: 'BAR',  width: 'HALF', dataSpec: { groupBy: 'procurementStage', terms: [{ field: 'lostAbandonedCount', agg: 'count' }], op: 'single' } },
  ],
  MAIN: [
    { name: 'New Projects by Month',       chartType: 'LINE', width: 'FULL', dataSpec: { groupBy: 'createdAt', timeBucket: 'month', terms: [{ field: 'projectCount', agg: 'count' }], op: 'single' } },
    { name: 'Product Revenue by Client',   chartType: 'BAR',  width: 'HALF', dataSpec: { groupBy: 'client', terms: [{ field: 'productSaleTotal', agg: 'sum' }], op: 'single' } },
    { name: 'Projects by Phase',           chartType: 'BAR',  width: 'HALF', dataSpec: { groupBy: 'phase', terms: [{ field: 'projectCount', agg: 'count' }], op: 'single' } },
    { name: 'Projects by Service Type',    chartType: 'BAR',  width: 'HALF', dataSpec: { groupBy: 'serviceType', terms: [{ field: 'projectCount', agg: 'count' }], op: 'single' } },
    { name: 'Projects by Status',          chartType: 'BAR',  width: 'HALF', dataSpec: { groupBy: 'procurementStatus', terms: [{ field: 'projectCount', agg: 'count' }], op: 'single' } },
    { name: 'Projects by Project Type',    chartType: 'BAR',  width: 'HALF', dataSpec: { groupBy: 'projectType', terms: [{ field: 'projectCount', agg: 'count' }], op: 'single' } },
    { name: 'Projects by Sales Owner',     chartType: 'BAR',  width: 'HALF', dataSpec: { groupBy: 'salesOwner', terms: [{ field: 'projectCount', agg: 'count' }], op: 'single' } },
    { name: 'Win Rate by Owner',           chartType: 'BAR',  width: 'HALF', dataSpec: { groupBy: 'salesOwner', terms: [{ field: 'wonCount', agg: 'count' }, { field: 'decidedCount', agg: 'count' }], op: 'percent' } },
  ],
  BUDGET: [
    { name: 'Budgets by Type',             chartType: 'BAR',  width: 'FULL', dataSpec: { groupBy: 'budgetType', terms: [{ field: 'budgetsCount', agg: 'count' }], op: 'single' } },
    { name: 'Budget Value by Client',      chartType: 'BAR',  width: 'HALF', dataSpec: { groupBy: 'client', terms: [{ field: 'budgetValue', agg: 'sum' }], op: 'single' } },
    { name: 'Budget Value by Source',      chartType: 'BAR',  width: 'HALF', dataSpec: { groupBy: 'budgetSource', terms: [{ field: 'budgetValue', agg: 'sum' }], op: 'single' } },
    { name: 'Budgets Created by Month',    chartType: 'LINE', width: 'HALF', dataSpec: { groupBy: 'createdAt', timeBucket: 'month', terms: [{ field: 'budgetsCount', agg: 'count' }], op: 'single' } },
    { name: 'Budget Value by Month',       chartType: 'LINE', width: 'HALF', dataSpec: { groupBy: 'createdAt', timeBucket: 'month', terms: [{ field: 'budgetValue', agg: 'sum' }], op: 'single' } },
    { name: 'Budgets by Service Type',     chartType: 'BAR',  width: 'HALF', dataSpec: { groupBy: 'serviceType', terms: [{ field: 'budgetsCount', agg: 'count' }], op: 'single' } },
    { name: 'Budgets by Project Type',     chartType: 'BAR',  width: 'HALF', dataSpec: { groupBy: 'projectType', terms: [{ field: 'budgetsCount', agg: 'count' }], op: 'single' } },
    { name: 'Budgets by Client',           chartType: 'BAR',  width: 'HALF', dataSpec: { groupBy: 'client', terms: [{ field: 'budgetsCount', agg: 'count' }], op: 'single' } },
    // Pricing calibration (learning loop): model vs actual per budget line.
    // kind:'calibration' widgets read CalibrationSample rows, not the field
    // catalog — see src/lib/calibration/report.js.
    { name: 'Pricing Calibration — Rate Drift',   chartType: 'TABLE', width: 'FULL', dataSpec: { kind: 'calibration', report: 'rateDrift' } },
    { name: 'Model vs Actual — Drift by Line',    chartType: 'BAR',   width: 'FULL', dataSpec: { kind: 'calibration', report: 'modelVsActualByLine' } },
    { name: 'Drift by Building Type',             chartType: 'BAR',   width: 'HALF', dataSpec: { kind: 'calibration', report: 'modelVsActualByBuilding' } },
    { name: 'Calibration Coverage by Line',       chartType: 'BAR',   width: 'HALF', dataSpec: { kind: 'calibration', report: 'coverageByLine' } },
    { name: 'Projects with Actuals by Month',     chartType: 'LINE',  width: 'HALF', dataSpec: { kind: 'calibration', report: 'samplesByMonth' } },
  ],
};

module.exports = { TEMPLATES_BY_SECTION };
