import { NextResponse } from 'next/server';
import { requirePublicBudgetAccess } from '@/lib/publicAccess';
import { rateLimit, clientIp } from '@/lib/rateLimit';
import { publicIntakeEstimate, intakeEstimateGate } from '@/lib/intake/estimate';
import { loadPricing } from '@/lib/pricingLoader';
import { loadAdoptedGuesses } from '@/lib/calibration/figureNormsLoad';

export const dynamic = 'force-dynamic';

/**
 * PUBLIC, UNAUTHENTICATED live-estimate endpoint for /conceptual_budget.
 *
 * The public page shows the same live budget sidebar the internal wizard has,
 * but the internal wizard computes client-side with the full PRICING model in
 * the bundle. That model is ILC's cost book, it must not ship to a public
 * visitor's browser. So the public page POSTs its answers here and gets back
 * ONLY the computed budget object; the pricing stays on the server.
 *
 * The math is deliberately not a copy: answers map through answersToEngine()
 * into the same sections shape the internal wizard saves, quantities come
 * from the same computeQuantities() takeoff the reviewer sees, and both feed
 * the one validated engine. If this estimate and the internal budget for the
 * same inputs ever disagree, something upstream broke.
 *
 * The computation itself lives in src/lib/intake/estimate.js (2026-09-12) so
 * the PDF download at /api/intake/pdf prices from the same function.
 *
 * @see src/lib/intake/estimate.js, gate + answers → budget
 * @see src/lib/intake/questionnaire.js, the verbatim answers + engine maps
 * @see src/lib/intake/quantities.js, drawings → counts and square footage
 * @see src/lib/calculations.js, the engine
 */

const LIMIT = { limit: 30, windowMs: 60_000 }; // fires on every answer change, debounced client-side
const MAX_PAYLOAD_CHARS = 200_000;             // same ceiling as the submit route

export async function POST(req) {
  const access = await requirePublicBudgetAccess();
  if (access.error) return access.error;
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

  // No drawings and no typed-in minimum → no number (and no pricing load).
  if (!intakeEstimateGate(answers, drawings, { provisional: true }).ready) {
    return NextResponse.json({ budget: null, projectData: null, quantities: [] });
  }

  const pricing = await loadPricing();

  // The pricing model never leaves the server, and neither do the formulas
  // (Mike 2026-09-16: "someone could steal all the math"). The public
  // projection keeps labels, the visitor's own quantities and the dollars;
  // counts × price-each, multipliers and "1 pole per 30 ft" stay internal.
  return NextResponse.json(publicIntakeEstimate({ answers, drawings, pricing, adopted: await loadAdoptedGuesses(), provisional: true }));
}
