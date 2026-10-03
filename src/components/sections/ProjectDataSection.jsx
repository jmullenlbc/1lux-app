'use client';
import { useState, useEffect, useRef } from 'react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Card, { CardHeader, CardBody } from '@/components/ui/Card';
import QuestionCard from './QuestionCard';
import { allowsGarages, allowsCarports } from '@/lib/coveredParkingTypes';
import { siteFeaturesToRows, SITE_FEATURE_ROW_KEYS } from '@/lib/siteFeatures';
import { useFigureAlerts, FigureAlertNote, FigureAlertSummary } from '@/components/figures/FigureAlerts';

const SITE_FEATURE_FORM_KEYS = new Set(Object.values(SITE_FEATURE_ROW_KEYS));

// The six sporadic site features live as SiteFeature rows on the project, not
// as Project Info columns; the form reads them off `projectData.siteFeatures`
// and shows them as flat numbers like everything else.
function formValue(projectData, key) {
  if (SITE_FEATURE_FORM_KEYS.has(key)) return siteFeaturesToRows(projectData?.siteFeatures)[key];
  return projectData?.[key];
}

// Boxes that only apply to some building types (Mike 2026-09-13) — the same
// rule the public form and the budget engine use.
const FIELD_ALLOWED = {
  numCarports: allowsCarports,
  numGarages:  allowsGarages,
};

