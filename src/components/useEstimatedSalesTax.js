'use client';
import { useEffect, useRef, useState } from 'react';
import { estimatedSalesTaxPct, nextTaxBoxFor, salesTaxBasis, zipLookupState } from '@/lib/salesTaxEstimate';

/**
 * Keeps an "Estimated sales tax" box filled from the project location, on the
 * New Project form and the public tool alike: the state table at once, then
 * the zip code's rate where a free lookup exists. A rate the user typed is
 * never replaced. `setTax` takes an updater (current box → next box).
 * Returns the basis ('zip' | 'exact' | 'average' | '') for the hint.
 */
export function useEstimatedSalesTax(state, zip, setTax) {
  const lastRef = useRef('');
  const [basis, setBasis] = useState(() => salesTaxBasis(state));
  useEffect(() => {
    const place = (est, b) => {
      if (!est) return;
      setBasis(b);
      setTax(cur => {
        const next = nextTaxBoxFor(cur, lastRef.current, est);
        if (next === est) lastRef.current = est;
        return next;
      });
    };
    place(estimatedSalesTaxPct(state), salesTaxBasis(state));
    const z = String(zip || '').trim().slice(0, 5);
    if (!zipLookupState(state) || !/^\d{5}$/.test(z)) return undefined;
    let live = true;
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/sales-tax?state=${encodeURIComponent(String(state).trim())}&zip=${z}`);
        const d = r.ok ? await r.json() : null;
        if (live && d?.pct) place(d.pct, d.basis);
      } catch { /* keep the state estimate */ }
    }, 400);
    return () => { live = false; clearTimeout(t); };
  }, [state, zip]); // eslint-disable-line react-hooks/exhaustive-deps
  return basis;
}
