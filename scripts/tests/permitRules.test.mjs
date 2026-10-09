// City permit feeds (migration 0123, Mike 10-7). Pure, no DB, no fetch.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PERMIT_PROFILES, profileForSource, permitWhere, permitQueryUrl, permitRows, permitToSignal, unitsFrom, unitsFromText, whatFor, shortText, cleanCompany, titleCaseAddress, money, houstonWindows, houstonReportForm, houstonRows, csvCells } from '../../src/lib/market-intel/permitRules.js';

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

test('Houston: the report form, 90-day windows and the CSV export rows', () => {
  const H = PERMIT_PROFILES.HOUSTON;
  assert.equal(H.api, 'houston');
  const form = houstonReportForm(Date.UTC(2026, 0, 1), Date.UTC(2026, 2, 31));
  assert.match(form, /IBIF_ex=online_per_se\.fex/);
  assert.match(form, /BDT=20260101&EDT=20260331/);
  assert.match(form, /SELTD=MF&PTYPE=13/);
  const w = houstonWindows(Date.UTC(2026, 0, 1), Date.UTC(2026, 6, 1), 90);
  assert.equal(w.length, 3);
  assert.equal(w[2].end.getTime(), Date.UTC(2026, 6, 1));
  assert.equal(csvCells('"24004085","Building Pmt    ","*HARRIS, LLC","a ""b"" c",  14000000,"13"').join('|'), '24004085|Building Pmt|*HARRIS, LLC|a "b" c|14000000|13');
  const csv = [
    '"25065309","Building Pmt    ","*JLB CENTER STREET L.P.                     ","3028 CENTER ST BLD1B 77007         ","78,855 SF NEW APT BLD (65 UNITS) (M/8) 1-5-3-R2-A-SPK/FA \'21 IBC  ",  10724280,"13"',
    '"25065310","Building Pmt    ","*JLB CENTER STREET L.P.                     ","3028 CENTER ST BLD1A 77007         ","119,873 SF NEW APT BLD (104UNITS)(2/8) 1-5-3-R2/A3-A-SPK/FA \'21IBC",  16302728,"13"',
    '"14051649","TEMPORARY C/O   ","*REGALIA AT THE PARK HOLDINGS, LLC          ","10 N CRAWFORD ST 77002             ","NEW APARTMENT BUILDING (MASTER 1 OF 3)1-5-3-R2-B  100% SPR        ",         0,"CT"',
    '"24055972","Building Pmt    ","*2811 KIRBY                                 ","2811 KIRBY DR 77098                ","(M/46) NEW SHELL/CORE FOR APRTMNTS 1-38-1-SH-A \'15 IBC SPK13      ",   9999999,"13"',
    '',
  ].join('\r\n');
  const rows = houstonRows(csv, { issuedAt: new Date(Date.UTC(2026, 2, 31)) });
  assert.equal(rows.length, 4);
  assert.equal(rows[0].OWNER_OCCUPANT, '*JLB CENTER STREET L.P.');
  const kept = rows.map(r => permitToSignal(H, r)).filter(Boolean);
  assert.deepEqual(kept.map(s => s.permitNumber), ['25065309', '25065310']);
  assert.equal(kept[0].title, 'New building, 65 units: 3028 Center St Bld1b');
  assert.equal(kept[1].unitCount, 104);
  assert.equal(kept[0].address, '3028 Center St Bld1b');
  assert.equal(kept[0].neighborhood, 'ZIP 77007');
  assert.equal(kept[0].contractorName, '');
  assert.deepEqual(kept[0].extracted.companies, [{ name: 'Jlb Center Street L.P.', role: 'OWNER' }]);
  assert.deepEqual(kept[0].extracted.developerNames, ['Jlb Center Street L.P.']);
  assert.equal(kept[0].publishedAt.toISOString().slice(0, 10), '2026-03-31');
  assert.match(kept[0].summary, /Owner Jlb Center Street L\.P\./);
  assert.equal(profileForSource({ feedUrl: 'https://cohtora.houstontx.gov/ibi_apps/WFServlet', market: 'HOUSTON' }).key, 'HOUSTON');
});