const FIELDS = [
  { group: 'Building Metrics',
    fields: [
      { key: 'grossSf',              label: 'Total Gross SF',                  type: 'number', placeholder: '150,000',  hint: 'Total gross square footage of the entire building' },
      { key: 'lotSf',                label: 'Lot Size Gross SF',               type: 'number', placeholder: '40,000',   hint: 'Total lot square footage' },
      { key: 'buildingFootprintSf',  label: 'Building Footprint Total Gross SF', type: 'number', placeholder: '20,000', hint: 'Footprint of building on lot. Lot minus footprint = exterior site area.' },
      { key: 'numUnits',             label: '# of Units / Rooms',              type: 'number', placeholder: '120',      hint: 'Total residential unit count. On a hotel, keys count as units.' },
      { key: 'numBuildings',         label: '# of Buildings',                  type: 'number', placeholder: '7',        hint: 'Residential buildings on the site (not counting a standalone clubhouse). Drives building wallpack counts.' },
      { key: 'numBedrooms',          label: '# of Bedrooms',                   type: 'number', placeholder: '200',      hint: 'Total bedroom count across all units' },
      { key: 'numBalconies',         label: '# of Balconies',                  type: 'number', placeholder: '100',      hint: 'Total balcony count' },
      { key: 'numBathrooms',         label: '# of Bathrooms',                  type: 'number', placeholder: '200',      hint: 'Total bathroom count across all units' },
      { key: 'numVanities',          label: '# of Vanities',                   type: 'number', placeholder: '200',      hint: 'Usually equal to # of bathrooms' },
      { key: 'numEgressStairwells',  label: '# of Egress Stairwell Landings',  type: 'number', placeholder: '30',       hint: 'Count every landing, including the half-landing between floors: a stair serving 3 floors has 3 floor landings + 2 in-between = 5. Every landing gets a light. The drawing takeoff fills this in with 10% already added; if you type it yourself, add 10% on top.' },
      { key: 'numFans',              label: '# of Ceiling Fans',               type: 'number', placeholder: '14',       hint: 'Total fan count — overrides unit-mix calculation. Leave blank to auto-calculate.' },
      { key: 'numAccentDownlights',  label: '# of Recessed Downlight Accents', type: 'number', placeholder: '40',       hint: 'Adjustable recessed accents in corridors. $160 ea (1-hr fire rated).' },
    ],
  },
  { group: 'Parking & Exterior',
    fields: [
      { key: 'numSurfaceParking',   label: '# of Surface Parking Stalls', type: 'number', placeholder: '80',  hint: 'Not in a structured garage' },
      { key: 'numCarports',         label: '# of Carports',               type: 'number', placeholder: '0',   hint: 'Individual covered bays' },
      { key: 'numGarages',          label: '# Detached/Attached Garages', type: 'number', placeholder: '0' },
      { key: 'numExteriorDoors',        label: '# of Exterior Doors',            type: 'number', placeholder: '20',  hint: 'Building entry/exit doors (not unit doors)' },
      // Sporadic site features (Mike 2026-09-16). Each is priced as its own
      // fixture package: area lights at the dog park entrance and around courts,
      // 12 ft pedestrian poles on playgrounds and along courtyards / turf play.
      { key: 'dogParks',         label: '# of Dog Parks',            type: 'number', placeholder: '0', hint: '1 area light at the entrance of each dog park. 0 = none.' },
      { key: 'courtyardFt',      label: 'Courtyard Length (ft)',     type: 'number', placeholder: '0', hint: 'Longest dimension of the courtyard(s), in feet. 1 pedestrian pole per 30 ft. Length unknown? Use 60 ft per courtyard (2 poles). 0 = none.' },
      { key: 'playgrounds',      label: '# of Playgrounds',          type: 'number', placeholder: '0', hint: '2 pedestrian poles per playground. 0 = none.' },
      { key: 'tennisCourts',     label: '# of Tennis Courts',        type: 'number', placeholder: '0', hint: '4 area lights per court. 0 = none.' },
      { key: 'pickleballCourts', label: '# of Pickleball Courts',    type: 'number', placeholder: '0', hint: '4 area lights per court. 0 = none.' },
      { key: 'turfPlayFt',       label: 'Turf Play Area Length (ft)', type: 'number', placeholder: '0', hint: 'Longest dimension of the turf play area(s), in feet. 1 pedestrian pole per 50 ft. 0 = none.' },
      { key: 'driveLengthFt',    label: 'Private Drive Length (ft)', type: 'number', placeholder: '', hint: 'Townhomes and single family. Usually read off the site plan. 1 pole light per 81 ft.' },
      { key: 'walkwayLengthFt',  label: 'Walkway Length (ft)',       type: 'number', placeholder: '', hint: 'Townhomes and single family. Usually read off the site plan. 1 bollard / pedestrian pole per 40 ft; blank = 1 per 8 homes.' },
    ],
  },
  { group: 'Area Breakdowns (SF)',
    fields: [
      { key: 'unitsSf',           label: 'Units Gross SF',           type: 'number', placeholder: '95,000',  hint: 'Residential units only — used for base $0.38/SF calculation' },
      { key: 'garageSf',          label: 'Enclosed Garage SF',       type: 'number', placeholder: '25,000',  hint: '0 if no enclosed garage' },
      { key: 'bohSf',             label: 'BOH / Core + Shell SF',    type: 'number', placeholder: '8,000',   hint: 'Mechanical, storage, bike room, trash, etc.' },
      { key: 'corridorSf',        label: 'Corridor SF',              type: 'number', placeholder: '18,000', hint: 'Enclosed corridors and stairwells — or open-air breezeways on a walk-up' },
      { key: 'interiorAmenitySf', label: 'Interior Amenity SF',      type: 'number', placeholder: '5,000',   hint: 'Lobby, clubhouse, fitness, co-working, etc.' },
      { key: 'exteriorAmenitySf', label: 'Exterior Amenity SF',      type: 'number', placeholder: '8,000',   hint: 'Pool deck, courtyards, terraces, and other outdoor gathering areas' },
    ],
  },
  { group: 'Freight, Warehousing & Tax',
    fields: [
      { key: 'freightPct',     label: 'Freight %',     type: 'number', placeholder: '6',    hint: 'Default 6% of lighting product subtotal. Enter as a percentage (e.g. 6 for 6%)', suffix: '%' },
      { key: 'warehousingPct', label: 'Warehousing %', type: 'number', placeholder: '3',    hint: 'Default 3% of lighting product subtotal. Enter as a percentage (e.g. 3 for 3%)', suffix: '%' },
      { key: 'salesTaxPct',    label: 'Sales Tax %',   type: 'number', placeholder: '9.15', hint: 'Jurisdiction sales tax rate on materials. Leave blank for tax-exempt projects. Applied to product subtotals only.', suffix: '%' },
    ],
  },
  { group: 'Section Adders',
    fields: [
      { key: 'bohManualAdder',       label: 'BOH / Core + Shell manual adder',    type: 'number', placeholder: '0', hint: 'Add an arbitrary dollar amount to bump the BOH total.', prefix: '$' },
      { key: 'garageManualAdder',    label: 'Enclosed Garage manual adder',       type: 'number', placeholder: '0', hint: 'Add an arbitrary dollar amount to bump the garage total.', prefix: '$' },
      { key: 'exitSignsManualAdder', label: 'Exit Signs manual adder',            type: 'number', placeholder: '0', hint: 'Add an arbitrary dollar amount to bump the exit signs total.', prefix: '$' },
    ],
  },
];

