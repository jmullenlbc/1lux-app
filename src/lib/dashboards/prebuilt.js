// Prebuilt dashboard cards, the ones that arrive on their own.
//
// A template with a `dataSpec.kind` (Things Needing a Look, the pricing-
// calibration set) is added to every dashboard at load time, so a new card
// reaches everybody without anyone rebuilding their dashboard. Mike, 2026-09-11:
// "Make it stick", taking one off has to last, which means the load has to know
// what was taken off. That list lives in DashboardHiddenWidget, keyed by
// prebuiltKey() below.
//
// Pure functions, no Prisma, so the rules can be pinned by a test.

export function parseSpec(dataSpec) {
  if (!dataSpec) return null;
  if (typeof dataSpec === 'object') return dataSpec;
  try { return JSON.parse(dataSpec); } catch { return null; }
}

// A card's identity. Deliberately NOT its title: the widget editor lets people
// retitle a prebuilt card, and matching by title used to add a second copy of
// any card that had been renamed.
export function prebuiltKey(dataSpec) {
  const s = parseSpec(dataSpec);
  // `tpl` marks an ordinary, fully editable field chart that should still
  // arrive on every dashboard by itself (Maram's procurement cards, 9-23).
  if (s?.tpl && !s.kind) return `tpl:${s.tpl}`;
  if (!s?.kind) return null;
  return s.report ? `${s.kind}:${s.report}` : String(s.kind);
}

// The prebuilt templates this dashboard should gain on this load: not already
// on it (by identity, or by title for anything older), and not taken off.
export function missingPrebuilt(templates, widgets, hiddenKeys = []) {
  const hidden = new Set(hiddenKeys);
  const haveKeys = new Set();
  const haveNames = new Set();
  for (const w of widgets || []) {
    const k = prebuiltKey(w.dataSpec);
    if (k) haveKeys.add(k);
    haveNames.add(w.name);
  }
  return (templates || []).filter(t => {
    const k = prebuiltKey(t.dataSpec);
    return k && !haveKeys.has(k) && !hidden.has(k) && !haveNames.has(t.name);
  });
}

// Cards that were taken off this dashboard and could be put back, with their
// template titles. A key with no template any more (a retired card) is left
// out, there is nothing to put back.
export function hiddenCards(templates, hiddenKeys = []) {
  const byKey = new Map();
  for (const t of templates || []) {
    const k = prebuiltKey(t.dataSpec);
    if (k) byKey.set(k, t.name);
  }
  return hiddenKeys.filter(k => byKey.has(k)).map(k => ({ key: k, name: byKey.get(k) }));
}