test('Salt Lake City: the Accela form, the result rows, the next page and the permit page', async () => {
  const { accelaDate, accelaState, accelaSearchForm, accelaNextTarget, accelaNextForm, accelaRows, accelaTotal, accelaWorthDetail, accelaDetail } = await import('../../src/lib/market-intel/permitRules.js');
  const { accelaWindows } = await import('../../src/lib/market-intel/accelaFeed.js');
  const S = PERMIT_PROFILES.SALT_LAKE;
  assert.equal(S.api, 'accela');
  assert.equal(profileForSource({ feedUrl: S.layerUrl, market: 'SALT_LAKE' }).key, 'SALT_LAKE');

  assert.equal(accelaDate(Date.UTC(2026, 9, 8)), '10/08/2026');
  const page = '<input type="hidden" id="__VIEWSTATE" value="VS1" /><input type="hidden" id="__VIEWSTATEGENERATOR" value="A9A677DE" /><input type="hidden" id="__VIEWSTATEENCRYPTED" value="" />';
  const state = accelaState(page);
  assert.deepEqual(state, { __VIEWSTATE: 'VS1', __VIEWSTATEGENERATOR: 'A9A677DE', __VIEWSTATEENCRYPTED: '' });
  const form = new URLSearchParams(accelaSearchForm(S, Date.UTC(2026, 8, 1), Date.UTC(2026, 8, 15), state));
  assert.equal(form.get('ctl00$PlaceHolderMain$generalSearchForm$txtGSStartDate'), '09/01/2026');
  assert.equal(form.get('ctl00$PlaceHolderMain$generalSearchForm$ddlGSPermitType'), 'Building/Permit/Commercial/NA');
  assert.equal(form.get('ctl00$PlaceHolderMain$btnNewSearch'), 'Search');
  assert.equal(form.get('__VIEWSTATE'), 'VS1');

  const row = (no, desc, status, project = 'Tower A') => `<span id="lblUpdatedTime" CSS="x">10/08/2026</span><a href="/SLCREF/Cap/CapDetail.aspx?Module=Building&amp;capID1=26HIS&amp;capID2=00000&amp;capID3=${no}">x</a>`
    + `<span id="lblPermitNumber1">BLD2026-${no}</span><span id="lblType">Commercial Building Permit</span><span id="lblDescription">${desc}</span>`
    + `<span id="lblProjectName">${project}</span><span id="lblAddress">177 E 900 S, Salt Lake City UT 84111-4229</span><span id="lblStatus">${status}</span>`;
  const list = `Showing 1-10 of 100+ ${row('08316', 'New 6 story 212 unit apartment building', 'In For Review')}${row('08294', 'Suite remodel &amp; paint', 'Issued', '')}`
    + `<a href="javascript:__doPostBack(&#39;ctl00$PlaceHolderMain$dgvPermitList$gdvPermitList$ctl13$ctl14&#39;,&#39;&#39;)">Next</a>`;
  const rows = accelaRows(list);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].permitNumber, 'BLD2026-08316');
  assert.equal(rows[0].url, '/SLCREF/Cap/CapDetail.aspx?Module=Building&capID1=26HIS&capID2=00000&capID3=08316');
  assert.equal(rows[1].description, 'Suite remodel & paint');
  assert.equal(accelaTotal(list), 101);
  assert.equal(accelaNextTarget(list), 'ctl00$PlaceHolderMain$dgvPermitList$gdvPermitList$ctl13$ctl14');
  assert.equal(accelaNextTarget('<p>no more</p>'), null);
  const next = new URLSearchParams(accelaNextForm(S, Date.UTC(2026, 8, 1), Date.UTC(2026, 8, 15), state, 'ctl00$x'));
  assert.equal(next.get('__EVENTTARGET'), 'ctl00$x');
  assert.equal(next.get('ctl00$PlaceHolderMain$btnNewSearch'), null);
  assert.equal(accelaWorthDetail(rows[0]), true);
  assert.equal(accelaWorthDetail(rows[1]), false);
  // only rows that read like a whole building are worth opening (each page is a second)
  const worth = (projectName, description, status = 'In For Review') => accelaWorthDetail({ projectName, description, status });
  assert.equal(worth('Phase II - The Cooperative', '128 unit affordable housing project'), true);
  assert.equal(worth('South Temple Apartments', 'Lobby refresh'), true);
  assert.equal(worth('', 'New 4 story mixed-use building, 40,015 sf'), true);
  assert.equal(worth('LifeStance Health', 'THIS WORK CONSISTS OF THE INTERIOR ALTERATIONS FOR A NEW TENANT'), false);
  assert.equal(worth("Trader Joe's", 'New 2800 SQ.FT expansion space, new bathroom, new break room'), false);
  assert.equal(worth('Swallow 327 #2', 'Fire remediation - just 1 unit'), false);
  assert.equal(worth('Provenza Wall Sign', 'New wall sign', 'Void'), false);
  assert.equal(worth('', 'Construct new 2 story office building shell'), true);

  const detail = 'Job Value<span><span><span>($)</span></span></span>:</h2></span><span class="ACA_SmLabel">$71,000,000.00</span></div>'
    + "Use Type (Permit): </span> </div> <div class='c'> <span class='s'>New Construction</span> </div>"
    + 'Square footage of work area: </span></div><div><span>184,500</span></div>'
    + 'Record Status:</span>&nbsp;<span id="ctl00_PlaceHolderMain_lblRecordStatus">Issued</span></h1>';
  assert.deepEqual(accelaDetail(detail), { jobValue: 71000000, useType: 'New Construction', sqft: 184500, status: 'Issued', proposedUnits: null, proposedUse: '', grossSf: null });
  assert.equal(accelaDetail('<p>nothing</p>').jobValue, null);

  // the row plus its page becomes a signal; the city name is cut from the address
  const sig = permitToSignal(S, { ...rows[0], ...accelaDetail(detail), url: 'https://aca-prod.accela.com' + rows[0].url });
  assert.ok(sig);
  assert.equal(sig.valuation, 71000000);
  assert.equal(sig.unitCount, 212);
  assert.equal(sig.permitNumber, 'BLD2026-08316');
  assert.match(sig.title, /177 E 900 S/);
  assert.doesNotMatch(sig.title, /Salt Lake City UT/);
  assert.equal(sig.extracted.metro, 'Salt Lake City, UT');
  assert.equal(permitToSignal(S, { ...rows[1], jobValue: 71000 }), null);
  assert.equal(permitToSignal(S, { ...rows[0], jobValue: 71000000, status: 'Withdrawn' }), null);

  const w = accelaWindows(Date.UTC(2026, 0, 1), Date.UTC(2026, 1, 5), 14);
  assert.equal(w.length, 3);
  assert.equal(w[2].end.toISOString(), '2026-02-05T00:00:00.000Z');
});

