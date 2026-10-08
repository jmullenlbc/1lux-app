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
 *
 * Profile fields: api 'arcgis' | 'socrata'; dateField; classField (arcgis
 * defaults to CLASS); valueField or valueExpr (arcgis defaults to VALUATION);
 * baseWhere; keepClasses (leave out to keep every class the $10M floor lets
 * through); dateLiteral 'plain' for servers that reject DATE '...'; headers
 * sent with the fetch; map(row) -> the common permit shape, with skip: true
 * for rows to drop.
 */

/** The MarketSource.sourceType that marks a permit feed. Kept as the 0123 value for every city, ArcGIS or Socrata. */
export const PERMIT_SOURCE_TYPE = 'ARCGIS_PERMITS';

/** Permit classes worth a salesperson's time, as Denver prints them. */
export const DENVER_KEEP_CLASSES = ['New Building', 'Addition', 'Phased Construction', 'Foundation Only/Excavation', 'Foundation Only/ Excavation'];

/** Austin work classes worth a look (commercial building permits only). */
export const AUSTIN_KEEP_CLASSES = ['New', 'Addition', 'Shell', 'Addition and Remodel'];

/** Orlando work types worth a look. A $10M+ alteration is a real building job, so it stays. */
export const ORLANDO_KEEP_CLASSES = ['New', 'Addition', 'Alteration', 'Alt'];

/** Mesa work types worth a look. The $10M floor does the real filtering. */
export const MESA_KEEP_CLASSES = ['Multi-Family Residential', 'Commercial/Industrial Projects', 'Other Commercial', 'Tenant Improvement (Interior Only)', 'Additions', 'Remodeling With Addition', 'Renovations/Remodels'];

/** Miami-Dade application types worth a look (building permits only, so the job value is not repeated on trade permits). */
export const MIAMI_DADE_KEEP_CLASSES = ['NEW', 'SHELL ONLY', 'ADDITION - ATTACHED', 'ADDITION - DETACHED', 'ALTER - INTERIOR'];

/** City of Miami scopes of work worth a look. */
export const MIAMI_KEEP_CLASSES = ['NEW CONSTRUCTION', 'PHASED PERMIT', 'ADDITION AND REMODELING', 'REMODELING/REPAIRS'];

/** Hillsborough County permit types worth a look. Apartments file under Commercial New Construction. */
export const HILLSBOROUGH_KEEP_CLASSES = ['Commercial New Construction', 'Commercial Addition', 'Commercial Building Alterations (Renovations)'];

