/**
 * Pure rules for city permit feeds (migration 0123, Mike 10-7). No DB, no fetch.
 *
 * A city publishes its building permits as rows. We keep the ones that could
 * be a lighting job: new buildings and additions with a unit count, or a
 * declared value big enough to be a building rather than a tenant finish.
 *
 * Each city has a PROFILE: the open-data layer to query, which column holds
 * what, and which permit classes count. Denver is the first. Adding a city is
 * a new profile here plus one SOURCES row in sourceCatalog.js.
 */

export const PERMIT_SOURCE_TYPE = 'ARCGIS_PERMITS';

/** Permit classes worth a salesperson's time, as Denver prints them. */
export const DENVER_KEEP_CLASSES = ['New Building', 'Addition', 'Phased Construction', 'Foundation Only/Excavation', 'Foundation Only/ Excavation'];

/** Below this declared value a "New Building" is a shed, not a job. */
export const MIN_VALUATION = 1_000_000;

export const PERMIT_PROFILES = {
  DENVER: {
    key:       'DENVER',
    metro:     'Denver, CO',
    state:     'CO',
    layerUrl:  'https://services1.arcgis.com/zdB7qR0BtYrg0Xpl/arcgis/rest/services/ODC_DEV_COMMERCIALCONSTPERMIT_P/FeatureServer/317/query',
    siteUrl:   'https://www.denvergov.org/opendata',
    dateField: 'DATE_ISSUED',
    outFields: ['OBJECTID', 'DATE_ISSUED', 'PERMIT_NUM', 'ADDRESS', 'LOCATION', 'CLASS', 'UNITS', 'VALUATION', 'CONTRACTOR_NAME', 'NEIGHBORHOOD'],
    keepClasses: DENVER_KEEP_CLASSES,
    map: (a) => ({
      permitNumber:   str(a.PERMIT_NUM),
      permitClass:    str(a.CLASS),
      address:        titleCaseAddress(str(a.ADDRESS)),
      neighborhood:   str(a.NEIGHBORHOOD),
      valuation:      num(a.VALUATION),
      contractorName: cleanCompany(str(a.CONTRACTOR_NAME)),
      unitCount:      unitsFrom(a.UNITS),
      issuedAt:       a.DATE_ISSUED ? new Date(a.DATE_ISSUED) : null,
    }),
  },
};

export function profileFor(key) {
  return PERMIT_PROFILES[String(key || '').toUpperCase()] || null;
}

/** The ArcGIS where clause: recent, a kept class, and either units or real money. */
export function permitWhere(profile, since) {
  const classes = profile.keepClasses.map(c => `'${c.replace(/'/g, "''")}'`).join(',');
  const d       = since instanceof Date ? since : new Date(since);
  const iso     = d.toISOString().slice(0, 10);
  return `${profile.dateField} >= DATE '${iso}' AND CLASS IN (${classes}) AND ((UNITS IS NOT NULL AND UNITS <> '') OR VALUATION >= ${MIN_VALUATION})`;
}

/** Full query URL for one profile. */
export function permitQueryUrl(profile, since, { limit = 500 } = {}) {
  const p = new URLSearchParams({
    where:            permitWhere(profile, since),
    outFields:        profile.outFields.join(','),
    orderByFields:    `${profile.dateField} DESC`,
    resultRecordCount: String(limit),
    returnGeometry:   'false',
    f:                'json',
  });
  return `${profile.layerUrl}?${p}`;
}

/**
 * Turn one city row into the signal fields plus a ready-made extraction the
 * tag writer already understands (companies, metro, state, unitCount).
 * Returns null when the row is not worth keeping.
 */
export function permitToSignal(profile, attributes) {
  const p = profile.map(attributes || {});
  if (!p.permitNumber) return null;
  if (!profile.keepClasses.includes(p.permitClass)) return null;
  if (!p.unitCount && !(p.valuation >= MIN_VALUATION)) return null;

  const what  = p.permitClass === 'Addition' ? 'Addition' : p.permitClass.startsWith('Foundation') ? 'Foundation permit' : p.permitClass === 'Phased Construction' ? 'Phased construction' : 'New building';
  const units = p.unitCount ? `, ${p.unitCount.toLocaleString('en-US')} units` : '';
  const title = `${what}${units}: ${p.address || 'address not given'}`;
  const parts = [
    p.contractorName ? `Contractor ${p.contractorName}` : null,
    p.valuation ? `declared value ${money(p.valuation)}` : null,
    p.neighborhood ? `in ${p.neighborhood}` : null,
    `Permit ${p.permitNumber}`,
  ].filter(Boolean);

  return {
    kind:           'PERMIT',
    signalType:     'PERMIT',
    title,
    summary:        parts.join(', ') + '.',
    url:            null,
    publishedAt:    p.issuedAt,
    unitCount:      p.unitCount,
    permitNumber:   p.permitNumber,
    permitClass:    p.permitClass,
    address:        p.address,
    neighborhood:   p.neighborhood,
    valuation:      p.valuation,
    contractorName: p.contractorName,
    extracted: {
      companies:      p.contractorName ? [{ name: p.contractorName, role: 'GC' }] : [],
      developerNames: p.contractorName ? [p.contractorName] : [],
      projectNames:   [],
      metro:          profile.metro,
      state:          profile.state,
      unitCount:      p.unitCount,
    },
  };
}

// ── helpers ──────────────────────────────────────────────────────────────────
function str(v) { return v == null ? '' : String(v).trim(); }
function num(v) { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : null; }

/** Denver stores UNITS as text: "265", "6.", "-2", "". Keep whole positives. */
export function unitsFrom(v) {
  const n = parseInt(String(v ?? '').replace(/[^\d-]/g, ''), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** "GARRETT CONSTRUCTION COMPANY LLC (THE)" -> "Garrett Construction Company LLC" */
export function cleanCompany(name) {
  let s = String(name || '').replace(/\s*\((THE|A|AN)\)\s*$/i, '').replace(/\s+DBA\s+.*$/i, '').replace(/\s+/g, ' ').trim();
  if (!s) return '';
  if (s === s.toUpperCase()) {
    s = s.toLowerCase().replace(/\b[a-z]/g, c => c.toUpperCase())
         .replace(/\b(Llc|Llp|Inc|Co|Corp|Ltd|Lp|Pc)\b\.?/g, m => m.toUpperCase());
  }
  return s;
}

/** "4459 N RIFLE ST" -> "4459 N Rifle St" */
export function titleCaseAddress(addr) {
  const s = String(addr || '').replace(/\s+/g, ' ').trim();
  if (!s) return '';
  return s.toLowerCase().replace(/\b[a-z]/g, c => c.toUpperCase()).replace(/\b([NSEW]|Ne|Nw|Se|Sw)\b/g, m => m.toUpperCase());
}

export function money(n) {
  if (!n) return '';
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1_000)     return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n)}`;
}
