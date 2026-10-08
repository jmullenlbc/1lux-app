// City permit feeds (migration 0123, Mike 10-7). Pure, no DB, no fetch.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PERMIT_PROFILES, profileForSource, permitWhere, permitQueryUrl, permitRows, permitToSignal, unitsFrom, unitsFromText, whatFor, shortText, cleanCompany, titleCaseAddress, money } from '../../src/lib/market-intel/permitRules.js';

const DENVER = PERMIT_PROFILES.DENVER;
const ROW = {
  OBJECTID: 1, DATE_ISSUED: Date.UTC(2026, 8, 23), PERMIT_NUM: '2026-COMMCON-0000365', ADDRESS: '4459 N RIFLE ST',
  LOCATION: '//', CLASS: 'New Building', UNITS: '265', VALUATION: 51862516, CONTRACTOR_NAME: 'PAULSCORP LLC', NEIGHBORHOOD: 'Gateway - Green Valley Ranch',
};

test('Denver unit text becomes a whole positive number or nothing', () => {
  assert.equal(unitsFrom('265'), 265);
  assert.equal(unitsFrom('6.'), 6);
  assert.equal(unitsFrom('-2'), null);
  assert.equal(unitsFrom(''), null);
  assert.equal(unitsFrom(null), null);
});

test('shouting contractor names read like names', () => {
  assert.equal(cleanCompany('GARRETT CONSTRUCTION COMPANY LLC (THE)'), 'Garrett Construction Company LLC');
  assert.equal(cleanCompany('VASTYAN COLORADO LLC DBA  VASTYAN CONSTRUCTION'), 'Vastyan Colorado LLC');
  assert.equal(cleanCompany('Milender White Construction Co'), 'Milender White Construction Co');
  assert.equal(cleanCompany(''), '');
});

test('addresses title-case but keep the compass letter', () => {
  assert.equal(titleCaseAddress('4459 N RIFLE ST'), '4459 N Rifle St');
  assert.equal(titleCaseAddress('2777 N ZUNI ST'), '2777 N Zuni St');
});

test('a new multifamily building becomes a permit signal with a GC tag', () => {
  const s = permitToSignal(DENVER, ROW);
  assert.equal(s.kind, 'PERMIT');
  assert.equal(s.signalType, 'PERMIT');
  assert.equal(s.title, 'New building, 265 units: 4459 N Rifle St');
  assert.equal(s.unitCount, 265);
  assert.equal(s.valuation, 51862516);
  assert.equal(s.contractorName, 'Paulscorp LLC');
  assert.equal(s.permitNumber, '2026-COMMCON-0000365');
  assert.deepEqual(s.extracted.companies, [{ name: 'Paulscorp LLC', role: 'GC' }]);
  assert.equal(s.extracted.metro, 'Denver, CO');
  assert.equal(s.extracted.state, 'CO');
  assert.match(s.summary, /\$52M/);
  assert.match(s.summary, /Permit 2026-COMMCON-0000365/);
});

test('tenant finishes, sheds and contractor swaps are dropped', () => {
  assert.equal(permitToSignal(DENVER, { ...ROW, CLASS: 'Alteration/Tenant Finish' }), null);
  assert.equal(permitToSignal(DENVER, { ...ROW, CLASS: 'Change of Contractor', UNITS: '1', VALUATION: 0 }), null);
  assert.equal(permitToSignal(DENVER, { ...ROW, UNITS: '', VALUATION: 250000 }), null);
  // Under $10M is too small a job, unit count or not (Mike 10-8).
  assert.equal(permitToSignal(DENVER, { ...ROW, VALUATION: 4_000_000 }), null);
  assert.equal(permitToSignal(DENVER, { ...ROW, UNITS: '', VALUATION: 4_000_000 }), null);
  // No unit count but real money still counts: a hotel or a big addition.
  assert.ok(permitToSignal(DENVER, { ...ROW, UNITS: '', VALUATION: 12_000_000 }));
  assert.equal(permitToSignal(DENVER, { ...ROW, PERMIT_NUM: '' }), null);
});

