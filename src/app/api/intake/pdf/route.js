import { NextResponse } from 'next/server';
import { requirePublicBudgetAccess } from '@/lib/publicAccess';
import { rateLimit, clientIp } from '@/lib/rateLimit';
import { checkLocation } from '@/lib/usStates';
import { answersToMap } from '@/lib/intake/quantities';
import { publicIntakeEstimate, intakeEstimateGate } from '@/lib/intake/estimate';
import { buildIntakePdfHtml, intakePdfFilename } from '@/lib/intake/pdfHtml';
import { loadPricing } from '@/lib/pricingLoader';
import { loadAdoptedGuesses } from '@/lib/calibration/figureNormsLoad';
import { htmlToPdf } from '@/lib/pdf';

export const dynamic = 'force-dynamic';

/**
 * PUBLIC, UNAUTHENTICATED "Download PDF" for the /conceptual_budget review
 * step (2026-09-12).
 *
 * The browser sends the same inputs it sends /api/intake/estimate, answers
 * and drawings, plus the project name and location. It never sends a
 * number: the budget is recomputed here with publicIntakeEstimate(), the
 * same function the live estimate uses, so a doctored request can't put a
 * made-up figure on a Logiq branded page.
 *
 * What the PDF may show is decided in src/lib/intake/pdfHtml.js: only what
 * the on-screen summary already shows the visitor. The project name is the
 * only free text, and it is escaped, this HTML is rendered by a real browser
 * on our server, so an unescaped tag could make it fetch anything.
 *
 * Chromium is heavy, so the limit is tighter than the estimate route's.
 * Registered in next.config.mjs + scripts/check-runtime-assets.mjs (chromium).
 */

const LIMIT = { limit: 5, windowMs: 60_000 };
const MAX_PAYLOAD_CHARS = 200_000; // same ceiling as the estimate and submit routes

/** The visitor's own time zone for the date line, if it is a real one. */
function safeTimeZone(tz) {
  if (typeof tz !== 'string' || tz.length > 64) return undefined;
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return tz; } catch { return undefined; }
}

export async function POST(req) {
  const access = await requirePublicBudgetAccess();
  if (access.error) return access.error;
  const ip = clientIp(req);
  const gate = rateLimit(`intake-pdf:${ip}`, LIMIT);
  if (!gate.allowed) {
    return NextResponse.json(
      { error: 'Too many downloads. Please wait a moment and try again.' },
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
    return NextResponse.json({ error: 'Request is too large.' }, { status: 413 });
  }

  const { projectName, answers, drawings } = body || {};
  const name = String(projectName ?? '').trim().replace(/\s+/g, ' ').slice(0, 300);
  if (!name) {
    return NextResponse.json({ error: 'Please add a project name first.' }, { status: 422 });
  }
  const loc = checkLocation({ city: body.city, state: body.state, zip: body.zip });
  if (!loc.ok) {
    return NextResponse.json({ error: `Please check the project location: ${loc.missing.join(', ')}.` }, { status: 422 });
  }
  if (!intakeEstimateGate(answers, drawings).ready) {
    return NextResponse.json({ error: 'Add your drawings or building data first, then try again.' }, { status: 422 });
  }

  try {
    const pricing = await loadPricing();
    // The PUBLIC projection: the PDF goes to the same visitor the page does, so
    // it gets the same formula-free budget (no "priced at 2.3× conventional").
    const { budget, projectData } = publicIntakeEstimate({ answers, drawings, pricing, adopted: await loadAdoptedGuesses() });
    // Same test the review step uses before it shows a budget at all.
    if (!budget || !((projectData?.grossSf || 0) > 0)) {
      return NextResponse.json({ error: 'We need a little more building information before we can make a PDF.' }, { status: 422 });
    }

    const html = buildIntakePdfHtml({
      projectName: name,
      location:    `${loc.city}, ${loc.state} ${loc.zip}`,
      buildingType: answersToMap(answers).projectType,
      budget,
      projectData,
      answers: answersToMap(answers),
      dateLabel: new Date().toLocaleDateString('en-US', {
        year: 'numeric', month: 'long', day: 'numeric', timeZone: safeTimeZone(body.timeZone),
      }),
    });

    const pdf = await htmlToPdf(html, { landscape: false, margin: { top: '0.5in', right: '0.6in', bottom: '0.5in', left: '0.6in' } });
    return new NextResponse(pdf, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${intakePdfFilename(name)}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    // Details stay in the log, a public visitor gets a plain sentence.
    console.error('[intake/pdf]', err);
    return NextResponse.json({ error: 'We couldn’t make the PDF just now. Please try again in a minute.' }, { status: 500 });
  }
}
