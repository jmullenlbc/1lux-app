import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { calculateBudget, formatCurrency } from '@/lib/calculations';
import { OPTION_LABELS } from '@/lib/pricing';
import { responsesToSections } from '@/lib/utils';
import { loadPricing } from '@/lib/pricingLoader';
import { htmlToPdf } from '@/lib/pdf';

function esc(s) {
  if (s == null) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function fmt(n) { return formatCurrency(n); }
function fmtDate(d) {
  const dt = new Date(d);
  const yy = String(dt.getFullYear()).slice(2);
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yy}.${mm}.${dd}`;
}

// GET /api/projects/[id]/budget/pdf
export async function GET(request, { params }) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  const project = await prisma.project.findUnique({
    where: { id: params.id },
    include: { projectData: true, responses: true, createdBy: { select: { name: true, email: true } } },
  });
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const pricing  = project.pricingSnapshot ? JSON.parse(project.pricingSnapshot) : await loadPricing();
  const sections = responsesToSections(project.responses);
  const pd       = { ...(project.projectData || {}), buildingTypeKey: project.buildingType };
  const budget   = calculateBudget(pd, sections, pricing);
  const r        = sections;

  const freightPct     = Math.round((budget.freightRate     ?? 0.06) * 100);
  const warehousingPct = Math.round((budget.warehousingRate ?? 0.03) * 100);
  const contingencyPct = budget.contingencyRate ? Math.round(budget.contingencyRate * 100) : 0;

  const isDesign = project.budgetType === 'design';
  const typeLabel = isDesign ? 'Design' : 'Conceptual';
  const dateStr   = fmtDate(new Date());
  const title     = `${dateStr} ${project.name} ${typeLabel} Budget`;

  function gl(cat, key) { return OPTION_LABELS[cat]?.[key] || key || '—'; }
  const LL = {
    diskType:           { flatEdgeLit: 'Flat Edge-Lit (standard)', backlit: 'Backlit Rounded (–$0.04/SF credit)' },
    entryDisk:          { typical: 'Standard', upgraded12: '12" Oversized Entry Disk (+$25/unit)', decorative: 'Decorative Surface Mount (+$30/unit)' },
    fixtureType:        { disk: 'Surface-Mount Disk', recessed: 'Recessed Downlight' },
    corridorFireRating: { surfaceMount: 'Surface Mount', fireRated: 'Fire-Rated Concealed' },
    stairwellDesign:    { code: 'Code Minimum', elevated: 'Elevated / Upgraded Design' },
    stairwellPainting:  { unpainted: 'Unpainted / Raw Walls', painted: 'Painted / Finished Walls' },
    corridorEnds:       { none: 'None', sconce: 'Sconce at Corridor Ends', downlight: 'Downlight at Corridor Ends' },
    elevatorLobby:      { no: 'No', yes: 'Yes' },
    corridorSpecial:    { no: 'No', yes: 'Yes' },
    exitSignType:       { thermoplastic: 'Thermoplastic (~$22/sign)', mixed: 'Mixed Edge-Lit FOH / Thermoplastic BOH (~$75/sign)', edgelit: 'Edge-Lit Throughout (~$127/sign)' },
    garageDesignLevel:  { medium: 'Standard LED Linear Grid ($0.30/SF)', enhanced: 'Enhanced Higher Uniformity ($0.45/SF)', high: 'Enhanced Higher Uniformity ($0.45/SF)' },
    garageControls:     { none: 'None', occSensor: 'Occupancy Sensors (+$0.02/SF)', battery: 'Integrated Battery Backup (+$0.05/SF)', batteryAndSensor: 'Battery + Occ Sensor (+$0.06/SF)', daylighting: 'Daylight Harvesting (+$0.10/SF)' },
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
  function ll(cat, key) { return LL[cat]?.[key] || key || '—'; }

  const answerGroups = [
    { section: 'Residential Units', rows: [
      { q: 'Disk Type',               a: ll('diskType',       r.units?.diskType           || 'flatEdgeLit') },
      { q: 'Unit Entry Disk',         a: ll('entryDisk',      r.units?.entryDisk          || 'typical') },
      { q: 'Undercabinet Lighting',   a: gl('undercabinet',   r.units?.undercabinet       || 'none') },
      { q: 'Kitchen Island Pendants', a: gl('kitchenPendants',r.units?.kitchenPendants    || 'none') },
      { q: 'Ceiling Fans',            a: gl('fans',           r.units?.fans               || 'none') },
      ...(r.units?.fans && r.units.fans !== 'none' && r.units?.fanLevel
        ? [{ q: 'Fan Finish Level',   a: r.units.fanLevel }] : []),
      { q: 'Vanity Lighting',         a: gl('vanity',         r.units?.vanity             || 'bathBarLow') },
      { q: 'Balcony Fixture',         a: gl('balcony',        r.units?.balcony            || 'none') },
      { q: 'Living Room Fixture',     a: ll('livingRoomDisks',r.units?.livingRoomDisks    || '1large') },
      { q: 'Boiler / HVAC Room Disk', a: ll('boilerRoom',     r.units?.boilerRoom         || 'no') },
      { q: 'Closet Control',          a: ll('closetControl',  r.units?.closetControl      || 'switch') },
      { q: 'Half-Hot Receptacles',    a: ll('halfHotReceptacles', r.units?.halfHotReceptacles || 'no') },
      ...(Number(r.units?.dimmersPerUnit) > 0
        ? [{ q: 'Extra Dimmers / Unit', a: `${r.units.dimmersPerUnit} dimmer(s)` }] : []),
    ].filter(row => row.a && row.a !== '—') },

    { section: 'Corridors & Stairwells', rows: [
      { q: 'Fixture Type',         a: ll('fixtureType',        r.corridors?.fixtureType        || 'disk') },
      ...(r.corridors?.fixtureSpacing
        ? [{ q: 'Fixture Spacing', a: `${r.corridors.fixtureSpacing} ft on center` }] : []),
      { q: 'Unit Entry Sconce',    a: gl('corridorSconce',     r.corridors?.unitSconce         || 'none') },
      { q: 'Fire Rating Req.',     a: ll('corridorFireRating', r.corridors?.corridorFireRating  || 'surfaceMount') },
      { q: 'Stairwell Design',     a: ll('stairwellDesign',    r.corridors?.stairwellDesign     || 'code') },
      { q: 'Stairwell Painting',   a: ll('stairwellPainting',  r.corridors?.stairwellPainting   || 'unpainted') },
      { q: 'Corridor Ends',        a: ll('corridorEnds',       r.corridors?.corridorEnds        || 'none') },
      { q: 'Special Corridor',     a: ll('corridorSpecial',    r.corridors?.corridorSpecial     || 'no') },
      { q: 'Elevator Lobby',       a: ll('elevatorLobby',      r.corridors?.elevatorLobby       || 'no') },
      { q: 'Exit Sign Type',       a: ll('exitSignType',       r.corridors?.exitSignType        || 'thermoplastic') },
      { q: 'Garage Design Level',  a: ll('garageDesignLevel',  r.corridors?.garageDesignLevel   || 'medium') },
      { q: 'Garage Controls',      a: ll('garageControls',     r.corridors?.garageControls      || 'none') },
    ].filter(row => row.a && row.a !== '—') },

    { section: 'Interior Amenities', rows: [
      { q: 'Finish Level / Rate', a: (() => {
          const v = r.amenities?.interiorLevel || 'medium';
          const labels = { low: 'Low / Simple ($0.25/SF)', medium: 'Medium / Standard ($0.35/SF)', high: 'High / Upscale ($0.50/SF)', custom: 'Custom Rate' };
          if (v === 'custom' && r.amenities?.interiorCustomRate)
            return `Custom: $${Number(r.amenities.interiorCustomRate).toFixed(2)}/SF`;
          return labels[v] || v;
        })() },
      ...(r.amenities?.amenityList?.length
        ? [{ q: 'Amenity Types', a: r.amenities.amenityList.map(v => gl('interiorAmenities', v)).join(', ') }] : []),
    ].filter(row => row.a && row.a !== '—') },

    { section: 'Exterior & Site', rows: [
      { q: 'Exterior Amenity Level', a: gl('exteriorAmenities', r.exterior?.amenityLevel  || 'medium') },
      { q: 'Amenity Hours',          a: gl('amenityHours',      r.exterior?.amenityHours  || 'beforeDusk') },
      { q: 'Site Type',              a: ll('siteType',          r.exterior?.siteType      || '') },
      { q: 'Roadway Lighting',       a: ll('roadwayLighting',   r.exterior?.roadwayLighting || 'no') },
      { q: 'Exterior Emergency',     a: ll('exteriorEmergency', r.exterior?.exteriorEmergency || '') },
      { q: 'Pole Light Control',     a: ll('exteriorPoleControl', r.exterior?.exteriorPoleControl || '') },
      ...(Number(r.exterior?.landscapeBudget) > 0
        ? [{ q: 'Extra Landscape Budget', a: fmt(Number(r.exterior.landscapeBudget)) }] : []),
    ].filter(row => row.a && row.a !== '—') },

    { section: 'Emergency Lighting', rows: [
      { q: 'Strategy', a: gl('emergency', r.emergency?.strategy || 'integrated_inverters') },
    ] },

    { section: 'Controls & Energy', rows: [
      { q: 'Building Type',      a: gl('buildingType',    pd.buildingTypeKey || r.controls?.buildingType || 'midRise') },
      { q: 'Energy Credit',      a: gl('energyCredit',    r.controls?.energyCredit     || 'no') },
      { q: 'Controls System',    a: ll('controlsSystem',  r.controls?.controlsSystem   || 'standalone') },
      { q: 'Decorative Dimming', a: ll('decorativeDimming', r.controls?.decorativeDimming || 'no') },
      { q: 'Scene Switching',    a: ll('sceneSwitching',  r.controls?.sceneSwitching   || 'none') },
      { q: 'Zone Reduction',     a: ll('zoneReduction',   r.controls?.zoneReduction    || 'no') },
      ...(Number(r.controls?.controlsOverride) > 0
        ? [{ q: 'Controls Override', a: fmt(Number(r.controls.controlsOverride)) + ' (manual override)' }] : []),
    ].filter(row => row.a && row.a !== '—') },
  ];

  const projectDataRows = [
    { label: 'Total Gross SF',         value: pd.grossSf             ? pd.grossSf.toLocaleString()            : null },
    { label: 'Units Gross SF',         value: pd.unitsSf             ? pd.unitsSf.toLocaleString()            : null },
    { label: '# of Units',             value: pd.numUnits            ? pd.numUnits.toLocaleString()           : null },
    { label: '# of Bedrooms',          value: pd.numBedrooms         ? pd.numBedrooms.toLocaleString()        : null },
    { label: '# of Bathrooms',         value: pd.numBathrooms        ? pd.numBathrooms.toLocaleString()       : null },
    { label: '# of Vanities',          value: pd.numVanities         ? pd.numVanities.toLocaleString()        : null },
    { label: '# of Balconies',         value: pd.numBalconies        ? pd.numBalconies.toLocaleString()       : null },
    { label: 'Stairwell Landings',     value: pd.numEgressStairwells ? pd.numEgressStairwells.toString()      : null },
    { label: 'Corridor SF',            value: pd.corridorSf          ? pd.corridorSf.toLocaleString()         : null },
    { label: 'Interior Amenity SF',    value: pd.interiorAmenitySf   ? pd.interiorAmenitySf.toLocaleString()  : null },
    { label: 'Exterior Amenity SF',    value: pd.exteriorAmenitySf   ? pd.exteriorAmenitySf.toLocaleString()  : null },
    { label: 'Garage SF',              value: pd.garageSf            ? pd.garageSf.toLocaleString()           : null },
    { label: 'BOH SF',                 value: pd.bohSf               ? pd.bohSf.toLocaleString()              : null },
    { label: 'Surface Parking Stalls', value: pd.numSurfaceParking   ? pd.numSurfaceParking.toString()        : null },
    { label: '# of Carports',          value: pd.numCarports         ? pd.numCarports.toString()              : null },
    { label: '# of Exterior Doors',    value: pd.numExteriorDoors    ? pd.numExteriorDoors.toString()         : null },
  ].filter(r => r.value);

  const lineItems = [
    { label: 'Residential Units',    value: budget.sections?.units?.total?.product    || 0 },
    { label: 'Corridors & Stairwells', value: budget.sections?.corridors?.total?.product || 0 },
    { label: 'BOH / Core + Shell',   value: budget.sections?.boh?.product             || 0 },
    { label: 'Interior Amenities',   value: budget.sections?.interior?.product         || 0 },
    { label: 'Enclosed Garage',      value: budget.sections?.garage?.product           || 0 },
    { label: 'Exterior & Site',      value: budget.sections?.exterior?.total?.product  || 0 },
    { label: 'Emergency Lighting',   value: budget.sections?.emergency?.product        || 0 },
    { label: 'Exit Signs',           value: budget.sections?.exitSigns?.product        || 0 },
  ];

  function row(label, value, bold = false) {
    const style = bold
      ? 'display:flex;justify-content:space-between;padding:3px 0;font-weight:700;border-top:2px solid #0f172a;margin-top:4px'
      : 'display:flex;justify-content:space-between;padding:2px 0;border-bottom:1px solid #e2e8f0;font-size:8.5pt';
    const valStyle = bold ? 'font-family:monospace' : `font-family:monospace;color:${value === 0 ? '#cbd5e1' : '#0f172a'}`;
    return `<div style="${style}"><span>${esc(label)}</span><span style="${valStyle}">${esc(fmt(value))}</span></div>`;
  }

  const breakdownRows = lineItems.map(i => row(i.label, i.value)).join('');

  const qRows = answerGroups.map(group => {
    if (!group.rows.length) return '';
    const rowsHtml = group.rows.map(r =>
      `<div style="display:flex;padding:1.5px 0;border-bottom:1px solid #f1f5f9">
        <span style="width:160px;flex-shrink:0;font-size:7.5pt;color:#64748b">${esc(r.q)}</span>
        <span style="font-size:7.5pt;color:#1e293b;font-weight:500">${esc(r.a)}</span>
      </div>`
    ).join('');
    return `
      <div style="margin-top:8px">
        <div style="font-size:6.5pt;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#0f172a;border-bottom:1px solid #cbd5e1;padding-bottom:2px;margin-bottom:2px">${esc(group.section)}</div>
        ${rowsHtml}
      </div>`;
  }).join('');

  const pdGrid = projectDataRows.map(r =>
    `<div><div style="font-size:7pt;color:#94a3b8">${esc(r.label)}</div><div style="font-size:8pt;font-weight:600;color:#0f172a">${esc(r.value)}</div></div>`
  ).join('');

  const clientBudget = pd.clientInitialBudget > 0
    ? `<div style="margin-top:10px;padding-top:8px;border-top:1px solid #1e293b;font-size:8pt">
        <span style="color:#94a3b8">Client Budget: </span>
        <span style="font-weight:700">${esc(fmt(pd.clientInitialBudget))}</span>
        <span style="margin-left:10px;font-weight:700;color:${budget.totalWithControls <= pd.clientInitialBudget ? '#4ade80' : '#f87171'}">
          ${budget.totalWithControls <= pd.clientInitialBudget
            ? '✓ Under by ' + fmt(pd.clientInitialBudget - budget.totalWithControls)
            : '△ Over by ' + fmt(budget.totalWithControls - pd.clientInitialBudget)}
        </span>
      </div>` : '';

  const designDisclaimer = isDesign
    ? `<p style="font-size:7.5pt;color:#94a3b8;line-height:1.5;margin:8px 0 0 0">
        This is a design phase budget prepared by ILC Studios for early design and pre-con purposes only.
        Actual costs will vary based on final design, product selections, and market conditions.
        Not a formal bid or contract.
      </p>` : '';

  const contingencyRows = budget.contingencyAmount > 0
    ? row(`Contingency (${contingencyPct}%)`, budget.contingencyAmount) +
      row('Total w/ Contingency', budget.totalWithContingency, true)
    : '';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <title>${esc(title)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, "Helvetica Neue", sans-serif; font-size: 9pt; color: #1e1e1e; background: white; }
    @page { size: letter; margin: 0.5in 0.6in; }
  </style>
</head>
<body>

<!-- ── PAGE 1 ── -->
<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px">
  <img src="https://app.ilcstudios.com/ilc-studios-logo.jpg" alt="ILC Studios" style="height:36px"/>
  <div style="text-align:right;font-size:7.5pt;color:#64748b;line-height:1.6">
    ILC Studios — ${esc(typeLabel)} Lighting &amp; Controls Budget<br/>
    ${esc(project.name)}${project.location ? ' · ' + esc(project.location) : ''}<br/>
    ${esc(new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }))}
  </div>
</div>

<!-- Hero -->
<div style="background:#0f172a;color:white;padding:18px 22px;border-radius:6px;margin-bottom:10px;-webkit-print-color-adjust:exact;print-color-adjust:exact">
  <div style="font-size:7.5pt;color:#94a3b8;margin-bottom:4px">ILC Studios — ${esc(typeLabel)} Lighting &amp; Controls Budget</div>
  <div style="font-size:22pt;font-weight:700;font-family:monospace;margin-bottom:6px">${esc(fmt(budget.totalWithControls))}</div>
  <div style="display:flex;flex-wrap:wrap;gap:16px;font-size:8pt">
    <div><span style="color:#94a3b8">Lighting Only: </span><span style="font-weight:600">${esc(fmt(budget.subtotalLightingOnly))}</span></div>
    <div><span style="color:#94a3b8">Controls (w/ F&amp;W): </span><span style="font-weight:600">${esc(fmt(budget.controlsTotal))}</span></div>
    ${budget.perSf  > 0 ? `<div><span style="color:#94a3b8">$/SF: </span><span style="font-weight:600">$${budget.perSf.toFixed(2)}</span></div>` : ''}
    ${budget.perUnit > 0 ? `<div><span style="color:#94a3b8">$/Unit: </span><span style="font-weight:600">${esc(fmt(budget.perUnit))}</span></div>` : ''}
  </div>
  ${clientBudget}
</div>

${designDisclaimer}

<!-- Project Data -->
<div style="margin:10px 0 8px 0">
  <div style="font-weight:700;font-size:8.5pt;color:#0f172a;margin-bottom:6px">Project Data</div>
  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px 16px">
    ${pdGrid}
  </div>
</div>

<hr style="border:none;border-top:1px solid #e2e8f0;margin:8px 0"/>

<!-- Budget Breakdown -->
<div style="margin-bottom:4px;font-weight:700;font-size:8.5pt;color:#0f172a">Budget Breakdown</div>
${breakdownRows}
${row('Lighting Subtotal', budget.lightingProductSubtotal, true)}
${row(`Freight (${freightPct}%)`, budget.freight || 0)}
${row(`Warehousing (${warehousingPct}%)`, budget.warehousing || 0)}
${row('Lighting Total', budget.subtotalLightingOnly, true)}
${row('Controls (IECC 2021)', budget.controls || 0)}
${row(`Freight (${freightPct}%)`, budget.controlsFreight || 0)}
${row(`Warehousing (${warehousingPct}%)`, budget.controlsWarehousing || 0)}
${row('Total w/ Controls', budget.totalWithControls, true)}
${contingencyRows}

<p style="font-size:7pt;color:#94a3b8;margin-top:6px">Conceptual estimate only. Does not include sales tax.</p>

<!-- ── PAGE 2 ── -->
<div style="page-break-before:always">
  <div style="display:flex;justify-content:space-between;align-items:baseline;border-bottom:1px solid #cbd5e1;padding-bottom:4px;margin-bottom:8px">
    <div style="font-weight:700;font-size:9pt;color:#0f172a">${esc(project.name)}</div>
    <div style="font-size:7.5pt;color:#94a3b8">${esc(new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }))}</div>
  </div>
  <div style="font-weight:700;font-size:8.5pt;color:#0f172a;margin-bottom:4px">Questionnaire Responses</div>
  ${qRows}
</div>

</body>
</html>`;

  const pdf = await htmlToPdf(html, { landscape: false, margin: { top: '0.5in', right: '0.6in', bottom: '0.5in', left: '0.6in' } });
  return new NextResponse(pdf, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${title}.pdf"`,
    },
  });
}
