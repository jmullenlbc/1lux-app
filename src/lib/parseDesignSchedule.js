import { getAnthropicKey } from '@/lib/anthropicKey.js';
import Anthropic from '@anthropic-ai/sdk';
import { wrapClient } from '@/lib/agent/client';
import { buildUntrustedPrompt, warnOnInjection } from '@/lib/agent/untrusted';
import { modelParams, answerBudget, warnIfTruncated } from '@/lib/aiModels';

// Recorded: see src/lib/agent/ledger.js. wrapClient is a synchronous Proxy, so a
// module-level client can be wrapped in place without making this an await.
const anthropic = wrapClient(new Anthropic({ apiKey: getAnthropicKey() }), 'schedule.design.parse');

const DESIGN_MILESTONE_IDS = [
  {
    id:    '100-sd',
    label: '100% SD',
    hint:  '100% Schematic Design completion. Look for "100% SD Milestone", "100% SD", "SD Complete". Use the milestone/finish date, not the phase start date.',
  },
  {
    id:    '100-dd',
    label: '100% DD',
    hint:  '100% Design Development completion. Look for "100% DD Milestone", "100% DD". Use the milestone/finish date.',
  },
  {
    id:    '50-cd',
    label: '50% CD',
    hint:  '50% Construction Documents milestone. Look for "50% CD Milestone", "50% CD".',
  },
  {
    id:    '90-cd',
    label: '90% CD',
    hint:  '90% or 80% CD milestone. Look for "90% CD", "80% CD", "75% CD Checkset", "80% CD - GMP" start date. If not present, skip it.',
  },
  {
    id:    'permit-set',
    label: 'Permit Set',
    hint:  'Building permit submittal or permit set. Look for "Building Department Submittal Milestone", "Permit Set", "building permit submittal 1", "SUBMIT…Permit Package". Use first permit submittal date.',
  },
  {
    id:    'gmp',
    label: 'GMP',
    hint:  'GMP pricing milestone. Look for "GMP Pricing" finish date, "80% CD - GMP" finish date, or a "GMP" milestone row.',
  },
  {
    id:    '100-cd-ifc',
    label: '100% CD (IFC)',
    hint:  'Final 100% CD, Issued for Construction. Look for "IFC Issuance Milestone", "100% CD", "Building Department Approval Milestone", "IFC". Use the last/final IFC date.',
  },
];

/**
 * @param {string} textContent  the architect's schedule export — their document.
 * @param {object} [ctx]        `{ projectId }`, used only to label the warning if
 *                              the schedule contains instruction-like text.
 */
export async function extractDesignMilestonesWithAI(textContent, ctx = {}) {
  const prompt = `You are reading a design/architecture project schedule (may be MS Project, Asta, or similar Gantt export).

Extract milestone dates and return ONLY a valid JSON array — no markdown, no explanation.

Return format: [{"id":"milestone-id","label":"Milestone Label","date":"YYYY-MM-DD"}, ...]

Milestones to find:
${DESIGN_MILESTONE_IDS.map(m => `• "${m.id}" → ${m.label}: ${m.hint}`).join('\n')}

Rules:
- Only include milestones that are explicitly in the schedule — do NOT guess or invent dates
- Use milestone/finish dates, not start dates for phase-duration rows
- Return [] if no recognizable milestone dates are found
- Dates may appear as M/D/YY, MM/DD/YYYY, Mon D/D/YY, or Primavera P6's DD-Mon-YY ("07-Oct-24"). A trailing "A" means the date is actual, and a trailing "*" is a constraint marker — neither is part of the date.`;

  // The schedule is the architect's export, not ours. It used to be appended to
  // the prompt under a "Schedule text:" label, which is a label, not a boundary.
  // See src/lib/agent/untrusted.js.
  const sealed = buildUntrustedPrompt({
    instructions: prompt,
    documents:    [{ text: textContent, descriptor: 'design schedule', maxChars: 200000 }],
  });
  warnOnInjection('schedule.design.parse', ctx.projectId, sealed);

  const msg = await anthropic.messages.create({
    // Mike, 2026-08-19: all schedules are read by Fable 5. Same reason as the
    // construction pass in scheduleExtract.js — the old 8,000-character cap was
    // narrow enough that a design schedule of any length lost its tail silently.
    ...modelParams('schedule.design'),
    max_tokens: answerBudget('schedule.design', 2000),
    system:     sealed.system,
    messages:   [{ role: 'user', content: sealed.content }],
  });

  warnIfTruncated(msg, 'schedule.design');
  const raw   = msg.content.map(b => b.text || '').join('');
  const start = raw.indexOf('[');
  const end   = raw.lastIndexOf(']');
  if (start === -1 || end === -1) return null;

  try {
    const parsed = JSON.parse(raw.slice(start, end + 1));
    return parsed.filter(m =>
      m.id && m.label && /^\d{4}-\d{2}-\d{2}$/.test(m.date) &&
      parseInt(m.date) >= 2018 && parseInt(m.date) <= 2045
    );
  } catch {
    return null;
  }
}
