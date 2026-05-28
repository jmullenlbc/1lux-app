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
  n = n.replace(/[^a-z0-9\s\-]/g, ' ');
  for (const suffix of LEGAL_SUFFIXES) {
    n = n.replace(new RegExp(`\\b${suffix}\\b`, 'g'), '');
  }
  for (const word of NOISE_WORDS) {
    n = n.replace(new RegExp(`\\b${word}\\b`, 'g'), '');
  }
  return n.replace(/\s+/g, ' ').trim();
}

export function normalizeMany(names) {
  return names.map(n => ({ raw: n, normalized: normalizeName(n) }));
}
