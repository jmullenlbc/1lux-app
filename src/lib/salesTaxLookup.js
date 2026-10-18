/**
 * Estimated sales tax by zip where a free public lookup exists (Mike 10-17:
 * "Anything that is easy do as zip code and anything else do as an
 * estimate"). Today that is Washington, whose Department of Revenue answers
 * a zip code with the combined rate, no key. Every other state falls back to
 * the table in salesTaxEstimate.js. Server only.
 */
import { estimatedSalesTaxPct, salesTaxBasis, zipLookupState } from '@/lib/salesTaxEstimate';

const cache = new Map();

/** { pct: '10.55', basis: 'zip' | 'exact' | 'average' | '' } */
export async function lookupSalesTax({ state, zip }) {
  const st = String(state || '').trim().toUpperCase();
  const z = String(zip || '').trim().slice(0, 5);
  const fallback = { pct: estimatedSalesTaxPct(st), basis: salesTaxBasis(st) };
  if (!zipLookupState(st) || !/^\d{5}$/.test(z)) return fallback;
  const key = `${st}:${z}`;
  if (cache.has(key)) return cache.get(key);
  try {
    const res = await fetch(`https://webgis.dor.wa.gov/webapi/AddressRates.aspx?output=text&addr=&city=&zip=${z}`, {
      signal: AbortSignal.timeout(6000),
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    // "LocationCode=1726 Rate=.1055 ResultCode=5"; a bad zip answers Rate=-1.
    const m = /\bRate=(-?[\d.]+)/.exec(await res.text());
    const rate = m ? Number(m[1]) : NaN;
    if (!(rate > 0 && rate < 0.15)) return fallback;
    const out = { pct: String(Math.round(rate * 10000) / 100), basis: 'zip' };
    cache.set(key, out);
    return out;
  } catch {
    return fallback;
  }
}