// ── Concept plans (Mike 10-8): planning cases kept at 25+ units, saved as CONCEPT ──

test('Austin site plan cases: 25+ units kept, under 25 dropped, multifamily with no count kept, dead cases skipped', async () => {
  const { denverProjectName, CONCEPT_MIN_UNITS } = await import('../../src/lib/market-intel/permitRules.js');
  const A = PERMIT_PROFILES.AUSTIN_SITE_PLAN;
  assert.equal(A.kind, 'CONCEPT');
  assert.equal(CONCEPT_MIN_UNITS, 25);
  assert.equal(profileForSource({ feedUrl: A.layerUrl, market: 'AUSTIN' }).key, 'AUSTIN_SITE_PLAN');
  // no $10M floor on a planning case, only the class list and the date
  const where = permitWhere(A, Date.UTC(2026, 0, 1));
  assert.match(where, /sub_type in \('Site Plan Administrative'/);
  assert.match(where, /application_start_date >= '2026-01-01'/);
  assert.doesNotMatch(where, /10000000/);

  const base = {
    permit_number: 'SP-2026-0123C', case_name: 'Lamar Union Apartments', sub_type: 'Site Plan Administrative', status: 'In Review',
    description_of_work: 'New 5 story multifamily building with 312 units and structured parking', proposed_land_use: 'Multifamily',
    link: 'https://abc.austintexas.gov/web/permit/public-search-other?t_detail=1&t_selected_folderrsn=1', application_start_date: '2026-09-15T00:00:00.000',
    street_number: '1100', street_direction: 'S', street_name: 'LAMAR', street_type: 'BLVD', council_district: '5',
    proposed_no_of_units: '312', applicant_organization_name: 'KIMLEY-HORN AND ASSOCIATES INC', owner_organization_name: 'GREYSTAR DEVELOPMENT LLC',
  };
  const sig = permitToSignal(A, base);
  assert.ok(sig);
  assert.equal(sig.kind, 'CONCEPT');
  assert.equal(sig.signalType, 'CONCEPT');
  assert.equal(sig.unitCount, 312);
  assert.equal(sig.valuation, null);
  assert.equal(sig.permitNumber, 'SP-2026-0123C');
  assert.equal(sig.address, '1100 S Lamar Blvd');
  assert.equal(sig.title, 'Concept plan, 312 units: 1100 S Lamar Blvd');
  assert.match(sig.summary, /Owner Greystar Development LLC/);
  assert.match(sig.summary, /Applicant Kimley-Horn And Associates INC/);
  assert.match(sig.summary, /Council District 5/);
  assert.match(sig.summary, /Case SP-2026-0123C\.$/);
  assert.equal(sig.url, base.link);
  assert.deepEqual(sig.extracted.companies, [{ name: 'Greystar Development LLC', role: 'OWNER' }, { name: 'Kimley-Horn And Associates INC', role: 'OTHER' }]);
  assert.deepEqual(sig.extracted.developerNames, ['Greystar Development LLC']);
  assert.equal(sig.extracted.metro, 'Austin, TX');

  // under the floor
  assert.equal(permitToSignal(A, { ...base, proposed_no_of_units: '12', description_of_work: 'New 12 unit townhome project' }), null);
  // units in the text when the column is empty
  assert.equal(permitToSignal(A, { ...base, proposed_no_of_units: '' }).unitCount, 312);
  // multifamily with no count stated is kept, an office with no count is not
  const unstated = permitToSignal(A, { ...base, proposed_no_of_units: '', description_of_work: 'New multifamily development with podium parking' });
  assert.equal(unstated.unitCount, null);
  assert.equal(unstated.title, 'Concept plan, units not stated: 1100 S Lamar Blvd');
  assert.equal(permitToSignal(A, { ...base, proposed_no_of_units: '', description_of_work: 'New office building', proposed_land_use: 'Office', case_name: 'Lamar Office' }), null);
  // dead or city cases
  assert.equal(permitToSignal(A, { ...base, status: 'Expired' }), null);
  assert.equal(permitToSignal(A, { ...base, status: 'Closed' }), null);
  assert.equal(permitToSignal(A, { ...base, case_name: 'City-Initiated Rezoning' }), null);
  // the link as an object still works
  assert.equal(permitToSignal(A, { ...base, link: { url: 'https://x' } }).url, 'https://x');

  // zoning: units are rarely stated, so an unstated multifamily case is dropped
  const Z = PERMIT_PROFILES.AUSTIN_ZONING;
  const z = { case_number: 'C14-2026-0042', case_name: 'Ross Road Rezoning', sub_type: 'Zoning/Rezoning', detailed_status: 'Active',
    description_of_work: 'Rezone from SF-3 to MF-6 for 240 unit multifamily', site_address: '5807  ROSS   , AUSTIN,TX 78617', application_start_date: '2026-09-01T00:00:00.000', link: 'https://z' };
  const zs = permitToSignal(Z, z);
  assert.equal(zs.permitNumber, 'C14-2026-0042');
  assert.equal(zs.unitCount, 240);
  assert.equal(zs.address, '5807 Ross');
  assert.equal(zs.permitClass, 'Zoning/Rezoning');
  assert.equal(permitToSignal(Z, { ...z, description_of_work: 'Rezone from SF-3 to MF-6 for multifamily' }), null);
  assert.doesNotMatch(permitWhere(Z, Date.UTC(2026, 0, 1)), /10000000/);

  assert.equal(denverProjectName('2026PM0000333 - 3550 W. 13th Ave - Westridge Mulroy Bldg'), 'Westridge Mulroy Bldg');
  assert.equal(denverProjectName('2026PM0000333 - 3550 W. 13th Ave'), '3550 W. 13th Ave');
  assert.equal(denverProjectName('Plain name'), 'Plain name');
});

test('Denver concept plans: the record page gives the units, use and floor area', async () => {
  const { accelaRows, accelaDetail } = await import('../../src/lib/market-intel/permitRules.js');
  const D = PERMIT_PROFILES.DENVER_CONCEPT;
  assert.equal(D.api, 'accela');
  assert.equal(D.openAll, true);
  assert.equal(profileForSource({ feedUrl: D.layerUrl, market: 'DENVER' }).key, 'DENVER_CONCEPT');
  assert.equal(profileForSource({ feedUrl: PERMIT_PROFILES.DENVER.layerUrl, market: 'DENVER' }).key, 'DENVER');

  const list = '<span id="x_lblUpdatedTime" CSS="x">09/30/2026</span><a id="x_hlPermitNumber" href="/DENVER/Cap/CapDetail.aspx?Module=Development&amp;capID1=26CON&amp;capID2=00000&amp;capID3=00169">x</a>'
    + '<span id="x_lblPermitNumber1">2026-CONCEPT-0000169</span><span id="x_lblType">Concept Plan</span>'
    + '<span id="x_lblProjectName">2026PM0000333 - 3550 W. 13th Ave - Westridge Mulroy Bldg</span><span id="x_lblAddress">3550 W 13th AVE, Denver CO 80204-1500</span><span id="x_lblStatus">Review in Progress</span>';
  const rows = accelaRows(list);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].permitNumber, '2026-CONCEPT-0000169');
  assert.equal(rows[0].permitType, 'Concept Plan');
  assert.equal(rows[0].description, '');
  assert.equal(rows[0].address, '3550 W 13th AVE, Denver CO 80204-1500');

  const detail = 'Number of Proposed Dwelling Units:</span></div><div><span>186</span></div>'
    + 'Proposed Use 1:</span></div><div><span>Multi-Unit Dwelling</span></div>'
    + 'Gross Floor Area (sq. ft):</span></div><div><span>212,400</span></div>'
    + 'Record Status:</span>&nbsp;<span id="lblRecordStatus">Review in Progress</span>';
  const d = accelaDetail(detail);
  assert.equal(d.proposedUnits, 186);
  assert.equal(d.proposedUse, 'Multi-Unit Dwelling');
  assert.equal(d.grossSf, 212400);
  assert.equal(accelaDetail('<p>nothing</p>').proposedUnits, null);

  const sig = permitToSignal(D, { ...rows[0], ...d, url: 'https://aca-prod.accela.com' + rows[0].url });
  assert.ok(sig);
  assert.equal(sig.kind, 'CONCEPT');
  assert.equal(sig.unitCount, 186);
  assert.equal(sig.permitClass, 'Concept Plan');
  assert.equal(sig.address, '3550 W 13th Ave');
  assert.equal(sig.title, 'Concept plan, 186 units: 3550 W 13th Ave');
  assert.match(sig.summary, /^Westridge Mulroy Bldg: Multi-Unit Dwelling: 212,400 sq ft, in status Review in Progress, Case 2026-CONCEPT-0000169\.$/);
  assert.equal(sig.extracted.metro, 'Denver, CO');
  // a closed and approved plan is still a lead; a withdrawn one is not; 1 unit means a house
  assert.ok(permitToSignal(D, { ...rows[0], ...d, status: 'Closed - Approved' }));
  assert.equal(permitToSignal(D, { ...rows[0], ...d, status: 'Withdrawn' }), null);
  assert.equal(permitToSignal(D, { ...rows[0], ...d, proposedUnits: 1 }), null);
  assert.equal(permitToSignal(D, { ...rows[0], ...d, proposedUnits: 24 }), null);
  assert.equal(permitToSignal(D, { ...rows[0], ...d, proposedUnits: null, proposedUse: 'Office' }), null);
  assert.equal(permitToSignal(D, { ...rows[0], ...d, proposedUnits: null }).unitCount, null);
});

