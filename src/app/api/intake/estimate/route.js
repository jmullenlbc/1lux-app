import { NextResponse } from 'next/server';
import { rateLimit, clientIp } from '@/lib/rateLimit';
import { answersToEngine } from '@/lib/intake/questionnaire';
import { computeQuantities } from '@/lib/intake/quantities';
import { calculateBudget } from '@/lib/calculations';
import { loadPricing } from '@/lib/pricingLoader';

export const dynamic = 'force-dynamic';

/**
 * PUBLIC, UNAUTHENTICATED live-estimate endpoint for /conceptual_budget.
 *
 * The public page shows the same live budget sidebar the internal wizard has,
 * but the internal wizard computes client-side with the full PRICING model in
 * the bundle. That model is ILC's cost book — it must not ship to a public
 * visitor's browser. So the public page POSTs its answers here and gets back
 * ONLY the computed budget object; the pricing stays on the server.
 *
 * The math is deliberately not a copy: answers map through answersToEngine()
 * into the same sections shape the internal wizard saves, quantities come
 * from the same computeQuantities() takeoff the reviewer sees, and both feed
 * the one validated engine. If this estimate and the internal budget for the
 * same inputs ever disagree, something upstream broke.
 *
 * @see src/lib/intake/questionnaire.js — the verbatim answers + engine maps
 * @see src/lib/intake/quantities.js    — drawings → counts and square footage
 * @see src/lib/calculations.js         — the engine
 */

const LIMIT = { limit: 30, windowMs: 60_000 }; // fires on every answer change, debounced client-side
const MAX_PAYLOAD_CHARS = 200_000;             // same ceiling as the submit route

/** A stated, usable number — or null (Number(null) is 0, hence the dance). */
function num(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export async function POST(req) {
  const ip = clientIp(req);
  const gate = rateLimit(`intake-estimate:${ip}`, LIMIT);
  if (!gate.allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Please wait a moment.' },
      { status: 429, headers: { 'Retry-After': String(gate.retryAfterSec) } },
    );
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
  if (JSON.stringify(body).length > MAX_PAYLOAD_CHARS) {
    return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
  }

  const { answers, drawings } = body || {};

  // Drawings → quantities (null stays null: "the drawing did not say").
  const rows = computeQuantities(drawings || null, answers || null);
  const q = {};
  for (const r of rows) if (r && r.key) q[r.key] = r.value;

  const { sections, buildingTypeKey } = answersToEngine(answers);

  const pd = {
    grossSf:             num(q.grossSf),
    unitsSf:             num(q.unitsSf),
    numUnits:            num(q.totalUnits),
    numBalconies:        num(q.balconies),
    numVanities:         num(q.vanities),
    numBathrooms:        num(q.bathrooms),
    corridorSf:          num(q.corridorSf),
    interiorAmenitySf:   num(q.interiorAmenitySf),
    exteriorAmenitySf:   num(q.exteriorAmenitySf),
    garageSf:            num(q.garageSf),
    bohSf:               num(q.bohSf),
    numEgressStairwells: num(q.egressStairwells),
    numSurfaceParking:   num(q.surfaceParking),
    numCarports:         num(q.carports),
    numGarages:          num(q.garages),
    lotSf:               num(q.lotSf),
    buildingFootprintSf: num(q.buildingFootprintSf),
    buildingTypeKey:     buildingTypeKey || undefined,
    // Sales tax is unknown at intake; the reviewed budget adds it later.
  };

  const pricing = await loadPricing();
  const budget = calculateBudget(pd, sections, pricing);

  // The budget object is derived output (the visitor's own numbers) — the
  // pricing model itself never leaves the server.
  return NextResponse.json({ budget, projectData: pd });
}
