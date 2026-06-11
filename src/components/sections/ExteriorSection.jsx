'use client';
import { useState } from 'react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import QuestionCard from './QuestionCard';
import { formatCurrency } from '@/lib/calculations';
import StandardsHint from '@/components/wizard/StandardsHint';

// Manual adder line items — the things the formula does NOT compute. These ADD
// on top of the frozen formula breakdown.
const EXT_MANUAL_ITEMS = [
  ['pathwayLighting',     'Pathway lighting'],
  ['parkingEntrances',    'Parking entrances'],
  ['manualExteriorAdder', 'Manual exterior adder'],
];

export default function ExteriorSection({ responses, projectData, onSaveResponses, onSaveData, onNext, onPrev, isDesign = false }) {
  const [answers, setAnswers] = useState({
    amenityLevel:      responses.amenityLevel      || 'medium',
    amenityHours:      responses.amenityHours      || 'beforeDusk',
    landscapeBudget:   responses.landscapeBudget   ?? '',
    exteriorOverride:  responses.exteriorOverride  ?? '',
    // Design-only
    exteriorEmergency: responses.exteriorEmergency || 'wallpack',
    exteriorPoleControl: responses.exteriorPoleControl || 'photocell',
    siteType:          responses.siteType          || 'pedestrian',
    roadwayLighting:   responses.roadwayLighting   || 'no',
  });

  // Manual adder items (pathway, parking entrances, catch-all). These ADD on top
  // of the frozen formula breakdown.
  const [manualItems, setManualItems] = useState(() => {
    try { return JSON.parse(responses.exteriorManualItems || '{}') || {}; }
    catch { return {}; }
  });
  const setManualItem = (key, val) => setManualItems(m => ({ ...m, [key]: val }));
  const manualTotal = EXT_MANUAL_ITEMS.reduce((s, [key]) => s + (parseFloat(manualItems[key]) || 0), 0);

  const [saving, setSaving] = useState(false);

  const extSf       = Number(projectData?.exteriorAmenitySf)    || 0;
  const parking     = Number(projectData?.numSurfaceParking)     || 0;
  const carports    = Number(projectData?.numCarports)           || 0;
  const numGarages  = Number(projectData?.numGarages)            || 0;
  const extDoors    = Number(projectData?.numExteriorDoors)      || 0;
  const lotSf       = Number(projectData?.lotSf)                 || 0;
  // Landscape = 2% of total lot SF (Excel-verified formula, matches the engine).
  const autoLandscape = lotSf > 0 ? lotSf * 0.02 : 0;

  const rateMap  = { low: 1, lowMedium: 2, medium: 3, high: 5 };
  const baseRate = rateMap[answers.amenityLevel] ?? 3;
  const nightMult = answers.amenityHours === 'afterSunset' ? 2 : 1;
  const extraFromNight = extSf * baseRate; // the adder shown in the question card

  // Live cost breakdown (mirrors calculations.js exterior block)
  const amenityProduct  = extSf * baseRate * nightMult;
  const parkingFixtures = Math.ceil(parking / 9);
  const parkingProduct  = parkingFixtures * 1325;
  const carportProduct  = Math.floor(carports / 2) * 30;
  const garageProduct   = numGarages * 80;
  const halfDoors       = Math.ceil(extDoors / 2);
  const doorProduct     = halfDoors * 350 + (extDoors - halfDoors) * 75;
  const landscapeAdder  = parseFloat(answers.landscapeBudget) > 0 ? parseFloat(answers.landscapeBudget) : 0;
  const landscapeTotal  = autoLandscape + landscapeAdder;
  const subBeforeMisc   = amenityProduct + parkingProduct + carportProduct + garageProduct + doorProduct + landscapeTotal;
  const miscBuffer      = subBeforeMisc * 0.05;
  const exteriorFormulaTotal = subBeforeMisc + miscBuffer;

  // Frozen formula breakdown lines (read-only, auto-calculated, math shown in text).
  // Exterior amenities are NOT listed here — they're configured + shown by the
  // amenity question cards above. They stay in the exterior total via the engine.
  const frozenLines = [
    { label: 'Surface parking',       math: `${parking} stalls ÷ 9 = ${parkingFixtures} fixture${parkingFixtures === 1 ? '' : 's'} × $1,325`, value: parkingProduct },
    { label: 'Carports',              math: `${carports} ÷ 2 = ${Math.floor(carports / 2)} disk${Math.floor(carports / 2) === 1 ? '' : 's'} × $30`, value: carportProduct },
    { label: 'Detached garages',      math: `${numGarages} × $80/door`, value: garageProduct },
    { label: 'Exterior door sconces', math: `${halfDoors}×$350 + ${extDoors - halfDoors}×$75`, value: doorProduct },
    { label: 'Landscape',             math: `${lotSf.toLocaleString()} SF lot × 2%`, value: landscapeTotal },
    { label: 'Miscellaneous',         math: '5% buffer of full exterior (incl. amenities)', value: miscBuffer },
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
    const payload = { ...answers, exteriorManualItems: JSON.stringify(manualItems) };
    if (!isDesign) {
      payload.exteriorEmergency  = null;
      payload.exteriorPoleControl = null;
      payload.siteType            = null;
      payload.roadwayLighting     = null;
    }
    await onSaveResponses(payload);
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
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
          {[
            { label: 'Exterior Amenity SF',    value: extSf > 0 ? extSf.toLocaleString() : '—' },
            { label: 'Surface Parking Stalls', value: parking  || '—' },
            { label: 'Carports',               value: carports || '—' },
            { label: 'Exterior Doors',         value: extDoors || '—' },
          ].map(item => (
            <div key={item.label} className="bg-white rounded-lg border border-slate-100 p-3">
              <div className="text-xl font-bold text-slate-900">{item.value}</div>
              <div className="text-xs text-slate-500 mt-0.5">{item.label}</div>
            </div>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-400">
          <div>• Surface parking: 1 fixture per ~9 stalls × $1,325/fixture (area light + 30ft pole)</div>
          <div>• Carports: 1 × 7" disk per every other bay ($30 ea)</div>
          <div>• Exterior doors: $350 + $75 per door pair (sconces)</div>
        </div>
      </div>

      {/* Exterior amenity level */}
      <QuestionCard
        question="What level of design would you like for exterior amenities?"
        note="Exterior amenities include pool deck, courtyards, and outdoor gathering areas. Range: $1/SF (minimal) to $5/SF (high-end, may include façade lighting)."
        costSuffix=" total"
        options={[
          { value: 'low',       label: '$1/SF — Low',        sub: 'Garden walk-up; minimal exterior amenity lighting',                cost: extSf * 1 },
          { value: 'lowMedium', label: '$2/SF — Low-Medium', sub: 'Simple mid-market exterior amenity package',                       cost: extSf * 2 },
          { value: 'medium',    label: '$3/SF — Medium',     sub: 'Standard mid-market exterior amenity package',                     cost: extSf * 3 },
          { value: 'high',      label: '$5/SF — High',       sub: 'High-end mid-rise / high-rise; may include façade accent lighting', cost: extSf * 5 },
        ]}
        value={answers.amenityLevel}
        onChange={val => setAnswers(a => ({ ...a, amenityLevel: val }))}
      />

      {/* Amenity hours */}
      <QuestionCard
        question="What will be the amenity operational hours?"
        note="If amenity areas (e.g., pool) are open after sunset or before sunrise, lighting levels must be much higher, effectively doubling the exterior amenity budget."
        costSuffix=" total"
        options={[
          {
            value: 'beforeDusk',
            label: 'Closes at or before dusk',
            sub:   'Standard exterior amenity budget applies',
            cost:  0,
          },
          {
            value: 'afterSunset',
            label: 'Open after sunset or before sunrise',
            sub:   '2× the exterior amenity budget — significantly higher light levels required',
            cost:  extraFromNight,
          },
        ]}
        value={answers.amenityHours}
        onChange={val => setAnswers(a => ({ ...a, amenityHours: val }))}
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
            onChange={e => setAnswers(a => ({ ...a, exteriorOverride: e.target.value }))}
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
            onChange={val => setAnswers(a => ({ ...a, exteriorEmergency: val }))}
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
            onChange={val => setAnswers(a => ({ ...a, exteriorPoleControl: val }))}
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
            onChange={val => setAnswers(a => ({ ...a, siteType: val }))}
          />

          <QuestionCard
            question="Is city-required roadway lighting included in this scope?"
            note="Some jurisdictions require the developer to install and dedicate roadway lighting to the city. This is typically a separate line item and may require a different fixture spec. Informational."
            options={[
              { value: 'no',  label: 'No — no roadway lighting required',         cost: 0 },
              { value: 'yes', label: 'Yes — city-required roadway lighting in scope', sub: 'Note in project; coordinate with civil engineer', cost: 0 },
            ]}
            value={answers.roadwayLighting}
            onChange={val => setAnswers(a => ({ ...a, roadwayLighting: val }))}
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
