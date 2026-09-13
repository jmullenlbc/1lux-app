'use client';
import { useState, useMemo } from 'react';
import Button from '@/components/ui/Button';
import QuestionCard from '@/components/sections/QuestionCard';
import { PRICING } from '@/lib/pricing';
import { calculateBudget } from '@/lib/calculations';

export default function DesignInteriorAmenitiesSection({
  responses,
  projectData,
  allSections,
  pricing,
  onSaveResponses,
  onNext,
  onPrev,
}) {
  const P = pricing || PRICING;
  const existing = responses || {};
  const [ans, setAns] = useState({
    interiorLevel: existing.interiorLevel || 'medium',
  });
  const [saving, setSaving] = useState(false);
  // What the chosen answer costs, recomputed live (Mike 2026-09-13).
  const qc = useMemo(
    () => calculateBudget(projectData, { ...(allSections || {}), amenities: { ...(allSections?.amenities || {}), ...ans } }, pricing || null).questionCosts || {},
    [projectData, allSections, ans, pricing],
  );

  const intAmenitySf = Number(projectData?.interiorAmenitySf) || 0;
  const rateMap = {
    low:    P.interiorAmenities?.low    ?? 6,
    medium: P.interiorAmenities?.medium ?? 10,
    high:   P.interiorAmenities?.high   ?? 16,
  };
  const liveTotal = intAmenitySf * (rateMap[ans.interiorLevel] ?? rateMap.medium);

  async function handleNext() {
    setSaving(true);
    await onSaveResponses({ ...existing, ...ans });
    setSaving(false);
    onNext();
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Interior Amenities</h2>
        <p className="text-slate-500 text-sm mt-1">
          Lobby, clubhouse, fitness center, co-working spaces, mail rooms, and other
          non-residential interior common areas.
        </p>
      </div>

      {/* Scope */}
      <div className="bg-slate-50 rounded-xl border border-slate-200 p-4">
        <div className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">Amenity Scope</div>
        <div className="grid grid-cols-2 gap-3 text-center max-w-xs">
          <div className="bg-white rounded-lg border border-slate-100 p-3">
            <div className="text-xl font-bold text-slate-900">
              {intAmenitySf > 0 ? intAmenitySf.toLocaleString() : '—'}
            </div>
            <div className="text-xs text-slate-500 mt-0.5">Interior Amenity SF</div>
          </div>
          {intAmenitySf > 0 && (
            <div className="bg-white rounded-lg border border-slate-100 p-3">
              <div className="text-xl font-bold text-amber-700">
                ${liveTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div className="text-xs text-slate-500 mt-0.5">Est. Amenity Product</div>
            </div>
          )}
        </div>
        {intAmenitySf === 0 && (
          <p className="text-xs text-slate-400 mt-2">
            Enter Interior Amenity SF in Project Data to see live estimates.
          </p>
        )}
      </div>

      <QuestionCard
        question="What level of interior amenity lighting design?"
        note={`Rate applied to ${intAmenitySf > 0 ? intAmenitySf.toLocaleString() + ' SF of' : ''} interior amenity space. Includes lobby, clubhouse, fitness, co-working, and similar spaces. Does not include corridors (handled separately).`}
        costSuffix=" total"
        options={[
          {
            value: 'low',
            label:  `$${rateMap.low}/SF — Low Finish`,
            sub:    'Garden walk-up, surface park — simple lobby and basic amenity lighting',
            cost:   intAmenitySf * rateMap.low,
          },
          {
            value: 'medium',
            label:  `$${rateMap.medium}/SF — Medium Finish`,
            sub:    'Standard mid-market multifamily — mix of decorative and functional lighting',
            cost:   intAmenitySf * rateMap.medium,
          },
          {
            value: 'high',
            label:  `$${rateMap.high}/SF — High Finish`,
            sub:    'High-end mid-rise or high-rise — significant decorative, accent, and architectural lighting',
            cost:   intAmenitySf * rateMap.high,
          },
        ]}
        value={ans.interiorLevel}
        impact={qc['amenities.interiorLevel']}
        onChange={v => setAns(a => ({ ...a, interiorLevel: v }))}
      />

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-xs text-blue-800">
        <p className="font-semibold mb-1">What&apos;s Included</p>
        <ul className="space-y-0.5 list-disc list-inside">
          <li>Lobby / entry vestibule</li>
          <li>Clubroom / leasing lounge</li>
          <li>Fitness center</li>
          <li>Co-working / study rooms</li>
          <li>Mail / package rooms</li>
          <li>Trash / recycling rooms (if FOH-finished)</li>
        </ul>
        <p className="mt-2 text-blue-700">
          BOH spaces (mechanical, bike storage, utility) are billed separately at a flat
          $1.85/SF via the BOH line.
        </p>
      </div>

      <div className="flex gap-3 pt-2">
        <Button variant="secondary" onClick={onPrev}>Back</Button>
        <Button variant="amber" size="lg" loading={saving} onClick={handleNext}>
          Save &amp; Continue to Exterior
        </Button>
      </div>
    </div>
  );
}