test('the where clause asks for recent kept classes worth $10M or more', () => {
  const w = permitWhere(DENVER, new Date(Date.UTC(2026, 0, 15)));
  assert.match(w, /DATE_ISSUED >= DATE '2026-01-15'/);
  assert.match(w, /CLASS IN \('New Building','Addition'/);
  assert.match(w, /VALUATION >= 10000000/);
  const url = permitQueryUrl(DENVER, new Date(Date.UTC(2026, 0, 15)), { limit: 50 });
  assert.match(url, /^https:\/\/services1\.arcgis\.com\//);
  assert.match(url, /resultRecordCount=50/);
  assert.match(url, /f=json/);
});

const AUSTIN = PERMIT_PROFILES.AUSTIN;
const AROW = {
  permit_number: '2026-030863 BP', permit_class: 'C- 105 Five or More Family Bldgs', work_class: 'New', issue_date: '2026-09-06T00:00:00.000',
  housing_units: '5', total_job_valuation: '10067000', original_address1: '6620 ED BLUESTEIN BLVD SB BLDG 1', contractor_company_name: 'DMJ Construction Services LLC',
  applicant_org: 'DMJ Construction Services LLC', description: 'New construction of multifamily', link: { url: 'https://abc.austintexas.gov/web/permit/public-search-other?t_detail=1&t_selected_folderrsn=13669715' }, council_district: '1',
};

test('Austin rows map to a permit signal with the city link', () => {
  const s = permitToSignal(AUSTIN, AROW);
  assert.equal(s.kind, 'PERMIT');
  assert.equal(s.permitNumber, '2026-030863 BP');
  assert.equal(s.permitClass, 'New');
  assert.equal(s.unitCount, 5);
  assert.equal(s.address, '6620 Ed Bluestein Blvd Sb Bldg 1');
  assert.equal(s.contractorName, 'DMJ Construction Services LLC');
  assert.match(s.url, /^https:\/\/abc\.austintexas\.gov\//);
  assert.match(s.summary, /Five or More Family Bldgs/);
  assert.equal(s.extracted.metro, 'Austin, TX');
  assert.equal(s.extracted.state, 'TX');
  assert.equal(permitToSignal(AUSTIN, { ...AROW, work_class: 'Remodel' }), null);
  assert.equal(permitToSignal(AUSTIN, { ...AROW, total_job_valuation: '9900000' }), null);
  // Austin's housing_units is a building count on non-residential rows: a sign permit says 1.
  assert.equal(permitToSignal(AUSTIN, { ...AROW, permit_class: 'C- 328 Commercial Other Nonresident Bldg', housing_units: '1', total_job_valuation: '25000000' }).unitCount, null);
  assert.equal(permitToSignal(AUSTIN, { ...AROW, permit_class: 'C- 329 Com Structures Other Than Bldg', total_job_valuation: '25000000' }), null);
  assert.equal(permitToSignal(AUSTIN, { ...AROW, permit_class: 'C- 213 Hotels, Motels, & Tourist Cabins', housing_units: '120' }).unitCount, 120);
});

test('Austin asks Socrata for commercial building permits in its own dialect', () => {
  const w = permitWhere(AUSTIN, new Date(Date.UTC(2026, 0, 15)));
  assert.match(w, /permittype='BP' AND permit_class_mapped='Commercial'/);
  assert.match(w, /issue_date >= '2026-01-15'/);
  assert.match(w, /work_class IN \('New','Addition','Shell'/);
  assert.match(w, /AND total_job_valuation >= 10000000$/);
  assert.doesNotMatch(w, /housing_units/);
  const url = permitQueryUrl(AUSTIN, new Date(Date.UTC(2026, 0, 15)), { limit: 50 });
  assert.match(url, /^https:\/\/data\.austintexas\.gov\/resource\/3syk-w9eu\.json\?/);
  assert.match(url, /%24limit=50/);
  assert.match(url, /%24order=issue_date\+DESC/);
});

test('permitRows reads both feed shapes', () => {
  assert.deepEqual(permitRows(DENVER, { features: [{ attributes: { PERMIT_NUM: 'a' } }] }), [{ PERMIT_NUM: 'a' }]);
  assert.deepEqual(permitRows(AUSTIN, [{ permit_number: 'b' }]), [{ permit_number: 'b' }]);
  assert.throws(() => permitRows(DENVER, { error: { message: 'bad layer' } }), /bad layer/);
  assert.throws(() => permitRows(AUSTIN, { error: true, message: 'bad query' }), /bad query/);
});

// ── Orlando (10-8) ───────────────────────────────────────────────────────────
const ORLANDO = PERMIT_PROFILES.ORLANDO;
const OROW = {
  permit_number: 'BLD2026-12345', application_type: 'Building Permit', worktype: 'New', plan_review_type: 'Commercial', issue_permit_date: '2026-08-01T00:00:00.000',
  permit_address: '510 BROOKHAVEN DR', estimated_cost: '24500000', contractor_name: 'THE WHITING-TURNER CONTRACTING COMPANY', project_name: 'LAKE HIGHLAND ATHLETIC CENTER', neighborhood: 'Lake Highland',
};

test('Orlando rows map and the where clause asks for commercial or 3-plus-unit buildings', () => {
  const s = permitToSignal(ORLANDO, OROW);
  assert.equal(s.title, 'New building: 510 Brookhaven Dr');
  assert.match(s.summary, /Commercial: LAKE HIGHLAND ATHLETIC CENTER/);
  assert.equal(s.contractorName, 'The Whiting-Turner Contracting Company');
  assert.equal(s.unitCount, null);
  assert.equal(s.extracted.metro, 'Orlando, FL');
  assert.equal(permitToSignal(ORLANDO, { ...OROW, estimated_cost: '9999999' }), null);
  assert.equal(permitToSignal(ORLANDO, { ...OROW, worktype: 'Demolition' }), null);
  assert.equal(permitToSignal(ORLANDO, { ...OROW, worktype: 'Alteration' }).title, 'Alteration: 510 Brookhaven Dr');
  const w = permitWhere(ORLANDO, new Date(Date.UTC(2026, 0, 15)));
  assert.match(w, /plan_review_type IN \('Commercial','Residential 3 or more'\)/);
  assert.match(w, /worktype IN \('New','Addition','Alteration','Alt'\)/);
  assert.match(w, /estimated_cost >= 10000000$/);
});

// ── Phoenix metro: Mesa + Tempe (10-8) ───────────────────────────────────────
const MESA = PERMIT_PROFILES.MESA;
const MROW = {
  permit_number: 'PMT21-15339', issued_date: '2026-09-01T00:00:00.000', permit_type: 'COM', record_type: 'Commercial Permit', type_of_work: 'Multi-Family Residential',
  property_address: '5135 S POWER RD', total_valuation: '53810201.3', contractor_name: 'MMF 1 ARIZONA CONTRACTOR, L.L.C.',
  description_of_work: 'This project consists of new development of 305-units multi-family development comprising of (1) 4-stories multifamily building.',
};

test('Mesa reads the unit count out of the description when the unit column is empty', () => {
  const s = permitToSignal(MESA, MROW);
  assert.equal(s.title, 'New building, 305 units: 5135 S Power Rd, Mesa');
  assert.equal(s.unitCount, 305);
  assert.equal(s.contractorName, 'Mmf 1 Arizona Contractor, L.L.C.');
  assert.equal(s.extracted.metro, 'Phoenix, AZ');
  assert.equal(permitToSignal(MESA, { ...MROW, number_of_dwelling_units: '280' }).unitCount, 280);
  assert.equal(permitToSignal(MESA, { ...MROW, type_of_work: 'Tenant Improvement (Interior Only)' }).title, 'Tenant improvement: 5135 S Power Rd, Mesa');
  assert.equal(permitToSignal(MESA, { ...MROW, type_of_work: 'Swimming Pool' }), null);
  assert.equal(permitToSignal(MESA, { ...MROW, total_valuation: '9500000' }), null);
  assert.match(permitWhere(MESA, new Date(Date.UTC(2026, 0, 15))), /^issued_date >= '2026-01-15' AND type_of_work IN \('Multi-Family Residential'/);
});

const TEMPE = PERMIT_PROFILES.TEMPE;
const TROW = {
  PermitNum: 'BP250302', PermitClass: '106 New - Ten or more Family', PermitTypeDesc: 'Building Permit', OriginalAddress1: '965 E UNIVERSITY DR',
  EstProjectCost: 143656500, HousingUnits: 533, ContractorCompanyName: null, Description: 'CONSTRUCT NEW MIXED USE RESIDENTIAL/COMMERCIAL BUILDING', IssuedDateDtm: 1786060800000,
};

test('Tempe keeps every $10M class except the junk and counts units only on family buildings', () => {
  const s = permitToSignal(TEMPE, TROW);
  assert.equal(s.title, 'New building, 533 units: 965 E University Dr, Tempe');
  assert.match(s.summary, /^New - Ten or more Family: CONSTRUCT NEW/);
  assert.deepEqual(s.extracted.companies, []);
  assert.equal(permitToSignal(TEMPE, { ...TROW, PermitClass: '437 - Additions and Alterations - Non-Residential', HousingUnits: 0 }).title, 'Addition: 965 E University Dr, Tempe');
  assert.equal(permitToSignal(TEMPE, { ...TROW, PermitClass: '330 - Commercial Buildings', HousingUnits: 3 }).unitCount, null);
  assert.equal(permitToSignal(TEMPE, { ...TROW, PermitClass: '645 - Demolition' }), null);
  const w = permitWhere(TEMPE, new Date(Date.UTC(2026, 0, 15)));
  assert.equal(w, "IssuedDateDtm >= DATE '2026-01-15' AND EstProjectCost >= 10000000");
});

// ── Miami: county + city (10-8) ──────────────────────────────────────────────
const MIAMI_DADE = PERMIT_PROFILES.MIAMI_DADE;
const DROW = {
  PermitNumber: '2026072044', PermitIssuedDate: '2026-09-16', ApplicationTypeDescription: 'NEW', ProposedUseDescription: '5 UNITS OR MORE - RESIDENTIAL',
  PropertyAddress: '2681 NE 191 ST', City: 'MIAMI', EstimatedValue: '68000000', StructureUnits: 250, StructureFloors: 9, ContractorName: 'THE WINDOW GUYS OF FLORIDA INC',
};

test('Miami-Dade reads the text value, counts units on residential uses and only reads BLDG permits', () => {
  const s = permitToSignal(MIAMI_DADE, DROW);
  assert.equal(s.title, 'New building, 250 units: 2681 NE 191 St, Miami');
  assert.equal(s.valuation, 68000000);
  assert.match(s.summary, /5 Units Or More - Residential, Contractor The Window Guys Of Florida INC, declared value \$68M/);
  assert.equal(permitToSignal(MIAMI_DADE, { ...DROW, ProposedUseDescription: 'WAREHOUSE/STORAGE', StructureUnits: 1 }).unitCount, null);
  assert.equal(permitToSignal(MIAMI_DADE, { ...DROW, ApplicationTypeDescription: 'RE-ROOF/REPAIR' }), null);
  assert.equal(permitToSignal(MIAMI_DADE, { ...DROW, ApplicationTypeDescription: 'SHELL ONLY' }).title, 'Shell building, 250 units: 2681 NE 191 St, Miami');
  const w = permitWhere(MIAMI_DADE, new Date(Date.UTC(2026, 0, 15)));
  assert.equal(w, "PermitType='BLDG' AND PermitIssuedDate >= DATE '2026-01-15' AND ApplicationTypeDescription IN ('NEW','SHELL ONLY','ADDITION - ATTACHED','ADDITION - DETACHED','ALTER - INTERIOR') AND CAST(EstimatedValue AS FLOAT) >= 10000000");
});

const MIAMI = PERMIT_PROFILES.MIAMI;
const CROW = {
  PermitNumber: 'BD25010853001B001', IssuedDate: 1791390180000, ScopeofWork: 'NEW CONSTRUCTION', PropertyType: 'Commercial',
  WorkItems: 'RETAIL OF GOODS:SUPERMARKET/CLOTHING|MULTI-FAMILY (RENTAL)|PARKING GARAGE-MULTIPLE FLOORS ', DeliveryAddress: '1445 N MIAMI AV', TotalCost: '104095626', CompanyName: 'FIRST FLORIDA CONSTRUCTORS LLC', TotalSQFT: '594815',
};

test('City of Miami says what the building holds and casts its text cost', () => {
  const s = permitToSignal(MIAMI, CROW);
  assert.equal(s.title, 'New building: 1445 N Miami Av, Miami');
  assert.match(s.summary, /^Commercial: Retail Of Goods, Multi-Family \(Rental\), Parking Garage-Multiple Floors, Contractor First Florida Constructors LLC, declared value \$104M/);
  assert.equal(permitToSignal(MIAMI, { ...CROW, ScopeofWork: 'PHASED PERMIT' }).title, 'Phased construction: 1445 N Miami Av, Miami');
  assert.equal(permitToSignal(MIAMI, { ...CROW, ScopeofWork: 'REMODELING/REPAIRS' }).title, 'Alteration: 1445 N Miami Av, Miami');
  assert.equal(permitToSignal(MIAMI, { ...CROW, ScopeofWork: 'DEMOLITION' }), null);
  assert.match(permitWhere(MIAMI, new Date(Date.UTC(2026, 0, 15))), /^IssuedDate >= DATE '2026-01-15' AND ScopeofWork IN \('NEW CONSTRUCTION'.* AND CAST\(TotalCost AS FLOAT\) >= 10000000$/);
});

// ── Tampa Bay: Hillsborough County (10-8) ────────────────────────────────────
const HILLS = PERMIT_PROFILES.HILLSBOROUGH;
const HROW = {
  PERMIT__: 'HC-BLD-23-0050335', ISSUED_DATE: 1787443200000, TYPE: 'Commercial New Construction', OCCUPANCY_TYPE: 'Dwellings', OCCUPANCY_CATEGORY: 'R-2 Apartment Bldg',
  ADDRESS: '216 S MULRENNAN RD', CITY: 'Valrico 33594', Value: 61583327, Unit_Cnt_Int: 47, SF_Total_Int: 58651, DESCRIPTION: 'NEW CONSTRUCTION OF A SEVEN BUILDING 325 UNIT APARTMENT COMPLEX - BUILDING 2',
};

test('Hillsborough counts units on residential occupancies only and has no contractor', () => {
  const s = permitToSignal(HILLS, HROW);
  assert.equal(s.title, 'New building, 47 units: 216 S Mulrennan Rd, Valrico');
  assert.equal(s.contractorName, '');
  assert.deepEqual(s.extracted.companies, []);
  assert.equal(s.extracted.metro, 'Tampa, FL');
  assert.equal(permitToSignal(HILLS, { ...HROW, OCCUPANCY_TYPE: '', OCCUPANCY_CATEGORY: 'S-2A Low Hazard Storage', Unit_Cnt_Int: 1 }).unitCount, null);
  assert.equal(permitToSignal(HILLS, { ...HROW, TYPE: 'Residential New Construction' }), null);
  assert.equal(permitToSignal(HILLS, { ...HROW, TYPE: 'Commercial Building Alterations (Renovations)' }).title, 'Alteration, 47 units: 216 S Mulrennan Rd, Valrico');
  assert.match(permitWhere(HILLS, new Date(Date.UTC(2026, 0, 15))), /^ISSUED_DATE >= DATE '2026-01-15' AND TYPE IN \('Commercial New Construction'.* AND Value >= 10000000$/);
});

// ── Jacksonville (10-8) ──────────────────────────────────────────────────────
const JAX = PERMIT_PROFILES.JACKSONVILLE;
const JROW = {
  FullPermitNumber: 'B-26-365360.000', PaidDay: 1779926400000, TypeOfWork: 'New Building', ProposedUseDesc: 'Non-Residential', TotalCost: 36000000,
  ADDR: '777 CHURCH ST E', CITY: 'JACKSONVILLE', ZIPCODE: '32202', CompanyName: 'Haskell', Comments: 'Chilled water plant expansion', Status: 12,
};

test('Jacksonville sends the Referer and a plain quoted date the city proxy accepts', () => {
  const s = permitToSignal(JAX, JROW);
  assert.equal(s.title, 'New building: 777 Church St E, Jacksonville');
  assert.match(s.summary, /^Non-Residential: Chilled water plant expansion, Contractor Haskell, declared value \$36M/);
  assert.equal(permitToSignal(JAX, { ...JROW, TypeOfWork: 'Tenant Build-Out' }).title, 'Tenant improvement: 777 Church St E, Jacksonville');
  assert.equal(permitToSignal(JAX, { ...JROW, TypeOfWork: 'Roof' }), null);
  assert.equal(permitWhere(JAX, new Date(Date.UTC(2026, 0, 15))), "PermitTypeID=1 AND PaidDay >= '2026-01-15' AND TypeOfWork IN ('New Building','Addition','Alterations & Repairs','Tenant Build-Out') AND TotalCost >= 10000000");
  assert.equal(JAX.headers.Referer, 'https://maps.coj.net/bid/default.aspx');
  assert.match(permitQueryUrl(JAX, new Date(Date.UTC(2026, 0, 15))), /^https:\/\/maps\.coj\.net\/bid\/duval\.ashx\?HTTPS:\/\/CMVXDWVZDA\.QQQ\/Z4\/query\?where=/);
});

test('a source row finds its profile by feed URL first, so two feeds can share a metro', () => {
  assert.equal(profileForSource({ market: 'PHOENIX', feedUrl: TEMPE.layerUrl }).key, 'TEMPE');
  assert.equal(profileForSource({ market: 'PHOENIX', feedUrl: MESA.layerUrl }).key, 'MESA');
  assert.equal(profileForSource({ market: 'MIAMI', feedUrl: MIAMI_DADE.layerUrl }).key, 'MIAMI_DADE');
  assert.equal(profileForSource({ market: 'DENVER', feedUrl: 'https://example.com/old' }).key, 'DENVER');
  assert.equal(profileForSource({ market: 'DALLAS' }), null);
});

test('class words become the title lead across every city', () => {
  assert.equal(whatFor('New Building'), 'New building');
  assert.equal(whatFor('Addition and Remodel'), 'Addition');
  assert.equal(whatFor('Foundation Only/Excavation'), 'Foundation permit');
  assert.equal(whatFor('Shell'), 'Shell building');
  assert.equal(whatFor('Alt'), 'Alteration');
  assert.equal(whatFor('Renovations/Remodels'), 'Alteration');
  assert.equal(whatFor('Other Commercial'), 'Building work');
  assert.equal(unitsFromText('new development of 305-units multi-family'), 305);
  assert.equal(unitsFromText('BLDG 1: New 4-story, 281 units'), 281);
  assert.equal(unitsFromText('1 unit shell warehouse'), null);
  assert.equal(unitsFromText(''), null);
  assert.equal(shortText('a  b', 10), 'a b');
  assert.match(shortText('word '.repeat(50), 30), /\.\.\.$/);
});

test('money reads short', () => {
  assert.equal(money(51862516), '$52M');
  assert.equal(money(3500000), '$3.5M');
  assert.equal(money(299500), '$300K');
  assert.equal(money(0), '');
});
