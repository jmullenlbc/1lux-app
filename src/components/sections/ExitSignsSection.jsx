'use client';
import { useState, useMemo } from 'react';
import Button from '@/components/ui/Button';
import QuestionCard from './QuestionCard';
import { formatCurrency, calculateBudget } from '@/lib/calculations';
import { PRICING } from '@/lib/pricing';

export default function ExitSignsSection({ responses, projectData, allSections, pricing, onSaveResponses, onNext, onPrev }) {
  // Rates and the SF-per-sign come from the master price sheet — the same
  // numbers the engine charges (calculations.js, designExitSigns).
  const DX = (pricing || PRICING).designExitSigns || {};
  const SIGN_RATES = {
    thermoplastic: DX.thermoplasticPerSign ?? 22,
    mixed:         DX.mixedPerSign         ?? 75,
    edgelit:       DX.edgelitPerSign       ?? 120,
  };
  const sfPerSign = DX.sfPerSign || 5000;

  const [ans, setAns] = useState({
    exitSignType: responses.exitSignType || 'thermoplastic',
  });
  const [saving, setSaving] = useState(false);
  // What each answer costs (+ estimated labor), recomputed live as answers
  // change — local answers only save on Next (Mike 2026-09-13).
  const qc = useMemo(
    () => calculateBudget(projectData, { ...(allSections || {}), corridors: { ...(allSections?.corridors || {}), ...ans } }, pricing || null).questionCosts || {},
    [projectData, allSections, ans, pricing],
  );

  const grossSf    = Number(projectData?.grossSf) || 0;
  const signCount  = grossSf > 0 ? Math.max(1, Math.ceil(grossSf / sfPerSign)) : 0;
  const signRate   = SIGN_RATES[ans.exitSignType] ?? SIGN_RATES.thermoplastic;
  const signTotal  = signCount * signRate;

  async function handleNext() {
    setSaving(true);
    // Merge into corridors section — only touches exitSignType
    await onSaveResponses({ exitSignType: ans.exitSignType });
    setSaving(false);
    onNext();
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Exit Signs</h2>
        <p className="text-slate-500 text-sm mt-1">
          Exit sign type throughout the building. Counts are estimated at 1 exit sign
          per {sfPerSign.toLocaleString()} gross SF. Final count is determined by the egress drawings.
        </p>
      </div>

      {/* Scope summary */}
      <div className="bg-slate-50 rounded-xl border border-slate-200 p-4">
        <div className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">Estimated Scope</div>
        <div className="grid grid-cols-3 gap-4 text-center">
          {[
            { label: 'Gross SF',          value: grossSf > 0 ? grossSf.toLocaleString() : '—' },
            { label: 'Est. Exit Signs',   value: signCount || '—' },
            { label: 'Est. Cost',         value: signTotal > 0 ? formatCurrency(signTotal) : '—' },
          ].map(item => (
            <div key={item.label} className="bg-white rounded-lg border border-slate-100 p-3">
              <div className="text-xl font-bold text-slate-900">{item.value}</div>
              <div className="text-xs text-slate-500 mt-0.5">{item.label}</div>
            </div>
          ))}
        </div>
        <p className="text-xs text-slate-400 mt-3">
          1 exit sign per {sfPerSign.toLocaleString()} gross SF is a conservative estimate.
          Enter Gross SF in Project Data to see a count.
        </p>
      </div>

      <QuestionCard
        question="Exit sign type?"
        note={`${signCount > 0 ? `~${signCount} exit sign${signCount !== 1 ? 's' : ''} estimated for this project. ` : ''}Thermoplastic is the standard code-compliant option at lowest cost. Edge-lit is slim and design-forward. Mixed is the best balance for buildings with a back-of-house garage.`}
        costSuffix=" total"
        options={[
          {
            value: 'thermoplastic',
            label: 'Thermoplastic',
            sub:   `~$${SIGN_RATES.thermoplastic} ea — code-compliant, bulkier housing; use throughout`,
            cost:  signCount * SIGN_RATES.thermoplastic,
          },
          {
            value: 'mixed',
            label: 'Mixed — Edge-lit FOH + Thermoplastic BOH/Garage',
            sub:   `~$${SIGN_RATES.mixed} ea blended avg — design-forward in lobbies/corridors, code-min in BOH`,
            cost:  signCount * SIGN_RATES.mixed,
          },
          {
            value: 'edgelit',
            label: 'Edge-lit everywhere',
            sub:   `~$${SIGN_RATES.edgelit} ea — cleanest appearance throughout; highest cost`,
            cost:  signCount * SIGN_RATES.edgelit,
          },
        ]}
        value={ans.exitSignType} impact={qc['corridors.exitSignType']}
        onChange={v => setAns(a => ({ ...a, exitSignType: v }))}
      />

      <div className="flex gap-3 pt-2">
        <Button variant="secondary" onClick={onPrev}>Back</Button>
        <Button variant="amber" size="lg" loading={saving} onClick={handleNext}>
          Save &amp; Continue
        </Button>
      </div>
    </div>
  );
}
