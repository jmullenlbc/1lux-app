'use client';
import { useState } from 'react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import QuestionCard from './QuestionCard';
import { formatCurrency, priceOverride } from '@/lib/calculations';
import { PRICING } from '@/lib/pricing';
import StandardsHint from '@/components/wizard/StandardsHint';

// Manual adder line items — the things the formula does NOT compute. These ADD
// on top of the frozen formula breakdown.
const EXT_MANUAL_ITEMS = [
  ['pathwayLighting',     'Pathway lighting'],
  ['parkingEntrances',    'Parking entrances'],
  ['manualExteriorAdder', 'Manual exterior adder'],
];

export default function ExteriorSection({ responses, projectData, pricing, onSaveResponses, onSaveData, onNext, onPrev, isDesign = false }) {
  // Single source of truth: read rates/costs from the live master pricing. (Landscape
  // 2% and door averaging are hardcoded in the engine, so kept hardcoded here to match.)
  const P = pricing || PRICING;
  const [answers, setAnswers] = useState({
    amenityLevel:      responses.amenityLevel      || 'medium',
    amenityHours:      responses.amenityHours      || 'beforeDusk',
    siteDesignLevel:   responses.siteDesignLevel   || 'base',
    exteriorOverride:  responses.exteriorOverride  ?? '',
    // Building wallpack overrides. 'auto' (not '') is the cleared state — see the
    // OverrideBox note in QuestionCard.jsx: the responses store refuses to overwrite
    // a real value with a blank, so clearing must write something non-blank.
    wallpacksQty:      responses.wallpacksQty      ?? '',
    wallpacksPrice:    responses.wallpacksPrice    ?? '',
    // Design-only
    exteriorEmergency: responses.exteriorEmergency || 'wallpack',
    exteriorPoleControl: responses.exteriorPoleControl || 'photocell',
    siteType:          responses.siteType          || 'pedestrian',
    roadwayLighting:   responses.roadwayLighting   || 'no',
  });
  // `landscapeBudget` was a manual override field removed from the UI
  // mid-2026; engine reference also removed. Manual landscape additions
  // now route through exteriorManualItems.manualExteriorAdder.
  const [dirtyAnswers, setDirtyAnswers] = useState(() => new Set());

  // Manual adder items (pathway, parking entrances, catch-all). These ADD on top
  // of the frozen formula breakdown.
  const [manualItems, setManualItems] = useState(() => {
    try { return JSON.parse(responses.exteriorManualItems || '{}') || {}; }
    catch { return {}; }
  });
  const [dirtyManualItems, setDirtyManualItems] = useState(() => new Set());
  const setManualItem = (key, val) => {
    setManualItems(m => ({ ...m, [key]: val }));
    setDirtyManualItems(d => new Set(d).add(key));
  };
  const manualTotal = EXT_MANUAL_ITEMS.reduce((s, [key]) => s + (parseFloat(manualItems[key]) || 0), 0);

  const [saving, setSaving] = useState(false);

  const extSf       = Number(projectData?.exteriorAmenitySf)    || 0;
  const parking     = Number(projectData?.numSurfaceParking)     || 0;
  const carports    = Number(projectData?.numCarports)           || 0;
  const numGarages  = Number(projectData?.numGarages)            || 0;
  const extDoors    = Number(projectData?.numExteriorDoors)      || 0;
  const lotSf       = Number(projectData?.lotSf)                 || 0;
  const footprintSf = Number(projectData?.buildingFootprintSf)   || 0;
  // Landscape = 2% of NET lot SF (lot − building footprint), capped at the
  // questionnaire's stated ceiling — mirrors calculations.js (Mike 2026-09-04:
  // "net lot"). Falls back to the full lot when no footprint is on file.
  // Rate and cap read from master pricing so this cannot drift from the engine.
  const LS = P.exterior?.landscape || {};
  const landscapePct = LS.pctOfNetLotSf ?? 0.02;
  const landscapeCap = LS.maxTotal ?? 3000;
  const netLotSf     = footprintSf > 0 ? Math.max(lotSf - footprintSf, 0) : lotSf;
  const landscapeRaw = netLotSf > 0 ? netLotSf * landscapePct : 0;
  const autoLandscape = Math.min(landscapeRaw, landscapeCap);
  const landscapeCapped = landscapeRaw > landscapeCap;
  const netLotMath = footprintSf > 0
    ? `${lotSf.toLocaleString()} − ${footprintSf.toLocaleString()} footprint = ${netLotSf.toLocaleString()} SF net lot`
    : `${lotSf.toLocaleString()} SF lot (no footprint on file)`;

  const EA       = P.exteriorAmenities || {};
  const rateMap  = { low: EA.low ?? 1, lowMedium: EA.lowMedium ?? 2, medium: EA.medium ?? 3, high: EA.high ?? 5 };
  const baseRate = rateMap[answers.amenityLevel] ?? (rateMap.medium);
  // Only '24hrs or after dark' doubles the line (Mike, 2026-09-01: Dusk to
  // Dawn is as-is cost).
  const nightMult = answers.amenityHours === 'afterSunset' ? (EA.nighttimeMultiplier ?? 2) : 1;
  const extraFromNight = extSf * baseRate; // the adder shown in the question card

  // Live cost breakdown (mirrors calculations.js exterior block — reads master pricing)
  const sp = P.exterior?.surfaceParking || {};
  const amenityProduct  = extSf * baseRate * nightMult;
  const parkingFixtures = Math.ceil(parking / (sp.stallsPerFixture ?? 9));
  // Solar site design multiplies the area-lighting line (fixture carries its
  // own panel/battery/controller) — mirrors calculations.js. Mike 2026-09-04.
  const solarSite       = answers.siteDesignLevel === 'solar';
  const solarMult       = solarSite ? (P.exterior?.solarMultiplier ?? 2.3) : 1;
  const parkingProduct  = parkingFixtures * (sp.perFixture ?? 1325) * solarMult;
  const solarExtra      = parkingFixtures * (sp.perFixture ?? 1325) * ((P.exterior?.solarMultiplier ?? 2.3) - 1);
  const carportProduct  = Math.floor(carports / 2) * (P.exterior?.carport?.diskEveryOther ?? 30);
  const garageProduct   = numGarages * (P.exterior?.detachedGarage?.sconcePerDoor ?? 80);
  // The old "exterior door sconces" line (doors × $212.50 avg) was deleted
  // 2026-08-12 — Mike: same fixture as the building wallpacks below, so it was
  // being counted twice. The door count itself still shows in the scope grid.

  // Building wallpacks — mirrors the engine block in calculations.js exactly:
  //   wallpacks = buildings × perBuilding[type] (+ clubhouse on horizontal types)
  // The # of Buildings project field wins; walk-up types fall back to
  // units ÷ unitsPerBuilding; vertical types are one building. Both overrides
  // go through priceOverride(): blank/'auto' → the model, a real number → that.
  const WPC             = P.exterior?.wallpacks || {};
  const wpType          = projectData?.buildingTypeKey || 'midRise';
  const wpPerBuilding   = WPC.perBuilding?.[wpType] ?? 0;
  const wpIsWalkUp      = ['stackedFlats', 'garden', 'gurban'].includes(wpType);
  const wpIsHorizontal  = wpIsWalkUp || ['singleFamily', 'townHouses'].includes(wpType);
  const numBuildingsPD  = Number(projectData?.numBuildings) || 0;
  const numUnitsPD      = Number(projectData?.numUnits)     || 0;
  const wpBuildings     = numBuildingsPD > 0
    ? numBuildingsPD
    : wpIsWalkUp
      ? Math.ceil(numUnitsPD / (WPC.unitsPerBuilding?.[wpType] ?? 24))
      : 1;
  const wpHasScale      = numBuildingsPD > 0 || numUnitsPD > 0;
  const wpAutoQty       = wpHasScale
    ? wpBuildings * wpPerBuilding + (wpIsHorizontal ? (WPC.clubhouse ?? 0) : 0)
    : 0;
  const wpQtyOv         = priceOverride(answers.wallpacksQty);
  const wpPriceOv       = priceOverride(answers.wallpacksPrice);
  const wpQty           = wpQtyOv   ?? wpAutoQty;
  const wpEach          = wpPriceOv ?? (WPC.perFixture ?? 350);
  const wallpackProduct = wpQty * wpEach;
  const wpMath = !wpHasScale && wpQtyOv == null
    ? 'no units or building count yet — $0'
    : `${wpQtyOv != null ? `${wpQty} (manual)` : `${wpBuildings} bldg${wpBuildings === 1 ? '' : 's'} × ${wpPerBuilding}${wpIsHorizontal && (WPC.clubhouse ?? 0) > 0 ? ` + ${WPC.clubhouse} clubhouse` : ''} = ${wpQty}`} × $${wpEach.toLocaleString()}${wpPriceOv != null ? ' (manual)' : ''}`;

  // Pathway lighting — mirrors the engine block wired 2026-09-04: $/unit by
  // building type from master pricing, floored at pathway.minTotal. A manual
  // "Pathway lighting" entry below WINS and suppresses this model line, so a
  // hand-counted figure is never stacked on top of the model's.
  const PW             = P.exterior?.pathway || {};
  const pathwayRate    = PW.dollarsPerUnit?.[wpType] ?? 0;
  const pathwayFloor   = Number(PW.minTotal) || 0;
  const pathwayManual  = parseFloat(manualItems.pathwayLighting) || 0;
  // Solar sites bump the model pathway line by pathway.solarMultiplier (1.6),
  // applied after the floor — mirrors the engine. Manual entries are taken as-is.
  const pathwaySolarMult = solarSite ? (PW.solarMultiplier ?? 1.6) : 1;
  const pathwayBase    = numUnitsPD > 0 && pathwayRate > 0
    ? Math.max(numUnitsPD * pathwayRate, pathwayFloor)
    : 0;
  const pathwayAuto    = pathwayBase * pathwaySolarMult;
  const pathwayProduct = pathwayManual > 0 ? 0 : pathwayAuto;
  const pathwayFloored = pathwayProduct > 0 && numUnitsPD * pathwayRate < pathwayFloor;
  const pathwaySolarSuffix = solarSite ? ` × ${pathwaySolarMult} solar` : '';
  const pathwayMath = pathwayManual > 0
    ? 'manual pathway entry below carries this scope'
    : numUnitsPD <= 0 || pathwayRate <= 0
      ? 'no units yet — $0'
      : pathwayFloored
        ? `${numUnitsPD.toLocaleString()} units × $${pathwayRate}/unit = $${Math.round(numUnitsPD * pathwayRate).toLocaleString()}, floored at $${pathwayFloor.toLocaleString()}${pathwaySolarSuffix}`
        : `${numUnitsPD.toLocaleString()} units × $${pathwayRate}/unit${pathwaySolarSuffix}`;

  const subBeforeMisc   = amenityProduct + parkingProduct + carportProduct + garageProduct + wallpackProduct + autoLandscape + pathwayProduct;
  // The buffer base includes the manual adder — matches the engine
  // (extBufferBase = extSubBeforeMisc + exteriorManualTotal). This preview
  // previously left the manual adder out of the buffer and understated it.
  const miscBuffer      = (subBeforeMisc + manualTotal) * (P.exterior?.miscBufferPct ?? 0.05);
  const exteriorFormulaTotal = subBeforeMisc + miscBuffer;

  // Frozen formula breakdown lines (read-only, auto-calculated, math shown in text).
  // Exterior amenities are NOT listed here — they're configured + shown by the
  // amenity question cards above. They stay in the exterior total via the engine.
  const frozenLines = [
    { label: solarSite ? 'Surface parking (solar)' : 'Surface parking',
      math: `${parking} stalls ÷ ${sp.stallsPerFixture ?? 9} = ${parkingFixtures} fixture${parkingFixtures === 1 ? '' : 's'} × $${(sp.perFixture ?? 1325).toLocaleString()}${solarSite ? ` × ${solarMult} solar` : ''}`, value: parkingProduct },
    { label: 'Carports',              math: `${carports} ÷ 2 = ${Math.floor(carports / 2)} disk${Math.floor(carports / 2) === 1 ? '' : 's'} × $${P.exterior?.carport?.diskEveryOther ?? 30}`, value: carportProduct },
    { label: 'Detached garages',      math: `${numGarages} × $${P.exterior?.detachedGarage?.sconcePerDoor ?? 80}/door`, value: garageProduct },
    { label: 'Building wallpacks',    math: wpMath, value: wallpackProduct },
    { label: solarSite && pathwayManual <= 0 ? 'Pathway lighting (solar)' : 'Pathway lighting', math: pathwayMath, value: pathwayProduct },
    // Show the cap when it binds, otherwise the label reads as the uncapped
    // figure and silently contradicts the value next to it.
    { label: 'Landscape',             math: landscapeCapped
        ? `${netLotMath} × $${landscapePct.toFixed(2)}/SF = $${Math.round(landscapeRaw).toLocaleString()}, capped at $${landscapeCap.toLocaleString()}`
        : `${netLotMath} × $${landscapePct.toFixed(2)}/SF`, value: autoLandscape },
    { label: 'Miscellaneous',         math: `${((P.exterior?.miscBufferPct ?? 0.05) * 100).toFixed(0)}% buffer of full exterior (incl. amenities + manual adder)`, value: miscBuffer },
  ];
  // Subtotal of the breakdown box = everything in the formula EXCEPT amenities
  // (amenities are shown separately above). Lines above sum to this.
  const formulaBreakdownSubtotal = exteriorFormulaTotal - amenityProduct;

  // Manual override replaces everything when set; otherwise frozen formula + manual adder.
  const overrideVal     = parseFloat(answers.exteriorOverride) > 0 ? parseFloat(answers.exteriorOverride) : 0;
  const overrideActive  = overrideVal > 0;
  const exteriorTotal   = overrideActive ? overrideVal : exteriorFormulaTotal + manualTotal;

  async function handleNext() {
    setSaving(true);
    // Only send dirty answers
    const payload = {};
    for (const key of dirtyAnswers) {
      payload[key] = answers[key];
    }
    // Only send dirty manual items
    if (dirtyManualItems.size > 0) {
      const dirtyManual = {};
      for (const key of dirtyManualItems) {
        dirtyManual[key] = manualItems[key];
      }
      payload.exteriorManualItems = JSON.stringify(dirtyManual);
    }
    // Null out design-only keys in conceptual mode
    if (!isDesign) {
      payload.exteriorEmergency  = null;
      payload.exteriorPoleControl = null;
      payload.siteType            = null;
      payload.roadwayLighting     = null;
    }
    if (Object.keys(payload).length > 0) {
      await onSaveResponses(payload);
    }
    setDirtyAnswers(new Set());
    setDirtyManualItems(new Set());
    setSaving(false);
    onNext();
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Exterior &amp; Site Lighting</h2>
        <p className="text-slate-500 text-sm mt-1">
          Scope includes: site lighting, exterior amenities (pool area, courtyards), landscape,
          surface parking lots, carports, and attached/detached garages.
        </p>
      </div>

      <StandardsHint category="EXTERIOR" />

      {/* Auto scope summary */}
      <div className="bg-slate-50 rounded-xl border border-slate-200 p-4">
        <div className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">Scope Inputs from Project Data</div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-center">
          {[
            { label: 'Exterior Amenity SF',    value: extSf > 0 ? extSf.toLocaleString() : '—' },
            { label: 'Surface Parking Stalls', value: parking  || '—' },
            { label: 'Carports',               value: carports || '—' },
            { label: 'Exterior Doors',         value: extDoors || '—' },
            { label: 'Buildings',              value: numBuildingsPD || '—' },
          ].map(item => (
            <div key={item.label} className="bg-white rounded-lg border border-slate-100 p-3">
              <div className="text-xl font-bold text-slate-900">{item.value}</div>
              <div className="text-xs text-slate-500 mt-0.5">{item.label}</div>
            </div>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-400">
          <div>• Surface parking: 1 fixture per ~{sp.stallsPerFixture ?? 9} stalls × ${(sp.perFixture ?? 1325).toLocaleString()}/fixture (area light + 30ft pole)</div>
          <div>• Carports: 1 × 7" disk per every other bay (${P.exterior?.carport?.diskEveryOther ?? 30} ea)</div>
          <div>• Building wallpacks: per-building rate by building type × ${WPC.perFixture ?? 350} each — covers exterior doors too</div>
          <div>• Pathway lighting: $/unit by building type (${pathwayRate || 0}/unit here), floored at ${pathwayFloor.toLocaleString()}; solar sites × {PW.solarMultiplier ?? 1.6} — a manual pathway entry replaces the model line</div>
          <div>• Landscape: ${landscapePct.toFixed(2)} per SF of the net lot (lot − building footprint), capped at ${landscapeCap.toLocaleString()}</div>
        </div>
      </div>

      {/* Site design level — base / upgraded / solar (mirrors the public intake question) */}
      <QuestionCard
        question="What level of design would you like on the site?"
        note="Base design covers code-required site and parking lighting. Solar fixtures carry their own panel, battery and controller, so the area lighting runs higher on product — but install labor should be reduced dramatically because there's no trenching or running conduit and wire to the poles."
        costSuffix=" total"
        options={[
          { value: 'base',     label: 'Base design',                                sub: 'Code-required site and parking lighting', cost: 0 },
          { value: 'upgraded', label: 'Upgraded landscape and/or path lighting',    sub: 'Recorded for the designer — add dollars via the manual adder below', cost: 0 },
          { value: 'solar',    label: `Solar lighting — ${P.exterior?.solarMultiplier ?? 2.3}× area lighting, ${PW.solarMultiplier ?? 1.6}× pathway`, sub: 'Self-contained solar fixtures; labor drops dramatically (no trenching, conduit, or wire runs)', cost: solarExtra + (pathwayManual > 0 ? 0 : pathwayBase * ((PW.solarMultiplier ?? 1.6) - 1)) },
        ]}
        value={answers.siteDesignLevel}
        onChange={val => {
          setAnswers(a => ({ ...a, siteDesignLevel: val }));
          setDirtyAnswers(d => new Set(d).add('siteDesignLevel'));
        }}
      />
      {solarSite && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
          <span className="font-semibold">Solar site lighting</span> — area lighting priced at {solarMult}× conventional, pathway at {pathwaySolarMult}×.
          Install labor should be reduced dramatically — no trenching, conduit, or wire runs to the poles.
        </div>
      )}

      {/* Exterior amenity level */}
      <QuestionCard
        question="What level of design would you like for exterior amenities?"
        note="Exterior amenities include pool deck, courtyards, and outdoor gathering areas. Range: $1/SF (minimal) to $5/SF (high-end, may include façade lighting)."
        costSuffix=" total"
        options={[
          { value: 'low',       label: `$${rateMap.low}/SF — Low finish`,             sub: 'Garden walk-up; minimal exterior amenity lighting',                cost: extSf * rateMap.low },
          { value: 'lowMedium', label: `$${rateMap.lowMedium}/SF — Low-Medium finish`, sub: 'Simple mid-market exterior amenity package',                       cost: extSf * rateMap.lowMedium },
          { value: 'medium',    label: `$${rateMap.medium}/SF — Medium finish`,        sub: 'Standard mid-market exterior amenity package',                     cost: extSf * rateMap.medium },
          { value: 'high',      label: `$${rateMap.high}/SF — High finish`,            sub: 'High-end mid-rise / high-rise; may include façade accent lighting', cost: extSf * rateMap.high },
        ]}
        value={answers.amenityLevel}
        onChange={val => {
          setAnswers(a => ({ ...a, amenityLevel: val }));
          setDirtyAnswers(d => new Set(d).add('amenityLevel'));
        }}
      />

      {/* Amenity hours */}
      <QuestionCard
        question="What will be the amenity operational hours? If one exists, does the pool close at or before dusk?"
        note="A pool area open after dark needs much higher light levels around the deck per code and in turn add 2x or more the cost."
        costSuffix=" total"
        options={[
          {
            value: 'afterSunset',
            label: '24hrs or after dark',
            sub:   `${EA.nighttimeMultiplier ?? 2}× the exterior amenity budget — much higher light levels required`,
            cost:  extraFromNight,
          },
          {
            value: 'duskToDawn',
            label: 'Dusk to Dawn',
            sub:   'Standard exterior amenity budget — lights run on the normal dusk-to-dawn schedule',
            cost:  0,
          },
          {
            value: 'beforeDusk',
            label: 'Other',
            sub:   'Standard exterior amenity budget applies (e.g., closes at or before dusk)',
            cost:  0,
          },
        ]}
        value={answers.amenityHours}
        onChange={val => {
          setAnswers(a => ({ ...a, amenityHours: val }));
          setDirtyAnswers(d => new Set(d).add('amenityHours'));
        }}
      />

      {/* Exterior amenities subtotal — calculated from the cards above (shown once, here) */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 flex items-start justify-between gap-4">
        <div>
          <p className="text-lg font-bold text-slate-900">Exterior Amenities + Pool Area</p>
          <p className="text-[11px] text-slate-400 mt-0.5">
            {extSf.toLocaleString()} SF × ${baseRate}/SF{nightMult === 2 ? ' × 2 (after sunset)' : ''}
          </p>
        </div>
        <div className="text-right shrink-0">
          <div className="text-[10px] uppercase tracking-widest text-slate-400">Subtotal</div>
          <div className="text-xl font-bold text-slate-900 font-mono">{formatCurrency(amenityProduct)}</div>
        </div>
      </div>

      {/* ── Section 1: Exterior Formula Breakdown (frozen / auto-calculated) ── */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-start justify-between gap-4 mb-1">
          <div>
            <p className="font-semibold text-slate-900">Exterior Formula Breakdown</p>
            <p className="text-[11px] text-slate-400">Auto-calculated · read-only · excludes amenities (shown above)</p>
          </div>
          <div className="text-right shrink-0">
            <div className="text-[10px] uppercase tracking-widest text-slate-400">Subtotal</div>
            <div className="text-lg font-bold text-slate-900 font-mono">{formatCurrency(formulaBreakdownSubtotal)}</div>
          </div>
        </div>
        <p className="text-xs text-slate-400 mb-4">
          Calculated live from your project data — these update automatically and can&apos;t be edited
          here. The math behind each line is shown in parentheses.
        </p>
        <div className="space-y-1.5">
          {frozenLines.map(row => (
            <div key={row.label} className="flex justify-between items-baseline gap-3 text-slate-600">
              <span className="text-sm">
                {row.label} <span className="text-[11px] text-slate-400">({row.math})</span>
              </span>
              <span className="font-mono text-sm font-semibold text-slate-700 shrink-0">{formatCurrency(row.value)}</span>
            </div>
          ))}
          <div className="flex justify-between border-t border-slate-200 pt-2 mt-2 font-bold text-slate-900">
            <span className="text-sm">Breakdown Subtotal</span>
            <span className="font-mono text-sm">{formatCurrency(formulaBreakdownSubtotal)}</span>
          </div>
        </div>
      </div>

      {/* ── Building Wallpacks — auto count with quantity + price overrides ── */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-start justify-between gap-4 mb-1">
          <div>
            <p className="font-semibold text-slate-900">Building Wallpacks</p>
            <p className="text-[11px] text-slate-400">
              Auto-counted from buildings ({wpMath}) — override either number below if the site says otherwise.
            </p>
          </div>
          <div className="text-right shrink-0">
            <div className="text-[10px] uppercase tracking-widest text-slate-400">Line Total</div>
            <div className="text-lg font-bold text-slate-900 font-mono">{formatCurrency(wallpackProduct)}</div>
          </div>
        </div>
        <p className="text-xs text-slate-400 mb-4">
          Egress wallpacks at the building exterior doors — this is the one line for exterior
          door fixtures (the old separate door-sconce line was folded in here). The count comes
          from the # of Buildings on Project Data and the building type&apos;s wallpacks-per-building
          rate. Leave a box blank to keep the automatic number.
        </p>
        <div className="flex flex-wrap gap-4">
          <div className="w-40">
            <Input
              label="Quantity (override)"
              type="number"
              placeholder={String(wpAutoQty)}
              value={wpQtyOv != null ? answers.wallpacksQty : ''}
              onChange={e => {
                const v = e.target.value === '' ? 'auto' : e.target.value;
                setAnswers(a => ({ ...a, wallpacksQty: v }));
                setDirtyAnswers(d => new Set(d).add('wallpacksQty'));
              }}
              min={0}
            />
          </div>
          <div className="w-40">
            <Input
              label="$ per wallpack (override)"
              type="number"
              prefix="$"
              placeholder={String(WPC.perFixture ?? 350)}
              value={wpPriceOv != null ? answers.wallpacksPrice : ''}
              onChange={e => {
                const v = e.target.value === '' ? 'auto' : e.target.value;
                setAnswers(a => ({ ...a, wallpacksPrice: v }));
                setDirtyAnswers(d => new Set(d).add('wallpacksPrice'));
              }}
              min={0}
            />
          </div>
        </div>
        {(wpQtyOv != null || wpPriceOv != null) && (
          <p className="mt-2 text-xs text-amber-700">
            Manual override in use
            {wpQtyOv != null ? ` — quantity ${wpQty} instead of the automatic ${wpAutoQty}` : ''}
            {wpPriceOv != null ? ` — $${wpEach.toLocaleString()} each instead of $${(WPC.perFixture ?? 350).toLocaleString()}` : ''}.
            Clear the box to go back to automatic.
          </p>
        )}
      </div>

      {/* ── Section 2: Manual Adder (editable — items the formula doesn't cover) ── */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-start justify-between gap-4 mb-1">
          <p className="font-semibold text-slate-900">Exterior Lighting Manual Adder</p>
          <div className="text-right shrink-0">
            <div className="text-[10px] uppercase tracking-widest text-slate-400">Manual Total</div>
            <div className="text-lg font-bold text-slate-900 font-mono">{formatCurrency(manualTotal)}</div>
          </div>
        </div>
        <p className="text-xs text-slate-400 mb-4">
          Items the formula doesn&apos;t compute. These <strong>add</strong> on top of the Formula
          Subtotal above.
        </p>
        <div className="space-y-2">
          {EXT_MANUAL_ITEMS.map(([key, label]) => (
            <div key={key} className="flex items-center gap-3">
              <span className="text-sm text-slate-600 flex-1">{label}</span>
              <div className="w-40">
                <Input
                  type="number"
                  placeholder="0"
                  prefix="$"
                  value={manualItems[key] ?? ''}
                  onChange={e => setManualItem(key, e.target.value)}
                  min={0}
                />
              </div>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between border-t border-slate-200 mt-3 pt-3">
          <span className="text-sm font-bold text-slate-900">Manual Adder Total</span>
          <span className="text-sm font-bold text-slate-900 font-mono">{formatCurrency(manualTotal)}</span>
        </div>
      </div>

      {/* Combined exterior total */}
      <div className="bg-slate-900 rounded-xl p-4 flex items-center justify-between">
        <span className="text-sm font-semibold text-white">
          Exterior Total {overrideActive ? '(override in use)' : '(formula + manual adder)'}
        </span>
        <span className="text-lg font-bold text-white font-mono">{formatCurrency(exteriorTotal)}</span>
      </div>

      {/* Manual exterior override — replaces everything when set */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <p className="font-semibold text-slate-900 mb-1">Manual Exterior Total (Override)</p>
        <p className="text-xs text-slate-400 mb-4">
          If the exterior was built out entirely by hand (outside this tool), enter the total here.
          It <strong>replaces</strong> the Formula Subtotal + Manual Adder above. Leave blank to use them.
        </p>
        <div className="max-w-xs">
          <Input
            label="Manual Exterior Total ($)"
            type="number"
            placeholder="0"
            prefix="$"
            value={answers.exteriorOverride}
            onChange={e => {
              setAnswers(a => ({ ...a, exteriorOverride: e.target.value }));
              setDirtyAnswers(d => new Set(d).add('exteriorOverride'));
            }}
            min={0}
          />
        </div>
        {overrideActive && (
          <p className="mt-2 text-xs text-amber-700">
            Override in use: {formatCurrency(overrideVal)} — the formula + manual adder above are ignored.
          </p>
        )}
      </div>

      {/* ── DESIGN-ONLY questions ────────────────────────────────────────────── */}
      {isDesign && (
        <>
          <QuestionCard
            question="Exterior door emergency lighting — wallpacks or decorative fixtures?"
            note="Code requires emergency lighting at exterior egress doors. Wallpacks are the lowest-cost option. Decorative sconces cost more but look better on finished facades."
            options={[
              { value: 'wallpack',   label: 'Wallpacks — code-compliant, lowest cost',                   cost: 0 },
              { value: 'decorative', label: 'Decorative exterior sconces at egress doors',               sub: 'Adder over wallpack; better aesthetic', cost: 0 },
              { value: 'integrated', label: 'Integrated emergency module in architectural fixture',       sub: 'Premium option; cleanest appearance', cost: 0 },
            ]}
            value={answers.exteriorEmergency}
            onChange={val => {
              setAnswers(a => ({ ...a, exteriorEmergency: val }));
              setDirtyAnswers(d => new Set(d).add('exteriorEmergency'));
            }}
          />

          <QuestionCard
            question="Exterior pole lighting control strategy?"
            note="All exterior pole lighting requires a control strategy. Photocell is standard; smart controls add cost but allow scheduling, dimming, and energy reporting."
            options={[
              { value: 'photocell',    label: 'Photocell — dusk-to-dawn automatic control',           sub: 'Standard; included in base', cost: 0 },
              { value: 'timeClock',    label: 'Time clock — scheduled on/off',                        sub: 'Allows after-hours shutoff', cost: 0 },
              { value: 'smartControl', label: 'Smart / networked controls',                           sub: 'Scheduling, dimming, energy reporting — adder', cost: 0 },
            ]}
            value={answers.exteriorPoleControl}
            onChange={val => {
              setAnswers(a => ({ ...a, exteriorPoleControl: val }));
              setDirtyAnswers(d => new Set(d).add('exteriorPoleControl'));
            }}
          />

          <QuestionCard
            question="Site lighting type — what does the site require?"
            note="Site type drives fixture selection and layout. Mixed sites may require a combination of strategies."
            options={[
              { value: 'pedestrian',    label: 'Pedestrian poles / bollards only',                     sub: 'Lower-height poles, path lights, bollards', cost: 0 },
              { value: 'areaLights',    label: 'Area lights on tall poles',                            sub: '25–30ft poles; parking lots and drive aisles', cost: 0 },
              { value: 'buildingMount', label: 'Building-mounted fixtures only',                       sub: 'Wall packs and wall-mounted fixtures', cost: 0 },
              { value: 'mixed',         label: 'Mixed — combination of pole types and building-mount', sub: 'Most common for mid-rise and podium buildings', cost: 0 },
            ]}
            value={answers.siteType}
            onChange={val => {
              setAnswers(a => ({ ...a, siteType: val }));
              setDirtyAnswers(d => new Set(d).add('siteType'));
            }}
          />

          <QuestionCard
            question="Is city-required roadway lighting included in this scope?"
            note="Some jurisdictions require the developer to install and dedicate roadway lighting to the city. This is typically a separate line item and may require a different fixture spec. Informational."
            options={[
              { value: 'no',  label: 'No — no roadway lighting required',         cost: 0 },
              { value: 'yes', label: 'Yes — city-required roadway lighting in scope', sub: 'Note in project; coordinate with civil engineer', cost: 0 },
            ]}
            value={answers.roadwayLighting}
            onChange={val => {
              setAnswers(a => ({ ...a, roadwayLighting: val }));
              setDirtyAnswers(d => new Set(d).add('roadwayLighting'));
            }}
          />
        </>
      )}

      <div className="flex gap-3 pt-2">
        <Button variant="secondary" onClick={onPrev}>Back</Button>
        <Button variant="amber" size="lg" loading={saving} onClick={handleNext}>
          Save &amp; Continue to Emergency
        </Button>
      </div>
    </div>
  );
}
