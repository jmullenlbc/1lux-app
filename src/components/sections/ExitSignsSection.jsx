'use client';
import { useState } from 'react';
import Button from '@/components/ui/Button';
import QuestionCard from './QuestionCard';
import { formatCurrency } from '@/lib/calculations';

const SIGN_RATES = { thermoplastic: 22, mixed: 75, edgelit: 127 };

export default function ExitSignsSection({ responses, projectData, onSaveResponses, onNext, onPrev }) {
  const [ans, setAns] = useState({
    exitSignType: responses.exitSignType || 'thermoplastic',
  });
  const [saving, setSaving] = useState(false);

  const grossSf    = Number(projectData?.grossSf) || 0;
  const signCount  = grossSf > 0 ? Math.max(1, Math.ceil(grossSf / 5000)) : 0;
  const signRate   = SIGN_RATES[ans.exitSignType] ?? 22;
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
          per 5,000 gross SF. Final count is determined by the egress drawings.
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
          1 exit sign per 5,000 gross SF is a conservative estimate.
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
            sub:   '~$22 ea — code-compliant, bulkier housing; use throughout',
            cost:  signCount * 22,
          },
          {
            value: 'mixed',
            label: 'Mixed — Edge-lit FOH + Thermoplastic BOH/Garage',
            sub:   '~$75 ea blended avg — design-forward in lobbies/corridors, code-min in BOH',
            cost:  signCount * 75,
          },
          {
            value: 'edgelit',
            label: 'Edge-lit everywhere',
            sub:   '~$127 ea — cleanest appearance throughout; highest cost',
            cost:  signCount * 127,
          },
        ]}
        value={ans.exitSignType}
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