/** Jacksonville types of work worth a look (building permits only). */
export const JACKSONVILLE_KEEP_CLASSES = ['New Building', 'Addition', 'Alterations & Repairs', 'Tenant Build-Out'];

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
  // Orlando publishes permit applications on Socrata (dataset ryhf-m453),
  // updated daily. No unit count column; plan_review_type says whether the
  // building is commercial or three-plus-unit residential.
  ORLANDO: {
    key:       'ORLANDO',
    api:       'socrata',
    metro:     'Orlando, FL',
    state:     'FL',
    layerUrl:  'https://data.cityoforlando.net/resource/ryhf-m453.json',
    siteUrl:   'https://data.cityoforlando.net/d/ryhf-m453',
    dateField: 'issue_permit_date',
    classField: 'worktype',
    valueField: 'estimated_cost',
    baseWhere: "application_type='Building Permit' AND plan_review_type IN ('Commercial','Residential 3 or more')",
    outFields: ['permit_number', 'application_type', 'worktype', 'plan_review_type', 'issue_permit_date', 'permit_address', 'estimated_cost', 'contractor_name', 'project_name', 'square_footage', 'neighborhood'],
    keepClasses: ORLANDO_KEEP_CLASSES,
    map: (a) => ({
      permitNumber:   str(a.permit_number),
      permitClass:    str(a.worktype),
      buildingKind:   [str(a.plan_review_type), str(a.project_name)].filter(Boolean).join(': '),
      address:        titleCaseAddress(str(a.permit_address)),
      neighborhood:   str(a.neighborhood),
      valuation:      num(a.estimated_cost),
      contractorName: cleanCompany(str(a.contractor_name)),
      unitCount:      null,
      issuedAt:       a.issue_permit_date ? new Date(a.issue_permit_date) : null,
      url:            null,
    }),
  },
  // Phoenix itself publishes no permit values, so the metro is covered by its
  // two big neighbours. Mesa: Socrata dataset dzpk-hxfb, daily, with units,
  // value and contractor.
  MESA: {
    key:       'MESA',
    api:       'socrata',
    metro:     'Phoenix, AZ',
    state:     'AZ',
    layerUrl:  'https://data.mesaaz.gov/resource/dzpk-hxfb.json',
    siteUrl:   'https://data.mesaaz.gov/Development-Services/Building-Permits/dzpk-hxfb',
    dateField: 'issued_date',
    classField: 'type_of_work',
    valueField: 'total_valuation',
    outFields: ['permit_number', 'issued_date', 'permit_type', 'record_type', 'type_of_work', 'property_address', 'total_valuation', 'number_of_dwelling_units', 'contractor_name', 'description_of_work'],
    keepClasses: MESA_KEEP_CLASSES,
    map: (a) => ({
      permitNumber:   str(a.permit_number),
      permitClass:    str(a.type_of_work),
      buildingKind:   [str(a.record_type), shortText(a.description_of_work, 140)].filter(Boolean).join(': '),
      address:        titleCaseAddress(str(a.property_address)) + ', Mesa',
      neighborhood:   '',
      valuation:      num(a.total_valuation),
      contractorName: cleanCompany(str(a.contractor_name)),
      // Mesa leaves the unit columns empty on multifamily rows; the description says "305-units".
      unitCount:      /Multi-Family/i.test(str(a.type_of_work)) ? (unitsFrom(a.number_of_dwelling_units) || unitsFromText(a.description_of_work)) : null,
      issuedAt:       a.issued_date ? new Date(a.issued_date) : null,
      url:            null,
    }),
  },
  // Tempe: ArcGIS layer with value and housing units. Classes read like
  // "106 New - Ten or more Family", so the $10M floor does the filtering and
  // only signs, pools, solar and demolition are dropped.
  TEMPE: {
    key:       'TEMPE',
    api:       'arcgis',
    metro:     'Phoenix, AZ',
    state:     'AZ',
    layerUrl:  'https://services.arcgis.com/lQySeXwbBg53XWDi/arcgis/rest/services/building_permits/FeatureServer/0/query',
    siteUrl:   'https://data.tempe.gov',
    dateField: 'IssuedDateDtm',
    valueField: 'EstProjectCost',
    outFields: ['PermitNum', 'PermitClass', 'PermitTypeDesc', 'OriginalAddress1', 'EstProjectCost', 'HousingUnits', 'ContractorCompanyName', 'Description', 'IssuedDateDtm'],
    map: (a) => ({
      permitNumber:   str(a.PermitNum),
      permitClass:    str(a.PermitClass),
      // "106 New - Ten or more Family" -> "New - Ten or more Family"
      buildingKind:   [str(a.PermitClass).replace(/^\d+\s*-?\s*/, ''), shortText(a.Description, 140)].filter(Boolean).join(': '),
      address:        titleCaseAddress(str(a.OriginalAddress1)) + ', Tempe',
      neighborhood:   '',
      valuation:      num(a.EstProjectCost),
      contractorName: cleanCompany(str(a.ContractorCompanyName)),
      unitCount:      /Family/i.test(str(a.PermitClass)) ? unitsFrom(a.HousingUnits) : null,
      skip:           /Demoli|Sign|Pool|Solar|Fence/i.test(str(a.PermitClass)),
      issuedAt:       a.IssuedDateDtm ? new Date(a.IssuedDateDtm) : null,
      url:            null,
    }),
  },
  // Miami-Dade County: ArcGIS table of county-issued permits, near daily.
  // The job value is a text column and is repeated on every trade permit of a
  // job, so only BLDG permits are read. Dates arrive as "YYYY-MM-DD".
  MIAMI_DADE: {
    key:       'MIAMI_DADE',
    api:       'arcgis',
    metro:     'Miami, FL',
    state:     'FL',
    layerUrl:  'https://services.arcgis.com/8Pc9XBTAsYuxx9Ny/arcgis/rest/services/miamidade_permit_data/FeatureServer/0/query',
    siteUrl:   'https://gis-mdc.opendata.arcgis.com',
    dateField: 'PermitIssuedDate',
    classField: 'ApplicationTypeDescription',
    valueExpr: 'CAST(EstimatedValue AS FLOAT)',
    baseWhere: "PermitType='BLDG'",
    outFields: ['PermitNumber', 'PermitIssuedDate', 'ApplicationTypeDescription', 'ProposedUseDescription', 'PropertyAddress', 'City', 'EstimatedValue', 'StructureUnits', 'StructureFloors', 'ContractorName'],
    keepClasses: MIAMI_DADE_KEEP_CLASSES,
    map: (a) => ({
      permitNumber:   str(a.PermitNumber),
      permitClass:    str(a.ApplicationTypeDescription),
      buildingKind:   titleCaseAddress(str(a.ProposedUseDescription)),
      address:        [titleCaseAddress(str(a.PropertyAddress)), titleCaseAddress(str(a.City))].filter(Boolean).join(', '),
      neighborhood:   '',
      valuation:      num(a.EstimatedValue),
      contractorName: cleanCompany(str(a.ContractorName)),
      unitCount:      /UNITS OR MORE|APT|CONDO|HOTEL|MOTEL|DUPLEX|TOWN HOUSE/i.test(str(a.ProposedUseDescription)) ? unitsFrom(a.StructureUnits) : null,
      issuedAt:       a.PermitIssuedDate ? new Date(a.PermitIssuedDate) : null,
      url:            null,
    }),
  },
  // City of Miami: ArcGIS point layer, daily. Job value is text; no unit
  // count, but WorkItems says what the building holds.
  MIAMI: {
    key:       'MIAMI',
    api:       'arcgis',
    metro:     'Miami, FL',
    state:     'FL',
    layerUrl:  'https://services1.arcgis.com/CvuPhqcTQpZPT9qY/arcgis/rest/services/Building_Permits_Since_2014/FeatureServer/0/query',
    siteUrl:   'https://datahub-miamigis.opendata.arcgis.com',
    dateField: 'IssuedDate',
    classField: 'ScopeofWork',
    valueExpr: 'CAST(TotalCost AS FLOAT)',
    outFields: ['PermitNumber', 'IssuedDate', 'ScopeofWork', 'PropertyType', 'WorkItems', 'DeliveryAddress', 'TotalCost', 'CompanyName', 'TotalSQFT'],
    keepClasses: MIAMI_KEEP_CLASSES,
    map: (a) => ({
      permitNumber:   str(a.PermitNumber),
      permitClass:    str(a.ScopeofWork),
      buildingKind:   [str(a.PropertyType), shortText(str(a.WorkItems).split('|').map(s => titleCaseAddress(s.split(':')[0])).filter(Boolean).join(', '), 140)].filter(Boolean).join(': '),
      address:        titleCaseAddress(str(a.DeliveryAddress)) + ', Miami',
      neighborhood:   '',
      valuation:      num(a.TotalCost),
      contractorName: cleanCompany(str(a.CompanyName)),
      unitCount:      null,
      issuedAt:       a.IssuedDate ? new Date(a.IssuedDate) : null,
      url:            null,
    }),
  },
  // Tampa Bay: the City of Tampa publishes no values or issue dates, so the
  // feed is Hillsborough County's issued-permits layer (unincorporated county
  // around Tampa, daily). Units and value, no contractor column.
  HILLSBOROUGH: {
    key:       'HILLSBOROUGH',
    api:       'arcgis',
    metro:     'Tampa, FL',
    state:     'FL',
    layerUrl:  'https://services.arcgis.com/apTfC6SUmnNfnxuF/arcgis/rest/services/AccelaDashBoard_MapService20211019/FeatureServer/4/query',
    siteUrl:   'https://hcfl.gov/businesses/permits-and-records/permitting-tools/data-maps-and-reports',
    dateField: 'ISSUED_DATE',
    classField: 'TYPE',
    valueField: 'Value',
    outFields: ['PERMIT__', 'ISSUED_DATE', 'TYPE', 'OCCUPANCY_TYPE', 'OCCUPANCY_CATEGORY', 'ADDRESS', 'CITY', 'Value', 'Unit_Cnt_Int', 'SF_Total_Int', 'DESCRIPTION'],
    keepClasses: HILLSBOROUGH_KEEP_CLASSES,
    map: (a) => ({
      permitNumber:   str(a.PERMIT__),
      permitClass:    str(a.TYPE),
      buildingKind:   [str(a.OCCUPANCY_CATEGORY) || str(a.OCCUPANCY_TYPE), shortText(a.DESCRIPTION, 140)].filter(Boolean).join(': '),
      address:        [titleCaseAddress(str(a.ADDRESS)), str(a.CITY).replace(/\s+\d{5}$/, '')].filter(Boolean).join(', '),
      neighborhood:   '',
      valuation:      num(a.Value),
      contractorName: '',
      // Unit_Cnt_Int says 1 on a warehouse shell; only count units on a residential occupancy.
      unitCount:      /R-[12]|Apartment|Dwelling|Townhome|Hotel|Multi|Nursing|ALF/i.test(str(a.OCCUPANCY_CATEGORY) + ' ' + str(a.OCCUPANCY_TYPE)) && unitsFrom(a.Unit_Cnt_Int) > 1 ? unitsFrom(a.Unit_Cnt_Int) : null,
      issuedAt:       a.ISSUED_DATE ? new Date(a.ISSUED_DATE) : null,
      url:            null,
    }),
  },
  // Jacksonville: the city's ArcGIS layer sits behind the Building Inspection
  // Division site's proxy, which wants the site as Referer and a plain quoted
  // date. The alias path comes from maps.coj.net/bid/js/utils.js and may move
  // if the city redeploys the site. PaidDay is the day a permit went active.
  JACKSONVILLE: {
    key:       'JACKSONVILLE',
    api:       'arcgis',
    metro:     'Jacksonville, FL',
    state:     'FL',
    layerUrl:  'https://maps.coj.net/bid/duval.ashx?HTTPS://CMVXDWVZDA.QQQ/Z4/query',
    siteUrl:   'https://maps.coj.net/bid/default.aspx',
    headers:   { Referer: 'https://maps.coj.net/bid/default.aspx' },
    dateField: 'PaidDay',
    dateLiteral: 'plain',
    classField: 'TypeOfWork',
    valueField: 'TotalCost',
    baseWhere: 'PermitTypeID=1',
    outFields: ['FullPermitNumber', 'PaidDay', 'TypeOfWork', 'ProposedUseDesc', 'TotalCost', 'ADDR', 'CITY', 'ZIPCODE', 'CompanyName', 'Comments', 'Status'],
    keepClasses: JACKSONVILLE_KEEP_CLASSES,
    map: (a) => ({
      permitNumber:   str(a.FullPermitNumber),
      permitClass:    str(a.TypeOfWork),
      buildingKind:   [str(a.ProposedUseDesc), shortText(a.Comments, 140)].filter(Boolean).join(': '),
      address:        [titleCaseAddress(str(a.ADDR)), titleCaseAddress(str(a.CITY)) || 'Jacksonville'].filter(Boolean).join(', '),
      neighborhood:   '',
      valuation:      num(a.TotalCost),
      contractorName: cleanCompany(str(a.CompanyName)),
      unitCount:      null,
      issuedAt:       a.PaidDay ? new Date(a.PaidDay) : null,
      url:            null,
    }),
  },
};

