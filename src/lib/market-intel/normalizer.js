const LEGAL_SUFFIXES = [
  'llc', 'inc', 'lp', 'ltd', 'corp', 'co', 'plc', 'llp',
  'limited', 'incorporated', 'corporation', 'company',
];

const NOISE_WORDS = [
  'real estate', 'realty', 'properties', 'property', 'group',
  'partners', 'partnership', 'residential', 'housing', 'development',
  'developments', 'developer', 'developers', 'management', 'mgmt',
  'capital', 'investment', 'investments', 'equity', 'fund', 'trust',
  'reit', 'holdings', 'holding', 'ventures', 'associates',
];

export function normalizeName(name) {
  if (!name) return '';
  let n = name.toLowerCase().trim();

  // Strip punctuation except spaces and hyphens
  n = n.replace(/[^a-z0-9\s\-]/g, ' ');

  // Strip legal suffixes
  for (const suffix of LEGAL_SUFFIXES) {
    n = n.replace(new RegExp(`\\b${suffix}\\b`, 'g'), '');
  }

  // Only strip noise words if the result would still have >= 2 meaningful tokens.
  // This prevents "Lincoln Property" → "lincoln" which then matches anything with "lincoln".
  const beforeNoise = n.replace(/\s+/g, ' ').trim();
  let candidate = beforeNoise;
  for (const word of NOISE_WORDS) {
    candidate = candidate.replace(new RegExp(`\\b${word}\\b`, 'g'), '');
  }
  candidate = candidate.replace(/\s+/g, ' ').trim();

  // If stripping noise words leaves a single short token (≤ 7 chars), keep the original
  // pre-noise version instead. "Lincoln Property" → keep "lincoln property", not "lincoln".
  const tokens = candidate.split(' ').filter(Boolean);
  if (tokens.length <= 1 && candidate.length <= 7) {
    return beforeNoise;
  }

  return candidate;
}

export function normalizeMany(names) {
  return names.map(n => ({ raw: n, normalized: normalizeName(n) }));
}
