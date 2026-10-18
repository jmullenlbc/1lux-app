// City gap feeds (Mike 10-17): Miami-Dade zoning, Tempe developments, Denver
// site plans, Salt Lake City concepts through permits, Dallas (state TABS
// filings, zoning filings, city housing deals). Pure, no DB, no fetch.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PERMIT_PROFILES as P, profileForSource, permitQueryUrl, permitQueryBody, permitRows, permitToSignal, permitWhere,
  SALT_LAKE_PLANNING_RE, tabsAddress, tabsDetail, tabsUnits, dallasHousingMatter, DALLAS_ZONE_TO_RE,
  tabsHousing, isHousing, fortWorthJobName, fortWorthJobs, arlingtonJobs,
} from '../../src/lib/market-intel/permitRules.js';
import { SOURCES as SOURCE_CATALOG } from '../../src/lib/market-intel/sourceCatalog.js';

test('every new feed has its own feed address and a catalog row', () => {
  const keys = ['DENVER_SDP', 'SALT_LAKE_RES', 'MIAMI_DADE_ZONING', 'TEMPE_DEVELOPMENTS', 'TABS_DALLAS', 'TABS_COLLIN', 'TABS_TARRANT', 'DALLAS_ZONING', 'DALLAS_HOUSING',
    'TABS_DENTON', 'TABS_TRAVIS', 'TABS_WILLIAMSON', 'TABS_HAYS', 'TABS_HARRIS', 'TABS_FORT_BEND', 'TABS_MONTGOMERY', 'TABS_BEXAR', 'TABS_BRAZORIA', 'TABS_GALVESTON', 'TABS_COMAL', 'TABS_ROCKWALL', 'TABS_KAUFMAN', 'TABS_ELLIS', 'TABS_GUADALUPE', 'FORT_WORTH', 'ARLINGTON'];
  const urls = Object.values(P).map(p => p.layerUrl);
  for (const k of keys) {
    assert.equal(urls.filter(u => u === P[k].layerUrl).length, 1, `${k} shares a feed address`);
    assert.equal(profileForSource({ feedUrl: P[k].layerUrl, market: 'X' }).key, k);
    assert.ok(SOURCE_CATALOG.some(s => s.feedUrl === P[k].layerUrl), `${k} has no catalog row`);
  }
  // The originals still find themselves.
  assert.equal(profileForSource({ feedUrl: P.DENVER_CONCEPT.layerUrl }).key, 'DENVER_CONCEPT');
  assert.equal(profileForSource({ feedUrl: P.SALT_LAKE.layerUrl }).key, 'SALT_LAKE');
  assert.equal(profileForSource({ feedUrl: P.DALLAS_COUNCIL.layerUrl }).key, 'DALLAS_COUNCIL');
});

test('Salt Lake City planning keeps concepts through plats, drops the noise (Mike 10-17)', () => {
  for (const t of ['Zoning Amendment', 'Final Plat', 'Design Review', 'Planned Development', 'Site Development', 'Conditional Use', 'Street Closure Plat'])
    assert.ok(SALT_LAKE_PLANNING_RE.test(t), t);
  for (const t of ['Sign Permit', 'Tree Removal', 'Minor Alteration', 'Zoning Verification Letter', 'Administrative Interpretation', 'Lot Line Adjustment', 'Appeal', 'Fence', 'Demolition'])
    assert.ok(!SALT_LAKE_PLANNING_RE.test(t), t);
  assert.equal(P.SALT_LAKE_RES.permitType, 'Building/Permit/Residential/NA');
  assert.equal(P.SALT_LAKE_RES.keepClasses, undefined);
});

test('Denver site development plans read like concept plans, titled "Site plan"', () => {
  assert.equal(P.DENVER_SDP.kind, 'CONCEPT');
  assert.equal(P.DENVER_SDP.api, 'accela');
  assert.equal(P.DENVER_SDP.permitType, 'Development/Project/Site Development Plan Review/NA');
  assert.equal(P.DENVER_SDP.titleLead, 'Site plan');
});

