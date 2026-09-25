/**
 * Notification email to the precon inbox when a public conceptual-budget
 * submission lands.
 *
 * Sends through Amazon SES (same AWS account and credentials as S3). Until
 * the ilcstudios.com domain is verified in the SES console this send will
 * fail — and that MUST be non-fatal: a stranger's submission is never lost
 * because our email wasn't configured. The caller wraps this in try/catch;
 * this module also catches and returns { sent, error } instead of throwing.
 *
 * Env:
 *   INTAKE_NOTIFY_TO   — recipient (default precon@ilcstudios.com)
 *   INTAKE_NOTIFY_FROM — verified SES sender (default noreply@ilcstudios.com)
 *   S3_REGION          — reused for SES (same account, same region)
 */
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { computeQuantities } from './quantities.js';
import { loadPricing } from '../pricingLoader.js';
import { loadAdoptedGuesses } from '../calibration/figureNormsLoad.js';

const TO   = process.env.INTAKE_NOTIFY_TO   || 'precon@ilcstudios.com';
const FROM = process.env.INTAKE_NOTIFY_FROM || 'noreply@ilcstudios.com';

function fmt(n) { return n == null ? '—' : Number(n).toLocaleString('en-US'); }

function summarizeDrawings(drawings) {
  const site = drawings?.siteData || {};
  const matrixUnits = (drawings?.unitTypes || []).reduce((s, t) => s + (Number(t?.qty ?? t?.count) || 0), 0);
  const lines = [
    `Units: ${matrixUnits > 0 ? matrixUnits + ' (unit matrix)' : fmt(site.totalUnits) + ' (site plan)'}`,
    `Gross SF: ${fmt(drawings?.projectTotals?.grossInteriorSf ?? site.grossSf)}`,
    `Buildings: ${fmt(site.buildingCount)}`,
    `Surface parking: ${fmt(site.surfaceParking)}   Garages: ${fmt(site.garages)}   Carports: ${fmt(site.carports)}`,
    `Lot: ${site.lotSf != null ? fmt(site.lotSf) + ' SF' : site.lotAcres != null ? site.lotAcres + ' acres' : '—'}`,
    `Building type: ${site.buildingType || '—'}`,
    `Read confidence: ${drawings?.overallConfidence != null ? Math.round(drawings.overallConfidence * 100) + '%' : '—'}`,
  ];
  return lines.join('\n');
}

/**
 * @param {object} p
 * @param {object} p.submission  — the created ConceptualSubmission row
 * @param {Array}  p.answers     — validated questionnaire rows
 * @param {Array}  p.flags       — computeReviewFlags() output
 * @param {object} p.drawings    — merged drawings data (or null)
 * @returns {Promise<{sent: boolean, error?: string}>}
 */
export async function notifyPrecon({ submission, answers, flags, drawings }) {
  const subject = `New conceptual budget request: ${submission.proposedName}`
    + (flags?.length ? ` (${flags.length} item${flags.length === 1 ? '' : 's'} to verify)` : '');

  // "No drawings" submissions (Mike, 2026-09-11) still get a full takeoff —
  // typed figures plus the ⚠ stand-in guesses for anything left blank.
  const typedIn = Array.isArray(answers) && answers.some(a => a?.questionKey === 'noDrawings' && a?.answer === 'yes');

  const where = [submission.city, submission.state].filter(Boolean).join(', ')
    + (submission.zip ? ` ${submission.zip}` : '');

  const parts = [
    `A new conceptual budget request just came in on app.ilcstudios.com/conceptual_budget.`,
    ``,
    `PROJECT:   ${submission.proposedName}`,
    `LOCATION:  ${where.trim() || '—'}`,
    `FROM:      ${submission.submitterName} <${submission.submitterEmail}>`,
    `COMPANY:   ${submission.submitterDomain}`,
    ``,
    `── What the drawings said ──`,
    drawings ? summarizeDrawings(drawings)
      : typedIn ? 'No drawings — the submitter typed the figures in. Anything marked ⚠ is our estimate.'
      : 'No drawings were uploaded.',
  ];

  // The full quantity takeoff — every count and SF the budget math needs,
  // with a ⚠ on anything that should be verified before it is trusted.
  if (drawings || typedIn) {
    try {
      const pricing = await loadPricing().catch(() => null);
      const quantities = computeQuantities(drawings, answers, pricing, await loadAdoptedGuesses());
      parts.push('', '── Quantity takeoff ──');
      for (const q of quantities) {
        const val = q.value == null ? 'not found' : fmt(q.value);
        parts.push(`${q.flag ? '⚠ ' : '  '}${q.label}: ${val}${q.source === 'derived' ? ' (derived)' : q.source === 'questionnaire' ? ' (from questionnaire)' : ''}`);
        if (q.flag) parts.push(`      ${q.flag}`);
      }
    } catch (e) {
      console.error('intake notify — takeoff failed (non-fatal):', e?.message || e);
    }
  }

  if (flags?.length) {
    parts.push('', '── VERIFY BEFORE TRUSTING ──');
    for (const f of flags) parts.push(`• ${f}`);
  }

  if (answers?.length) {
    parts.push('', '── Questionnaire answers ──');
    let section = null;
    for (const a of answers) {
      if (a.section !== section) { section = a.section; parts.push(`[${section}]`); }
      parts.push(`  ${a.question}  →  ${a.answer}`);
    }
  }

  parts.push('', `Review it: https://app.ilcstudios.com/admin/intake`);

  try {
    // Same credential convention as qcStorage: S3_ACCESS_KEY_ID / S3_SECRET_
    // ACCESS_KEY are deliberately not AWS_-prefixed (Amplify reserves those),
    // so the SDK's default provider chain can't find them on its own.
    const id     = process.env.S3_ACCESS_KEY_ID;
    const secret = process.env.S3_SECRET_ACCESS_KEY;
    const ses = new SESClient({
      region: process.env.S3_REGION || 'us-east-2',
      ...(id && secret ? { credentials: { accessKeyId: id, secretAccessKey: secret } } : {}),
    });
    await ses.send(new SendEmailCommand({
      Source: FROM,
      Destination: { ToAddresses: [TO] },
      Message: {
        Subject: { Data: subject, Charset: 'UTF-8' },
        Body: { Text: { Data: parts.join('\n'), Charset: 'UTF-8' } },
      },
    }));
    return { sent: true };
  } catch (e) {
    console.error('intake notify email failed (non-fatal):', e?.message || e);
    return { sent: false, error: String(e?.message || e).slice(0, 300) };
  }
}
