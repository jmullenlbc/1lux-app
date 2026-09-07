'use client';
import { useState } from 'react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/calculations';
import { PRICING } from '@/lib/pricing';

const INT_RATES = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15];

export default function AmenitiesSection({ responses, projectData, pricing, onSaveResponses, onNext, onPrev }) {
  const P = pricing || PRICING;
  const [answers, setAnswers] = useState({
    interiorLevel: responses.interiorLevel || '10',
    manualAdder:   responses.manualAdder   ?? '',
  });
  const [dirty, setDirty] = useState(() => new Set());
  const [saving, setSaving] = useState(false);

  const intSf    = Number(projectData?.interiorAmenitySf) || 0;
  const selected = answers.interiorLevel;
  // Map legacy named levels to their $/SF rate from master pricing (matches the engine).
  const NAMED_RATES = {
    low:    P.interiorAmenities?.low    ?? 6,
    medium: P.interiorAmenities?.medium ?? 10,
    high:   P.interiorAmenities?.high   ?? 16,
  };
  const selectedRate = NAMED_RATES[selected] ?? (Number(selected) || 0);

  async function handleNext() {
    setSaving(true);
    if (dirty.size > 0) {
      const payload = {};
      for (const key of dirty) {
        payload[key] = answers[key];
      }
      await onSaveResponses(payload);
    }
    setDirty(new Set());
    setSaving(false);
    onNext();
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Interior Amenities</h2>
        <p className="text-slate-500 text-sm mt-1">
          Scope includes: leasing & offices, clubhouse, mail & parcel rooms,
          lobby, public bathrooms, fitness center, co-working, and entry vestibules.
        </p>
      </div>

      {intSf > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
          Interior amenity area: <strong>{intSf.toLocaleString()} SF</strong> ·
          Selected rate: <strong>${selectedRate}/SF</strong> ·
          Estimate: <strong>{formatCurrency(intSf * selectedRate)}</strong>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <p className="font-semibold text-slate-900 mb-1">
          Choose the $/SF rate based on your project's finish level.
        </p>
        <p className="text-xs text-slate-400 mb-5">
          Interior amenities range from $6/SF (garden walk-up) to $16/SF (high-end mid-rise or high-rise).
        </p>

        {/* Rate selector grid */}
        <div className="grid grid-cols-5 gap-2 mb-4">
          {INT_RATES.map(rate => {
            const isSelected = String(selectedRate) === String(rate);
            let finish = '';
            if (rate <= 7)       finish = 'Low';
            else if (rate <= 10) finish = 'Medium';
            else if (rate <= 13) finish = 'Upper Mid';
            else                 finish = 'High End';

            return (
              <button
                key={rate}
                onClick={() => {
                  setAnswers(a => ({ ...a, interiorLevel: String(rate) }));
                  setDirty(d => new Set(d).add('interiorLevel'));
                }}
                className={cn(
                  'rounded-lg border p-3 text-center transition-all',
                  isSelected
                    ? 'border-amber-400 bg-amber-50 shadow-sm'
                    : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50',
                )}
              >
                <div className={cn('text-lg font-bold', isSelected ? 'text-amber-600' : 'text-slate-700')}>
                  ${rate}
                </div>
                <div className="text-xs text-slate-400 mt-0.5">/SF</div>
                <div className={cn('text-xs font-medium mt-1', isSelected ? 'text-amber-500' : 'text-slate-400')}>
                  {finish}
                </div>
              </button>
            );
          })}
        </div>

        {/* Reference guide */}
        <div className="bg-slate-50 rounded-lg p-3 text-xs text-slate-500 space-y-1">
          <div><span className="font-medium text-slate-600">$6–7/SF</span> — Garden walk-up, minimal amenity package</div>
          <div><span className="font-medium text-slate-600">$8–10/SF</span> — Standard mid-market multifamily</div>
          <div><span className="font-medium text-slate-600">$11–13/SF</span> — Upper mid-range, enhanced amenity package</div>
          <div><span className="font-medium text-slate-600">$14–16/SF</span> — High-end mid-rise or high-rise, luxury finishes</div>
        </div>
      </div>

      {/* Manual adder */}
      <div>
        <div className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">Manual Adder</div>
        <Input
          label="Interior Amenities manual adder"
          type="number"
          placeholder="0"
          hint="Add an arbitrary dollar amount to bump the amenities total."
          prefix="$"
          value={answers.manualAdder}
          onChange={e => {
            setAnswers(a => ({ ...a, manualAdder: e.target.value }));
            setDirty(d => new Set(d).add('manualAdder'));
          }}
          min={0}
        />
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
