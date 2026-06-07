// Shared utilities for Pricing Intelligence (Feature 1 + Feature 2)

// Normalize manufacturer/partNumber keys for consistent lookup.
// "Kichler 49024NI" === "KICHLER  49024ni" === "kichler-49024ni"
export function normalizeKey(s) {
  return (s || '').toLowerCase().trim().replace(/[\s\-_.]+/g, ' ').trim();
}

// Read configurable thresholds from SystemConfig, falling back to defaults.
export async function getPricingConfig(prisma) {
  const [thresholdRec, windowRec] = await Promise.all([
    prisma.systemConfig.findUnique({ where: { key: 'pricing_alert_threshold' } }),
    prisma.systemConfig.findUnique({ where: { key: 'pricing_alert_window_months' } }),
  ]);
  return {
    thresholdPct:   thresholdRec ? parseFloat(thresholdRec.value) : 10,   // default 10%
    windowMonths:   windowRec    ? parseInt(windowRec.value, 10)  : 12,   // default 12 months
  };
}
