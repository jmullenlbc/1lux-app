'use client';
import { useState } from 'react';
import Button from '@/components/ui/Button';
import QuestionCard from '@/components/sections/QuestionCard';

export default function DesignCommonSection({
  responses,          // { corridors: {...}, emergency: {...} }
  projectData,
  onSaveMultiSection, // fn({ corridors: {...}, emergency: {...} }) → promise
  onNext,
  onPrev,
}) {
  const corridorResp  = responses.corridors  || {};
  const emergencyResp = responses.emergency  || {};

  const [corr, setCorr] = useState({
    unitSconce:    corridorResp.unitSconce    || 'none',
    corridorLevel: corridorResp.corridorLevel || 'code',
    exitSignType:  corridorResp.exitSignType  || 'thermoplastic',
    // Carry through any existing keys so we don't wipe stairwell data etc.
  });
  const [emerg, setEmerg] = useState({
    strategy: emergencyResp.strategy || 'integrated_inverters',
    hasGenerator: emergencyResp.hasGenerator || 'no',
  });
  const [saving, setSaving] = useState(false);

  function setC(k, v) { setCorr(c  => ({ ...c,  [k]: v })); }
  function setE(k, v) { setEmerg(e => ({ ...e, [k]: v })); }

  const corridorSf   = Number(projectData?.corridorSf)       || 0;
  const intAmenitySf = Number(projectData?.interiorAmenitySf)|| 0;
  const garageSf     = Number(projectData?.garageSf)         || 0;
  const grossSf      = Number(projectData?.grossSf)          || 0;
  const numUnits     = Number(projectData?.numUnits)         || 0;

  // When generator is selected, override strategy to 'generator'
  function handleGeneratorChange(val) {
    setE('hasGenerator', val);
    if (val === 'yes') setE('strategy', 'generator');
    else if (emerg.strategy === 'generator') setE('strategy', 'integrated_inverters');
  }

  async function handleNext() {
    setSaving(true);
    // Persist corridor keys including any carry-through keys from existing responses
    const corridorSave = { ...corridorResp, ...corr };
    const emergencySave = {
      ...emergencyResp,
      strategy: emerg.hasGenerator === 'yes' ? 'generator' : emerg.strategy,
      hasGenerator: emerg.hasGenerator,
    };
    await onSaveMultiSection({ corridors: corridorSave, emergency: emergencySave });
    setSaving(false);
    onNext();
  }

  const hasGenerator = emerg.hasGenerator === 'yes';

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Common Areas</h2>
        <p className="text-slate-500 text-sm mt-1">
          Corridors, stairwells, emergency egress, exit signs, and garage lighting.
        </p>
      </div>

      {/* Scope */}
      {(corridorSf > 0 || intAmenitySf > 0 || garageSf > 0) && (
        <div className="bg-slate-50 rounded-xl border border-slate-200 p-4">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">Common Area Scope</div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
            {[
              { label: 'Corridor SF',     value: corridorSf   > 0 ? corridorSf.toLocaleString()   : '—' },
              { label: 'Interior Amenity',value: intAmenitySf > 0 ? intAmenitySf.toLocaleString() : '—' },
              { label: 'Garage SF',       value: garageSf     > 0 ? garageSf.toLocaleString()     : '—' },
              { label: 'Total Units',     value: numUnits || '—' },
            ].map(item => (
              <div key={item.label} className="bg-white rounded-lg border border-slate-100 p-3">
                <div className="text-xl font-bold text-slate-900">{item.value}</div>
                <div className="text-xs text-slate-500 mt-0.5">{item.label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── CORRIDORS ──────────────────────────────────────────────────── */}
      <div>
        <div className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">Corridors & Stairwells</div>
        <div className="space-y-4">

          <QuestionCard
            question="Corridor lighting design approach?"
            note={`Base rate is $0.27/SF (7" disk at ~10ft spacing). Elevated design adds focal moments — end-of-corridor lighting, art lighting, or more decorative downlights.${corridorSf > 0 ? ` (${corridorSf.toLocaleString()} SF)` : ''}`}
            options={[
              { value: 'code',     label: 'Code minimum',      sub: '$0.27/SF — functional 7" disks at spacing',         cost: 0    },
              { value: 'elevated', label: 'Elevated design',   sub: '$0.52/SF — adds end-of-corridor & accent lighting', cost: 0.25 },
            ]}
            value={corr.corridorLevel}
            onChange={v => setC('corridorLevel', v)}
            costSuffix="/SF"
          />

          <QuestionCard
            question="Unit-entry sconce?"
            note={`A sconce at each unit's front door creates a residential feel and helps tenants identify their unit. ${numUnits > 0 ? `(${numUnits} units)` : ''}`}
            options={[
              { value: 'none',       label: 'None',                               cost: 0   },
              { value: 'low',        label: 'Sconce — Low Finish',     sub: '$55 ea',   cost: 55  },
              { value: 'medium',     label: 'Sconce — Medium Finish',  sub: '$125 ea',  cost: 125 },
              { value: 'high',       label: 'Sconce — High Finish',    sub: '$300 ea',  cost: 300 },
              { value: 'integrated', label: 'Integrated Unit # + Light', sub: '$200 ea', cost: 200 },
            ]}
            value={corr.unitSconce}
            onChange={v => setC('unitSconce', v)}
            costSuffix="/unit"
          />

        </div>
      </div>

      {/* ── EXIT SIGNS ─────────────────────────────────────────────────── */}
      <div>
        <div className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">Exit Signs</div>
        <div className="space-y-4">

          <QuestionCard
            question="Exit sign type?"
            note={`Thermoplastic meets code at the lowest cost. Edge-lit is cleaner and nearly flush — better for design-forward buildings. ${grossSf > 0 ? `Approx. ${Math.max(1, Math.ceil(grossSf / 5000))} signs for this project.` : ''}`}
            options={[
              { value: 'thermoplastic', label: 'Thermoplastic',  sub: '~$30 ea — code-compliant, bulkier profile',    cost: 30  },
              { value: 'edgelit',       label: 'Edge-lit',        sub: '~$130 ea — low-profile, premium appearance',  cost: 130 },
            ]}
            value={corr.exitSignType}
            onChange={v => setC('exitSignType', v)}
            costSuffix="/sign"
          />

        </div>
      </div>

      {/* ── EMERGENCY LIGHTING ──────────────────────────────────────────── */}
      <div>
        <div className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">Emergency / Egress Lighting</div>
        <div className="space-y-4">

          <QuestionCard
            question="Will there be a building generator for emergency lighting?"
            note="If a generator is provided, emergency lighting is powered through the normal circuit with no additional backup fixtures required."
            options={[
              { value: 'no',  label: 'No generator — need independent backup strategy', cost: 0 },
              { value: 'yes', label: 'Yes — generator covers all emergency lighting',   cost: 0 },
            ]}
            value={emerg.hasGenerator}
            onChange={handleGeneratorChange}
          />

          {!hasGenerator && (
            <QuestionCard
              question="Emergency lighting strategy?"
              note="Without a generator, egress lighting needs independent battery backup. Integrated batteries in fixtures are the cleanest approach. Frogeyes are visible but less expensive."
              options={[
                { value: 'frogeyes',             label: 'Frogeyes everywhere',                          sub: 'Corridors $0.15/SF + amenity $0.15/SF + garage $0.10/SF', cost: 0 },
                { value: 'frogeyes_inv',          label: 'Frogeyes in corridors + inverters in amenities', sub: 'Corridors $0.15/SF + amenity $1.25/SF',                 cost: 0 },
                { value: 'integrated_frogeyes',   label: 'Integrated batteries (garage) + frogeyes (corridors) + inverters (amenity)', sub: 'Cleanest for garage',     cost: 0 },
                { value: 'integrated_inverters',  label: 'Integrated batteries (garage) + inverters (corridors + amenity)',            sub: 'Best performance — recommended', cost: 0 },
                { value: 'inverters',             label: 'Central inverter system everywhere',           sub: 'Highest cost, best optics',                             cost: 0 },
              ]}
              value={emerg.strategy}
              onChange={v => setE('strategy', v)}
            />
          )}

        </div>
      </div>

      <div className="flex gap-3 pt-2">
        <Button variant="secondary" onClick={onPrev}>Back</Button>
        <Button variant="amber" size="lg" loading={saving} onClick={handleNext}>
          Save & Continue to Exterior
        </Button>
      </div>
    </div>
  );
}
