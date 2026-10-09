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
 * Profile fields: api 'arcgis' | 'socrata' | 'houston'; dateField; classField (arcgis
 * defaults to CLASS); valueField or valueExpr (arcgis defaults to VALUATION);
 * baseWhere; keepClasses (leave out to keep every class the $10M floor lets
 * through); dateLiteral 'plain' for servers that reject DATE '...'; headers
 * sent with the fetch; map(row) -> the common permit shape, with skip: true
 * for rows to drop; firstLookbackDays for feeds too slow for the 18-month
 * first pull (Houston); ownerName in the map output becomes an OWNER company.
 *
 * CONCEPT profiles (Mike 10-8): the same machinery read against a city's
 * planning cases, which are filed about a year before the permit. They carry
 * no declared value, so the $10M floor is replaced by a unit floor: a case is
 * kept when it states minUnits or more, or (keepUnstated) when it reads as
 * multifamily without a count. Rows become kind CONCEPT. Extra fields:
 * kind 'CONCEPT'; minUnits; keepClassRe (regex on permitClass instead of the
 * list); keepUnstated; noDetail (Accela: never open the record's page);
 * openAll (Accela: open every unlisted record's page, the unit count is there).
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

/** Houston "Sold Permits" report: the one permit description that is the building permit itself (PERMIT_TYPE 13). */
export const HOUSTON_KEEP_CLASSES = ['Building Pmt'];

/** Below this declared value a permit is too small a job for us, unit count or not (Mike 10-8: $10M). */
export const MIN_VALUATION = 10_000_000;

/** A planning case with fewer stated units than this is not worth a salesperson's time (Mike 10-8: 25). */
export const CONCEPT_MIN_UNITS = 25;

/** Words that say a planning case is housing we light, when the unit count is not stated. */
export const MULTIFAMILY_RE = /multi.?family|multi.?unit|apartment|mixed.?use|condo|residential units|dwelling units|senior (living|housing)|student housing|hotel|townho/i;

/** Planning statuses that mean the case is dead. */
const DEAD_CASE_RE = /withdrawn|denied|void|cancel|expired|inactive|aborted|rejected/i;

/** The Salt Lake City planning record types that are a real site entitlement (not a sign, a fence or an appeal). */
export const SALT_LAKE_PLANNING_RE = /Design Review|Planned Development|Zoning Incentives|Conditional Use|Zoning Map Amendment|Master Plan Amendment|Transit Station|New Construction|Preliminary Subdiv|Special Exception/i;

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
  // Houston has no open-data layer. Its legacy "Sold (approved) Permits"
  // WebFOCUS report answers a form POST for a date window, then a second POST
  // exports the rows as CSV (houstonFeed.js). Rows carry the owner, the
  // address, a free-text description with the unit count, and the declared
  // value, but NO issue date: a row is dated by the end of the window it was
  // found in (Mike 10-8: approximate, flagged). Multi-family only (FCC 002-004).
  HOUSTON: {
    key:       'HOUSTON',
    api:       'houston',
    metro:     'Houston, TX',
    state:     'TX',
    layerUrl:  'https://cohtora.houstontx.gov/ibi_apps/WFServlet',
    siteUrl:   'https://cohtora.houstontx.gov/approot/soldpermits/online_permit.htm',
    firstLookbackDays: 270,
    windowDays: 90,
    keepClasses: HOUSTON_KEEP_CLASSES,
    map: (a) => ({
      permitNumber:   str(a.PROJECT_NO),
      permitClass:    str(a.PERMIT_DESC),
      buildingKind:   shortText(a.PROJECT_DESC, 90),
      // "3910 OLD SPANISH TRL BLD A 77021": the zip is the last word.
      address:        titleCaseAddress(str(a.Address).replace(/\s+\d{5}$/, '')),
      neighborhood:   /\d{5}$/.test(str(a.Address)) ? `ZIP ${str(a.Address).slice(-5)}` : '',
      valuation:      num(a.CURRENT_VALUATION),
      contractorName: '',
      ownerName:      cleanCompany(str(a.OWNER_OCCUPANT).replace(/^\*+\s*/, '')),
      unitCount:      unitsFromText(a.PROJECT_DESC),
      skip:           str(a.PERMIT_TYPE) !== '13' || /\bDEMO/i.test(str(a.PROJECT_DESC)),
      issuedAt:       a.issuedAt ? new Date(a.issuedAt) : null,
      url:            null,
    }),
  },
  // Salt Lake City has no open-data layer either (Utah's Socrata portal is
  // decommissioned; the county publishes nothing). The city's Accela portal
  // answers a plain ASP.NET search POST for a date window and permit type,
  // ten rows a page; the declared value ("Job Value") sits on each permit's
  // own page, so the feed reads the list, keeps the rows that read like a
  // building, then opens those (accelaFeed.js). The list date is the
  // application date, not the issue date; the record status says how far it
  // got. No owner or contractor is shown to the public.
  SALT_LAKE: {
    key:       'SALT_LAKE',
    api:       'accela',
    metro:     'Salt Lake City, UT',
    state:     'UT',
    layerUrl:  'https://aca-prod.accela.com/SLCREF/Cap/CapHome.aspx?module=Building&TabName=Building',
    siteUrl:   'https://aca-prod.accela.com/SLCREF/Cap/CapHome.aspx?module=Building&TabName=Building',
    detailBase: 'https://aca-prod.accela.com',
    permitType: 'Building/Permit/Commercial/NA',
    firstLookbackDays: 180,
    windowDays: 14,
    keepClasses: ['Commercial Building Permit'],
    map: (a) => ({
      permitNumber:   str(a.permitNumber),
      permitClass:    str(a.permitType),
      buildingKind:   [str(a.projectName), str(a.useType) ? `${str(a.useType)}` : '', shortText(a.description, 110)].filter(Boolean).join(': '),
      // "177 E 900 S, Ste 200, Salt Lake City UT 84111-4229"
      address:        titleCaseAddress(str(a.address).replace(/,\s*Salt Lake City\s+UT.*$/i, '')),
      neighborhood:   a.status ? `status ${str(a.status)}` : '',
      valuation:      num(a.jobValue),
      contractorName: '',
      unitCount:      unitsFromText(a.description),
      skip:           /withdrawn|denied|void|cancel|expired/i.test(str(a.status)),
      issuedAt:       a.date ? new Date(a.date) : null,
      url:            a.url ? String(a.url) : null,
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

  // ── Concept plans: planning cases filed about a year before the permit ──

  // Austin site plan cases (Socrata mavg-96ck, daily): the first site
  // entitlement submittal. The description usually says "multifamily" with
  // no count; proposed_no_of_units is filled on some rows. Owner and
  // applicant (usually the civil engineer) are named.
  AUSTIN_SITE_PLAN: {
    key:       'AUSTIN_SITE_PLAN',
    kind:      'CONCEPT',
    api:       'socrata',
    metro:     'Austin, TX',
    state:     'TX',
    layerUrl:  'https://data.austintexas.gov/resource/mavg-96ck.json',
    siteUrl:   'https://data.austintexas.gov/Building-and-Development/Site-Plan-Cases/mavg-96ck',
    dateField: 'application_start_date',
    classField: 'sub_type',
    baseWhere: "sub_type in ('Site Plan Administrative','Site Plan Commission','Site Plan Small Project')",
    outFields: ['permit_number', 'case_name', 'sub_type', 'status', 'description_of_work', 'proposed_land_use', 'link', 'application_start_date', 'street_number', 'street_prefix', 'street_direction', 'street_name', 'street_type', 'council_district', 'existing_no_of_units', 'proposed_no_of_units', 'proposed_bldg_sq_footage', 'applicant_fullname', 'applicant_organization_name', 'owner_fullname', 'owner_organization_name'],
    minUnits: CONCEPT_MIN_UNITS,
    keepUnstated: true,
    firstLookbackDays: 365,
    map: (a) => austinCase(a, {
      permitNumber: str(a.permit_number),
      address:      titleCaseAddress([a.street_number, a.street_prefix, a.street_direction, a.street_name, a.street_type].map(str).filter(Boolean).join(' ')),
      status:       str(a.status),
      unitCount:    unitsFrom(a.proposed_no_of_units) || unitsFromText(a.description_of_work) || unitsFromText(a.case_name),
    }),
  },
  // Austin zoning cases (Socrata edir-dcnf): rezonings and PUDs, even
  // earlier than a site plan. Units are almost never stated, so only a case
  // that states 25 or more is kept.
  AUSTIN_ZONING: {
    key:       'AUSTIN_ZONING',
    kind:      'CONCEPT',
    api:       'socrata',
    metro:     'Austin, TX',
    state:     'TX',
    layerUrl:  'https://data.austintexas.gov/resource/edir-dcnf.json',
    siteUrl:   'https://data.austintexas.gov/Building-and-Development/Zoning-Cases/edir-dcnf',
    dateField: 'application_start_date',
    classField: 'sub_type',
    baseWhere: "sub_type in ('Zoning/Rezoning','Planned Unit Development (PUD)')",
    outFields: ['case_number', 'permit_number', 'case_name', 'sub_type', 'detailed_status', 'description_of_work', 'proposed_land_use', 'link', 'application_start_date', 'site_address', 'council_district', 'applicant_fullname', 'applicant_organization_name', 'owner_fullname', 'owner_organization_name'],
    minUnits: CONCEPT_MIN_UNITS,
    keepUnstated: false,
    firstLookbackDays: 365,
    map: (a) => austinCase(a, {
      permitNumber: str(a.case_number) || str(a.permit_number),
      // "1213 W 6TH   , AUSTIN,TX 78703"
      address:      titleCaseAddress(str(a.site_address).replace(/\s*,\s*AUSTIN.*$/i, '')),
      status:       str(a.detailed_status),
      unitCount:    unitsFromText(a.description_of_work) || unitsFromText(a.case_name),
    }),
  },
  // Denver concept plans: the first Site Development Plan submittal, read
  // from the city's Accela Development module like Salt Lake's permits. The
  // list row has no unit count; every record's own page has "Number of
  // Proposed Dwelling Units", "Proposed Use 1" and the gross floor area, so
  // every new record is opened. The open-data layer (SDPConceptDynamic) has
  // the same rows without those fields.
  DENVER_CONCEPT: {
    key:       'DENVER_CONCEPT',
    kind:      'CONCEPT',
    api:       'accela',
    metro:     'Denver, CO',
    state:     'CO',
    layerUrl:  'https://aca-prod.accela.com/DENVER/Cap/CapHome.aspx?module=Development&TabName=Development',
    siteUrl:   'https://aca-prod.accela.com/DENVER/Cap/CapHome.aspx?module=Development&TabName=Development',
    permitType: 'Development/Project/Concept Review/NA',
    firstLookbackDays: 365,
    windowDays: 14,
    openAll: true,
    minUnits: CONCEPT_MIN_UNITS,
    keepUnstated: true,
    map: (a) => ({
      permitNumber:   str(a.permitNumber),
      permitClass:    str(a.permitType) || 'Concept Plan',
      // "2026PM0000333 - 3550 W. 13th Ave - Westridge Mulroy Bldg" -> the project name after the master number and address.
      buildingKind:   [denverProjectName(a.projectName), str(a.proposedUse), a.grossSf ? `${Number(a.grossSf).toLocaleString('en-US')} sq ft` : ''].filter(Boolean).join(': '),
      // "3550 W 13th AVE, Denver CO 80204-1500"
      address:        titleCaseAddress(str(a.address).replace(/,\s*Denver\s+CO.*$/i, '')),
      neighborhood:   a.status ? `status ${str(a.status)}` : '',
      valuation:      null,
      contractorName: '',
      // A stated count, even 1, is a count: a one-unit page is a house and fails the floor.
      unitCount:      a.proposedUnits >= 1 ? a.proposedUnits : null,
      multifamily:    MULTIFAMILY_RE.test(`${str(a.proposedUse)} ${str(a.projectName)}`),
      skip:           DEAD_CASE_RE.test(str(a.status)),
      issuedAt:       a.date ? new Date(a.date) : null,
      url:            a.url ? String(a.url) : null,
    }),
  },
  // Salt Lake City planning cases: the Accela Planning module, every record
  // type in one search (blank type), kept when the type is a site
  // entitlement. The list row carries the project name and a short note;
  // the record's page adds nothing, so none is opened.
  SALT_LAKE_PLANNING: {
    key:       'SALT_LAKE_PLANNING',
    kind:      'CONCEPT',
    api:       'accela',
    metro:     'Salt Lake City, UT',
    state:     'UT',
    layerUrl:  'https://aca-prod.accela.com/SLCREF/Cap/CapHome.aspx?module=Planning&TabName=Planning',
    siteUrl:   'https://aca-prod.accela.com/SLCREF/Cap/CapHome.aspx?module=Planning&TabName=Planning',
    permitType: '',
    firstLookbackDays: 365,
    windowDays: 14,
    noDetail: true,
    keepClassRe: SALT_LAKE_PLANNING_RE,
    minUnits: CONCEPT_MIN_UNITS,
    keepUnstated: true,
    map: (a) => ({
      permitNumber:   str(a.permitNumber),
      permitClass:    str(a.permitType),
      buildingKind:   [str(a.projectName), shortText(a.description, 140)].filter(Boolean).join(': '),
      address:        titleCaseAddress(str(a.address).replace(/,\s*Salt Lake City\s+UT.*$/i, '')),
      neighborhood:   a.status ? `status ${str(a.status)}` : '',
      valuation:      null,
      contractorName: '',
      unitCount:      unitsFromText(a.projectName) || unitsFromText(a.description),
      multifamily:    MULTIFAMILY_RE.test(`${str(a.projectName)} ${str(a.description)}`),
      skip:           DEAD_CASE_RE.test(str(a.status)),
      issuedAt:       a.date ? new Date(a.date) : null,
      url:            a.url ? String(a.url) : null,
    }),
  },

  // ── Council agendas (Mike 10-9): rezoning and PUD votes from Legistar ──
  // Legistar's web API is free and keyless. Each item's title carries the
  // case number, address, zoning asked for and, in most cities, the
  // applicant and owner. Kept when it states 25+ units or reads multifamily
  // (or names a multifamily zone district). Phoenix and Dallas have no permit
  // feed, so this is their first city source.
  DENVER_COUNCIL:       legistarProfile('DENVER_COUNCIL',       'denver',             'Denver, CO',        'CO', { typeRe: /^Bill$/,                       keepRe: /\bto\s+[A-Z]-(?:MX|MS|RX|RO|MU|RH)-\d/ }),
  PHOENIX_COUNCIL:      legistarProfile('PHOENIX_COUNCIL',      'phoenix',            'Phoenix, AZ',       'AZ', { typeRe: /Zoning Ordinance/,             keepRe: /\bR-[345]A?\b|Walkable Urban|\bWU\b|Residen|Apartment|Multi-?family|\bLiving\b|\bLofts?\b|\bFlats\b/i }),
  DALLAS_COUNCIL:       legistarProfile('DALLAS_COUNCIL',       'cityofdallas',       'Dallas, TX',        'TX', { typeRe: /^ZONING CASES/,                keepRe: /\bMF-\d/, typeClause: "substringof('ZONING CASES',MatterTypeName)" }),
  AUSTIN_COUNCIL:       legistarProfile('AUSTIN_COUNCIL',       'austintexas',        'Austin, TX',        'TX', { typeRe: /Zoning and Neighborhood Plan/, keepRe: /\bMF-\d|\bVMU\d?\b/ }),
  MESA_COUNCIL:         legistarProfile('MESA_COUNCIL',         'mesa',               'Mesa, AZ',          'AZ', { typeRe: /^Ordinance$|^PZ Zoning/,       keepRe: /\bRM-\d/ }),
  JACKSONVILLE_COUNCIL: legistarProfile('JACKSONVILLE_COUNCIL', 'jaxcityc',           'Jacksonville, FL',  'FL', { typeRe: /^Ordinance$/,                  keepRe: null }),
  HILLSBOROUGH_COUNCIL: legistarProfile('HILLSBOROUGH_COUNCIL', 'hillsboroughcounty', 'Tampa, FL',         'FL', { typeRe: /^Rezoning|Public Hearing-Land Use/, keepRe: /\bRMC-\d|\bRM-\d|Comprehensive Plan:\s*(?:R-(?:9|12|16|20|35)|[CUSR]MU-\d+)/ }),
};

function legistarProfile(key, client, metro, state, { typeRe, keepRe, typeClause = '' }) {
  return {
    key,
    kind:     'COUNCIL',
    api:      'legistar',
    client,
    metro,
    state,
    layerUrl: `https://webapi.legistar.com/v1/${client}/matters`,
    siteUrl:  `https://${client}.legistar.com/Legislation.aspx`,
    firstLookbackDays: 365,
    minUnits: CONCEPT_MIN_UNITS,
    typeRe,
    keepRe,
    typeClause,
    map: (m) => legistarMatter(client, m),
  };
}

/** The shared part of an Austin planning case: class, kind of building, people, status, link. */
function austinCase(a, own) {
  const text = `${str(a.case_name)} ${str(a.description_of_work)} ${str(a.proposed_land_use)}`;
  return {
    ...own,
    permitClass:    str(a.sub_type),
    buildingKind:   [str(a.case_name), shortText(a.description_of_work, 140)].filter(Boolean).join(': '),
    neighborhood:   a.council_district ? `Council District ${str(a.council_district)}` : '',
    valuation:      null,
    contractorName: '',
    ownerName:      cleanCompany(str(a.owner_organization_name) || str(a.owner_fullname)),
    applicantName:  cleanCompany(str(a.applicant_organization_name) || str(a.applicant_fullname)),
    multifamily:    MULTIFAMILY_RE.test(text),
    skip:           DEAD_CASE_RE.test(own.status) || /^closed$/i.test(own.status) || /City-Initiated|COA Planning/i.test(`${str(a.case_name)} ${str(a.applicant_organization_name)}`),
    issuedAt:       a.application_start_date ? new Date(a.application_start_date) : null,
    url:            typeof a.link === 'string' ? a.link : (a.link && a.link.url ? String(a.link.url) : null),
  };
}

/** "2026PM0000333 - 3550 W. 13th Ave - Westridge Mulroy Bldg" -> "Westridge Mulroy Bldg" (the name is the last dash part). */
export function denverProjectName(v) {
  const parts = str(v).split(/\s+-\s+/);
  return parts.length > 1 ? parts.slice(2).join(' - ') || parts[1] : parts[0];
}

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
  // A planning case declares no value; the unit floor is applied in permitToSignal.
  const floor   = profile.kind === 'CONCEPT' ? '' : ` AND ${value} >= ${MIN_VALUATION}`;
  if (profile.api === 'socrata') {
    return `${base}${profile.dateField} >= '${iso}'${klass}${floor}`;
  }
  const date = profile.dateLiteral === 'plain' ? `'${iso}'` : `DATE '${iso}'`;
  return `${base}${profile.dateField} >= ${date}${klass}${floor}`;
}

/** Full query URL for one profile. */
export function permitQueryUrl(profile, since, { limit = 500 } = {}) {
  if (profile.api === 'legistar') {
    const iso = (since instanceof Date ? since : new Date(since)).toISOString().slice(0, 10);
    // substringof is case sensitive: 'zon' covers zoning, rezone, rezoning, zoned.
    const words = ['zon', 'Zon', 'PUD', 'Planned'].map(w => `substringof('${w}',MatterTitle)`).join(' or ');
    const f = `MatterIntroDate ge datetime'${iso}' and (${words})${profile.typeClause ? ` and ${profile.typeClause}` : ''}`;
    return `${profile.layerUrl}?$top=1000&$orderby=MatterId desc&$filter=${encodeURIComponent(f)}`;
  }
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
  if (profile.api === 'legistar') {
    if (json && !Array.isArray(json)) throw new Error(json.Message || 'feed error');
    return json || [];
  }
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
  if (profile.keepClassRe && !profile.keepClassRe.test(p.permitClass)) return null;
  if (profile.kind === 'CONCEPT') return conceptToSignal(profile, p);
  if (profile.kind === 'COUNCIL') return councilToSignal(profile, p);
  if (!(p.valuation >= MIN_VALUATION)) return null;

  const what  = whatFor(p.permitClass);
  const units = p.unitCount ? `, ${p.unitCount.toLocaleString('en-US')} units` : '';
  const title = `${what}${units}: ${p.address || 'address not given'}`;
  const parts = [
    p.buildingKind ? p.buildingKind : null,
    p.contractorName ? `Contractor ${p.contractorName}` : null,
    p.ownerName ? `Owner ${p.ownerName}` : null,
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
      companies: [
        ...(p.contractorName ? [{ name: p.contractorName, role: 'GC' }] : []),
        ...(p.ownerName      ? [{ name: p.ownerName,      role: 'OWNER' }] : []),
      ],
      developerNames: [p.ownerName, p.contractorName].filter(Boolean),
      projectNames:   [],
      metro:          profile.metro,
      state:          profile.state,
      unitCount:      p.unitCount,
    },
  };
}

// ── Likely land buyer (Mike 10-9) ──
// A rezoning or site plan filed by a company that does not own the land
// usually means that company has the land under contract: the earliest public
// sign of a sale. The applicant is often the engineer, architect or zoning
// lawyer instead, so those are left as OTHER, and a person's name (no company
// word) is never called a buyer.
const PROFESSIONAL_RE = /engineer|consult|architect|design|survey|planning|planners|\blaw\b|attorney|legal|PLLC|\bP\.?C\.?$|\bL\.?L\.?P\.?$|civil|permit|expedit|land use|landscape|Kimley|Bury|Pape-Dawson|Halff|\bLJA\b|Stantec|Westwood|Atwell|Bohler|Langan|Dunaway|Garver|Huitt-Zollars|Drenner|Armbrust|Winstead|Jackson Walker|Dubois|Metcalfe|Coats Rose|Masterplan|Withey Morris|Rose Law|Snell/i;
const COMPANY_WORD_RE = /\b(LLC|L\.L\.C|LP|L\.P|LLLP|Inc|Corp|Corporation|Company|Co|Partners|Partnership|Group|Holdings|Development|Developers|Properties|Homes|Communities|Residential|Living|Capital|Ventures|Investments|Investors|Realty|Real Estate|Trust|Fund|Builders|Apartments|Housing|Multifamily|Equities|Acquisitions|Land)\b/i;
const sameName = (a, b) => String(a || '').toLowerCase().replace(/[^a-z0-9]/g, '') === String(b || '').toLowerCase().replace(/[^a-z0-9]/g, '');

export function likelyLandBuyer(ownerName, applicantName) {
  if (!ownerName || !applicantName || sameName(ownerName, applicantName)) return false;
  return COMPANY_WORD_RE.test(applicantName) && !PROFESSIONAL_RE.test(applicantName);
}

/** The applicant's tag role: BUYER, DEVELOPER (no owner named), OTHER (a consultant or a person), or null (it is the owner). */
export function applicantRole(ownerName, applicantName) {
  if (!applicantName) return null;
  if (ownerName && sameName(ownerName, applicantName)) return null;
  if (likelyLandBuyer(ownerName, applicantName)) return 'BUYER';
  if (!ownerName && COMPANY_WORD_RE.test(applicantName) && !PROFESSIONAL_RE.test(applicantName)) return 'DEVELOPER';
  return 'OTHER';
}

function filingCompanies(ownerName, applicantName) {
  const role = applicantRole(ownerName, applicantName);
  return [
    ...(ownerName ? [{ name: ownerName, role: 'OWNER' }] : []),
    ...(role      ? [{ name: applicantName, role }] : []),
  ];
}

/**
 * A planning case as a CONCEPT signal. Kept when it states minUnits or more,
 * or reads as multifamily with no count stated (keepUnstated). The applicant
 * is usually the engineer or architect (OTHER); when it is a company that is
 * not the owner it is tagged BUYER (see likelyLandBuyer).
 */
function conceptToSignal(profile, p) {
  const min = profile.minUnits || CONCEPT_MIN_UNITS;
  if (p.unitCount) { if (p.unitCount < min) return null; }
  else if (!(profile.keepUnstated && p.multifamily)) return null;

  const units = p.unitCount ? `${p.unitCount.toLocaleString('en-US')} units` : 'units not stated';
  const title = `Concept plan, ${units}: ${p.address || 'address not given'}`;
  const parts = [
    p.buildingKind ? p.buildingKind : null,
    p.ownerName ? `Owner ${p.ownerName}` : null,
    p.applicantName ? `Applicant ${p.applicantName}` : null,
    p.neighborhood ? `in ${p.neighborhood}` : null,
    `Case ${p.permitNumber}`,
  ].filter(Boolean);

  return {
    kind:           'CONCEPT',
    signalType:     'CONCEPT',
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
    valuation:      null,
    contractorName: '',
    extracted: {
      companies: filingCompanies(p.ownerName, p.applicantName),
      developerNames: [p.ownerName, applicantRole(p.ownerName, p.applicantName) === 'BUYER' ? p.applicantName : null].filter(Boolean),
      projectNames:   [],
      metro:          profile.metro,
      state:          profile.state,
      unitCount:      p.unitCount,
    },
  };
}

// ── Council agendas (Legistar) ──

const PASSED_RE = /passed|adopted|approved|enacted|granted|recommendation followed/i;
// Words that end a name inside a run-on Legistar title.
const NAME_END = '(?=\\s+(?:Representative|Owner|Location|Surveyor|U\\/A|Staff|Planner|Council|Folio|Agent|Application|Zoning|Request|City Staff)\\b|[.;]\\s|$)';

/** First capture of the first pattern that matches, trimmed. */
function firstMatch(text, patterns) {
  for (const re of patterns) { const m = text.match(re); if (m && m[1]) return m[1].trim(); }
  return '';
}

/** Case number, address, project, owner and applicant out of one Legistar title. Pure, exported for tests. */
export function parseCouncilTitle(title) {
  const t = str(title).replace(/\s+/g, ' ');
  const caseNumber = firstMatch(t, [
    /\b(C14[A-Z]?-\d{4}-\d{3,4})\b/,                 // Austin
    /\b(ZON\d{2}-\d{5})\b/,                           // Mesa
    /Rezoning Application (Z-[\dA-Z]+-\d{2}-\d)\b/,  // Phoenix
    /\b(Z-\d{2}-\d{6})\b/,                            // Dallas
    /\(Appl # (Z-\d+)/,                               // Jacksonville
    /Application Number:\s*([A-Z-]+ \d{2}-\d{4})/,    // Hillsborough
  ]);
  // Owner and applicant, most specific pattern first.
  let ownerName = '', applicantName = '';
  const both = firstMatch(t, [/Owner\/Applicant:\s*(.+?)(?=\.\s|$)/, new RegExp(`Applicant\\/Owner:\\s*(.+?)${NAME_END}`)]);
  const mesa = t.match(/(?:^|[.;]\s*)([^.;]+?),\s*owner;\s*([^.;]+?),\s*applicant\b/i);
  if (both) { ownerName = both; applicantName = both; }
  else if (mesa) { ownerName = mesa[1]; applicantName = mesa[2]; }
  else {
    ownerName     = firstMatch(t, [new RegExp(`\\bOwner:\\s*(.+?)${NAME_END}`), /\s-\s([^-()]+?)\s*\(R\.E\.\s*#/]);
    applicantName = firstMatch(t, [new RegExp(`\\bApplicant:\\s*(.+?)${NAME_END}`), /Rezoning Application Z-[^\s]+ \(([^()]+?) - /]);
  }
  // "Kittle Property Group / Jana Darmon": the company, not the contact.
  applicantName = applicantName.split(' / ')[0];
  const address = firstMatch(t, [
    /\bAKA\s+(.+?)(?=\.\s|$)/,                                   // Dallas
    /locally known as\s+(.+?)\s*\(/,                              // Austin
    /Rezoning at\s+([^,]+),/,                                     // Jacksonville
    /zoning classification for\s+(.+?)\s+in\s+[A-Z]/,             // Denver
    /Location:\s*(.+?)\s+Folio/,                                  // Hillsborough
    /-\s*((?:Approximately|Northeast|Northwest|Southeast|Southwest)\b[^()]+?)\s*\(Ordinance/i, // Phoenix
    /located\s+((?:approximately|at)\b[^.]+?)\.\s/i,              // Mesa
  ]);
  const projectName = firstMatch(t, [
    /^C14[^ ]* - (.+?) - Conduct/,          // Austin
    /"([^"]{3,80}?),?"/,                    // Mesa
    /Described in the (.+? PUD)\b/,         // Jacksonville
  ]);
  return { caseNumber, ownerName: cleanCompany(ownerName), applicantName: cleanCompany(applicantName), address: shortText(address, 120), projectName };
}

/** One Legistar matter, in the shape permitToSignal reads. */
export function legistarMatter(client, m) {
  const title  = str(m.MatterTitle);
  const parsed = parseCouncilTitle(title);
  const status = str(m.MatterStatusName);
  return {
    permitNumber:  parsed.caseNumber || str(m.MatterFile),
    permitClass:   str(m.MatterTypeName),
    body:          str(m.MatterBodyName),
    status,
    passed:        PASSED_RE.test(status),
    title,
    address:       parsed.address,
    projectName:   parsed.projectName || str(m.MatterName).replace(/^ZON\d{2}-\d{5}\s*-\s*/, ''),
    ownerName:     parsed.ownerName,
    applicantName: parsed.applicantName,
    neighborhood:  [str(m.MatterBodyName), status].filter(Boolean).join(': '),
    unitCount:     unitsFromText(title),
    multifamily:   MULTIFAMILY_RE.test(title),
    skip:          DEAD_CASE_RE.test(status) || /minutes|vacat|variance|replat|\bplat\b/i.test(`${str(m.MatterTypeName)} ${title.slice(0, 80)}`),
    issuedAt:      m.MatterPassedDate || m.MatterAgendaDate || m.MatterIntroDate ? new Date(m.MatterPassedDate || m.MatterAgendaDate || m.MatterIntroDate) : null,
    url:           m.MatterId ? `https://${client}.legistar.com/LegislationDetail.aspx?ID=${m.MatterId}${m.MatterGuid ? `&GUID=${m.MatterGuid}` : ''}` : null,
  };
}

/** A council or hearing-body zoning item as a COUNCIL signal. */
function councilToSignal(profile, p) {
  if (profile.typeRe && !profile.typeRe.test(p.permitClass)) return null;
  if (!/zon|PUD|Planned (?:Unit|Development|Area)/i.test(p.title)) return null;
  const min = profile.minUnits || CONCEPT_MIN_UNITS;
  if (p.unitCount) { if (p.unitCount < min) return null; }
  else if (!(p.multifamily || (profile.keepRe && profile.keepRe.test(p.title)))) return null;

  const units = p.unitCount ? `${p.unitCount.toLocaleString('en-US')} units` : 'units not stated';
  const title = `${p.passed ? 'Rezoning approved' : 'Rezoning on the agenda'}, ${units}: ${p.address || p.projectName || 'address not given'}`;
  const role  = applicantRole(p.ownerName, p.applicantName);
  const parts = [
    p.projectName || null,
    p.ownerName ? `Owner ${p.ownerName}` : null,
    p.applicantName && role ? `Applicant ${p.applicantName}` : null,
    p.neighborhood || null,
    `Case ${p.permitNumber}`,
  ].filter(Boolean);

  return {
    kind:           'COUNCIL',
    signalType:     'COUNCIL',
    projectRelated: true,
    title,
    summary:        `${parts.join(', ')}. ${shortText(p.title, 400)}`,
    url:            p.url || null,
    publishedAt:    p.issuedAt,
    unitCount:      p.unitCount,
    permitNumber:   p.permitNumber,
    permitClass:    p.permitClass,
    address:        p.address,
    neighborhood:   p.neighborhood,
    valuation:      null,
    contractorName: '',
    extracted: {
      companies:      filingCompanies(p.ownerName, p.applicantName),
      developerNames: [p.ownerName, role === 'BUYER' || role === 'DEVELOPER' ? p.applicantName : null].filter(Boolean),
      projectNames:   p.projectName ? [p.projectName] : [],
      metro:          profile.metro,
      state:          profile.state,
      unitCount:      p.unitCount,
    },
  };
}

// ── Houston report (pure: forms and CSV; the fetch lives in houstonFeed.js) ──

/** Date windows of n days from `since` to `until`, oldest first, each `{ start, end }`. */
export function houstonWindows(since, until, days = 90) {
  const out = [];
  let start = new Date(since);
  const end = new Date(until);
  while (start < end) {
    const stop = new Date(Math.min(start.getTime() + days * 86400e3, end.getTime()));
    out.push({ start, end: stop });
    start = stop;
  }
  return out;
}

const ymd = (d) => new Date(d).toISOString().slice(0, 10).replace(/-/g, '');

/** Form body for the report POST: multi-family (SELTD=MF), building permits, one date window. */
export function houstonReportForm(start, end) {
  return new URLSearchParams({
    IBIF_ex: 'online_per_se.fex', ibiapp_app: 'soldpermits', ibic_server: 'EDASERVE',
    BDT: ymd(start), EDT: ymd(end), edit4: '', edit5: '', SRH: '', SELTD: 'MF', PTYPE: '13',
  }).toString();
}

/** Form body for the CSV export of the report just run (same session cookies). Column order fixed. */
export const HOUSTON_EXPORT_FORM = 'IBIF_webapp=%2Fibi_apps&IBIC_server=EDASERVE&IBIWF_msgviewer=OFF&IBIF_ex=c1che&AR_CFUNC=EXPORT&IBIF_wfdescribe=OFF&AR_CFORMAT=COMMA&AR_WCOND=&AR_SORDER=&AR_CACHEMAS=REPS_PAID_PERMITS_MV&AR_CACHEMODE=0&AR_CACHEFMT=BINARY&AR_CACHEFEX=c1che&AR_COLS=++F01+AS+%27PROJECT_NO%27+F02+AS+%27PERMIT_DESC%27+F03+AS+%27OWNER_OCCUPANT%27+F04+AS+%27Address%27+F05+AS+%27PROJECT_DESC%27+F06+AS+%27CURRENT_VALUATION%27+F07+AS+%27PERMIT_TYPE%27&AR_COUNTCOL=F07&AR_RAND=367';

export const HOUSTON_COLUMNS = ['PROJECT_NO', 'PERMIT_DESC', 'OWNER_OCCUPANT', 'Address', 'PROJECT_DESC', 'CURRENT_VALUATION', 'PERMIT_TYPE'];

/** One CSV line into cells: quoted text with "" escapes, bare numbers with padding. */
export function csvCells(line) {
  const cells = [];
  let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { cells.push(cur); cur = ''; }
    else cur += c;
  }
  cells.push(cur);
  return cells.map(s => s.trim());
}

/** The export CSV (no header row) into objects, each stamped with the window's end as issuedAt. */
export function houstonRows(csv, { issuedAt = null } = {}) {
  return String(csv || '').split(/\r?\n/).filter(l => l.trim()).map(line => {
    const cells = csvCells(line);
    const row = {};
    HOUSTON_COLUMNS.forEach((k, i) => { row[k] = cells[i] ?? ''; });
    row.issuedAt = issuedAt;
    return row;
  }).filter(r => /^\d+$/.test(r.PROJECT_NO));
}

// ── Accela portal (pure: forms and HTML; the fetch lives in accelaFeed.js) ──

/** mm/dd/yyyy in UTC, the way the Accela date boxes want it. */
export function accelaDate(d) {
  const x = new Date(d);
  return `${String(x.getUTCMonth() + 1).padStart(2, '0')}/${String(x.getUTCDate()).padStart(2, '0')}/${x.getUTCFullYear()}`;
}

/** The hidden ASP.NET fields a page carries; every POST must echo them. */
export function accelaState(html) {
  const pick = (n) => (String(html || '').match(new RegExp(`id="${n}"[^>]*value="([^"]*)"`)) || [])[1] || '';
  return { __VIEWSTATE: pick('__VIEWSTATE'), __VIEWSTATEGENERATOR: pick('__VIEWSTATEGENERATOR'), __VIEWSTATEENCRYPTED: pick('__VIEWSTATEENCRYPTED') };
}

/** Search form for one date window and permit type (first page). */
export function accelaSearchForm(profile, start, end, state) {
  return new URLSearchParams({
    ...state,
    'ctl00$PlaceHolderMain$generalSearchForm$txtGSStartDate': accelaDate(start),
    'ctl00$PlaceHolderMain$generalSearchForm$txtGSEndDate':   accelaDate(end),
    'ctl00$PlaceHolderMain$generalSearchForm$ddlGSPermitType': profile.permitType,
    'ctl00$PlaceHolderMain$btnNewSearch': 'Search',
  }).toString();
}

/** The postback that turns to the next page, or null on the last page. */
export function accelaNextTarget(html) {
  return (String(html || '').match(/__doPostBack\(&#39;([^&]*)&#39;,&#39;&#39;\)">Next/) || [])[1] || null;
}

/** Form for the "Next >" postback on a result page. */
export function accelaNextForm(profile, start, end, state, target) {
  return new URLSearchParams({
    ...state,
    __EVENTTARGET: target,
    __EVENTARGUMENT: '',
    'ctl00$PlaceHolderMain$generalSearchForm$txtGSStartDate': accelaDate(start),
    'ctl00$PlaceHolderMain$generalSearchForm$txtGSEndDate':   accelaDate(end),
    'ctl00$PlaceHolderMain$generalSearchForm$ddlGSPermitType': profile.permitType,
  }).toString();
}

const unescapeHtml = (s) => String(s || '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * The ten rows of a result page: date, detail link, number, type, description,
 * project, address, status. Each row is read on its own, label by label, so a
 * module that leaves a column out (Planning has lblShortNote and
 * lblPermitAddress instead of lblDescription and lblAddress) still parses.
 */
export function accelaRows(html) {
  // The lookahead split never cuts at position 0, so the header is dropped by test, not by index.
  const chunks = String(html || '').split(/(?=<span[^>]*lblUpdatedTime)/).filter(c => /lblUpdatedTime/.test(c));
  const label = (chunk, ...names) => {
    for (const n of names) {
      const m = chunk.match(new RegExp(`${n}"[^>]*>([^<]*)<`));
      if (m) return unescapeHtml(m[1]);
    }
    return '';
  };
  return chunks.map(chunk => ({
    date:         label(chunk, 'lblUpdatedTime'),
    url:          unescapeHtml((chunk.match(/href="([^"]*CapDetail[^"]*)"/) || [])[1] || ''),
    permitNumber: label(chunk, 'lblPermitNumber1'),
    permitType:   label(chunk, 'lblType'),
    description:  label(chunk, 'lblDescription', 'lblShortNote'),
    projectName:  label(chunk, 'lblProjectName'),
    address:      label(chunk, 'lblAddress', 'lblPermitAddress'),
    status:       label(chunk, 'lblStatus'),
  })).filter(r => r.permitNumber);
}

/** "Showing 1-10 of 87" on a result page, as the total (null when absent). */
export function accelaTotal(html) {
  const m = String(html || '').match(/Showing \d+-\d+ of (\d+)(\+?)/);
  return m ? Number(m[1]) + (m[2] ? 1 : 0) : null;
}

/**
 * Only rows that read like a building are worth a detail fetch: a remodel of
 * one suite never reaches $10M. Says yes on new construction, additions,
 * apartments, hotels, towers, shells, a unit or storey count, or a square
 * footage of five figures or more.
 */
export function accelaWorthDetail(row) {
  if (/withdrawn|denied|void|cancel|expired/i.test(String(row.status || ''))) return false;
  const t = `${row.projectName || ''} ${row.description || ''}`;
  // Five or more units or storeys, or a word only a whole building gets.
  const strong = /\b(([5-9]|\d{2,})\s*-?\s*(unit|units|stor(y|ies|ey))|apartments?|multi.?family|multifamily|mixed.?use|hotel|tower|podium|parking (structure|garage)|new (commercial |office |residential |apartment |mixed.?use |\d+.story )?(building|construction|structure)|ground.?up|shell (and|&) core|core (and|&) shell)\b/i;
  // Work inside an existing building, however the sentence starts.
  const tenant = /\b(interior|remodel|alteration|tenant|build.?out|sign|repair|remediation|re.?roof|roof|hvac|mechanical|electrical|plumbing|demo|demolition|fire|sprinkler|expansion space|suite)\b/i;
  const weak   = /\b(new|construct|erect|addition|expansion|shell|condo|dwelling|residential building)\b/i;
  if (strong.test(t)) return true;
  if (/\b\d{2,3},\d{3}\s*(sf|sq|square)/i.test(t) || /\b\d{5,}\s*(sf|sq|square)/i.test(t)) return true;
  return weak.test(t) && !tenant.test(t);
}

/**
 * Job Value, use type, square footage and record status from a permit's own
 * page. A Denver concept plan's page adds the proposed dwelling units, the
 * proposed use and the gross floor area.
 */
export function accelaDetail(html) {
  const flat = String(html || '').replace(/\s+/g, ' ');
  const text = (label) => {
    const m = flat.match(new RegExp(`${label}(?:<[^>]+>|&nbsp;|\\s)*([^<]+)<`));
    return m ? unescapeHtml(m[1]) : '';
  };
  const count = (label) => { const n = parseInt((text(label) || '').replace(/,/g, ''), 10); return Number.isFinite(n) ? n : null; };
  const jobValue = (flat.match(/Job Value[\s\S]{0,400}?\$\s*([\d,]+(?:\.\d+)?)/) || [])[1];
  return {
    jobValue:      jobValue ? Number(jobValue.replace(/,/g, '')) : null,
    useType:       text('Use Type \\(Permit\\):'),
    sqft:          Number((text('Square footage of work area:') || '').replace(/,/g, '')) || null,
    status:        text('Record Status:'),
    proposedUnits: count('Number of Proposed Dwelling Units:'),
    proposedUse:   text('Proposed Use 1:'),
    grossSf:       count('Gross Floor Area \\(sq\\. ft\\):'),
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
