'use client';
import { useState, useMemo, useRef } from 'react';
import QuestionCard from './QuestionCard';
import { calculateBudget } from '@/lib/calculations';
import { PRICING } from '@/lib/pricing';

/**
 * Townhomes and single-family homes (Mike 10-2): no Corridors page, so the
 * front door sconce is asked on Residential Units. The answer is still the
 * corridors `unitSconce` / `unitSconcePrice` (same price, same engine line),
 * so it saves straight into the corridors section as it changes.
 */
export default function FrontDoorQuestion({ projectData, allSections, pricing, onSaveCorridors }) {
  const P = pricing || PRICING;
  const corridors = allSections?.corridors || {};
  const [sconce, setSconce] = useState(corridors.unitSconce || 'none');
  const [price, setPrice] = useState(corridors.unitSconcePrice ?? '');
  const timer = useRef(null);
  const numUnits = Number(projectData?.numUnits) || 0;

  const rates = {
    none:       P.corridorSconce?.none?.product       ?? 0,
    low:        P.corridorSconce?.low?.product        ?? 55,
    medium:     P.corridorSconce?.medium?.product     ?? 125,
    high:       P.corridorSconce?.high?.product       ?? 300,
    integrated: P.corridorSconce?.integrated?.product ?? 200,
  };

  const qc = useMemo(
    () => calculateBudget(projectData, { ...(allSections || {}), corridors: { ...corridors, unitSconce: sconce, unitSconcePrice: price } }, pricing || null).questionCosts || {},
    [projectData, allSections, corridors, sconce, price, pricing],
  );

  const save = patch => onSaveCorridors?.({ ...corridors, unitSconce: sconce, unitSconcePrice: price, ...patch });

  return (
    <QuestionCard
      question="Would you like a sconce at every front door?"
      note={`One sconce on the front of each home, by the door. The integrated option includes the house number. ${numUnits > 0 ? `(${numUnits} homes)` : ''}`}
      costSuffix="/home"
      options={[
        { value: 'none',       label: 'None',                                cost: rates.none },
        { value: 'low',        label: '1 sconce (Low finish)',    sub: `$${rates.low} ea`,        cost: rates.low },
        { value: 'medium',     label: '1 sconce (Medium finish)', sub: `$${rates.medium} ea`,     cost: rates.medium },
        { value: 'high',       label: '1 sconce (High finish)',   sub: `$${rates.high} ea`,       cost: rates.high },
        { value: 'integrated', label: '1 Integrated house number/light', sub: `$${rates.integrated} ea`, cost: rates.integrated },
      ]}
      value={sconce}
      onChange={v => { setSconce(v); save({ unitSconce: v }); }}
      impact={qc['corridors.unitSconce']}
      override={{
        value:       price,
        onChange:    v => {
          setPrice(v);
          clearTimeout(timer.current);
          timer.current = setTimeout(() => save({ unitSconcePrice: v }), 600);
        },
        masterPrice: rates[sconce],
        suffix:      '/home',
        disabled:    sconce === 'none',
      }}
    />
  );
}
