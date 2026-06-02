import { getAnthropicKey } from '@/lib/anthropicKey.js';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: getAnthropicKey() });

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

export async function extractDesignMilestonesWithAI(textContent) {
  const prompt = `You are reading a design/architecture project schedule (may be MS Project, Asta, or similar Gantt export).

Extract milestone dates and return ONLY a valid JSON array — no markdown, no explanation.

Return format: [{"id":"milestone-id","label":"Milestone Label","date":"YYYY-MM-DD"}, ...]

Milestones to find:
${DESIGN_MILESTONE_IDS.map(m => `• "${m.id}" → ${m.label}: ${m.hint}`).join('\n')}

Rules:
- Only include milestones that are explicitly in the schedule — do NOT guess or invent dates
- Use milestone/finish dates, not start dates for phase-duration rows
- Return [] if no recognizable milestone dates are found
- Dates may appear as M/D/YY, MM/DD/YYYY, or Mon D/D/YY format

Schedule text (first 8000 chars):
${textContent.slice(0, 8000)}`;

  const msg = await anthropic.messages.create({
    model:      'claude-haiku-4-5-20251001',
    max_tokens: 600,
    messages:   [{ role: 'user', content: prompt }],
  });

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
