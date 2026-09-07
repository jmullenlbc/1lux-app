export const dynamic = 'force-dynamic';

import { notFound, redirect } from 'next/navigation';
import { getSession, isClientViewer } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { responsesToSections } from '@/lib/utils';
import { calculateBudget, formatCurrency } from '@/lib/calculations';
import { OPTION_LABELS } from '@/lib/pricing';
import { loadPricing, pricingForProject } from '@/lib/pricingLoader';
import Link from 'next/link';
import SummaryPrintButton from './SummaryPrintButton';
import SummaryBudgetBreakdown from './SummaryBudgetBreakdown';
import ContingencyWidget from './ContingencyWidget';
import SalesTaxWidget from './SalesTaxWidget';
import MissingInputsWarning from '@/components/MissingInputsWarning';
import SendBudgetButton from './SendBudgetButton';

function formatActivityTime(dateStr) {
  return new Date(dateStr).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  });
}

export default async function SummaryPage({ params }) {
  const session = await getSession();
  if (!session) redirect('/login');

  let project = null;
  let budgetHistory = [];
  try {
    project = await prisma.project.findUnique({
      where: { id: params.id },
      include: { projectData: true, responses: true, createdBy: { select: { name: true, email: true } } },
    });
    budgetHistory = await prisma.projectActivity.findMany({
      where: {
        projectId: params.id,
        type: { in: ['questionnaire', 'project_data'] },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
  } catch (err) {
    console.error('[/project/id/summary] DB query failed:', err?.message ?? err);
  }

  if (!project) notFound();
  if (isClientViewer(session.role) && project.createdById !== session.id) notFound();

  // The snapshot frozen at project creation, with later-added lines filled from
  // the master sheet; current pricing if an older project has no snapshot.
  const pricing     = pricingForProject(project.pricingSnapshot, await loadPricing());
  const sections    = responsesToSections(project.responses);
  const projectData = { ...(project.projectData || {}), buildingTypeKey: project.buildingType };
  const budget      = calculateBudget(projectData, sections, pricing);
  const pd       = projectData;

  // Sales tax is applied by the engine whenever a rate is on file, so the
  // footer has to say which it is rather than always claiming "no tax".
  const salesTaxNote = budget.salesTaxPct > 0
    ? `Includes ${Math.round(budget.salesTaxPct * 10000) / 100}% sales tax on product.`
    : 'Does not include sales tax.';

  function getLabel(category, key) {
    return OPTION_LABELS[category]?.[key] || key || '—';
  }

  const LOCAL_LABELS = {
    diskType:           { flatEdgeLit: 'Flat Edge-Lit (standard)', backlit: 'Backlit Rounded (–$0.04/SF credit)' },
    entryDisk:          { typical: 'Standard (matches rooms)', upgraded12: '12" Oversized Entry Disk (+$25/unit)', decorative: 'Decorative Surface Mount (+$30/unit)' },
    fixtureType:        { disk: 'Surface-Mount Disk', recessed: 'Recessed Downlight' },
    corridorFireRating: { surfaceMount: 'Surface Mount (no fire rating required)', fireRated: 'Fire-Rated Concealed' },
    stairwellDesign:    { code: 'Code Minimum', elevated: 'Elevated / Upgraded Design' },
    stairwellPainting:  { unpainted: 'Unpainted / Raw Walls', painted: 'Painted / Finished Walls' },
    corridorEnds:       { none: 'None', sconce: 'Sconce at Corridor Ends', downlight: 'Downlight at Corridor Ends' },
    elevatorLobby:      { no: 'No', yes: 'Yes' },
    corridorSpecial:    { no: 'No', yes: 'Yes' },
    exitSignType:       { thermoplastic: 'Thermoplastic — Code Minimum (~$22/sign)', mixed: 'Mixed — Edge-Lit FOH / Thermoplastic BOH (~$75/sign)', edgelit: 'Edge-Lit Throughout (~$127/sign)' },
    garageDesignLevel:  { medium: 'Standard — LED Linear Grid ($0.30/SF)', enhanced: 'Enhanced — Higher Uniformity ($0.45/SF)', high: 'Enhanced — Higher Uniformity ($0.45/SF)' },
    garageControls:     { none: 'None', occSensor: 'Occupancy Sensors (+$0.02/SF)', battery: 'Integrated Battery Backup (+$0.05/SF)', batteryAndSensor: 'Battery + Occupancy Sensor (+$0.06/SF)', daylighting: 'Daylight Harvesting (+$0.10/SF)' },
    livingRoomDisks:    { '1large': '(1) Large 12" Disk (standard)', '4small': '(4) Small Disks (+$34/unit)' },
    boilerRoom:         { no: 'No', yes: 'Yes (+$15/unit)' },
    closetControl:      { switch: 'Standard Switch', occSensor: 'Occupancy Sensor' },
    halfHotReceptacles: { no: 'No', yes: 'Yes' },
    controlsSystem:     { standalone: 'Standalone / Independent', bms: 'BMS Integrated', none: 'None' },
    decorativeDimming:  { no: 'No', yes: 'Yes' },
    sceneSwitching:     { bankSwitches: 'Bank Switches', dmx: 'DMX / Scene Controller', none: 'None', no: 'None' },
    zoneReduction:      { no: 'No', yes: 'Yes — Automatic Zone Reduction' },
    siteType:           { pedestrian: 'Pedestrian-Focused', vehicular: 'Vehicular / Parking-Dominated', mixed: 'Mixed Use' },
    roadwayLighting:    { no: 'No', yes: 'Yes — Roadway / Streetscape Included' },
    exteriorEmergency:  { wallpack: 'Wall-Pack Fixtures', integrated: 'Integrated Into Design' },
    exteriorPoleControl:{ photocell: 'Photocell', timer: 'Timer', bms: 'BMS / Building Controls' },
  };

  function ll(cat, key) {
    return LOCAL_LABELS[cat]?.[key] || key || '—';
  }

  const r = sections; // shorthand

  const answerRows = [
    { section: 'Residential Units', rows: [
      { q: 'Disk Type',               a: ll('diskType',       r.units?.diskType           || 'flatEdgeLit') },
      { q: 'Unit Entry Disk',         a: ll('entryDisk',      r.units?.entryDisk          || 'typical') },
      { q: 'Undercabinet Lighting',   a: getLabel('undercabinet',     r.units?.undercabinet       || 'none') },
      { q: 'Kitchen Island Pendants', a: getLabel('kitchenPendants',  r.units?.kitchenPendants    || 'none') },
      { q: 'Ceiling Fans',            a: getLabel('fans',             r.units?.fans               || 'none') },
      ...(r.units?.fans && r.units.fans !== 'none' && r.units?.fanLevel
        ? [{ q: 'Fan Finish Level', a: r.units.fanLevel }] : []),
      { q: 'Vanity Lighting',         a: getLabel('vanity',           r.units?.vanity             || 'bathBarLow') },
      { q: 'Balcony Fixture',         a: getLabel('balcony',          r.units?.balcony            || 'none') },
      { q: 'Living Room Fixture',     a: ll('livingRoomDisks',        r.units?.livingRoomDisks    || '1large') },
      { q: 'Boiler / HVAC Room Disk', a: ll('boilerRoom',             r.units?.boilerRoom         || 'no') },
      { q: 'Closet Control',          a: ll('closetControl',          r.units?.closetControl      || 'switch') },
      { q: 'Half-Hot Receptacles',    a: ll('halfHotReceptacles',     r.units?.halfHotReceptacles || 'no') },
      ...(Number(r.units?.dimmersPerUnit) > 0
        ? [{ q: 'Extra Dimmers / Unit', a: `${r.units.dimmersPerUnit} dimmer(s)` }] : []),
    ].filter(row => row.a && row.a !== '—')},

    { section: 'Corridors & Stairwells', rows: [
      { q: 'Fixture Type',         a: ll('fixtureType',        r.corridors?.fixtureType         || 'disk') },
      ...(r.corridors?.fixtureSpacing
        ? [{ q: 'Fixture Spacing', a: `${r.corridors.fixtureSpacing} ft on center` }] : []),
      { q: 'Unit Entry Sconce',    a: getLabel('corridorSconce', r.corridors?.unitSconce         || 'none') },
      { q: 'Fire Rating Req.',     a: ll('corridorFireRating',   r.corridors?.corridorFireRating  || 'surfaceMount') },
      { q: 'Stairwell Design',     a: ll('stairwellDesign',      r.corridors?.stairwellDesign     || 'code') },
      { q: 'Stairwell Painting',   a: ll('stairwellPainting',    r.corridors?.stairwellPainting   || 'unpainted') },
      { q: 'Corridor Ends',        a: ll('corridorEnds',         r.corridors?.corridorEnds        || 'none') },
      { q: 'Special Corridor',     a: ll('corridorSpecial',      r.corridors?.corridorSpecial     || 'no') },
      { q: 'Elevator Lobby',       a: ll('elevatorLobby',        r.corridors?.elevatorLobby       || 'no') },
      { q: 'Exit Sign Type',       a: ll('exitSignType',         r.corridors?.exitSignType        || 'thermoplastic') },
      { q: 'Garage Design Level',  a: ll('garageDesignLevel',    r.corridors?.garageDesignLevel   || 'medium') },
      { q: 'Garage Controls',      a: ll('garageControls',       r.corridors?.garageControls      || 'none') },
    ].filter(row => row.a && row.a !== '—')},

    { section: 'Interior Amenities', rows: [
      { q: 'Finish Level / Rate', a: (() => {
          const v = r.amenities?.interiorLevel || 'medium';
          const parsed = parseFloat(v);
          if (isFinite(parsed) && !['low','medium','high'].includes(v))
            return `$${parsed}/SF (custom rate)`;
          return getLabel('interiorAmenities', v);
        })(),
      },
    ]},

    { section: 'Exterior & Site', rows: [
      { q: 'Exterior Amenity Level', a: getLabel('exteriorAmenities', r.exterior?.amenityLevel  || 'medium') },
      { q: 'Amenity Hours',          a: getLabel('amenityHours',      r.exterior?.amenityHours  || 'beforeDusk') },
      { q: 'Site Type',              a: ll('siteType',                r.exterior?.siteType      || '') },
      { q: 'Roadway Lighting',       a: ll('roadwayLighting',         r.exterior?.roadwayLighting || 'no') },
      { q: 'Exterior Emergency',     a: ll('exteriorEmergency',       r.exterior?.exteriorEmergency || '') },
      { q: 'Pole Light Control',     a: ll('exteriorPoleControl',     r.exterior?.exteriorPoleControl || '') },
      ...(Number(r.exterior?.landscapeBudget) > 0
        ? [{ q: 'Extra Landscape Budget', a: formatCurrency(Number(r.exterior.landscapeBudget)) }] : []),
    ].filter(row => row.a && row.a !== '—')},

    { section: 'Emergency Lighting', rows: [
      { q: 'Strategy', a: getLabel('emergency', r.emergency?.strategy || 'integrated_inverters') },
    ]},

    { section: 'Controls & Energy', rows: [
      { q: 'Building Type',      a: getLabel('buildingType', pd.buildingTypeKey || r.controls?.buildingType || r.controls?.projectType || 'midRise') },
      { q: 'Energy Credit',      a: getLabel('energyCredit', r.controls?.energyCredit     || 'no') },
      { q: 'Controls System',    a: ll('controlsSystem',     r.controls?.controlsSystem   || 'standalone') },
      { q: 'Decorative Dimming', a: ll('decorativeDimming',  r.controls?.decorativeDimming || 'no') },
      { q: 'Scene Switching',    a: ll('sceneSwitching',     r.controls?.sceneSwitching   || 'none') },
      { q: 'Zone Reduction',     a: ll('zoneReduction',      r.controls?.zoneReduction    || 'no') },
      ...(Number(r.controls?.controlsOverride) > 0
        ? [{ q: 'Controls Override', a: formatCurrency(Number(r.controls.controlsOverride)) + ' (manual override)' }]
        : []),
    ].filter(row => row.a && row.a !== '—')},
  ];


  const freightPct     = Math.round((budget.freightRate     ?? 0.06) * 100);
  const warehousingPct = Math.round((budget.warehousingRate ?? 0.03) * 100);
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  const projectDataRows = [
    { label: 'Total Gross SF',         value: pd.grossSf             ? pd.grossSf.toLocaleString()           : null },
    { label: 'Units Gross SF',         value: pd.unitsSf             ? pd.unitsSf.toLocaleString()           : null },
    { label: '# of Units',             value: pd.numUnits            ? pd.numUnits.toLocaleString()          : null },
    { label: '# of Bedrooms',          value: pd.numBedrooms         ? pd.numBedrooms.toLocaleString()       : null },
    { label: '# of Bathrooms',         value: pd.numBathrooms        ? pd.numBathrooms.toLocaleString()      : null },
    { label: '# of Vanities',          value: pd.numVanities         ? pd.numVanities.toLocaleString()       : null },
    { label: '# of Balconies',         value: pd.numBalconies        ? pd.numBalconies.toLocaleString()      : null },
    { label: 'Stairwell Landings',     value: pd.numEgressStairwells ? pd.numEgressStairwells.toString()     : null },
    { label: 'Corridor SF',            value: pd.corridorSf          ? pd.corridorSf.toLocaleString()        : null },
    { label: 'Interior Amenity SF',    value: pd.interiorAmenitySf   ? pd.interiorAmenitySf.toLocaleString() : null },
    { label: 'Exterior Amenity SF',    value: pd.exteriorAmenitySf   ? pd.exteriorAmenitySf.toLocaleString() : null },
    { label: 'Garage SF',              value: pd.garageSf            ? pd.garageSf.toLocaleString()          : null },
    { label: 'BOH SF',                 value: pd.bohSf               ? pd.bohSf.toLocaleString()             : null },
    { label: 'Surface Parking Stalls', value: pd.numSurfaceParking   ? pd.numSurfaceParking.toString()       : null },
    { label: '# of Carports',          value: pd.numCarports         ? pd.numCarports.toString()             : null },
    { label: '# of Exterior Doors',    value: pd.numExteriorDoors    ? pd.numExteriorDoors.toString()        : null },
  ].filter(r => r.value);

  return (
    <div className="max-w-4xl mx-auto px-6 py-8 print:p-0 print:max-w-none">

      {/* ── NO PROJECT DATA WARNING ───────────────────────────────── */}
      {!pd.grossSf && (
        <div className="print:hidden mb-6 flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-5 py-4">
          <svg className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-800">Project data not entered — all figures are $0</p>
            <p className="text-xs text-amber-700 mt-0.5">
              Total Gross SF, # of Units, and area breakdowns are required before the budget can calculate.
              Go to the questionnaire, open <strong>Project Data</strong>, and fill in the building metrics.
            </p>
          </div>
          <Link
            href={`/project/${project.id}/wizard`}
            className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-white transition-colors"
          >
            Enter Project Data →
          </Link>
        </div>
      )}

      {/* ── PARTIAL PROJECT DATA WARNING ──────────────────────────── */}
      {/* Shows ONLY when grossSf is set but other critical fields are blank — */}
      {/* the silent-zero case that surfaced on Manuel's 2026-06-18 retest. */}
      {pd.grossSf && (
        <MissingInputsWarning projectData={pd} projectId={project.id} mode="full" />
      )}

      {/* ── SCREEN-ONLY HEADER ─────────────────────────────────────── */}
      <div className="print:hidden flex items-start justify-between mb-8">
        <div>
          <div className="flex items-center gap-2 text-sm text-slate-400 mb-2">
            <Link href="/dashboard" className="hover:text-slate-600 transition-colors">Projects</Link>
            <span>/</span>
            <Link href={`/project/${project.id}`} className="hover:text-slate-600 transition-colors">{project.name}</Link>
            <span>/</span>
            <span className="text-slate-600">Summary</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">{project.name}</h1>
          {project.location && <p className="text-slate-500 text-sm mt-0.5">{project.location}</p>}
        </div>
        <div className="flex gap-2">
          <Link
            href={`/project/${project.id}/wizard`}
            className="px-4 py-2 rounded-lg text-sm font-medium border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
          >
            Edit Questionnaire
          </Link>
          <SendBudgetButton
            projectId={project.id}
            projectName={project.name}
            totalBudget={budget.totalWithControls}
          />
          <SummaryPrintButton projectId={project.id} />
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* PRINT PAGE 1                                                  */}
      {/* ══════════════════════════════════════════════════════════════ */}

      {/* Budget hero — dark navy */}
      <div
        className="rounded-2xl print:rounded-none p-6 print:p-5 mb-6 print:mb-5 text-white"
        style={{ backgroundColor: '#0f172a', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}
      >
        <div className="flex items-start justify-between">
          <div>
            <div className="text-xs font-medium mb-1" style={{ color: '#94a3b8' }}>
          ILC Studios — {project.budgetType === 'design' ? 'Design' : 'Conceptual'} Lighting &amp; Controls Budget
        </div>
            <div className="text-3xl print:text-2xl font-bold tabular-nums mb-2">
              {formatCurrency(budget.totalWithControls)}
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm print:text-xs">
              <div><span style={{ color: '#94a3b8' }}>Lighting Only: </span><span className="font-semibold">{formatCurrency(budget.subtotalLightingOnly)}</span></div>
              <div><span style={{ color: '#94a3b8' }}>Controls (w/ F&amp;W): </span><span className="font-semibold">{formatCurrency(budget.controlsTotal)}</span></div>
              {budget.perSf  > 0 && <div><span style={{ color: '#94a3b8' }}>$/SF: </span><span className="font-semibold">${budget.perSf.toFixed(2)}</span></div>}
              {budget.perUnit > 0 && <div><span style={{ color: '#94a3b8' }}>$/Unit: </span><span className="font-semibold">{formatCurrency(budget.perUnit)}</span></div>}
            </div>
          </div>
          <div className="text-right hidden print:block">
            <div className="text-sm font-semibold" style={{ color: '#e2e8f0' }}>{project.name}</div>
            {project.location && <div className="text-xs mt-0.5" style={{ color: '#94a3b8' }}>{project.location}</div>}
            <div className="text-xs mt-0.5" style={{ color: '#64748b' }}>{today}</div>
          </div>
        </div>
        {pd.clientInitialBudget > 0 && (
          <div className="mt-3 pt-3 text-sm print:text-xs" style={{ borderTop: '1px solid #1e293b' }}>
            <span style={{ color: '#94a3b8' }}>Client Budget: </span>
            <span className="font-semibold">{formatCurrency(pd.clientInitialBudget)}</span>
            <span className={`ml-3 font-semibold ${budget.totalWithControls <= pd.clientInitialBudget ? 'text-green-400' : 'text-red-400'}`}>
              {budget.totalWithControls <= pd.clientInitialBudget
                ? `✓ Under by ${formatCurrency(pd.clientInitialBudget - budget.totalWithControls)}`
                : `△ Over by ${formatCurrency(budget.totalWithControls - pd.clientInitialBudget)}`}
            </span>
          </div>
        )}
        <p className="text-xs mt-2 print:hidden" style={{ color: '#475569' }}>
          {project.budgetType === 'design' ? 'Design budget estimate' : 'Conceptual estimate'}. {salesTaxNote}
        </p>
      </div>

      <div className="space-y-1">
        <SalesTaxWidget
          projectId={project.id}
          initialPct={budget.salesTaxPct || 0}
          taxAmount={(budget.lightingTaxAmount || 0) + (budget.controlsTaxAmount || 0)}
        />
        <ContingencyWidget
          projectId={project.id}
          baseBudget={budget.totalWithControls}
          initialPct={pd.contingencyPct ?? 0}
        />
      </div>

      {/* ── Design disclaimer — small, above Project Data ──────────── */}
      {project.budgetType === 'design' && (
        <p className="text-[10px] text-slate-400 leading-relaxed mb-3 print:mb-2">
          This is a design phase budget prepared by ILC Studios for early design and pre-con purposes only.
          Actual costs will vary based on final design, product selections, and market conditions.
          Not a formal bid or contract.
        </p>
      )}

      {/* ── PROJECT DATA — horizontal grid ─────────────────────────── */}
      <div className="bg-white rounded-xl print:rounded-none border border-slate-200 print:border-0 p-5 print:p-0 mb-6 print:mb-4">
        <h3 className="font-bold text-slate-900 mb-3 print:text-sm print:font-bold print:text-slate-900 print:mb-2">Project Data</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 print:grid-cols-4 gap-x-6 gap-y-2 print:gap-x-4 print:gap-y-1.5">
          {projectDataRows.map(row => (
            <div key={row.label}>
              <div className="text-xs text-slate-400 print:text-slate-400">{row.label}</div>
              <div className="text-sm font-semibold text-slate-900 tabular-nums print:text-xs">{row.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── DIVIDER — screen gap already separates; print needs a rule ── */}
      <div className="hidden print:block border-t border-slate-300 my-4" />

      {/* ── BUDGET BREAKDOWN — interactive on screen, clean for print ─ */}
      <div className="bg-white rounded-xl print:rounded-none border border-slate-200 print:border-0 p-5 print:p-0">
        <div className="flex items-center justify-between mb-3 print:mb-2">
          <h3 className="font-bold text-slate-900 print:text-sm print:font-bold print:text-slate-900">Budget Breakdown</h3>
          <span className="print:hidden text-xs text-slate-400 italic">Hover a line for details</span>
        </div>
        <SummaryBudgetBreakdown budget={budget} freightPct={freightPct} warehousingPct={warehousingPct} />
        <p className="hidden print:block text-xs mt-3 text-slate-400">
          Conceptual estimate only. {salesTaxNote}
        </p>
      </div>

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* PRINT PAGE 2 — Questionnaire Responses                        */}
      {/* ══════════════════════════════════════════════════════════════ */}
      <div className="print-page-2 bg-white rounded-xl print:rounded-none border border-slate-200 print:border-0 p-5 print:p-0 mt-6 print:mt-0">

        {/* Print page 2 header */}
        <div className="hidden print:flex print:items-center print:justify-between print:mb-4 print:pb-2 print:border-b print:border-slate-300">
          <div>
            <div className="text-sm font-bold text-slate-800">{project.name}</div>
            {project.location && <div className="text-xs text-slate-500">{project.location}</div>}
          </div>
          <div className="text-xs text-slate-400">{today}</div>
        </div>

        <h3 className="font-semibold text-slate-900 mb-4 print:hidden">Questionnaire Responses</h3>

        {/* Flat single-column list — sections separated by a heading */}
        <div className="space-y-0">
          {answerRows.map((group, gi) => (
            <div key={group.section} className={gi > 0 ? 'mt-4 print:mt-2' : ''}>
              <div className="text-xs font-bold text-slate-900 uppercase tracking-widest mb-1 pb-1 border-b border-slate-200 print:border-slate-300 print:mb-0">
                {group.section}
              </div>
              {group.rows.map(row => (
                <div key={row.q} className="flex py-1.5 print:py-0.5 border-b border-slate-50 print:border-slate-100">
                  <span className="text-sm print:text-xs text-slate-500 w-56 print:w-48 shrink-0">{row.q}</span>
                  <span className="text-sm print:text-xs text-slate-800 font-medium leading-snug">{row.a}</span>
                </div>
              ))}
            </div>
          ))}
        </div>

      </div>

      {/* ── BUDGET CHANGE HISTORY — screen only ───────────────────── */}
      {budgetHistory.length > 0 && (
        <div className="print:hidden bg-white rounded-xl border border-slate-200 p-5 mt-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-slate-900">Budget Change History</h3>
            <Link
              href={`/project/${project.id}`}
              className="text-xs text-amber-600 hover:text-amber-700 font-medium transition-colors"
            >
              View all in Activity tab →
            </Link>
          </div>

          <div className="space-y-0 divide-y divide-slate-100">
            {budgetHistory.map(activity => (
              <div key={activity.id} className="flex gap-4 py-3 first:pt-0 last:pb-0">
                <div className="w-32 shrink-0 text-xs text-slate-500">
                  {formatActivityTime(activity.createdAt)}
                </div>
                <div className="w-24 shrink-0 text-sm font-medium text-slate-700">
                  {activity.userName || activity.userEmail || 'Unknown'}
                </div>
                <div className="flex-1 text-sm text-slate-600">
                  {activity.description}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}
