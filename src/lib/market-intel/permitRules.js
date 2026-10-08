/**
 * Pure rules for city permit feeds (migration 0123, Mike 10-7). No DB, no fetch.
 *
 * A city publishes its building permits as rows. We keep the ones that could
 * be a lighting job: new buildings and additions with a declared value of
 * $10M or more. Anything smaller is too small a job for us.
 *
 * Each city has a PROFILE: the open-data layer to query, which column holds
 * what, and which permit classes count. Denver is the first. Adding a city is
 * a new profile here plus one SOURCES row in sourceCatalog.js.
 */

/** The MarketSource.sourceType that marks a permit feed. Kept as the 0123 value for every city, ArcGIS or Socrata. */
export const PERMIT_SOURCE_TYPE = 'ARCGIS_PERMITS';

/** Permit classes worth a salesperson's time, as Denver prints them. */
export const DENVER_KEEP_CLASSES = ['New Building', 'Addition', 'Phased Construction', 'Foundation Only/Excavation', 'Foundation Only/ Excavation'];

/** Austin work classes worth a look (commercial building permits only). */
export const AUSTIN_KEEP_CLASSES = ['New', 'Addition', 'Shell', 'Addition and Remodel'];

/** Below this declared value a permit is too small a job for us, unit count or not (Mike 10-8: $10M). */
export const MIN_VALUATION = 10_000_000;

export const PERMIT_PROFILES = {
  DENVER: {
    key:       'DENVER',
    api:       'arcgis',
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
      url:            null,
    }),
  },
  // Austin publishes every construction permit on Socrata (dataset 3syk-w9eu),
  // updated daily. Rows carry housing units, job value, the contractor and a
  // link to the city's permit page.
  AUSTIN: {
    key:       'AUSTIN',
    api:       'socrata',
    metro:     'Austin, TX',
    state:     'TX',
    layerUrl:  'https://data.austintexas.gov/resource/3syk-w9eu.json',
    siteUrl:   'https://data.austintexas.gov/Building-and-Development/Issued-Construction-Permits/3syk-w9eu',
    dateField: 'issue_date',
    classField: 'work_class',
    unitsField: 'housing_units',
    valueField: 'total_job_valuation',
    baseWhere: "permittype='BP' AND permit_class_mapped='Commercial'",
    outFields: ['permit_number', 'permit_class', 'work_class', 'issue_date', 'housing_units', 'total_job_valuation', 'original_address1', 'contractor_company_name', 'applicant_org', 'description', 'link', 'council_district'],
    keepClasses: AUSTIN_KEEP_CLASSES,
    map: (a) => ({
      permitNumber:   str(a.permit_number),
      permitClass:    str(a.work_class),
      // "C- 105 Five or More Family Bldgs" -> "Five or More Family Bldgs"
      buildingKind:   str(a.permit_class).replace(/^[A-Z]-\s*\d+\s*/, ''),
      address:        titleCaseAddress(str(a.original_address1)),
      neighborhood:   a.council_district ? `Council District ${str(a.council_district)}` : '',
      valuation:      num(a.total_job_valuation),
      contractorName: cleanCompany(str(a.contractor_company_name) || str(a.applicant_org)),
      unitCount:      /Family Bldgs|Mixed Use|Hotels/i.test(str(a.permit_class)) ? unitsFrom(a.housing_units) : null,
      skip:           /Other Than Bldg|Demolition|Relocation/i.test(str(a.permit_class)),
      issuedAt:       a.issue_date ? new Date(a.issue_date) : null,
      url:            a.link && a.link.url ? String(a.link.url) : null,
    }),
  },
};

export function profileFor(key) {
  return PERMIT_PROFILES[String(key || '').toUpperCase()] || null;
}

/** The feed's where clause: recent, a kept class, and at least $10M declared. */
export function permitWhere(profile, since) {
  const classes = profile.keepClasses.map(c => `'${c.replace(/'/g, "''")}'`).join(',');
  const d       = since instanceof Date ? since : new Date(since);
  const iso     = d.toISOString().slice(0, 10);
  if (profile.api === 'socrata') {
    const base = profile.baseWhere ? `${profile.baseWhere} AND ` : '';
    return `${base}${profile.dateField} >= '${iso}' AND ${profile.classField} IN (${classes}) AND ${profile.valueField} >= ${MIN_VALUATION}`;
  }
  return `${profile.dateField} >= DATE '${iso}' AND CLASS IN (${classes}) AND VALUATION >= ${MIN_VALUATION}`;
}

/** Full query URL for one profile. */
export function permitQueryUrl(profile, since, { limit = 500 } = {}) {
  if (profile.api === 'socrata') {
    const p = new URLSearchParams({
      $select: profile.outFields.join(','),
      $where:  permitWhere(profile, since),
      $order:  `${profile.dateField} DESC`,
      $limit:  String(limit),
    });
    return `${profile.layerUrl}?${p}`;
  }
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

/** Rows out of a feed response, whichever shape the city's API uses. */
export function permitRows(profile, json) {
  if (profile.api === 'socrata') {
    if (json && json.error) throw new Error(json.message || 'feed error');
    return Array.isArray(json) ? json : [];
  }
  if (json && json.error) throw new Error(json.error.message || 'feed error');
  return (json.features || []).map(f => f.attributes);
}

/**
 * Turn one city row into the signal fields plus a ready-made extraction the
 * tag writer already understands (companies, metro, state, unitCount).
 * Returns null when the row is not worth keeping.
 */
export function permitToSignal(profile, attributes) {
  const p = profile.map(attributes || {});
  if (!p.permitNumber || p.skip) return null;
  if (!profile.keepClasses.includes(p.permitClass)) return null;
  if (!(p.valuation >= MIN_VALUATION)) return null;

  const what  = p.permitClass.startsWith('Addition') ? 'Addition' : p.permitClass.startsWith('Foundation') ? 'Foundation permit' : p.permitClass === 'Phased Construction' ? 'Phased construction' : p.permitClass === 'Shell' ? 'Shell building' : 'New building';
  const units = p.unitCount ? `, ${p.unitCount.toLocaleString('en-US')} units` : '';
  const title = `${what}${units}: ${p.address || 'address not given'}`;
  const parts = [
    p.buildingKind ? p.buildingKind : null,
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
    url:            p.url || null,
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