test('Salt Lake City planning cases: list-only rows with the Planning module labels', async () => {
  const { accelaRows, accelaSearchForm, accelaState } = await import('../../src/lib/market-intel/permitRules.js');
  const P = PERMIT_PROFILES.SALT_LAKE_PLANNING;
  assert.equal(P.noDetail, true);
  assert.equal(profileForSource({ feedUrl: P.layerUrl, market: 'SALT_LAKE' }).key, 'SALT_LAKE_PLANNING');
  assert.equal(profileForSource({ feedUrl: PERMIT_PROFILES.SALT_LAKE.layerUrl, market: 'SALT_LAKE' }).key, 'SALT_LAKE');
  const form = new URLSearchParams(accelaSearchForm(P, Date.UTC(2026, 8, 1), Date.UTC(2026, 8, 15), accelaState('')));
  assert.equal(form.get('ctl00$PlaceHolderMain$generalSearchForm$ddlGSPermitType'), '');

  const row = (no, type, project, note, status = 'Under Review') => `<span id="r_lblUpdatedTime">09/30/2026</span><a id="r_hlPermitNumber" href="/SLCREF/Cap/CapDetail.aspx?Module=Planning&amp;capID3=${no}">x</a>`
    + `<span id="r_lblPermitNumber1">PLNPCM2026-${no}</span><span id="r_lblType">${type}</span><span id="r_lblProjectName">${project}</span>`
    + `<span id="r_lblShortNote">${note}</span><span id="r_lblPermitAddress">600 S STATE ST, Salt Lake City UT 84111</span><span id="r_lblStatus">${status}</span>`;
  const list = row('00411', 'Design Review', 'State Street Apartments', 'New 7 story 240 unit multifamily building')
    + row('00412', 'Sign Permit', 'Wall sign', 'New wall sign')
    + row('00413', 'Planned Development', 'Liberty Wells PD', 'Mixed-use development, residential over retail')
    + row('00414', 'Conditional Use', 'The Grove', 'New 300 unit apartment project', 'Withdrawn');
  const rows = accelaRows(list);
  assert.equal(rows.length, 4);
  assert.equal(rows[0].description, 'New 7 story 240 unit multifamily building');
  assert.equal(rows[0].address, '600 S STATE ST, Salt Lake City UT 84111');
  assert.equal(rows[0].url, '/SLCREF/Cap/CapDetail.aspx?Module=Planning&capID3=00411');

  const sigs = rows.map(r => permitToSignal(P, r));
  assert.equal(sigs[0].kind, 'CONCEPT');
  assert.equal(sigs[0].unitCount, 240);
  assert.equal(sigs[0].permitClass, 'Design Review');
  assert.equal(sigs[0].address, '600 S State St');
  assert.match(sigs[0].summary, /^State Street Apartments: New 7 story 240 unit multifamily building/);
  assert.equal(sigs[1], null);                  // not a planning type we keep
  assert.equal(sigs[2].unitCount, null);        // mixed-use with no count, kept
  assert.equal(sigs[3], null);                  // withdrawn
});
