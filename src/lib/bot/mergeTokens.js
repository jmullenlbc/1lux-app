// Canonical merge tokens usable in message templates. Single source of truth for
// the template editors' autocomplete AND the bot's fill step, so they never drift.
export const MERGE_TOKENS = [
  { token: 'firstName', label: "Contact's first name",        sample: 'Bob' },
  { token: 'name',      label: "Contact's full name",         sample: 'Bob Smith' },
  { token: 'company',   label: "Contact's company",           sample: 'Brinkmann' },
  { token: 'target',    label: 'Intro target (expect-intro)', sample: 'Tom' },
];

// Replace {{token}} with values[token]; unknown/empty tokens collapse to ''.
export function fillTemplate(tpl, values = {}) {
  return String(tpl || '').replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, key) => {
    const v = values[key];
    return v == null || v === '' ? '' : String(v);
  });
}