test('Miami-Dade zoning hearings: multifamily only, by application year and case type', () => {
  const Z = P.MIAMI_DADE_ZONING;
  const where = permitWhere(Z, new Date(2025, 5, 1));
  assert.match(where, /^APPL_YEAR IN \('2025','2026'(,'\d{4}')*\) AND CASE_TYPE IN \('ZM Pre-App'/);
  const row = { PROC_NUM: 'Z2026000123', CASE_TYPE: 'ZM Admin Site Plan Review', LOC_ADDR: '12000 SW 152 ST', APPL_YEAR: '2026', APPL_MONTH: '8', APPL_DESC: 'Site plan for a 312 unit multifamily development', APPL_LINK: 'https://example.miamidade.gov/a', BOARD: 'CZAB 12' };
  const s = permitToSignal(Z, row);
  assert.equal(s.kind, 'CONCEPT');
  assert.equal(s.unitCount, 312);
  assert.equal(s.permitClass, 'Zoning: Admin Site Plan Review');
  assert.match(s.title, /^Concept plan, 312 units: 12000 Sw 152 St/i);
  assert.equal(permitToSignal(Z, { ...row, APPL_DESC: 'Duplex on a single lot, multifamily zoning' }), null);
  assert.equal(permitToSignal(Z, { ...row, APPL_DESC: 'Office warehouse' }), null);
  assert.ok(permitToSignal(Z, { ...row, APPL_DESC: 'Workforce housing on a vacant parcel' }));
});

test('Tempe developments: stage in neighborhood, units and SF, finished projects left out', () => {
  const T = P.TEMPE_DEVELOPMENTS;
  assert.match(permitWhere(T, new Date()), /CERTIFICATE%.*BUILDING PERMIT ISSUED%/);
  const row = { F_TRACK_G: 'PL260123', PROJECT: 'Rio Salado Apartments', SITE_ADDRESS: '1200 E RIO SALADO PKWY', PROPOSED_USE___DESCRIPTION: 'Multi-family residential', PERMIT_TYPE: 'Development Plan Review', BLDG_SF: '412,500', F__OF_UNITS_KEYS: '388', STORIES: 7, CATEGORY: 'IN REVIEW FOR PLANNING ENTITLEMENTS', CreationDate: Date.UTC(2026, 6, 1) };
  const s = permitToSignal(T, row);
  assert.equal(s.unitCount, 388);
  assert.equal(s.neighborhood, 'stage in review for planning entitlements');
  assert.match(s.title, /^Development case, 388 units: 1200 E Rio Salado Pkwy, Tempe/);
  assert.equal(permitToSignal(T, { ...row, F__OF_UNITS_KEYS: '12' }), null);
});

test('TABS: the search posts sorted by cost, one county per feed', () => {
  const D = P.TABS_DALLAS;
  assert.equal(permitQueryUrl(D, new Date(2026, 5, 19)), 'https://www.tdlr.texas.gov/TABS/Search/SearchProjects?LocationCounty=2057');
  const form = new URLSearchParams(permitQueryBody(D, new Date(2026, 5, 19), { now: new Date(2026, 9, 17) }));
  assert.equal(form.get('RegistrationDateBegin'), '06/19/2026');
  assert.equal(form.get('RegistrationDateEnd'), '10/17/2026');
  assert.equal(form.get('columns[9][data]'), 'EstimatedCost');
  assert.equal(form.get('order[0][dir]'), 'desc');
  assert.equal(permitQueryBody(P.DENVER, new Date()), null);
  assert.deepEqual(permitRows(D, { data: [{ ProjectNumber: 'T1' }] }), [{ ProjectNumber: 'T1' }]);
  assert.throws(() => permitRows(D, { error: 'x' }), /TABS answered without a data list/);
  assert.equal(D.worthDetail({ EstimatedCost: 9999999 }), false);
  assert.equal(D.worthDetail({ EstimatedCost: 67800000 }), true);
});

test('TABS addresses, units and the project page', () => {
  assert.equal(tabsAddress('1545 Mockingbird Ln Dallas, TX 75235'), '1545 Mockingbird Ln, Dallas');
  assert.equal(tabsAddress('Ponte Ave. & Bella Lane, Addison, Tx, 75001'), 'Ponte Ave. & Bella Lane, Addison');
  assert.equal(tabsUnits('New construction of 404 wood-framed apartments with a garage'), 404);
  assert.equal(tabsUnits('New 359 unit multifamily community'), 359);
  assert.equal(tabsUnits('Tenant finish out, 3 floors'), null);

  const html = `<div>Project Name: Mockingbird Oak Park</div><div>Location Address: 1545 Mockingbird Ln Dallas, TX 75235</div>
    <div>Scope of Work: New 359 unit multifamily community</div><div>Square Footage: 412,000</div><div>Current Status: Project Registered</div>
    <div>OWNER</div><div>Owner Name: Mockingbird Owner LP</div><div>Contact Name: Carl B. Anderson, IV, President, Larkspur Real Estate Partners LP</div>
    <div>TENANT</div><div>Tenant Name: </div><div>DESIGN FIRM</div><div>Design Firm Name: Corgan</div><div>Design Firm Address: Dallas</div>`;
  const d = tabsDetail(html);
  assert.equal(d.ownerName, 'Mockingbird Owner LP');
  assert.equal(d.developerName, 'Larkspur Real Estate Partners LP');
  assert.equal(d.designFirm, 'Corgan');
  assert.equal(d.squareFeet, 412000);
  assert.equal(d.status, 'Registered');

  // "Owner % company": the company behind the owner entity is the developer.
  const careOf = tabsDetail(html.replace('Mockingbird Owner LP', 'Vpdev 2 LLC % Dco Realty INC.'));
  assert.equal(careOf.ownerName, 'Vpdev 2 LLC');
  assert.equal(careOf.developerName, 'Dco Realty INC.');

  const row = { ProjectNumber: 'TABS2027002235', ProjectName: 'Mockingbird Oak Park', ProjectCreatedOn: '2026-09-02T10:00:00', TypeOfWork: 9001, EstimatedCost: 67800000 };
  const s = permitToSignal(P.TABS_DALLAS, { ...row, ...d });
  assert.equal(s.title, 'New building (state filing), 359 units: 1545 Mockingbird Ln, Dallas');
  assert.match(s.summary, /Owner Mockingbird Owner LP, Developer Larkspur Real Estate Partners LP, Design firm Corgan/);
  assert.deepEqual(s.extracted.companies.map(c => c.role).sort(), ['ARCHITECT', 'DEVELOPER', 'OWNER']);
  assert.equal(s.url, 'https://www.tdlr.texas.gov/TABS/Search/Project/TABS2027002235');
  assert.equal(permitToSignal(P.TABS_DALLAS, { ...row, ...d, EstimatedCost: 9000000 }), null);
  assert.equal(permitToSignal(P.TABS_DALLAS, { ...row, ...d, status: 'Cancelled' }), null);
});

test('Dallas zoning filings: kept when the new zone allows apartments', () => {
  assert.ok(DALLAS_ZONE_TO_RE.test('R-7.5(A) to MF-2(A)'));
  assert.ok(DALLAS_ZONE_TO_RE.test('GZC from CS to MU-1'));
  assert.ok(DALLAS_ZONE_TO_RE.test('R-7.5(A) to TH-1'));
  assert.ok(!DALLAS_ZONE_TO_RE.test('MF-2(A) to CR'));
  const Z = P.DALLAS_ZONING;
  const s = permitToSignal(Z, { CASE_NUMBER: 'Z-26-000185', ZONE_CHANGE: 'GZC - R-7.5(A) to MF-2(A)', DATE_VERIFIED: Date.UTC(2026, 8, 20) });
  assert.equal(s.title, 'Rezoning filed, units not stated: case Z-26-000185, Dallas');
  assert.match(s.summary, /^Zone change R-7\.5\(A\) to MF-2\(A\)/);
  assert.equal(permitToSignal(Z, { CASE_NUMBER: 'Z-26-000190', ZONE_CHANGE: 'R-7.5(A) to CR', DATE_VERIFIED: Date.UTC(2026, 8, 20) }), null);
});

test('Dallas city housing deals: project, units, address and developer from the council title', () => {
  const H = P.DALLAS_HOUSING;
  const url = decodeURIComponent(permitQueryUrl(H, new Date('2026-01-01')));
  assert.match(url, /^https:\/\/webapi\.legistar\.com\/v1\/cityofdallas\/matters\?housing=1&\$top=1000/);
  assert.match(url, /substringof\('Public Facility Corporation',MatterTitle\) or substringof\('Housing Finance Corporation',MatterTitle\)/);
  assert.match(url, /MatterTypeName ne 'BRIEFING ITEMS'/);
  assert.match(decodeURIComponent(permitQueryUrl(P.DALLAS_COUNCIL, new Date('2026-01-01'))), /\/matters\?\$top=1000.*substringof\('zon',MatterTitle\)/);

  const m = (MatterTitle, extra = {}) => ({ MatterId: 9, MatterFile: '26-2707A', MatterTypeName: 'CONSENT AGENDA', MatterStatusName: 'Approved', MatterIntroDate: '2026-08-13T00:00:00', MatterTitle, ...extra });
  const pfc = dallasHousingMatter(m('Authorize the Dallas Public Facility Corporation to (1) acquire, develop, and own DNT Housing, a 350-unit workforce housing community located at 18438 and 18470 Dallas Parkway, Dallas, Texas 75287 (Project); and (2) enter into a seventy-five-year lease agreement with GHN Holdings, LLC or its affiliate, for the development of the Project'));
  assert.equal(pfc.projectName, 'DNT Housing');
  assert.equal(pfc.address, '18438 and 18470 Dallas Parkway, Dallas');
  assert.equal(pfc.unitCount, 350);
  assert.equal(pfc.applicantName, 'GHN Holdings, LLC');

  const tc = dallasHousingMatter(m('A public hearing (1) to receive comments regarding an application by EC Carpenter’s Point, LLC and/or its affiliate(s) (collectively referred to as Applicant), to the Texas Department of Housing and Community Affairs (TDHCA) for 2026 4% Non-Competitive Low Income Housing Tax Credits for Carpenter’s Point, a 150-unit senior residential development for persons of low and moderate income to be located at 4645 Dolphin Rd., Dallas, Texas, 75223 (Project)'));
  assert.equal(tc.projectName, "Carpenter's Point");
  assert.equal(tc.applicantName, "EC Carpenter's Point, LLC");
  assert.equal(tc.unitCount, 150);

  const aff = dallasHousingMatter(m('Authorize the Dallas Public Facility Corporation to (1) acquire, develop, and own the University Hills, a mixed-income, multifamily development to be located at 1910 East Wheatland Road, Dallas Texas 75241 (Project); and (2) enter into a 75-year lease agreement with UH Multifamily Development 1, LLC, an affiliate of Hoque Global Partnership, LLC and Anchor Capital Partners, LLC, for the development of the Project'));
  assert.equal(aff.projectName, 'University Hills');
  assert.equal(aff.applicantName, 'Hoque Global Partnership, LLC');

  const s = permitToSignal(H, m('Authorize the Dallas Public Facility Corporation to (1) acquire, develop, and own DNT Housing, a 350-unit workforce housing community located at 18438 and 18470 Dallas Parkway, Dallas, Texas 75287 (Project); and (2) enter into a seventy-five-year lease agreement with GHN Holdings, LLC or its affiliate, for the development of the Project'));
  assert.equal(s.title, 'City housing deal, 350 units: 18438 and 18470 Dallas Parkway, Dallas');
  assert.deepEqual(s.extracted.companies, [{ name: 'GHN Holdings, LLC', role: 'DEVELOPER' }]);
  assert.deepEqual(s.extracted.developerNames, ['GHN Holdings, LLC']);
  assert.equal(s.url, 'https://cityofdallas.legistar.com/LegislationDetail.aspx?ID=9');

  // A staff contract that only mentions the agency is not a project.
  assert.equal(permitToSignal(H, m('Authorize a ten-month subrecipient agreement with Transition Resource Action Center for housing services - Financing: Texas Department of Housing and Community Affairs')), null);
});

test('TABS keeps housing and hotels only (Mike 10-17)', () => {
  assert.equal(tabsHousing({ ProjectName: 'Kubota Tractor Warehouse', scope: 'New 400,000 sf distribution building' }), false);
  assert.ok(tabsHousing({ ProjectName: 'The Barnett', scope: 'New 4 story apartment building' }));
  assert.ok(tabsHousing({ ProjectName: 'Hampton Inn', scope: 'New hotel' }));
  assert.ok(tabsHousing({ ProjectName: 'The Quarters', scope: 'New student housing' }));
  assert.ok(tabsHousing({ ProjectName: 'Brookdale', scope: 'New senior living community' }));
// Mixed use alone is not housing (Fort Worth files a convention center under it); mixed use residential is.  assert.equal(isHousing('Mixed Use: Fort Worth Convention Center Phase 2'), false);  assert.ok(isHousing('CONSTRUCT NEW MIXED USE RESIDENTIAL/COMMERCIAL BUILDING'));  assert.equal(isHousing('Hospital renovation', { units: 0 }), false);
  assert.ok(tabsHousing({ ProjectName: 'Phase 2', scope: 'New 240 unit community' }));
});

test('Fort Worth: a job filed one permit per building is added up before the $10M floor', () => {
  const FW = P.FORT_WORTH;
  assert.equal(permitWhere(FW, new Date(2026, 5, 1)).includes('10000000'), false);
  assert.equal(fortWorthJobName('X TEAM /// Richardson Ridge Bldg 3'), 'Richardson Ridge');
  assert.equal(fortWorthJobName('Alexan Copper Ranch - Building 1 NZ26-00326'), 'Alexan Copper Ranch');
  const row = (no, name, extra) => ({ Permit_No: no, Permit_SubType: 'New', B1_SPECIAL_TEXT: name, Addr_No: '5200', Street_Name: 'RICHARDSON', Street_Suffix: 'RD', Owner_Full_Name: 'RR Partners LLC', File_Date: Date.UTC(2026, 8, 1), Current_Status: 'Issued', Status_Date: 1, JobValue: '3400000', Use_Type: 'Residential', Specific_Use: 'Apartments', Units: '228', SqFt: '40000', ...extra });
  const rows = [1, 2, 3, 4, 5, 6].map(n => row(`PB26-0${n}`, `X TEAM /// Richardson Ridge Bldg ${n}`));
  rows.push(row('PB26-01', 'X TEAM /// Richardson Ridge Bldg 1', { Street_Name: 'FOR REVIEW ONLY', Addr_No: '1', Owner_Full_Name: null, Status_Date: 0 }));
  const jobs = fortWorthJobs(rows);
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].value, 6 * 3400000);
  assert.equal(jobs[0].units, 228);
  assert.equal(jobs[0].street, '5200 RICHARDSON RD');
  const sig = permitToSignal(FW, jobs[0]);
  assert.ok(sig, 'the folded job passes the floor');
  assert.equal(sig.title.includes('Richardson Ridge') || sig.summary?.includes('Richardson Ridge'), true);

  const alexan = fortWorthJobs([
    row('PB26-11', 'Alexan Copper Ranch - Building 1', { Units: '88', JobValue: '9000000', Owner_Full_Name: 'Trammell Crow' }),
    row('PB26-12', 'Alexan Copper Ranch - Building 2', { Units: '88', JobValue: '9000000', Owner_Full_Name: 'Trammell Crow' }),
    row('PB26-13', 'Alexan Copper Ranch - Building 3', { Units: '126', JobValue: '12000000', Owner_Full_Name: 'Trammell Crow' }),
    row('PB26-10', 'Alexan Copper Ranch', { Units: '302', JobValue: '30000000', Owner_Full_Name: 'Trammell Crow', Current_Status: 'Void' }),
  ]);
  assert.equal(alexan.length, 1);
  assert.equal(alexan[0].units, 302);
  assert.equal(alexan[0].value, 30000000);

  // One small building on its own stays under the floor.
  assert.equal(permitToSignal(FW, fortWorthJobs([row('PB26-20', 'Corner Retail', { Use_Type: 'Commercial', JobValue: '2500000', Units: null })])[0]), null);
});

