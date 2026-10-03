'use client';
import { useState, useMemo, useRef } from 'react';
import QuestionCard from './QuestionCard';
import { calculateBudget } from '@/lib/calculations';
import { PRICING } from '@/lib/pricing';

/**
 * Townhomes and single-family homes (Mike 10-2): the balcony question lives on
 * the "Front Door & Back Balcony" page instead of Residential Units. The answer
 * is still the Units `balcony` / `balconyPrice` (same price, same engine line),
 * so it saves straight into the units section as it changes.
 */
export default function BackBalconyQuestion({ projectData, allSections, pricing, onSaveUnits }) {
  const P = pricing || PRICING;
  const units = allSections?.units || {};
  const [balcony, setBalcony] = useState(units.balcony || 'none');
  const [price, setPrice] = useState(units.balconyPrice ?? '');
  const timer = useRef(null);
  const numBalconies = Number(projectData?.numBalconies) || 0;

  const qc = useMemo(
    () => calculateBudget(projectData, { ...(allSections || {}), units: { ...units, balcony, balconyPrice: price } }, pricing || null).questionCosts || {},
    [projectData, allSections, units, balcony, price, pricing],
  );

  const save = patch => onSaveUnits?.({ ...units, balcony, balconyPrice: price, ...patch });

  return (
    <QuestionCard
      question="How do you want to light the back balconies?"
      note={`${numBalconies > 0 ? `${numBalconies} back balconies in Project Data` : 'Enter the # of balconies in Project Data to see the cost'}. A small surface-mount disk is the budget option. Cost shown is the net adder per balcony.`}
      costSuffix="/balcony"
      options={[
        { value: 'none',         label: 'None',                              cost: P.balcony.none.product },
        { value: 'disk5inch',    label: '5" surface mount disk',             sub: 'Included in base',  cost: P.balcony.disk5inch.product },
        { value: 'sconcelow',    label: 'Back balcony sconce (Low finish)',    sub: 'budget priority',   cost: P.balcony.sconcelow.product },
        { value: 'sconceMedium', label: 'Back balcony sconce (Medium finish)', sub: 'standard priority', cost: P.balcony.sconceMedium.product },
        { value: 'sconceHigh',   label: 'Back balcony sconce (High finish)',   sub: 'premium priority',  cost: P.balcony.sconceHigh.product },
      ]}
      value={balcony}
      onChange={v => { setBalcony(v); save({ balcony: v }); }}
      impact={qc['units.balcony']}
      override={{
        value:       price,
        onChange:    v => {
          setPrice(v);
          clearTimeout(timer.current);
          timer.current = setTimeout(() => save({ balconyPrice: v }), 600);
        },
        masterPrice: P.balcony[balcony]?.product,
        suffix:      '/balcony',
        disabled:    balcony === 'none',
      }}
    />
  );
}
