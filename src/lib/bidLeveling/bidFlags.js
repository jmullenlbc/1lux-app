/**
 * Bid Leveling inclusion questions (Mike 10-18). One BidFlag row per key per
 * bid. This is the master list: never hardcode a key anywhere else.
 *
 * `hints` seed the quote reader; they never decide a state on their own.
 * Every INCLUDED or EXCLUDED needs verbatim evidence from the quote. No
 * evidence means NOT_STATED, which feeds the clarification list.
 */

export const BID_FLAG_KEYS = [
  { key: 'unit_pricing',    label: 'Unit pricing provided',              group: 'pricing' },
  { key: 'freight',         label: 'Freight',                            group: 'logistics', hints: /freight|f\.o\.b|prepaid|allowed/i },
  { key: 'warehousing',     label: 'Warehousing, stage and store',       group: 'logistics', hints: /stage|store|warehous/i },
  { key: 'deliveries',      label: 'Number of deliveries',               group: 'logistics', hints: /deliver|shipment|release/i },
  { key: 'controls_common', label: 'Common area controls',               group: 'scope',     hints: /control|bom/i },
  { key: 'controls_unit',   label: 'In unit sensors, switches and dimmers', group: 'scope',  hints: /occ|sensor|wallbox|dimmer|switch/i },
  { key: 'em_batteries',    label: 'Emergency batteries',                group: 'scope',     hints: /\bem\b|emergency|battery|inverter/i },
  { key: 'fire_hoods',      label: 'Fire rated hoods and barriers',      group: 'scope',     hints: /fire|hood|hat|barrier/i },
  { key: 'tape_drivers',    label: 'LED tape drivers and power supplies', group: 'scope',    hints: /driver|power supply|psu|transformer/i },
  { key: 'landscape_xfmr',  label: 'Landscape transformers',             group: 'scope',     hints: /landscape|transformer/i },
  { key: 'poles_bolts',     label: 'Poles and anchor bolts',             group: 'scope',     hints: /pole|anchor|bolt/i },
  { key: 'channel',         label: 'Tape channel and extrusion',         group: 'scope',     hints: /channel|extrusion|by others/i },
  { key: 'fan_controllers', label: 'Fan wall controllers',               group: 'scope',     hints: /fan|controller/i },
  { key: 'lamps',           label: 'Screw in lamps',                     group: 'scope',     hints: /lamp/i },
  { key: 'spares',          label: 'Spares and attic stock',             group: 'pricing',   hints: /spare|attic/i },
  { key: 'tax',             label: 'Sales tax rate and base',            group: 'pricing',   hints: /tax/i },
  { key: 'validity',        label: 'Valid until',                        group: 'terms',     hints: /expire|valid|firm/i },
  { key: 'escalation',      label: 'Tariff or escalation clause',        group: 'terms',     hints: /tariff|escalat|surcharge|china/i },
  { key: 'finish_basis',    label: 'Finish basis',                       group: 'terms',     hints: /finish|premium|adder/i },
  { key: 'warranty',        label: 'Warranty basis',                     group: 'terms',     hints: /warrant/i },
  { key: 'lead_time',       label: 'Lead time and transit',              group: 'terms',     hints: /lead ?time|transit/i },
  { key: 'channel_type',    label: 'Price level (rep, distributor or contractor net)', group: 'terms', hints: /distributor|contractor|net|rep/i },
  { key: 'payment_terms',   label: 'Payment terms (deposit, mobilization, on arrival)', group: 'terms', hints: /mobiliz|deposit|on arrival|net ?\d+|payment/i },
  { key: 'returns',         label: 'Returns (NCNR, restocking, RMA)',    group: 'terms',     hints: /ncnr|non.?cancel|non.?return|restock|rma/i },
];

export const FLAG_KEY_SET = new Set(BID_FLAG_KEYS.map((f) => f.key));

export const FLAG_STATES = ['INCLUDED', 'EXCLUDED', 'NOT_STATED', 'CONTRADICTION', 'ESTIMATE', 'ALLOWANCE', 'EXPIRED'];

// ESTIMATE is the vendor's word; on screen it must never read as our number.
export const FLAG_STATE_LABELS = {
  INCLUDED: 'Included',
  EXCLUDED: 'Excluded',
  NOT_STATED: 'Not stated',
  CONTRADICTION: 'Contradiction',
  ESTIMATE: 'Vendor estimate',
  ALLOWANCE: 'Allowance',
  EXPIRED: 'Expired',
};

// Pill tone per state: green, red, slate, amber.
export const FLAG_STATE_TONE = {
  INCLUDED: 'green',
  EXCLUDED: 'red',
  NOT_STATED: 'slate',
  CONTRADICTION: 'amber',
  ESTIMATE: 'amber',
  ALLOWANCE: 'amber',
  EXPIRED: 'red',
};

export const FLAG_GROUPS = [
  { key: 'pricing', label: 'Pricing' },
  { key: 'logistics', label: 'Logistics' },
  { key: 'scope', label: 'Scope' },
  { key: 'terms', label: 'Terms' },
];

export function flagLabel(key) {
  return BID_FLAG_KEYS.find((f) => f.key === key)?.label || key;
}

/** A state the clarification list should ask about. */
export function isOpenState(state) {
  return state === 'NOT_STATED' || state === 'CONTRADICTION' || state === 'EXPIRED';
}
