// Canonical default-dashboard widget lineups for the universal engine.
// SINGLE SOURCE OF TRUTH — consumed by both:
//   • the app  → src/lib/defaultDashboard.js re-exports this (create-default seeding)
//   • the seed → prisma/seed.js requires this (creates admin defaults on deploy)
// Field-picker dataSpec format: { groupBy, timeBucket?, terms:[{field,agg}], op }.

const TEMPLATES_BY_SECTION = {
  SALES: [
    { name: 'Combined Revenue Forecast',   chartType: 'BAR',  width: 'FULL', dataSpec: { groupBy: 'expectedOrderDate', timeBucket: 'month', terms: [{ field: 'productSaleTotal', agg: 'sum' }, { field: 'designFeeTotal', agg: 'sum' }], op: 'add' } },
    { name: 'Pipeline Value by Stage',     chartType: 'BAR',  width: 'HALF', dataSpec: { groupBy: 'procurementStage', terms: [{ field: 'productSaleTotal', agg: 'sum' }], op: 'single' } },
    { name: 'Open Projects by Organization', chartType: 'BAR',  width: 'HALF', dataSpec: { groupBy: 'client', terms: [{ field: 'projectCount', agg: 'count' }], op: 'single' } },
    { name: 'Win Rate by Owner',           chartType: 'BAR',  width: 'HALF', dataSpec: { groupBy: 'salesOwner', terms: [{ field: 'wonCount', agg: 'count' }, { field: 'decidedCount', agg: 'count' }], op: 'percent' } },
    { name: 'Win Rate by Project Type',    chartType: 'BAR',  width: 'HALF', dataSpec: { groupBy: 'projectType', terms: [{ field: 'wonCount', agg: 'count' }, { field: 'decidedCount', agg: 'count' }], op: 'percent' } },
    { name: 'Open Pipeline by Probability',chartType: 'BAR',  width: 'HALF', dataSpec: { groupBy: 'probabilityTier', terms: [{ field: 'projectCount', agg: 'count' }], op: 'single' } },
    { name: 'Projects by Service Type',    chartType: 'BAR',  width: 'HALF', dataSpec: { groupBy: 'serviceType', terms: [{ field: 'projectCount', agg: 'count' }], op: 'single' } },
    { name: 'Lost + Abandoned by Stage',   chartType: 'BAR',  width: 'HALF', dataSpec: { groupBy: 'procurementStage', terms: [{ field: 'lostAbandonedCount', agg: 'count' }], op: 'single' } },
    // Maram's Procurement Revenue cards (9-16 call; her Pipedrive dashboard).
    // `tpl` makes each one arrive on every existing Sales dashboard by itself
    // while staying an ordinary, editable chart. See src/lib/dashboards/prebuilt.js.
    { name: 'Next 12 Months — Open 80%+ Product Revenue by Order Month', chartType: 'BAR', width: 'FULL', dataSpec: { tpl: 'procurement-open-80', groupBy: 'expectedOrderDate', timeBucket: 'next12', terms: [{ field: 'productSaleTotal', agg: 'sum' }], op: 'single',
      filters: [{ field: 'procurementStatus', op: 'is', value: 'OPEN' }, { field: 'averageProbability', op: 'gte', value: 80 }] } },
    { name: 'Next 12 Months — Open + Won 20%+ Product Revenue, Running Total', chartType: 'BAR', width: 'FULL', dataSpec: { tpl: 'procurement-open-won-20-cumulative', groupBy: 'expectedOrderDate', timeBucket: 'next12', cumulative: true, terms: [{ field: 'productSaleTotal', agg: 'sum' }], op: 'single',
      filters: [{ field: 'procurementStatus', op: 'in', value: ['OPEN', 'WON'] }, { field: 'averageProbability', op: 'gte', value: 20 }] } },
    { name: 'Buyout — Not Yet Ordered (Product Revenue)', chartType: 'BAR', width: 'HALF', dataSpec: { tpl: 'procurement-buyout-open', hideZero: true, groupBy: 'client', terms: [{ field: 'productSaleTotal', agg: 'sum' }], op: 'single',
      filters: [{ field: 'procurementStage', op: 'is', value: 'BUYOUT' }, { field: 'procurementStatus', op: 'is', value: 'OPEN' }] } },
    { name: 'Average Days in Buyout by Owner', chartType: 'BAR', width: 'HALF', dataSpec: { tpl: 'procurement-buyout-days', groupBy: 'salesOwner', terms: [{ field: 'buyoutDays', agg: 'avg' }], op: 'single' } },
    { name: 'On Hold Revenue by Client', chartType: 'BAR', width: 'HALF', dataSpec: { tpl: 'procurement-on-hold', hideZero: true, groupBy: 'client', terms: [{ field: 'onHoldRevenue', agg: 'sum' }, { field: 'onHoldDesignFee', agg: 'sum' }], op: 'add' } },
  ],
  MAIN: [
    // "Things Needing a Look" — five checks for records that disagree with each
    // other, capped at five on screen and five newly-surfaced a week. kind:
    // 'verification' makes it prebuilt: no field picker, and the card fetches
    // itself from /api/verification. See src/lib/verification/checks.js.
    { name: 'Things Needing a Look',       chartType: 'VERIFICATION', width: 'FULL', dataSpec: { kind: 'verification' } },
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
    // Phase 3. A different question from the four above: not "is the rate
    // right" but "are we multiplying by the right thing at all". Both stay
    // silent until a line has five jobs behind it — see drivers.js.
    { name: 'Lines Priced Off the Wrong Thing',   chartType: 'TABLE', width: 'FULL', dataSpec: { kind: 'calibration', report: 'driverSuggestions' } },
    { name: 'What Each Line Really Tracks',       chartType: 'TABLE', width: 'FULL', dataSpec: { kind: 'calibration', report: 'driverFit' } },
  ],
};

module.exports = { TEMPLATES_BY_SECTION };
