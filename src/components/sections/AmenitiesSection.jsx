'use client';
import { useState } from 'react';
import { useLiveAnswers } from "@/components/wizard/useLiveAnswers";
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import InteriorTierPicker from '@/components/sections/InteriorTierPicker';
import { formatCurrency } from '@/lib/calculations';
import { PRICING } from '@/lib/pricing';
import { INTERIOR_AMENITY_RATES } from '@/lib/interiorAmenityTiers';

export default function AmenitiesSection({ responses, projectData, pricing, onSaveResponses, onNext, onPrev, onLiveAnswers }) {
  const P = pricing || PRICING;
  const [answers, setAnswers] = useState({
    interiorLevel: responses.interiorLevel || '10',
    manualAdder:   responses.manualAdder   ?? '',
  });
  const [dirty, setDirty] = useState(() => new Set());
  const [saving, setSaving] = useState(false);
  useLiveAnswers(onLiveAnswers, "amenities", answers); // Mike 10-15: sidebar moves before Next

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
          Budget: <strong>{formatCurrency(intSf * selectedRate)}</strong>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <p className="font-semibold text-slate-900 mb-1">
          Choose the $/SF rate based on your project's finish level.
        </p>
        <p className="text-xs text-slate-400 mb-5">
          Interior amenities range from $4/SF (garden walk-up) to $16/SF (high-end mid-rise or high-rise), in three finish tiers.
        </p>

        {/* A project priced by an old named level (low/medium/high) highlights the
            matching dollar button; picking any button saves a number from then on. */}
        <InteriorTierPicker
          value={String(selectedRate)}
          onChange={rate => {
            setAnswers(a => ({ ...a, interiorLevel: rate }));
            setDirty(d => new Set(d).add('interiorLevel'));
          }}
        />
        {selectedRate > 0 && !INTERIOR_AMENITY_RATES.includes(selectedRate) && (
          <p className="text-xs text-amber-600 mt-3">
            This project is currently priced at ${selectedRate}/SF, which is outside the $4 to $16 range. Pick a rate above to change it.
          </p>
        )}
      </div>

      {/* Manual adder */}
      <div>
        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Manual Adder</div>
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

      {/* Phones: Back and Next wrap onto two lines when tight (Mike 10-29) */}
      <div className="flex flex-wrap gap-3 pt-2">
        <Button variant="secondary" onClick={onPrev}>Back</Button>
        <Button variant="amber" size="lg" loading={saving} onClick={handleNext}>
          Save & Continue to Exterior
        </Button>
      </div>
    </div>
  );
}