test('Arlington: same street in one pull, added up; housing marked', () => {
  const A = P.ARLINGTON;
  assert.equal(permitWhere(A, new Date(2026, 5, 1)).includes('10000000'), false);
  const r = (seq, name, value, use) => ({ FOLDERYEAR: 26, FOLDERSEQUENCE: seq, FOLDERTYPE: 'CP', STATUSDESC: 'Issued', InDate: Date.UTC(2026, 8, 3, 15), SUBDESC: 'Commercial', WORKDESC: 'New Construction', FOLDERNAME: name, ConstructionValuationDeclared: value, MainUse: use, Census: '' });
  const jobs = arlingtonJobs([
    r(101, '1200 S WATSON RD', 5000000, 'Apartments (3+ dwelling units)'),
    r(102, '1210 S WATSON RD', 5000000, 'Apartments (3+ dwelling units)'),
    r(103, '1200 S WATSON RD Unit GARAGE 1', 1500000, 'Carports'),
    r(200, '900 SHERRY ST', 2500000, 'Office'),
  ]);
  assert.equal(jobs.length, 2);
  const watson = jobs.find(j => /WATSON/.test(j.FOLDERNAME));
  assert.equal(watson.value, 11500000);
  assert.equal(watson.buildings, 3);
  assert.ok(watson.housing);
  assert.ok(permitToSignal(A, watson));
  assert.equal(permitToSignal(A, jobs.find(j => /SHERRY/.test(j.FOLDERNAME))), null);
});