/** The profile for a source row: its feed URL first, then its market key. Two feeds can share one metro. */
export function profileForSource(source) {
  const url = String(source?.feedUrl || '').trim();
  const byUrl = url && Object.values(PERMIT_PROFILES).find(p => p.layerUrl === url);
  return byUrl || profileFor(source?.market);
}

export function profileFor(key) {
  return PERMIT_PROFILES[String(key || '').toUpperCase()] || null;
}

/** The feed's where clause: recent, a kept class, and at least $10M declared. */
export function permitWhere(profile, since) {
  const classes = (profile.keepClasses || []).map(c => `'${c.replace(/'/g, "''")}'`).join(',');
  const d       = since instanceof Date ? since : new Date(since);
  const iso     = d.toISOString().slice(0, 10);
  const base    = profile.baseWhere ? `${profile.baseWhere} AND ` : '';
  const value   = profile.valueExpr || profile.valueField || 'VALUATION';
  const klass   = profile.keepClasses ? ` AND ${profile.classField || 'CLASS'} IN (${classes})` : '';
  if (profile.api === 'socrata') {
    return `${base}${profile.dateField} >= '${iso}'${klass} AND ${value} >= ${MIN_VALUATION}`;
  }
  const date = profile.dateLiteral === 'plain' ? `'${iso}'` : `DATE '${iso}'`;
  return `${base}${profile.dateField} >= ${date}${klass} AND ${value} >= ${MIN_VALUATION}`;
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
  if (profile.keepClasses && !profile.keepClasses.includes(p.permitClass)) return null;
  if (!(p.valuation >= MIN_VALUATION)) return null;

  const what  = whatFor(p.permitClass);
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
    projectRelated: true,
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

/** The first words of a city's title, from however each city names its permit class. */
export function whatFor(permitClass) {
  const c = String(permitClass || '');
  if (/tenant/i.test(c))                       return 'Tenant improvement';
  if (/foundation/i.test(c))                   return 'Foundation permit';
  if (/phased/i.test(c))                       return 'Phased construction';
  if (/shell/i.test(c))                        return 'Shell building';
  if (/addition/i.test(c))                     return 'Addition';
  if (/^alt|alteration|remodel|renovat/i.test(c)) return 'Alteration';
  if (/^other/i.test(c))                       return 'Building work';
  return 'New building';
}

/** A long free-text description cut to about n characters on a word, one line. */
export function shortText(v, n = 140) {
  const s = str(v).replace(/\s+/g, ' ');
  if (s.length <= n) return s;
  const cut = s.slice(0, n);
  return (cut.lastIndexOf(' ') > n * 0.6 ? cut.slice(0, cut.lastIndexOf(' ')) : cut) + '...';
}

/** Denver stores UNITS as text: "265", "6.", "-2", "". Keep whole positives. */
export function unitsFrom(v) {
  const n = parseInt(String(v ?? '').replace(/[^\d-]/g, ''), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** "new development of 305-units multi-family" -> 305. Only counts of two or more, so "1 unit" on a shell is ignored. */
export function unitsFromText(v) {
  const m = String(v || '').match(/\b(\d{1,4})[\s-]*(?:dwelling\s+)?units?\b/i);
  const n = m ? parseInt(m[1], 10) : NaN;
  return Number.isFinite(n) && n > 1 ? n : null;
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
