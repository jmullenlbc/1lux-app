/**
 * Parametric Estimating Engine
 *
 * Bottom-up estimate: confirmed PlacedFixtures × ILCSpec.budget_cost.
 * Pure function, no DB or network calls.
 *
 * tierPrefs: { [masterTypeCode]: 'LOW_COST' | 'STANDARD' | 'UPGRADE' }
 */
export function runParametricEstimate({
  fixtures     = [],
  ilcSpecs     = [],
  masterTypes  = [],
  freightRate     = 0.06,
  warehousingRate = 0.03,
  salesTaxPct     = 0,
  tierPrefs       = {},
}) {
  // ── Count confirmed fixtures by master_type_id ────────────────────────────
  const counts = {};
  for (const f of fixtures) {
    if (f.status !== 'CONFIRMED') continue;
    const code = f.master_type_id;
    counts[code] = (counts[code] || 0) + 1;
  }

  // ── Build line items ──────────────────────────────────────────────────────
  const lineItems = [];

  for (const [code, qty] of Object.entries(counts).sort(([a], [b]) => a.localeCompare(b))) {
    const mt       = masterTypes.find(m => m.code === code);
    const tierPref = tierPrefs[code] || 'STANDARD';

    // Priority: preferred-tier + default → preferred-tier any → any default → first active
    const pool = ilcSpecs.filter(s => s.master_type_id === code && s.is_active !== false);
    const spec  =
      pool.find(s => s.tier === tierPref && s.is_default) ||
      pool.find(s => s.tier === tierPref) ||
      pool.find(s => s.is_default) ||
      pool[0] ||
      null;

    const unitCost = (spec?.budget_cost != null && spec.budget_cost >= 0) ? spec.budget_cost : null;
    const total    = unitCost != null ? qty * unitCost : null;

    lineItems.push({
      code,
      family:  mt?.fixture_family ?? code,
      spec,
      availableSpecs: pool,
      tierPref,
      qty,
      unitCost,
      total,
      hasCost: unitCost != null,
    });
  }

  // ── Totals ────────────────────────────────────────────────────────────────
  const coveredItems = lineItems.filter(li => li.hasCost);
  const subtotal     = coveredItems.reduce((s, li) => s + li.total, 0);
  const freight      = subtotal * freightRate;
  const warehousing  = subtotal * warehousingRate;
  const tax          = subtotal * salesTaxPct;
  const grandTotal   = subtotal + freight + warehousing + tax;

  const missingCosts  = lineItems.some(li => !li.hasCost);
  const totalFixtures = Object.values(counts).reduce((s, c) => s + c, 0);

  return {
    lineItems,
    totalFixtures,
    coveredFixtures: coveredItems.reduce((s, li) => s + li.qty, 0),
    subtotal,
    freight,
    warehousing,
    tax,
    grandTotal,
    missingCosts,
    freightRate,
    warehousingRate,
    salesTaxPct,
  };
}

/**
 * Map placed fixture master type codes → wizard projectData fields.
 * Used by "Apply Counts to Wizard" to pre-populate unit-count fields.
 */
export const WIZARD_FIELD_MAP = {
  F:  'numFans',
  V:  'numVanities',
  Z:  null,  // steplight, no direct wizard field
  UC: null,  // undercabinet, wizard uses qualitative choice, not count
};

export function deriveWizardCounts(fixtures) {
  const counts = {};
  for (const f of fixtures) {
    if (f.status !== 'CONFIRMED') continue;
    const code = f.master_type_id;
    counts[code] = (counts[code] || 0) + 1;
  }

  const updates = {};
  for (const [code, field] of Object.entries(WIZARD_FIELD_MAP)) {
    if (field && counts[code] != null) updates[field] = counts[code];
  }
  return updates; // e.g. { numFans: 82, numVanities: 164 }
}
