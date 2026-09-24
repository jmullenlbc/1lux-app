// Import-free: the public page and the public PDF both print this line.
// The one formula shown to visitors on purpose (Mike 2026-09-24).

/**
 * The ONE formula shown to visitors on purpose (Mike 2026-09-24: "show the $/SF
 * calculated with the note that controls gets capped at $190K"). Every other
 * line stays dollars-only. Null when somebody typed a controls override.
 */
export function controlsMathOf(b) {
  if (!b || b.controlsOverridden) return null;
  const perSf = Number(b.controlsRateUsed) || 0, sf = Number(b.controlsBasisSf) || 0;
  if (!(perSf > 0 && sf > 0)) return null;
  return { perSf, sf, cap: Number(b.controlsCap) || null, capped: !!b.controlsCapped };
}

const money = v => '$' + Math.round(v).toLocaleString('en-US');

/** "$0.30/SF × 623,594 SF = $187,078 — capped at $190,000 …" or null. */
export function controlsMathWords(cm) {
  if (!cm || !(cm.perSf > 0) || !(cm.sf > 0)) return null;
  const rate = '$' + Number(cm.perSf).toFixed(2) + '/SF';
  const sf = Math.round(cm.sf).toLocaleString('en-US') + ' SF';
  const full = cm.perSf * cm.sf;
  const base = `${rate} × ${sf} = ${money(full)}`;
  if (cm.capped && cm.cap > 0) {
    return `${base}, capped at ${money(cm.cap)}. Controls are capped because we have not seen even large multifamily projects go over that.`;
  }
  return cm.cap > 0
    ? `${base}. Controls are capped at ${money(cm.cap)}; we have not seen even large multifamily projects go over that.`
    : base;
}
