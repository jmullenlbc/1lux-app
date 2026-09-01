/**
 * The public conceptual-budget questionnaire.
 *
 * These are the 13 questions from the internal multifamily questionnaire
 * spreadsheet (first tab), reworded for a stranger on the public page:
 * internal pricing notes, adder math, and Drive links stay out; the
 * plain-English tradeoff each option carries stays in.
 *
 * Answer VALUES are the spreadsheet's own answer strings wherever one exists
 * (e.g. "Mirror and bath bar (Low)"), so a submission's answers read
 * identically to a questionnaire filled in by hand and can be dropped into
 * the same downstream math without translation.
 *
 * Shared by the public page (renders it) and the submit route (validates
 * against it) — one definition, so the two can't drift.
 */

export const INTAKE_QUESTIONS = [
  // ── RESIDENTIAL UNITS ──────────────────────────────────────────────────────
  {
    key: 'undercabinet',
    section: 'Residential units',
    question: 'Do you want undercabinet lighting in kitchens?',
    hint: 'Line voltage is the more cost-effective option with a larger profile; low voltage has a smaller profile but needs a remote power supply.',
    options: ['None', 'Line voltage', 'Low voltage'],
    default: 'None',
  },
  {
    key: 'islandPendants',
    section: 'Residential units',
    question: 'Are kitchen island pendants desired?',
    hint: 'Pendants replace the standard disks over islands and range widely in cost depending on the fixture chosen.',
    options: ['None', 'Yes'],
    default: 'None',
  },
  {
    key: 'ceilingFans',
    section: 'Residential units',
    question: 'Are ceiling fans desired, and in which rooms?',
    hint: 'A typical fan adds meaningful product and installation cost per unit, so location matters.',
    options: ['None', 'Master bed only', 'All bedrooms', 'Bedrooms and living room', 'Living room only'],
    default: 'None',
  },
  {
    key: 'vanityLighting',
    section: 'Residential units',
    question: 'How do you want to light unit bathroom vanities?',
    hint: '"Mirror and bath bar (Low)" is already included in the base budget. Illuminated mirrors often cost the same or less overall and need less coordination between trades.',
    options: ['Mirror and bath bar (Low)', 'Upgraded vanity fixture', 'Illuminated mirrors'],
    default: 'Mirror and bath bar (Low)',
  },
  {
    key: 'balconyLighting',
    section: 'Residential units',
    question: 'How do you want to light unit balconies?',
    hint: 'A small recessed disk is the budget option; sconces range from builder-grade to decorative.',
    options: ['Exterior balcony sconce (Low)', 'Recessed disk', 'Upgraded sconce', 'No balconies'],
    default: 'Exterior balcony sconce (Low)',
  },

  // ── EMERGENCY ──────────────────────────────────────────────────────────────
  {
    key: 'egressLighting',
    section: 'Emergency',
    question: 'How do you want to approach emergency egress lighting?',
    hint: 'If the building has a generator that can carry lighting, separate emergency fixtures are mostly unnecessary. Code still requires integrated battery backup in certain areas like stairwells.',
    options: ['Frogeyes everywhere', 'Building generator carries lighting', 'Not sure — recommend for me'],
    default: 'Frogeyes everywhere',
  },

  // ── INTERIOR AMENITIES ─────────────────────────────────────────────────────
  {
    key: 'interiorAmenityFinish',
    section: 'Interior amenities',
    question: 'What level of finish are the interior amenity spaces?',
    hint: 'Clubhouse, leasing, fitness, lobby. Low is typical for a garden walk-up; High is a high-end mid-rise or high-rise.',
    options: ['Low', 'Medium', 'High', 'No interior amenities'],
    default: 'Medium',
  },

  // ── CORRIDORS / STAIRWELLS ─────────────────────────────────────────────────
  {
    key: 'unitEntrySconce',
    section: 'Corridors and stairwells',
    question: 'Would you like a sconce at every unit entry?',
    hint: 'Options run from a simple builder-grade sconce up to an integrated unit-number light.',
    options: ['None', '1 sconce (Low)', '1 sconce (Medium)', '1 sconce (High)', 'Integrated unit number/light'],
    default: '1 sconce (Low)',
  },

  // ── EXTERIOR ───────────────────────────────────────────────────────────────
  {
    key: 'siteDesignLevel',
    section: 'Exterior',
    question: 'What level of design would you like on the site?',
    hint: 'Base design covers code-required site and parking lighting; enhanced adds landscape and architectural lighting.',
    options: ['Base design', 'Enhanced design'],
    default: 'Base design',
  },
  {
    key: 'exteriorAmenityFinish',
    section: 'Exterior',
    question: 'What level of finish are the exterior amenity spaces?',
    hint: 'Pool area, courtyards. The high end may include facade lighting.',
    options: ['Low', 'Medium', 'High', 'No exterior amenities'],
    default: 'Low',
  },
  {
    key: 'amenityHours',
    section: 'Exterior',
    question: 'Will exterior amenities be open after dark? Does the pool close by dusk?',
    hint: 'Areas not used at night can be lit to code minimum. A pool open after dark needs much higher light levels around the deck.',
    options: ['Closed by dusk', 'Open after dark', 'No exterior amenities', 'Not sure'],
    default: 'Not sure',
  },

  // ── CONTROLS ───────────────────────────────────────────────────────────────
  {
    key: 'projectType',
    section: 'Controls',
    question: 'What type of project is this?',
    hint: 'Drives the common-area control system requirements (IECC 2021).',
    options: ['Garden (3 Levels)', 'Garden (4 Levels)', 'Wrap', 'Podium', 'Mid-rise', 'High-rise', 'Townhomes', 'Other'],
    default: null, // prefilled from the drawing read when possible
  },

  // ── ENERGY CODES ───────────────────────────────────────────────────────────
  {
    key: 'energyCredit',
    section: 'Energy codes',
    question: 'Are you trying to beat code-allowed lighting power densities for an energy credit?',
    hint: 'If so, more of the budget should go toward controls and more efficient fixtures.',
    options: ['No', 'Yes', 'Not sure'],
    default: 'No',
  },
];

const byKey = new Map(INTAKE_QUESTIONS.map(q => [q.key, q]));

/**
 * Validate submitted answers against the questionnaire.
 * Returns rows ready for ConceptualSubmissionAnswer — unknown keys are
 * dropped, answers are clamped to the question's options (free text is not
 * accepted on option questions: this is a public endpoint), and unanswered
 * questions fall back to their default so the reviewer always sees a full set.
 */
export function validateAnswers(input) {
  const given = input && typeof input === 'object' ? input : {};
  const rows = [];
  for (const q of INTAKE_QUESTIONS) {
    const raw = typeof given[q.key] === 'string' ? given[q.key].trim() : '';
    const answer = q.options.includes(raw) ? raw : (q.default ?? '');
    if (!answer) continue; // no answer and no default (e.g. projectType left blank)
    rows.push({ section: q.section, questionKey: q.key, question: q.question, answer });
  }
  return rows;
}