const PCT_FIELDS = new Set(['freightPct', 'warehousingPct', 'salesTaxPct']);

export default function ProjectDataSection({ projectId, projectData, responses = {}, onSaveData, onSaveResponses, onNext, isDesign = false }) {
  const [form, setForm] = useState(() => {
    const f = {};
    FIELDS.forEach(g => g.fields.forEach(field => {
      const raw = formValue(projectData, field.key);
      // Convert stored decimal (0.06) → display percentage (6) for pct fields
      if (PCT_FIELDS.has(field.key) && raw != null && raw !== '') {
        f[field.key] = (parseFloat(raw) * 100).toFixed(1).replace(/\.0$/, '');
      } else {
        f[field.key] = raw ?? '';
      }
    }));
    return f;
  });
  const [dirty, setDirty] = useState(() => new Set());

  // Reflect numbers written from OUTSIDE this form — a drawing upload
  // committing to Project Info while this section is on screen. The form was
  // initialized once from the mount-time prop, so without this an upload's
  // numbers only appear after a full reload. Fields the user is mid-edit on
  // (in `dirty`) are left alone: an extractor must not eat unsaved typing.
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  useEffect(() => {
    setForm(f => {
      const next = { ...f };
      FIELDS.forEach(g => g.fields.forEach(field => {
        if (dirtyRef.current.has(field.key)) return;
        const raw = formValue(projectData, field.key);
        next[field.key] = (PCT_FIELDS.has(field.key) && raw != null && raw !== '')
          ? (parseFloat(raw) * 100).toFixed(1).replace(/\.0$/, '')
          : raw ?? '';
      }));
      return next;
    });
  }, [projectData]);
  const [qAnswers, setQAnswers] = useState({
    buyHold:          responses.buyHold          || '',
    switchesDimmers:  responses.switchesDimmers  || '',
    contingency:      responses.contingency      || '',
    salesTax:         responses.salesTax         || '',
  });
  const [qDirty, setQDirty] = useState(() => new Set());
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);

  // Line-level alerts: a figure far off our real jobs of this building type.
  const figures = useFigureAlerts(projectId);
  const figureCtx = { buildingType: projectData?.buildingTypeKey, units: form.numUnits, grossSf: form.grossSf };
  const shownFields = FIELDS.flatMap(g => g.fields)
    .filter(field => !FIELD_ALLOWED[field.key] || FIELD_ALLOWED[field.key](projectData?.buildingTypeKey));
  const alerts = Object.fromEntries(shownFields
    .map(field => [field.key, figures.alertFor(field.key, form[field.key], figureCtx)])
    .filter(([, a]) => a));

  function update(key) {
    return e => {
      figures.forget(key);
      setForm(f => ({ ...f, [key]: e.target.value }));
      setDirty(d => new Set(d).add(key));
      setSaved(false);
    };
  }

  async function handleSave(andNext = false) {
    setSaving(true);
    // Only send fields the user actually touched
    const payload = {};
    for (const key of dirty) {
      payload[key] = form[key];
    }
    // Convert display percentage (6) → stored decimal (0.06) for pct fields
    for (const key of PCT_FIELDS) {
      if (key in payload && payload[key] !== '' && payload[key] != null) {
        const pct = parseFloat(payload[key]);
        payload[key] = isNaN(pct) ? '' : (pct / 100).toString();
      }
    }
    if (Object.keys(payload).length > 0) {
      await onSaveData(payload);
    }
    // Always save Q&A responses. Contingency is now visible in all modes;
    // the other strategy fields (buyHold, switchesDimmers) remain design-
    // only in the UI but are harmless to send from conceptual mode (the
    // server preserve-on-blank guard, commit 896ded1, skips empty writes).
    if (onSaveResponses) {
      await onSaveResponses(qAnswers);
    }
    setDirty(new Set());
    setQDirty(new Set());
    setSaved(true);
    setSaving(false);
    if (andNext) onNext();
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Project Data</h2>
        <p className="text-slate-500 text-sm mt-1">
          Enter your project metrics. The budget updates live as you fill in data.
          All fields are optional — enter what you have and refine later.
        </p>
      </div>

      <FigureAlertSummary count={Object.keys(alerts).length} />

      {FIELDS.map(group => (
        <Card key={group.group}>
          <CardHeader>
            <h3 className="font-semibold text-slate-800">{group.group}</h3>
          </CardHeader>
          <CardBody>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {group.fields.filter(field => !FIELD_ALLOWED[field.key] || FIELD_ALLOWED[field.key](projectData?.buildingTypeKey)).map(field => (
                <div key={field.key}>
                <Input
                  label={field.label}
                  type={field.type}
                  placeholder={field.placeholder}
                  hint={field.hint}
                  prefix={field.prefix}
                  suffix={field.suffix}
                  value={form[field.key]}
                  onChange={update(field.key)}
                  min={0}
                />
                <FigureAlertNote alert={alerts[field.key]} saved={!dirty.has(field.key)} onRight={() => figures.markRight(field.key)} />
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      ))}

      {/* ── CONTINGENCY (all modes) ─────────────────────────────────────── */}
      {/* Visible in conceptual + design. Engine applies the selected % to the */}
      {/* lighting product subtotal and adds a "Total w/ Contingency" line on */}
      {/* the Summary. Selecting "No contingency" leaves the totals unchanged. */}
      <QuestionCard
        question="Should we hold a contingency line item in the budget?"
        note="A contingency covers scope gaps discovered during design. Typical range: 5–10% of lighting subtotal. Recommended for early-stage budgets."
        options={[
          { value: 'none', label: 'No contingency',                          sub: 'Use only for late-stage CD budgets with high confidence', cost: 0 },
          { value: '5pct', label: '5% contingency',                          sub: 'Standard for DD-stage budgets', cost: 0 },
          { value: '10pct',label: '10% contingency',                         sub: 'Recommended for SD-stage or early schematic budgets', cost: 0 },
        ]}
        value={qAnswers.contingency}
        onChange={v => setQAnswers(a => ({ ...a, contingency: v }))}
      />

      {/* ── DESIGN-ONLY Q&A ───────────────────────────────────────────────── */}
      {isDesign && (
        <div className="space-y-4">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Project Intent &amp; Budget Strategy</div>

          <QuestionCard
            question="Is this a buy-and-hold or build-and-sell project?"
            note="Buy-and-hold projects benefit from more durable fixtures with lower long-term maintenance cost. Build-and-sell projects can prioritize visual impact per dollar at sale."
            options={[
              { value: 'buyHold',   label: 'Buy and hold — long-term ownership',     sub: 'Prioritize durability and low maintenance', cost: 0 },
              { value: 'buildSell', label: 'Build and sell — exit at or near CO',     sub: 'Prioritize visual impact per dollar', cost: 0 },
            ]}
            value={qAnswers.buyHold}
            onChange={v => {
              setQAnswers(a => ({ ...a, buyHold: v }));
              setQDirty(d => new Set(d).add('buyHold'));
            }}
          />

          <QuestionCard
            question="Should switches and dimmers be included in our budget or in the electrical contractor's scope?"
            note="Switches and dimmers are sometimes self-performed by the EC. Clarifying this upfront prevents budget gaps or overlaps."
            options={[
              { value: 'ourScope', label: 'Include in ILC / lighting budget',           sub: 'We spec and supply switches/dimmers', cost: 0 },
              { value: 'ecScope',  label: "Electrical contractor's scope",               sub: 'EC supplies and installs; exclude from our budget', cost: 0 },
              { value: 'tbd',      label: 'TBD — to be determined',                     cost: 0 },
            ]}
            value={qAnswers.switchesDimmers}
            onChange={v => {
              setQAnswers(a => ({ ...a, switchesDimmers: v }));
              setQDirty(d => new Set(d).add('switchesDimmers'));
            }}
          />

          {/* Sales tax is now entered as a numeric % in the Freight, Warehousing & Tax section above */}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-3 pt-2">
        <Button variant="amber" size="lg" loading={saving} onClick={() => handleSave(true)}>
          Save & Continue to Units
        </Button>
        <Button variant="secondary" onClick={() => handleSave(false)} disabled={saving}>
          Save Draft
        </Button>
        {saved && !saving && (
          <span className="text-sm text-green-600 flex items-center gap-1">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            Saved
          </span>
        )}
      </div>
    </div>
  );
}
