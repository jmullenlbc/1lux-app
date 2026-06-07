// Master list of Budget QC checklist items.
// Never hardcode itemKey strings anywhere else — always import from here.

export const BUDGET_QC_ITEMS = [
  // ── AUTO-CHECKS (system evaluates; human acknowledges if needed) ──────────
  { key: 'auto_emergency',   label: 'Emergency / life safety fixtures present',      section: 'auto',    autoCheck: true },
  { key: 'auto_controls',    label: 'Controls & commissioning line included',         section: 'auto',    autoCheck: true },
  { key: 'auto_qty_drift',   label: 'No dramatic quantity changes vs. last version', section: 'auto',    autoCheck: true },
  { key: 'auto_price_drift', label: 'No dramatic price changes vs. last version',    section: 'auto',    autoCheck: true },

  // ── FIXTURE & LINE ITEM QC ────────────────────────────────────────────────
  { key: 'fixture_downlight_components', label: 'Downlights have all components (trim, driver, housing)', section: 'fixture' },
  { key: 'fixture_lamps',                label: 'Lamps included where required',                           section: 'fixture' },
  { key: 'fixture_remote_drivers',       label: 'Remote drivers and power supplies included',              section: 'fixture' },
  { key: 'fixture_channel_tape',         label: 'Channel fits specified LED tape',                         section: 'fixture' },
  { key: 'fixture_ul_listings',          label: 'All decorative fixtures have UL listings',                section: 'fixture' },

  // ── PRICING & COMMERCIAL ─────────────────────────────────────────────────
  { key: 'pricing_tax',        label: 'Sales tax included',                       section: 'pricing' },
  { key: 'pricing_freight',    label: 'Freight included',                         section: 'pricing' },
  { key: 'pricing_warehousing',label: 'Warehousing included',                     section: 'pricing' },
  { key: 'pricing_pia',        label: 'Pay-in-advance manufacturers reviewed',    section: 'pricing' },
];

export const QC_SECTIONS = [
  { key: 'auto',    label: 'System Auto-Checks' },
  { key: 'fixture', label: 'Fixture & Line Item QC' },
  { key: 'pricing', label: 'Pricing & Commercial' },
];

export function getItemsBySection(sectionKey) {
  return BUDGET_QC_ITEMS.filter(i => i.section === sectionKey);
}

export function getTotalCount() {
  return BUDGET_QC_ITEMS.length;
}
