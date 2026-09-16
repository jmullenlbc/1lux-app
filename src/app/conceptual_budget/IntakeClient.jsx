'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { US_STATES, checkLocation } from '@/lib/usStates';
import DrawingDropzone from '@/components/intake/DrawingDropzone';
import BudgetSidebar from '@/components/wizard/BudgetSidebar';
import SummaryBudgetBreakdown from '@/app/(app)/project/[id]/summary/SummaryBudgetBreakdown';
import QuestionCard from '@/components/sections/QuestionCard';
import InteriorTierPicker from '@/components/sections/InteriorTierPicker';
import { classifyIntakeEmail } from '@/lib/intake';
import { INTAKE_QUESTIONS, noDrawingsReady } from '@/lib/intake/questionnaire';
import { formatCurrency } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * Public conceptual-budget intake — the SAME experience as the internal
 * wizard, on Mike's rule (2026-09-01): "Make sure the UI/UX is identical to
 * the internal tool with different pages for different areas of the building
 * with the side bar on the left for those different areas and a live budget
 * summary on the right."
 *
 * So the shell is the internal wizard's shell: SectionNav-style step list on
 * the left, one page per building area in the middle (QuestionCard radio
 * groups, exactly like the internal sections), and the SAME BudgetSidebar
 * component on the right. Two public-only steps bracket the areas: About You
 * (contact details) and Drawings up front, Review & Send at the end.
 *
 * The one deliberate difference is WHERE the math runs: the internal wizard
 * prices client-side with the full PRICING model in the bundle, but that
 * model is ILC's cost book and must not ship to a public visitor's browser.
 * Answers are debounced up to /api/intake/estimate and only the computed
 * budget object comes back — which is why the public QuestionCards show
 * descriptive subtext instead of per-option dollar adders.
 *
 * Duplicate project-name checking is intentionally NOT done live here. Doing
 * so against all projects from an unauthenticated page would let anyone
 * enumerate the client project list by guessing names. It belongs either in
 * the ILC review queue, or scoped to the submitter's own resolved client once
 * email→client mapping exists. See `findDuplicateProjects` in lib/intake.js.
 */

const CONFIRM_NOTE = 'We will confirm all numbers are correct and send you a budget within 48hrs.';

// ── Saved in this browser ────────────────────────────────────────────────────
// Mike, 2026-09-15: "People need to be able to fill out a budget and come back
// to it somehow … Browser save now." There is no login on this page, so the
// draft lives in the visitor's own browser (localStorage) and nowhere else:
// close the tab, come back next week on the same device, pick up where you
// left off. It is the visitor's INPUTS only — what they typed, what they
// answered, what we read off their drawings — never the estimate and never a
// price. Nothing here reaches a server, and nothing here expires.
//
// A resume LINK that works across devices needs a server-side copy and an
// email to send it in. Both are built: once the contact details pass About
// You, the same inputs are also saved to /api/intake/draft (a ConceptualDraft
// row, inputs only, never a price) so ILC staff can see unfinished budgets as
// leads, and ?resume=<token> reopens one on any device. The two buttons that
// hand the link to the visitor stay hidden behind this flag until Microsoft
// email is hooked up (Mike, 2026-09-15: "The link we should build but can't
// show until we hook up Microsoft email to it").
const RESUME_LINK_ENABLED = false;
const DRAFT_KEY = 'ilc.conceptualBudget.draft.v1';
const SERVER_SAVE_DELAY_MS = 3000;

/** The token from a ?resume= link, taken off the address bar so it is not
 *  left in the history or shared by accident when the page is copied. */
function takeResumeToken() {
  try {
    const url = new URL(window.location.href);
    const token = url.searchParams.get('resume');
    if (!token) return null;
    url.searchParams.delete('resume');
    window.history.replaceState(null, '', url.pathname + (url.search || '') + url.hash);
    return /^[A-Za-z0-9_-]{20,64}$/.test(token) ? token : null;
  } catch { return null; }
}

/** Read the saved draft, or null. Every storage access can throw (private
 *  windows, blocked site data, a full quota), so all of them are wrapped. */
function readDraft() {
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    return d && typeof d === 'object' && d.v === 1 ? d : null;
  } catch { return null; }
}
function writeDraft(draft) {
  try { window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); return true; }
  catch { return false; }
}
function clearDraft() {
  try { window.localStorage.removeItem(DRAFT_KEY); } catch { /* nothing to clear */ }
}
/** A draft worth offering back: something typed, or drawings already read.
 *  A page opened and closed without a keystroke leaves nothing to resume. */
function draftHasWork(d) {
  if (!d) return false;
  const typed = ['firstName', 'lastName', 'email', 'project'].some(k => String(d[k] ?? '').trim());
  return typed || Boolean(d.haveDrawings) || Boolean(d.drawings);
}
/** Copy only the keys the live state already has, and only string values, so
 *  a stale or hand-edited draft can never add fields the wizard doesn't know. */
function pickStrings(src, into) {
  const out = { ...into };
  if (!src || typeof src !== 'object') return out;
  for (const k of Object.keys(into)) if (typeof src[k] === 'string') out[k] = src[k];
  return out;
}
function fmtSavedAt(iso) {
  try {
    return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  } catch { return ''; }
}

/**
 * The step list, mirroring the internal wizard's area order
 * (units → corridors → amenities → exterior → emergency → controls).
 * `sections` names the INTAKE_QUESTIONS groups shown on that page;
 * `budgetStep` is the internal step id BudgetSidebar highlights.
 * `hint` is the one line under the page heading — what to do there and why
 * (beta prep, 2026-09-12). Plain words; keep them true to what the page does.
 */
const STEPS = [
  { id: 'about',     short: 'About You',     label: 'About You & Your Project',
    hint: 'Start with your details and where the project is, so we can put your budget together and get back to you.' },
  { id: 'drawings',  short: 'Drawings',      label: 'Upload Drawings',
    hint: 'Upload your drawing set if you have one — we read unit counts and sizes from it. No drawings? Choose “No drawings yet” and type in a few numbers instead.' },
  { id: 'units',     short: 'Units',         label: 'Residential Units',      sections: ['Residential units'],        budgetStep: 'units',
    hint: 'Choose the lighting inside the apartments. Each choice updates your budget.' },
  { id: 'corridors', short: 'Corridors',     label: 'Corridors & Stairwells', sections: ['Corridors and stairwells'], budgetStep: 'corridors',
    hint: 'Choose the light at each apartment door. Hallway and stair lighting is priced from your building figures.' },
  { id: 'amenities', short: 'Amenities',     label: 'Interior Amenities',     sections: ['Interior amenities'],       budgetStep: 'amenities',
    hint: 'Pick the finish level for shared indoor spaces like the clubhouse, leasing office and gym.' },
  { id: 'exterior',  short: 'Exterior',      label: 'Exterior & Site',        sections: ['Exterior'],                 budgetStep: 'exterior',
    hint: 'Choose the outdoor lighting for the site, parking and outdoor amenities like a pool deck.' },
  { id: 'emergency', short: 'Emergency',     label: 'Emergency Lighting',     sections: ['Emergency'],                budgetStep: 'emergency',
    hint: 'Code requires backup lighting on every exit path. Choose how you want it powered.' },
  { id: 'controls',  short: 'Controls',      label: 'Controls & Energy',      sections: ['Energy codes'], budgetStep: 'controls',
    hint: 'Tell us about any energy program. Together with your project type, it sets the lighting controls the code requires.' },
  { id: 'review',    short: 'Review & Send', label: 'Review & Send',
    hint: 'Check your budget and download a PDF copy. When you’re ready, send it to our team to review.' },
];

/** "How this works" on the About step — four short steps, plain words. */
const HOW_IT_WORKS = [
  { title: 'Tell us about your project', body: 'your name, work email, project name and location.' },
  { title: 'Add your drawings, or skip them', body: 'upload your drawing set if you have one. No drawings? Type in the building type, number of units and rough size.' },
  { title: 'Pick your lighting', body: 'a few quick choices for each part of the building. Your budget updates as you go.' },
  { title: 'Get your budget', body: 'see the summary and download it as a PDF. Send it to us and our team reviews it and follows up within 48 hours.' },
];

/**
 * The figures the wizard asks the visitor to TYPE when the drawings didn't
 * answer them (Mike, 2026-09-04: "answer as many of these questions as
 * possible and then ask them for what we can't find"). `key` matches
 * FIGURE_KEYS in questionnaire.js — the server-side whitelist that lets these
 * ride inside `answers`; `qKey` is the computeQuantities row each one settles.
 */
// Some boxes only exist for some project types (`types`, matched against the
// projectType answer). The drive length: townhomes and single-family. Garages:
// those plus stacked flats and garden walk-ups; carports: those plus wraps
// (Mike, 2026-09-13). The server does the arithmetic; no pricing reaches here.
const DRIVE_PROJECT_TYPES   = ['Town Houses (2-3 Levels)', 'Single Family (1-2 Levels)'];
const GARAGE_PROJECT_TYPES  = [...DRIVE_PROJECT_TYPES, 'Town House/Stacked Flats (3 Levels)', 'Garden (3 Levels)'];
const CARPORT_PROJECT_TYPES = [...GARAGE_PROJECT_TYPES, 'Wrap (3-5 Levels)'];
const DRIVE_LENGTH_FIELD = {
  key: 'figureDriveLengthFt', qKey: 'driveLengthFt', label: 'Private drive length (ft)', placeholder: 'e.g. 2,400',
  hint: 'The private road the homes face, end to end.', types: DRIVE_PROJECT_TYPES,
};
const GARAGE_FIELD = {
  key: 'figureGarages', qKey: 'garages', label: '# Garages', placeholder: 'e.g. 64',
  hint: 'Attached or detached. Enter 0 if none.', types: GARAGE_PROJECT_TYPES,
};
const CARPORT_FIELD = {
  key: 'figureCarports', qKey: 'carports', label: '# Carport bays', placeholder: 'e.g. 40',
  hint: 'Covered parking spaces. Enter 0 if none.', types: CARPORT_PROJECT_TYPES,
};
const fieldsFor = (list, projectType) => list.filter(f => !f.types || f.types.includes(projectType));

const FIGURE_FIELDS = [
  { key: 'figureGrossSf',        qKey: 'grossSf',          label: 'Total building gross SF',  placeholder: 'e.g. 364,000' },
  { key: 'figureTotalUnits',     qKey: 'totalUnits',       label: 'Total units',              placeholder: 'e.g. 234' },
  { key: 'figureStories',        qKey: 'stories',          label: '# Stories',                placeholder: 'e.g. 4' },
  DRIVE_LENGTH_FIELD,
  // Landings, not shafts (Mike, 2026-09-04): the internal Project Data field
  // asks for landings, and the engine prices $200 per LANDING — so the visitor
  // types the same figure. A switchback stair serving N floors has 2N−1.
  { key: 'figureStairLandings',  qKey: 'stairLandings',    label: '# Egress stairwell landings', placeholder: 'e.g. 15' },
  { key: 'figureExitDoors',      qKey: 'exitDoors',        label: '# Exit doors',             placeholder: 'e.g. 8' },
  { key: 'figureSurfaceParking', qKey: 'surfaceParking',   label: '# Surface parking stalls', placeholder: 'e.g. 120' },
  GARAGE_FIELD,
  CARPORT_FIELD,
  // Without a balcony count the balcony-lighting answer prices to $0 whatever
  // the visitor picks — ask for it whenever the unit matrix didn't list one.
  { key: 'figureBalconies',      qKey: 'balconies',        label: '# Balconies',              placeholder: 'e.g. 150' },
  // Same trap, same fix (Mike, 2026-09-15: "Exterior amenity math ... isn't
  // working. I click a different $/sf and nothing changes"). The exterior
  // amenity $/SF question multiplies this figure, so with no square footage
  // the whole line prices at $0 at every rate and the control looks broken.
  // Site plans very often don't state an amenity area, so ask for it.
  { key: 'figureExteriorAmenitySf', qKey: 'exteriorAmenitySf', label: 'Exterior amenity SF', placeholder: 'e.g. 12,000',
    hint: 'Pool deck, courtyards, plazas — the outdoor areas that get lit. Enter 0 if none.' },
];

/**
 * The no-drawings form on the Drawings step (Mike, 2026-09-11: "some other
 * way to say no and then all the square footage and count details that you
 * need to fill in"). `need` marks the minimum we ask for — the same rule
 * noDrawingsReady enforces on the server; 'either' means one of the two size
 * figures will do. Stories and surface stalls joined the required list on
 * 2026-09-12 (0 stalls is allowed). Blank optional fields are estimated
 * server-side and the estimate is shown in the field.
 */
const MANUAL_FIELDS = [
  { key: 'figureTotalUnits',        qKey: 'totalUnits',        label: 'Total units',               placeholder: 'e.g. 234',     need: 'required' },
  { key: 'figureGrossSf',           qKey: 'grossSf',           label: 'Total building SF',         placeholder: 'e.g. 364,000', need: 'either' },
  { key: 'figureAvgUnitSf',         qKey: null,                label: 'Average unit size SF',      placeholder: 'e.g. 950',     need: 'either' },
  { key: 'figureBuildings',         qKey: null,                label: '# Residential buildings',   placeholder: 'e.g. 6',       hint: 'Helps us estimate stairwells.' },
  // Stories and surface stalls required too (Mike, 2026-09-12: "surface parking
  // should be an easy number for them to figure out. Stories too.").
  { key: 'figureStories',           qKey: 'stories',           label: '# Stories',                 placeholder: 'e.g. 4',       need: 'required', hint: 'The tallest building.' },
  // `estNote` replaces the engine's long working-out under the estimate — the
  // landings one ran seven lines (Mike, 2026-09-12). Reviewers still see it all.
  { key: 'figureStairLandings',     qKey: 'stairLandings',     label: '# Egress stairwell landings', placeholder: 'e.g. 15', estNote: 'based on your building type, size and number of stories.' },
  { key: 'figureExitDoors',         qKey: 'exitDoors',         label: '# Exit doors',              placeholder: 'e.g. 8' },
  { key: 'figureSurfaceParking',    qKey: 'surfaceParking',    label: '# Surface parking stalls',  placeholder: 'e.g. 120',     need: 'required', hint: 'Open-air stalls only. Enter 0 if all parking is in a garage.' },
  GARAGE_FIELD,
  CARPORT_FIELD,
  { key: 'figureBalconies',         qKey: 'balconies',         label: '# Balconies',               placeholder: 'e.g. 150' },
  { key: 'figureInteriorAmenitySf', qKey: 'interiorAmenitySf', label: 'Interior amenity SF',       placeholder: 'e.g. 5,000',   hint: 'Clubhouse, leasing, fitness.' },
  { key: 'figureCorridorSf',        qKey: 'corridorSf',        label: 'Corridors & stairwells SF', placeholder: 'e.g. 30,000' },
  { key: 'figureBohSf',             qKey: 'bohSf',             label: 'Back of house SF',          placeholder: 'e.g. 10,000',  hint: 'Mechanical, storage, trash, bike rooms.' },
  { key: 'figureGarageSf',          qKey: 'garageSf',          label: 'Garage SF',                 placeholder: 'e.g. 80,000',  hint: 'Leave blank if there is no parking garage.' },
  { key: 'figureExteriorAmenitySf', qKey: 'exteriorAmenitySf', label: 'Exterior amenity SF',       placeholder: 'e.g. 12,000',  hint: 'Pool deck, courtyards. Leave blank if none.' },
  // Townhomes / single-family only (`types`) — Mike 2026-09-13.
  DRIVE_LENGTH_FIELD,
];

/**
 * A figure box in a grid. CSS subgrid gives every cell the same three rows —
 * label/hint, box, estimate note — so the boxes across a row sit on one line
 * even when a neighbour's tag or hint wraps. Where subgrid isn't supported it
 * falls back to a plain stacked field.
 */
function FigureField({ label, labelRight, hint, note, children }) {
  return (
    <label className="row-span-3 grid [grid-template-rows:subgrid] gap-y-0">
      <span className="block">
        <span className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
          <span className="text-sm font-semibold text-slate-700">{label}</span>
          {labelRight && <span className="text-xs text-slate-400 shrink-0">{labelRight}</span>}
        </span>
        {hint && <span className="block text-xs text-slate-400 mt-0.5">{hint}</span>}
      </span>
      <div className="mt-1.5">{children}</div>
      <div className={note ? 'mt-1.5' : undefined}>{note}</div>
    </label>
  );
}

const PROJECT_TYPE_OPTIONS =INTAKE_QUESTIONS.find(q => q.key === 'projectType')?.options || [];
// Project types that get the walking-path bollard question (Mike, 2026-09-12).
const BOLLARD_PROJECT_TYPES = ['Town Houses (2-3 Levels)', 'Single Family (1-2 Levels)'];

function Field({ label, labelRight, hint, error, children }) {
  return (
    <label className="block">
      {/* flex-wrap: in a narrow column the tag drops under the label instead
          of squeezing the label into a one-word-per-line stack. */}
      <span className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
        <span className="text-sm font-semibold text-slate-700">{label}</span>
        {labelRight && <span className="text-xs text-slate-400 shrink-0">{labelRight}</span>}
      </span>
      {hint && <span className="block text-xs text-slate-400 mt-0.5">{hint}</span>}
      <div className="mt-1.5">{children}</div>
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </label>
  );
}

const inputCls =
  'w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 ' +
  'placeholder:text-slate-300 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-100';

// Figure boxes hold 8 characters at most ("1,250,000"-ish) — sized for that,
// plus room for the ESTIMATE pill, rather than stretching across the column.
const figureBoxCls = 'max-w-[11rem]';

// Map the AI drawing read's buildingType (free text) onto the questionnaire's
// project-type options so the question arrives pre-answered when possible.
function guessProjectType(buildingType) {
  if (!buildingType) return null;
  const t = String(buildingType).toLowerCase();
  const q = INTAKE_QUESTIONS.find(x => x.key === 'projectType');
  const pick = (label) => (q?.options.includes(label) ? label : null);
  if (t.includes('single')) return pick('Single Family (1-2 Levels)');
  if (t.includes('stacked')) return pick('Town House/Stacked Flats (3 Levels)');
  if (t.includes('townhome') || t.includes('townhouse') || t.includes('town house')) return pick('Town Houses (2-3 Levels)');
  if (t.includes('high')) return pick('High Rise (12+ Levels)');
  if (t.includes('mid')) return pick('Mid Rise (9-12 Levels)');
  if (t.includes('podium')) return pick('Podium (3-8 Levels)');
  if (t.includes('wrap')) return pick('Wrap (3-5 Levels)');
  if (t.includes('gurban') || t.includes('urban garden')) return pick('Gurban (4-5 Levels)');
  // A 4–5 story garden building IS a gurban — that's the distinction.
  if ((t.includes('garden') || t.includes('walk')) && /[45]/.test(t)) return pick('Gurban (4-5 Levels)');
  if (t.includes('garden') || t.includes('walk')) return pick('Garden (3 Levels)');
  return null;
}

/** Render an option for display — the $/SF questions store bare numbers. */
function optionLabel(q, opt) {
  return q.format === 'perSf' ? `$${opt}/SF` : opt;
}

/**
 * Left rail — the public twin of the internal wizard's SectionNav: same
 * width, same numbered circles, same active/completed treatment. The header
 * carries ILC branding (and the project name once entered) where the
 * internal one shows the editable project block.
 */
function PublicSectionNav({ currentStep, completedSteps, canNavigate, onJump, projectName }) {
  return (
    <aside className="hidden lg:flex w-56 bg-white border-r border-slate-100 flex-col shrink-0 overflow-y-auto">
      <div className="px-4 py-4 border-b border-slate-100">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-slate-900 flex items-center justify-center shrink-0">
            <svg className="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-slate-900 leading-tight">ILC Studios</div>
            <div className="text-xs text-slate-400">Conceptual Budget</div>
          </div>
        </div>
        {projectName && (
          <div className="text-xs text-slate-500 mt-2.5 truncate font-medium">{projectName}</div>
        )}
      </div>

      <nav className="flex-1 px-2 py-3 space-y-0.5">
        {STEPS.map((step, i) => {
          const isActive    = step.id === currentStep;
          const isCompleted = completedSteps.includes(step.id);
          const enabled     = canNavigate(step.id);
          return (
            <button
              key={step.id}
              onClick={() => enabled && onJump(step.id)}
              disabled={!enabled}
              className={cn(
                'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-colors text-sm',
                isActive
                  ? 'bg-navy-800 text-white'
                  : isCompleted
                    ? 'text-slate-600 hover:bg-slate-50'
                    : enabled
                      ? 'text-slate-400 hover:bg-slate-50'
                      : 'text-slate-300 cursor-not-allowed',
              )}
            >
              <div className={cn(
                'w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-xs font-semibold',
                isActive      ? 'bg-amber-500 text-white'
                : isCompleted ? 'bg-green-500 text-white'
                : 'bg-slate-100 text-slate-400',
              )}>
                {isCompleted && !isActive
                  ? <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  : <span>{i + 1}</span>
                }
              </div>
              <span className={cn('leading-tight', isActive && 'font-medium')}>{step.short}</span>
            </button>
          );
        })}
      </nav>

      <div className="px-4 py-3 border-t border-slate-100">
        <p className="text-[11px] text-slate-400 leading-relaxed">{CONFIRM_NOTE}</p>
      </div>
    </aside>
  );
}

export default function IntakeClient() {
  const [stepId, setStepId] = useState('about');
  const [completedSteps, setCompletedSteps] = useState([]);
  const [firstName, setFirstName] = useState('');
  const [lastName,  setLastName]  = useState('');
  const [email,     setEmail]     = useState('');
  const [company,   setCompany]   = useState('');
  const [project,   setProject]   = useState('');
  // Project location, required (Mike, 2026-09-12: "We need location for data tracking").
  const [projCity,  setProjCity]  = useState('');
  const [projState, setProjState] = useState('');
  const [projZip,   setProjZip]   = useState('');
  const [touchedZip, setTouchedZip] = useState(false);
  const [touchedEmail, setTouchedEmail] = useState(false);
  const [drawings, setDrawings] = useState(null);
  // "Do you have drawings?" — null until answered, then 'yes' (the dropzone)
  // or 'no' (the typed-in figures form).
  const [haveDrawings, setHaveDrawings] = useState(null);
  const manual = haveDrawings === 'no';
  // Figures the visitor types when the drawings couldn't answer them (or to
  // override a derived estimate). Kept apart from `answers` so the radio-group
  // state stays purely INTAKE_QUESTIONS; merged in at the payload boundary.
  const [figures, setFigures] = useState(() => {
    const init = {};
    for (const f of [...FIGURE_FIELDS, ...MANUAL_FIELDS]) init[f.key] = '';
    return init;
  });
  // Figures typed to OVERRULE what we read off the drawings, keyed by takeoff
  // row key (Mike, 2026-09-15: "We need to be able to manually update any
  // field about the project we see off. None of that can be updated now.").
  // Kept apart from `figures`, which answer "the drawings didn't say" and stay
  // below a drawing; these say "the drawings were read wrong" and outrank one.
  // Sent as correct<RowKey> — see correctionKeyFor() in quantities.js.
  const [corrections, setCorrections] = useState({});
  const [answers, setAnswers] = useState(() => {
    const init = {};
    for (const q of INTAKE_QUESTIONS) init[q.key] = q.default ?? '';
    return init;
  });
  // "Is there a clubhouse?" on the no-drawings form (Mike, 2026-09-12: "Can we
  // somehow read if there is a clubhouse or not?"). '' = not sure → the
  // server's usual for the building type.
  const [hasClubhouse, setHasClubhouse] = useState('');
  const [estimate, setEstimate] = useState(null); // { budget, projectData, range } from the server
  const [submitting, setSubmitting] = useState(false);
  const [submitted,  setSubmitted]  = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [pdfBusy,  setPdfBusy]  = useState(false);
  const [pdfError, setPdfError] = useState(null);
  const mainRef = useRef(null);

  // ── Saved in this browser (see DRAFT_KEY) ─────────────────────────────────
  // `savedDraft` is the draft found on load, waiting for a Continue / Start
  // fresh decision. Autosave holds off until that decision (`draftDecided`),
  // or the first keystroke on a fresh form would overwrite the saved one
  // before the visitor had a chance to take it back.
  const [savedDraft, setSavedDraft] = useState(null);
  const [draftDecided, setDraftDecided] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  // The drawings read that came back from the draft, handed to the dropzone
  // once so it can list the files and keep counting them if more are added.
  const [restoredDrawings, setRestoredDrawings] = useState(null);
  // ── Saved on the server (see RESUME_LINK_ENABLED) ─────────────────────────
  // The resume token for this visitor's server-side copy, if one exists. Kept
  // in a ref as well so the save effect can read the latest value without
  // re-running every time it changes.
  const [draftToken, setDraftToken] = useState(null);
  const draftTokenRef = useRef(null);
  draftTokenRef.current = draftToken;
  const savingRef = useRef(false); // a save is in flight
  const dirtyRef  = useRef(false); // something changed while it was
  const [linkCopied,  setLinkCopied]  = useState(false);
  const [linkEmailed, setLinkEmailed] = useState(null); // null | 'sent' | 'failed'

  // The resume token is taken off the address bar exactly once. React's dev
  // Strict Mode runs the mount effect twice; a second look at the URL would
  // find nothing and drop the link on the floor.
  const resumeTokenRef = useRef(undefined);

  useEffect(() => {
    let cancelled = false;
    const fromLocal = () => {
      const d = readDraft();
      if (draftHasWork(d)) setSavedDraft(d);
      else setDraftDecided(true);
    };
    // A ?resume= link beats the browser copy: it was asked for on purpose.
    if (resumeTokenRef.current === undefined) resumeTokenRef.current = takeResumeToken();
    const token = resumeTokenRef.current;
    if (!token) { fromLocal(); return; }
    (async () => {
      try {
        const res = await fetch(`/api/intake/draft?token=${encodeURIComponent(token)}`);
        if (!res.ok) throw new Error('gone');
        const body = await res.json();
        if (cancelled) return;
        if (draftHasWork(body?.draft)) {
          setSavedDraft({ ...body.draft, serverToken: token, fromLink: true });
          return;
        }
      } catch { /* fall through to the browser copy */ }
      if (!cancelled) fromLocal();
    })();
    return () => { cancelled = true; };
  }, []);

  const stepIndex = STEPS.findIndex(s => s.id === stepId);
  const step      = STEPS[stepIndex];

  const emailCheck = email ? classifyIntakeEmail(email) : null;
  const emailError = touchedEmail && emailCheck && !emailCheck.ok ? emailCheck.message : null;

  // When a drawing read tells us the project type, pre-answer that question —
  // but never overwrite a choice the submitter already made themselves.
  const guessedType = useMemo(() => guessProjectType(drawings?.siteData?.buildingType), [drawings]);
  useEffect(() => {
    if (guessedType) {
      setAnswers(a => (a.projectType ? a : { ...a, projectType: guessedType }));
    }
  }, [guessedType]);

  // The typed figures merged into the answers payload. The server's
  // validateAnswers keeps them (FIGURE_KEYS whitelist) and computeQuantities
  // treats them as the 'questionnaire' rung of the gross-SF/units ladder —
  // below anything the drawings state, above anything derived.
  const mergedAnswers = useMemo(() => {
    const out = { ...answers };
    for (const [k, v] of Object.entries(figures)) {
      const s = String(v ?? '').trim();
      if (s) out[k] = s;
    }
    for (const [key, v] of Object.entries(corrections)) {
      const s = String(v ?? '').trim();
      if (s) out[`correct${key.charAt(0).toUpperCase()}${key.slice(1)}`] = s;
    }
    if (manual) out.noDrawings = 'yes';
    if (manual && hasClubhouse) out.hasClubhouse = hasClubhouse;
    return out;
  }, [answers, figures, corrections, manual, hasClubhouse]);

  // The no-drawings minimum (project type, units, and a size) — the same
  // check the estimate route enforces before it will price anything.
  const manualCheck = useMemo(() => noDrawingsReady(mergedAnswers), [mergedAnswers]);
  // The progress bar (Mike, 2026-09-12: "the more detailed data the more
  // accurate the budget") — boxes the visitor typed, not our estimates.
  // The drive-length box only exists for townhome / single-family projects.
  const manualFields = fieldsFor(MANUAL_FIELDS, answers.projectType);
  const manualFilled = manualFields.filter(f => String(figures[f.key] ?? '').trim() !== '').length;

  // ── Live server-side estimate ──────────────────────────────────────────────
  // Debounced: every answer flip re-prices, but a burst of changes is one call.
  // Drawings are the ticket in (Mike, 2026-09-04): no live number without
  // them. Typed figures only REFINE an estimate the drawings started — unless
  // the visitor said "no drawings" and filled in the minimum (Mike, 2026-09-11).
  const estimateSeq = useRef(0);
  useEffect(() => {
    if (manual ? !manualCheck.ready : !drawings) { setEstimate(null); return; }
    const seq = ++estimateSeq.current;
    const t = setTimeout(async () => {
      try {
        const res = await fetch('/api/intake/estimate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ answers: mergedAnswers, drawings: manual ? null : drawings }),
        });
        if (!res.ok) return; // keep the last good estimate
        const data = await res.json();
        if (seq === estimateSeq.current) setEstimate(data);
      } catch { /* transient network failure — keep the last good estimate */ }
    }, 500);
    return () => clearTimeout(t);
  }, [mergedAnswers, figures, drawings, manual, manualCheck.ready]);

  // ── "We couldn't find these" — the figures asked for on the Units page ────
  // Driven by the estimate's provenance rows: a figure whose source is
  // 'drawing' is settled and never asked. source null → plain ask; 'derived'
  // → show our estimate with its arithmetic and offer the override. Only
  // shown once drawings have been read — no drawings, no card, no number.
  const figureAsks = useMemo(() => {
    // A typed-in budget already asked for all of these on the Drawings step.
    if (!estimate || manual) return [];
    const rows = new Map((estimate?.quantities || []).map(r => [r.key, r]));
    return fieldsFor(FIGURE_FIELDS, answers.projectType).map(f => {
      const row = rows.get(f.qKey) || null;
      if (row && row.source === 'drawing') return null;
      return { ...f, row };
    }).filter(Boolean);
  }, [estimate, manual, answers.projectType]);

  // Takeoff rows by key — the no-drawings form shows "we'll estimate N" under
  // any optional field left blank.
  const estimateRows = useMemo(
    () => new Map((estimate?.quantities || []).map(r => [r.key, r])),
    [estimate]);

  // What the no-drawings form fills a blank box with (Mike, 2026-09-11: "can
  // we fill out the field but say it's an estimate somehow and they can
  // overwrite if they want"). Only the server's own estimates — rows it
  // derived — plus the average unit size, which is the estimated unit area
  // spread over the typed unit count. Nothing is shown until the required
  // figures are in, so a stale estimate never sits in a box.
  const manualEstimates = useMemo(() => {
    const m = {};
    if (!manual || !manualCheck.ready) return m;
    for (const f of MANUAL_FIELDS) {
      const row = f.qKey ? estimateRows.get(f.qKey) : null;
      if (row?.source === 'derived' && row.value != null) m[f.key] = { value: row.value, how: row.how };
    }
    const unitsSf = estimateRows.get('unitsSf');
    const units   = estimateRows.get('totalUnits')?.value;
    if (unitsSf?.source === 'derived' && unitsSf.value && units > 0) {
      m.figureAvgUnitSf = {
        value: Math.round(unitsSf.value / units),
        how:   `${unitsSf.how} Spread over ${Number(units).toLocaleString('en-US')} units.`,
      };
    }
    return m;
  }, [manual, manualCheck.ready, estimateRows]);

  // The box being typed in. While it has focus, an emptied box stays empty
  // (so the visitor can type a fresh number); on blur a blank box shows the
  // estimate again.
  const [editingKey, setEditingKey] = useState(null);

  // A plain function, not a component, so React never remounts the input and
  // steals focus mid-typing.
  const manualInput = f => {
    const typed = String(figures[f.key] ?? '');
    const est = manualEstimates[f.key];
    const showEst = !!est && !typed.trim() && editingKey !== f.key;
    return (
      <>
        <div className={cn('relative', figureBoxCls)}>
          <input
            className={cn(inputCls, showEst && 'bg-amber-50 border-amber-200 text-amber-700 italic pr-20')}
            inputMode="numeric"
            value={showEst ? Number(est.value).toLocaleString('en-US') : typed}
            onFocus={e => { if (showEst) { const el = e.target; requestAnimationFrame(() => el.select()); } }}
            onChange={e => { const v = e.target.value; setEditingKey(f.key); setFigures(x => ({ ...x, [f.key]: v })); }}
            onBlur={() => setEditingKey(k => (k === f.key ? null : k))}
            placeholder={f.placeholder}
            title={showEst ? est.how || undefined : undefined}
          />
          {showEst && (
            <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700">
              Estimate
            </span>
          )}
        </div>
      </>
    );
  };
  // The "Our estimate — …" line under a figure box. Kept apart from the box
  // so FigureField can hold every box in a row on the same line.
  const manualNote = f => {
    const est = manualEstimates[f.key];
    const showEst = !!est && !String(figures[f.key] ?? '').trim() && editingKey !== f.key;
    const how = f.estNote || est?.how;
    return showEst ? (
      <p className="text-xs text-amber-600">
        Our estimate{how ? ` — ${how}` : '.'} Type over it if you know the real number.
      </p>
    ) : null;
  };

  // ── Building summary on the Drawings page (Mike, 2026-09-04: "add a
  // building summary on the drawing page below of everything we pulled from
  // the drawings") — the takeoff rows the estimate already returns, split
  // into what was read and what will be asked for.
  const pulledRows = useMemo(() => {
    const rows = (estimate?.quantities || []).filter(r => r.label);
    return {
      found:   rows.filter(r => r.value != null),
      missing: rows.filter(r => r.value == null),
    };
  }, [estimate]);

  const questionsBySection = useMemo(() => {
    const out = new Map();
    for (const q of INTAKE_QUESTIONS) {
      if (!out.has(q.section)) out.set(q.section, []);
      out.get(q.section).push(q);
    }
    return out;
  }, []);

  const projLoc = checkLocation({ city: projCity, state: projState, zip: projZip });
  const contactReady =
    firstName.trim() && lastName.trim() && project.trim() && emailCheck?.ok && projLoc.ok;

  // Any step is reachable once the contact details are in — the same freedom
  // the internal sidebar gives — but nothing past About You before that.
  function canNavigate(id) {
    return id === 'about' || Boolean(contactReady);
  }

  function goTo(id) {
    setStepId(id);
    mainRef.current?.scrollTo({ top: 0 });
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function markDoneAndGo(nextId) {
    setCompletedSteps(c => (c.includes(stepId) ? c : [...c, stepId]));
    goTo(nextId);
  }

  function goNext() {
    const next = STEPS[stepIndex + 1];
    if (next) markDoneAndGo(next.id);
  }

  function goPrev() {
    const prev = STEPS[stepIndex - 1];
    if (prev) goTo(prev.id);
  }

  // ── Continue / Start fresh ────────────────────────────────────────────────
  function restoreDraft() {
    const d = savedDraft;
    if (!d) return;
    const str = v => (typeof v === 'string' ? v : '');
    setFirstName(str(d.firstName));
    setLastName(str(d.lastName));
    setEmail(str(d.email));
    setCompany(str(d.company));
    setProject(str(d.project));
    setProjCity(str(d.projCity));
    setProjState(str(d.projState));
    setProjZip(str(d.projZip));
    // They had already been through these boxes; show any error right away
    // rather than waiting for a blur that may never come.
    setTouchedEmail(Boolean(str(d.email)));
    setTouchedZip(Boolean(str(d.projZip)));
    if (d.haveDrawings === 'yes' || d.haveDrawings === 'no') setHaveDrawings(d.haveDrawings);
    if (d.drawings && typeof d.drawings === 'object') {
      setDrawings(d.drawings);
      setRestoredDrawings(d.drawings);
    }
    setFigures(f => pickStrings(d.figures, f));
    setAnswers(a => pickStrings(d.answers, a));
    setCorrections(d.corrections && typeof d.corrections === 'object'
      ? Object.fromEntries(Object.entries(d.corrections).filter(([, v]) => typeof v === 'string'))
      : {});
    setHasClubhouse(str(d.hasClubhouse));
    setCompletedSteps(Array.isArray(d.completedSteps)
      ? d.completedSteps.filter(id => STEPS.some(s => s.id === id))
      : []);
    setSavedAt(typeof d.savedAt === 'string' ? d.savedAt : null);
    setDraftToken(typeof d.serverToken === 'string' ? d.serverToken : null);
    setSavedDraft(null);
    setDraftDecided(true);
    // Back to the page they were on — unless the contact details in the draft
    // would not pass About You today, in which case that page comes first,
    // the same gate a fresh visitor meets.
    const ready = str(d.firstName).trim() && str(d.lastName).trim() && str(d.project).trim()
      && classifyIntakeEmail(str(d.email))?.ok
      && checkLocation({ city: str(d.projCity), state: str(d.projState), zip: str(d.projZip) }).ok;
    const target = ready && STEPS.some(s => s.id === d.stepId) ? d.stepId : 'about';
    goTo(target);
  }

  function discardDraft() {
    clearDraft();
    setDraftToken(null);
    setSavedDraft(null);
    setDraftDecided(true);
  }

  // A draft opened from a resume link needs no Continue / Start fresh question —
  // following the link was the answer.
  useEffect(() => {
    if (savedDraft?.fromLink) restoreDraft();
  }, [savedDraft]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Autosave ──────────────────────────────────────────────────────────────
  // Half a second after the last change, once there is something to keep.
  // Inputs only: never the estimate, never a price, never after Send.
  useEffect(() => {
    if (!draftDecided || submitted) return;
    const hasWork = [firstName, lastName, email, project].some(v => v.trim()) || haveDrawings || drawings;
    if (!hasWork) return;
    const t = setTimeout(() => {
      const when = new Date().toISOString();
      const ok = writeDraft({
        v: 1, savedAt: when, stepId, completedSteps,
        firstName, lastName, email, company, project, projCity, projState, projZip,
        haveDrawings, drawings, figures, corrections, answers, hasClubhouse,
        serverToken: draftTokenRef.current,
      });
      if (ok) setSavedAt(when);
    }, 500);
    return () => clearTimeout(t);
  }, [draftDecided, submitted, stepId, completedSteps, firstName, lastName, email, company, project,
      projCity, projState, projZip, haveDrawings, drawings, figures, corrections, answers, hasClubhouse,
      draftToken]); // a freshly minted token must reach the browser copy too

  // ── Server copy ───────────────────────────────────────────────────────────
  // Three seconds after the last change, and only once the contact details
  // pass About You (a name, a work email, a project, a location) — before that
  // there is nobody to tie the row to. Same inputs as the browser copy, never
  // a price. The first save mints the resume token; later saves update the
  // same row. Overlapping saves are serialised so a slow first save cannot
  // create two rows for one visitor.
  useEffect(() => {
    if (!draftDecided || submitted || !contactReady) return;
    const t = setTimeout(() => {
      const draft = {
        firstName, lastName, email, company, project, projCity, projState, projZip,
        haveDrawings, stepId, completedSteps, hasClubhouse, figures, corrections, answers,
        drawings: manual ? null : drawings,
      };
      const run = async () => {
        if (savingRef.current) { dirtyRef.current = true; return; }
        savingRef.current = true;
        try {
          const res = await fetch('/api/intake/draft', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: draftTokenRef.current, draft }),
          });
          if (res.status === 404 || res.status === 410) {
            // Submitted, put away, or unknown: forget it and start a new row next time.
            setDraftToken(null);
          } else if (res.ok) {
            const body = await res.json().catch(() => ({}));
            if (typeof body.token === 'string' && body.token !== draftTokenRef.current) setDraftToken(body.token);
          }
        } catch { /* offline or blocked — the browser copy still has it */ }
        finally {
          savingRef.current = false;
          if (dirtyRef.current) { dirtyRef.current = false; run(); }
        }
      };
      run();
    }, SERVER_SAVE_DELAY_MS);
    return () => clearTimeout(t);
  }, [draftDecided, submitted, contactReady, stepId, completedSteps, firstName, lastName, email, company, project,
      projCity, projState, projZip, haveDrawings, manual, drawings, figures, corrections, answers, hasClubhouse]);

  const resumeLink = draftToken && typeof window !== 'undefined'
    ? `${window.location.origin}/conceptual_budget?resume=${draftToken}`
    : null;

  async function copyResumeLink() {
    if (!resumeLink) return;
    try {
      await navigator.clipboard.writeText(resumeLink);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2500);
    } catch { window.prompt('Copy this link:', resumeLink); }
  }

  async function emailResumeLink() {
    if (!draftTokenRef.current) return;
    setLinkEmailed(null);
    try {
      const res = await fetch('/api/intake/draft/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: draftTokenRef.current }),
      });
      setLinkEmailed(res.ok ? 'sent' : 'failed');
    } catch { setLinkEmailed('failed'); }
  }

  async function handleSubmit() {
    if (!contactReady || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch('/api/intake/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contactName:  `${firstName.trim()} ${lastName.trim()}`,
          contactEmail: email,
          companyName:  company || null,
          projectName:  project,
          city:         projCity,
          state:        projState,
          zip:          projZip,
          drawingsData: manual ? null : (drawings || null),
          answers: mergedAnswers,
          // Ties the server-side draft to this submission so it leaves the
          // staff "unfinished budgets" list.
          draftToken: draftTokenRef.current,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Submission failed');
      }
      setSubmitted(true);
      // Sent, so there is nothing left to come back to. Cleared AFTER the
      // submitted flag flips, and the autosave stops on that flag, so the
      // last debounced write cannot land behind the clear.
      clearDraft();
      setSavedAt(null);
      setDraftToken(null);
    } catch (err) {
      setSubmitError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  // ── Download PDF ──────────────────────────────────────────────────────────
  // Sends the same inputs as the live estimate — never a number. The server
  // recomputes the budget and renders only what this summary already shows.
  async function handleDownloadPdf() {
    if (pdfBusy) return;
    setPdfBusy(true);
    setPdfError(null);
    try {
      const res = await fetch('/api/intake/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectName: project,
          city:        projCity,
          state:       projState,
          zip:         projZip,
          answers:     mergedAnswers,
          drawings:    manual ? null : drawings,
          timeZone:    Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const e = new Error(body.error || '');
        e.friendly = Boolean(body.error);
        throw e;
      }
      const blob = await res.blob();
      const named = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') || '');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = named ? named[1] : 'ILC-Conceptual-Budget.pdf';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (err) {
      setPdfError(err?.friendly ? err.message : 'We couldn’t make the PDF just now. Please try again in a minute.');
    } finally {
      setPdfBusy(false);
    }
  }

  const budget     = estimate?.budget || null;
  const estimatePd = estimate?.projectData || null;
  const hasEstimate = (estimatePd?.grossSf || 0) > 0 && budget;
  // Typed-in budgets only: the ±10% band the server works out (estimate.js).
  const range = estimate?.range || null;

  // ── Review page — the EXACT internal summary top (Mike, 2026-09-04: "The
  // summary page should match the exact summary page we have internally. You
  // cut the top of that summary page off."): navy hero, Project Data grid,
  // full Budget Breakdown. Same rows and markup as
  // src/app/(app)/project/[id]/summary/page.jsx.
  //
  // Every figure here is TYPE-OVER-ABLE (Mike, 2026-09-15: "We need to be able
  // to manually update any field about the project we see off. None of that
  // can be updated now."). The rows come from estimate.quantities rather than
  // from projectData, because a quantity row carries the things a person needs
  // in order to judge it — its key, what we read, where we read it and any
  // flag — while projectData is only the bare numbers after the fact.
  //
  // A row we found NOTHING for is still listed, with an empty box. Those are
  // the ones most worth typing into, and the old grid hid every one of them.
  const correctableRows = useMemo(() => {
    const rows = estimate?.quantities || [];
    return rows
      .filter(r => r && r.key && r.label && r.unit !== 'text')
      .map(r => ({
        key: r.key,
        label: r.label,
        how: r.flag ? `${r.how} — ${r.flag}` : r.how,
        display: r.value == null ? '' : Number(r.value).toLocaleString('en-US'),
        was: r.wasValue == null ? '' : Number(r.wasValue).toLocaleString('en-US'),
      }));
  }, [estimate]);
  const freightPct     = Math.round((budget?.freightRate     ?? 0.06) * 100);
  const warehousingPct = Math.round((budget?.warehousingRate ?? 0.03) * 100);
  const todayLabel = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  const navBtn = (enabled) =>
    `px-5 py-2.5 rounded-lg font-semibold text-sm transition-colors ${
      enabled ? 'bg-amber-500 hover:bg-amber-400 text-white' : 'bg-slate-200 text-slate-400 cursor-not-allowed'
    }`;
  const backBtn = 'px-4 py-2.5 rounded-lg font-semibold text-sm text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors';

  return (
    <div className="min-h-screen lg:h-screen bg-slate-50 flex flex-col">
      {/* Mobile header — the desktop layout carries branding in the left rail */}
      <header className="lg:hidden bg-white border-b border-slate-200">
        <div className="px-5 py-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-slate-900 flex items-center justify-center shrink-0">
            <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          </div>
          <div className="flex-1">
            <div className="text-base font-semibold text-slate-900 leading-tight">ILC Studios</div>
            <div className="text-xs text-slate-500">Conceptual Lighting Budget</div>
          </div>
          {hasEstimate && !submitted && (
            <div className="text-right">
              <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Live budget</div>
              <div className="text-base font-bold text-slate-900 tabular-nums">{formatCurrency(budget.totalWithControls)}</div>
              {range && (
                <div className="text-[10px] text-slate-400 tabular-nums">
                  likely {formatCurrency(range.low)}–{formatCurrency(range.high)}
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      <div className="flex-1 flex lg:overflow-hidden">
        {!submitted && (
          <PublicSectionNav
            currentStep={stepId}
            completedSteps={completedSteps}
            canNavigate={canNavigate}
            onJump={goTo}
            projectName={project}
          />
        )}

        {/* Main content */}
        <div ref={mainRef} className="flex-1 min-w-0 lg:overflow-y-auto">
          <div className="max-w-3xl mx-auto px-5 sm:px-6 py-8">
            {/* Mobile step chips — the left rail is desktop-only */}
            {!submitted && (
              <div className="lg:hidden flex items-center gap-1.5 flex-wrap mb-6">
                {STEPS.map((s, i) => (
                  <button
                    key={s.id}
                    onClick={() => canNavigate(s.id) && goTo(s.id)}
                    disabled={!canNavigate(s.id)}
                    className={`flex items-center gap-1.5 rounded-full pl-1.5 pr-3 py-1 text-xs font-semibold transition-colors ${
                      s.id === stepId ? 'bg-slate-900 text-white'
                      : completedSteps.includes(s.id) ? 'bg-amber-100 text-amber-800 hover:bg-amber-200'
                      : 'bg-slate-100 text-slate-400'
                    }`}
                  >
                    <span className={`w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center ${
                      s.id === stepId || completedSteps.includes(s.id) ? 'bg-amber-500 text-white' : 'bg-slate-300 text-white'
                    }`}>
                      {completedSteps.includes(s.id) && s.id !== stepId ? '✓' : i + 1}
                    </span>
                    {s.short}
                  </button>
                ))}
              </div>
            )}

            {/* Step header — same treatment as the internal wizard */}
            {!submitted && (
              <div className="mb-6">
                <div className="flex items-center gap-2 text-xs text-slate-400 mb-2">
                  <span>Step {stepIndex + 1} of {STEPS.length}</span>
                  {/* So a visitor knows closing the tab is safe. Browser-only:
                      the words say so, or they'd expect it on their phone too. */}
                  {savedAt && (
                    <span className="ml-auto text-[11px] text-slate-400" title="Saved in this browser only — come back on this device to continue.">
                      Saved in this browser · {fmtSavedAt(savedAt)}
                    </span>
                  )}
                  <div className="flex-1 max-w-32 bg-slate-100 rounded-full h-1">
                    <div
                      className="bg-amber-500 h-1 rounded-full transition-all"
                      style={{ width: `${(stepIndex / (STEPS.length - 1)) * 100}%` }}
                    />
                  </div>
                </div>
                <h1 className="text-xl font-semibold text-slate-900">{step.label}</h1>
                {step.hint && <p className="text-sm text-slate-500 mt-1 max-w-xl">{step.hint}</p>}
              </div>
            )}

            {submitted ? (
              <section className="bg-white rounded-2xl border border-slate-200 p-6">
                <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-4">
                  <p className="text-sm text-green-800 font-semibold">Request received — thanks!</p>
                  <p className="text-xs text-green-700 mt-1">{CONFIRM_NOTE}</p>
                  <p className="text-xs text-green-700 mt-2">
                    An ILC Studios team member will review your submission. If your project is a fit,
                    you&apos;ll receive a secure link to the ILC client portal to view your conceptual budget.
                  </p>
                </div>
              </section>
            ) : (
              <>
                {/* ── About you ── */}
                {stepId === 'about' && (
                  <section className="bg-white rounded-2xl border border-slate-200 p-6">
                    {/* A draft from last time, found in this browser. Offered
                        once, up front; nothing is saved until they choose. */}
                    {savedDraft && (
                      <div className="mb-6 rounded-xl border border-amber-300 bg-amber-50 p-4" role="region" aria-label="Saved budget found">
                        <p className="text-sm font-semibold text-slate-900">Pick up where you left off?</p>
                        <p className="text-xs text-slate-600 mt-1">
                          We kept {String(savedDraft.project ?? '').trim()
                            ? <>your budget for <span className="font-semibold">{String(savedDraft.project).trim()}</span></>
                            : 'your unfinished budget'}
                          {' '}in this browser
                          {typeof savedDraft.savedAt === 'string' && fmtSavedAt(savedDraft.savedAt)
                            ? <> — last saved {fmtSavedAt(savedDraft.savedAt)}</>
                            : null}.
                          {savedDraft.drawings
                            ? ' Your drawings were already read, so you won’t need to upload them again.'
                            : ''}
                        </p>
                        <div className="flex flex-wrap items-center gap-3 mt-3">
                          <button type="button" onClick={restoreDraft} className={navBtn(true)}>
                            Continue where I left off
                          </button>
                          <button
                            type="button"
                            onClick={discardDraft}
                            className="px-5 py-2.5 rounded-lg font-semibold text-sm border border-slate-300 text-slate-700 hover:bg-white transition-colors"
                          >
                            Start fresh
                          </button>
                        </div>
                      </div>
                    )}

                    {/* How this works — what the tool is, what you'll need,
                        how long, and what happens after. Kept light. */}
                    <div className="mb-6 max-w-xl">
                      <p className="text-sm text-slate-600">
                        Get a quick ballpark lighting budget for your project from ILC Studios. It takes a few minutes.
                      </p>
                      <h2 className="text-xs font-bold uppercase tracking-wide text-slate-400 mt-4 mb-2">How this works</h2>
                      <ol className="space-y-2">
                        {HOW_IT_WORKS.map((s, i) => (
                          <li key={s.title} className="flex gap-3 text-sm text-slate-600">
                            <span className="w-5 h-5 mt-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-semibold flex items-center justify-center shrink-0">
                              {i + 1}
                            </span>
                            <span><span className="font-semibold text-slate-800">{s.title}</span> — {s.body}</span>
                          </li>
                        ))}
                      </ol>
                    </div>

                    <div className="grid sm:grid-cols-2 gap-4">
                      <Field label="First name">
                        <input className={inputCls} value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="Jane" />
                      </Field>
                      <Field label="Last name">
                        <input className={inputCls} value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Doe" />
                      </Field>

                      <div className="sm:col-span-2">
                        <Field
                          label="Work email"
                          hint="We use your company domain to connect this to the right account, so personal addresses won't work."
                          error={emailError}
                        >
                          <input
                            className={inputCls}
                            type="email"
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            onBlur={() => setTouchedEmail(true)}
                            placeholder="jane@yourcompany.com"
                          />
                        </Field>
                        {emailCheck?.ok && (
                          <p className="text-xs text-green-600 mt-1">Work email accepted · {emailCheck.domain}</p>
                        )}
                      </div>

                      <Field label="Company" labelRight="Optional">
                        <input className={inputCls} value={company} onChange={e => setCompany(e.target.value)} placeholder="Your company" />
                      </Field>
                      <Field label="Project name">
                        <input className={inputCls} value={project} onChange={e => setProject(e.target.value)} placeholder="Lincoln Avenue Phase 2" />
                      </Field>

                      {/* Where the project is. City takes the room; State fits
                          "District of Columbia"; Zip fits ZIP+4. */}
                      <div className="sm:col-span-2 grid grid-cols-2 sm:grid-cols-[minmax(0,1fr)_12rem_8rem] gap-4">
                        <div className="col-span-2 sm:col-span-1">
                          <Field label="Project city">
                            <input className={inputCls} value={projCity} onChange={e => setProjCity(e.target.value)} placeholder="Austin" maxLength={100} />
                          </Field>
                        </div>
                        <Field label="State">
                          <select className={inputCls} value={projState} onChange={e => setProjState(e.target.value)}>
                            <option value="">Choose…</option>
                            {US_STATES.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
                          </select>
                        </Field>
                        <Field label="Zip code" error={touchedZip && projZip.trim() && !projLoc.zip ? 'Enter a 5-digit zip code.' : null}>
                          <input
                            className={inputCls}
                            inputMode="numeric"
                            maxLength={10}
                            value={projZip}
                            onChange={e => setProjZip(e.target.value)}
                            onBlur={() => setTouchedZip(true)}
                            placeholder="78701"
                          />
                        </Field>
                      </div>
                    </div>

                    <div className="flex items-center justify-between mt-6">
                      <span className="text-xs text-slate-400">
                        {contactReady ? 'Your details look good' : 'All fields except Company are required'}
                      </span>
                      <button onClick={() => contactReady && markDoneAndGo('drawings')} disabled={!contactReady} className={navBtn(contactReady)}>
                        Continue to drawings →
                      </button>
                    </div>
                  </section>
                )}

                {/* ── Drawings ──
                    Always MOUNTED, hidden with CSS when another step is active.
                    Unmounting DrawingDropzone loses its per-file UI state (the
                    `items` list lives inside the component), so clicking back
                    to this step showed an empty dropzone even though the parsed
                    results survived in `drawings` (Mike, 2026-09-04: "When I
                    clicked back to the budgeting tab, the drawings disappear
                    from view. They should still be there."). Keeping it mounted
                    also protects uploads still in flight on other steps. */}
                <section className={cn(
                  'bg-white rounded-2xl border border-slate-200 p-6',
                  stepId !== 'drawings' && 'hidden'
                )}>
                    <h3 className="text-sm font-semibold text-slate-800 mb-3">Do you have drawings?</h3>
                    <div className="grid sm:grid-cols-2 gap-3 mb-6">
                      {[
                        { v: 'yes', title: 'Yes — I have drawings', body: 'Drop them in and we read the square footage and counts for you.' },
                        { v: 'no',  title: 'No drawings yet',       body: 'Type in what you know — we estimate the rest.' },
                      ].map(o => (
                        <button
                          key={o.v}
                          type="button"
                          onClick={() => setHaveDrawings(o.v)}
                          className={cn(
                            'text-left rounded-xl border p-4 transition-colors',
                            haveDrawings === o.v
                              ? 'border-amber-400 bg-amber-50 ring-2 ring-amber-100'
                              : 'border-slate-200 hover:border-slate-300 bg-white'
                          )}
                        >
                          <span className="block text-sm font-semibold text-slate-900">{o.title}</span>
                          <span className="block text-xs text-slate-500 mt-1">{o.body}</span>
                        </button>
                      ))}
                    </div>

                    {/* Project type — asked here, up front, for both paths (Mike,
                        2026-09-12: "ask what kind of building type this is on the
                        drawing screen … If we put it further at the front it can
                        conditionally change other questions"). Town Houses and Single
                        Family turn on the walking-path bollard question on the Exterior page. */}
                    {haveDrawings !== null && (
                      <div className="mb-6">
                        <Field label="What type of project is this?" labelRight="Required"
                          hint="Sets stairs, wall packs, pathway lighting and the controls the code requires.">
                          <select
                            className={cn(inputCls, 'sm:max-w-xs')}
                            value={answers.projectType ?? ''}
                            onChange={e => setAnswers(a => ({ ...a, projectType: e.target.value }))}
                          >
                            <option value="">Choose one…</option>
                            {PROJECT_TYPE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                          </select>
                        </Field>
                        {guessedType && answers.projectType === guessedType && (
                          <p className="text-xs text-amber-600 mt-1.5">Pre-filled from your drawings — change it if we got it wrong.</p>
                        )}
                      </div>
                    )}

                    {/* The dropzone stays MOUNTED when "No" is picked (hidden with
                        CSS) so switching back keeps the uploaded files. */}
                    <div className={cn(haveDrawings !== 'yes' && 'hidden')}>
                    <p className="text-sm text-slate-500 mb-5">
                      The most useful sheet is the one with the <strong>unit matrix</strong> — building square footage and
                      unit counts. We read it automatically so you don&apos;t have to type it in.
                    </p>

                    <DrawingDropzone onResults={setDrawings} restored={restoredDrawings} />

                    {/* Building summary — everything the takeoff pulled from the
                        drawings, shown right where they were uploaded. Values +
                        provenance only; no pricing. */}
                    {drawings && pulledRows.found.length > 0 && (
                      <div className="mt-6 border border-slate-200 rounded-xl overflow-hidden">
                        <div className="px-4 py-3 bg-slate-50 border-b border-slate-100">
                          <h3 className="text-sm font-semibold text-slate-800">Building summary — what we pulled from your drawings</h3>
                          <p className="text-xs text-slate-400 mt-0.5">
                            Every figure below feeds your budget. Figures marked “est.” are our arithmetic, not read off a sheet — hover any number to see where it came from.
                          </p>
                        </div>
                        <div className="p-4 grid sm:grid-cols-2 gap-x-8 gap-y-2.5">
                          {pulledRows.found.map(r => (
                            <div key={r.key} className="flex items-baseline justify-between gap-3">
                              <span className="text-sm text-slate-600">{r.label}</span>
                              <span
                                className="text-sm font-semibold text-slate-900 text-right shrink-0"
                                title={[r.how, r.flag].filter(Boolean).join(' ')}
                              >
                                {Number(r.value).toLocaleString('en-US')}{r.unit === 'sf' ? ' SF' : ''}
                                {r.source === 'derived' && <span className="font-normal text-slate-400"> (est.)</span>}
                                {r.flag && <span className="text-amber-500" title={r.flag}> ⚠</span>}
                              </span>
                            </div>
                          ))}
                        </div>
                        {pulledRows.missing.length > 0 && (
                          <div className="px-4 pb-4">
                            <p className="text-xs text-slate-400">
                              Couldn’t read from the drawings (we’ll ask you on the next pages):{' '}
                              {pulledRows.missing.map(r => r.label).join(' · ')}
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                    </div>

                    {/* ── No drawings: the typed-in figures form ── */}
                    {manual && (
                      <div className="space-y-6">
                        <p className="text-sm text-slate-600">
                          <strong>The more detail you give us, the more accurate your budget.</strong> Fill in everything
                          you know — real numbers beat our estimates. If you don&apos;t know something, leave it and
                          we&apos;ll estimate it from our past projects; you can type over any estimate. Our team checks
                          every estimate before a budget goes out.
                        </p>
                        <div>
                          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-xs mb-1.5">
                            <span className="font-semibold text-slate-700">
                              You&apos;ve given us {manualFilled} of {manualFields.length} figures
                            </span>
                            <span className="text-slate-500">
                              {manualFilled === manualFields.length
                                ? 'Every figure is yours — the most accurate budget we can give without drawings'
                                : 'We estimate the rest'}
                            </span>
                          </div>
                          <div
                            className="h-2 w-full overflow-hidden rounded-full bg-slate-100"
                            role="progressbar"
                            aria-label="Figures filled in"
                            aria-valuemin={0}
                            aria-valuemax={manualFields.length}
                            aria-valuenow={manualFilled}
                          >
                            <div
                              className="h-full rounded-full bg-amber-500 transition-all duration-300"
                              style={{ width: `${Math.round((manualFilled / manualFields.length) * 100)}%` }}
                            />
                          </div>
                        </div>
                        <div className="grid sm:grid-cols-3 gap-4">
                          {MANUAL_FIELDS.filter(f => f.need).map(f => (
                            <FigureField
                              key={f.key}
                              label={f.label}
                              labelRight={f.need === 'required' ? 'Required' : f.key === 'figureGrossSf' ? 'Required — or unit size' : 'Or this'}
                              hint={f.hint}
                              note={manualNote(f)}
                            >
                              {manualInput(f)}
                            </FigureField>
                          ))}
                        </div>
                        <div>
                          <h3 className="text-sm font-semibold text-slate-800">The more of these you know, the more accurate your budget</h3>
                          <p className="text-xs text-slate-500 mt-0.5">Don&apos;t know one? Leave it and we&apos;ll estimate it.</p>
                          {/* No "Optional" tag on each box — the heading already says it. */}
                          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-3">
                            <FigureField label="Is there a clubhouse?" hint="A clubhouse, leasing office or fitness room.">
                              <select
                                className={inputCls}
                                value={hasClubhouse}
                                onChange={e => setHasClubhouse(e.target.value)}
                              >
                                <option value="">Not sure</option>
                                <option value="yes">Yes</option>
                                <option value="no">No</option>
                              </select>
                            </FigureField>
                            {manualFields.filter(f => !f.need).map(f => (
                              <FigureField key={f.key} label={f.label} hint={f.hint} note={manualNote(f)}>
                                {manualInput(f)}
                              </FigureField>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="flex items-center justify-between mt-6">
                      <button onClick={goPrev} className={backBtn}>← Back</button>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-slate-400">
                          {haveDrawings === null
                            ? 'Choose Yes or No above'
                            : !answers.projectType
                              ? 'Choose the project type above'
                            : manual
                              ? (manualCheck.ready
                                  ? 'Your live budget is ready'
                                  : `Still needed: ${manualCheck.missing.join(', ')}`)
                              : drawings
                                ? `${drawings.sources.length} drawing${drawings.sources.length !== 1 ? 's' : ''} read`
                                : 'Upload drawings to see live pricing — you can still submit without them'}
                        </span>
                        {(() => {
                          const ok = !!answers.projectType && (haveDrawings === 'yes' || (manual && manualCheck.ready));
                          return (
                            <button onClick={() => ok && goNext()} disabled={!ok} className={navBtn(ok)}>
                              {manual || drawings || haveDrawings === null ? 'Continue to units →' : 'Skip — continue to units →'}
                            </button>
                          );
                        })()}
                      </div>
                    </div>
                  </section>

                {/* ── Building-area pages ── */}
                {step.sections && (
                  <>
                    {/* Figures the drawings couldn't answer — asked once, on the
                        Units page, where the numbers they drive live. */}
                    {stepId === 'units' && figureAsks.length > 0 && (
                      <section className="bg-amber-50 border border-amber-200 rounded-2xl p-5 mb-4">
                        <h3 className="text-sm font-semibold text-amber-900">
                          Figures we couldn’t read from your drawings
                        </h3>
                        <p className="text-xs text-amber-700 mt-1">
                          Everything else came straight off the drawings — these we need from you.
                        </p>
                        <div className="grid sm:grid-cols-2 gap-4 mt-4">
                          {figureAsks.map(f => (
                            <div key={f.key}>
                              <Field label={f.label}>
                                <input
                                  className={cn(inputCls, figureBoxCls)}
                                  inputMode="numeric"
                                  value={figures[f.key]}
                                  onChange={e => setFigures(x => ({ ...x, [f.key]: e.target.value }))}
                                  placeholder={f.placeholder}
                                />
                              </Field>
                              {f.row?.source === 'derived' && !String(figures[f.key] ?? '').trim() && (
                                <p className="text-xs text-amber-600 mt-1.5">
                                  Our estimate: <strong>{Number(f.row.value).toLocaleString('en-US')}</strong>
                                  {f.row.how ? ` — ${f.row.how}` : ''}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      </section>
                    )}
                    <div className="space-y-4">
                      {step.sections.flatMap(name => questionsBySection.get(name) || [])
                        // Walking-path bollards: townhomes and single-family only (Mike, 2026-09-12).
                        .filter(q => q.key !== 'pathwayBollards' || BOLLARD_PROJECT_TYPES.includes(answers.projectType))
                        .map(q => (
                        <div key={q.key}>
                          {q.key === 'interiorAmenityFinish' ? (
                            // $4–$16 in three finish tiers — same picker as the internal wizard.
                            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                              <div className="mb-4">
                                <p className="font-semibold text-slate-900">{q.question}</p>
                                {q.hint && <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">{q.hint}</p>}
                              </div>
                              <InteriorTierPicker
                                value={answers[q.key] ?? ''}
                                onChange={v => setAnswers(a => ({ ...a, [q.key]: v }))}
                              />
                            </div>
                          ) : (
                          <QuestionCard
                            question={q.question}
                            note={q.hint}
                            value={answers[q.key] ?? ''}
                            onChange={v => setAnswers(a => ({ ...a, [q.key]: v }))}
                            options={q.options.map(opt => ({ value: opt, label: optionLabel(q, opt) }))}
                            // Per-answer cost comes from the server's estimate — never priced here.
                            impact={q.engine ? estimate?.budget?.questionCosts?.[`${q.engine.section}.${q.engine.field}`] : undefined}
                          />
                          )}
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center justify-between mt-6">
                      <button onClick={goPrev} className={backBtn}>← Back</button>
                      <button onClick={goNext} className={navBtn(true)}>
                        {stepIndex === STEPS.length - 2 ? 'Review & send →' : 'Continue →'}
                      </button>
                    </div>
                  </>
                )}

                {/* ── Review & send — the internal summary page, then the send form ── */}
                {stepId === 'review' && (
                  <div className="space-y-5">
                    {/* Budget hero — dark navy, identical to the internal summary */}
                    {hasEstimate && (
                      <div
                        className="rounded-2xl p-6 text-white"
                        style={{ backgroundColor: '#0f172a' }}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <div className="text-xs font-medium mb-1" style={{ color: '#94a3b8' }}>
                              ILC Studios — Conceptual Lighting &amp; Controls Budget
                            </div>
                            <div className="text-3xl font-bold tabular-nums mb-2">
                              {formatCurrency(budget.totalWithControls)}
                            </div>
                            {range && (
                              <div className="text-sm mb-2 tabular-nums" style={{ color: '#cbd5e1' }}>
                                Likely between {formatCurrency(range.low)} and {formatCurrency(range.high)} — built from typed-in figures, without drawings.
                              </div>
                            )}
                            <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
                              <div><span style={{ color: '#94a3b8' }}>Lighting Only: </span><span className="font-semibold">{formatCurrency(budget.subtotalLightingOnly)}</span></div>
                              <div><span style={{ color: '#94a3b8' }}>Controls (w/ F&amp;W): </span><span className="font-semibold">{formatCurrency(budget.controlsTotal)}</span></div>
                              {budget.perSf  > 0 && <div><span style={{ color: '#94a3b8' }}>$/SF: </span><span className="font-semibold">${budget.perSf.toFixed(2)}</span></div>}
                              {budget.perUnit > 0 && <div><span style={{ color: '#94a3b8' }}>$/Unit: </span><span className="font-semibold">{formatCurrency(budget.perUnit)}</span></div>}
                            </div>
                          </div>
                          <div className="text-right hidden sm:block shrink-0">
                            <div className="text-sm font-semibold" style={{ color: '#e2e8f0' }}>{project}</div>
                            <div className="text-xs mt-0.5" style={{ color: '#64748b' }}>{todayLabel}</div>
                          </div>
                        </div>
                        <p className="text-xs mt-2" style={{ color: '#475569' }}>
                          Conceptual estimate. Does not include sales tax. {CONFIRM_NOTE}
                        </p>
                      </div>
                    )}

                    {/* Project Data — horizontal grid, identical to the internal summary */}
                    {hasEstimate && correctableRows.length > 0 && (
                      <div className="bg-white rounded-xl border border-slate-200 p-5">
                        <h3 className="font-bold text-slate-900 mb-1">Project Data</h3>
                        <p className="text-xs text-slate-500 mb-4">
                          These came off your drawings. If one looks wrong, type the right number over it —
                          the budget updates straight away and we keep what we read on file.
                        </p>
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-3">
                          {correctableRows.map(row => {
                            const typed = String(corrections[row.key] ?? '');
                            const edited = typed.trim() !== '';
                            return (
                              <div key={row.key}>
                                <div className="text-xs text-slate-400">{row.label}</div>
                                <input
                                  className={cn(
                                    'w-full bg-transparent px-0 py-0.5 text-sm font-semibold tabular-nums border-0 border-b border-dashed focus:outline-none focus:ring-0 focus:border-solid focus:border-amber-400',
                                    edited ? 'text-amber-700 border-amber-300 border-solid' : 'text-slate-900 border-slate-200',
                                  )}
                                  inputMode="numeric"
                                  aria-label={`${row.label} — type over it to correct it`}
                                  value={edited ? typed : row.display}
                                  onFocus={e => { const el = e.target; requestAnimationFrame(() => el.select()); }}
                                  onChange={e => setCorrections(x => ({ ...x, [row.key]: e.target.value }))}
                                  placeholder={row.display ? undefined : 'not found'}
                                  title={row.how || undefined}
                                />
                                {edited && (
                                  <button
                                    type="button"
                                    className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-600 hover:text-amber-700"
                                    onClick={() => setCorrections(x => { const next = { ...x }; delete next[row.key]; return next; })}
                                  >
                                    Corrected{row.was ? ` — was ${row.was}` : ''} · undo
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Budget Breakdown — the same component the internal summary renders */}
                    {hasEstimate && (
                      <div className="bg-white rounded-xl border border-slate-200 p-5">
                        <div className="flex items-center justify-between mb-3">
                          <h3 className="font-bold text-slate-900">Budget Breakdown</h3>
                          <span className="text-xs text-slate-400 italic">Hover a line for details</span>
                        </div>
                        <SummaryBudgetBreakdown budget={budget} freightPct={freightPct} warehousingPct={warehousingPct} />
                      </div>
                    )}

                    {/* Keep a copy — PDF download, plus email once it's wired up */}
                    {hasEstimate && (
                      <div className="bg-white rounded-xl border border-slate-200 p-5">
                        <h3 className="font-bold text-slate-900">Keep a copy</h3>
                        <p className="text-xs text-slate-500 mt-0.5">Download this budget as a PDF to share with your team.</p>
                        <div className="flex flex-wrap items-center gap-3 mt-3">
                          <button
                            type="button"
                            onClick={handleDownloadPdf}
                            disabled={pdfBusy}
                            className={cn(
                              'px-5 py-2.5 rounded-lg font-semibold text-sm border transition-colors',
                              pdfBusy
                                ? 'border-slate-200 text-slate-400 cursor-wait'
                                : 'border-slate-300 text-slate-700 hover:bg-slate-50'
                            )}
                          >
                            {pdfBusy ? 'Preparing…' : 'Download PDF'}
                          </button>
                          {RESUME_LINK_ENABLED && resumeLink ? (
                            <>
                              <button
                                type="button"
                                onClick={copyResumeLink}
                                className="px-5 py-2.5 rounded-lg font-semibold text-sm border border-slate-300 text-slate-700 hover:bg-slate-50 transition-colors"
                              >
                                {linkCopied ? 'Link copied' : 'Copy my resume link'}
                              </button>
                              <button
                                type="button"
                                onClick={emailResumeLink}
                                className="px-5 py-2.5 rounded-lg font-semibold text-sm border border-slate-300 text-slate-700 hover:bg-slate-50 transition-colors"
                              >
                                Email me the link
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              disabled
                              aria-disabled="true"
                              className="px-5 py-2.5 rounded-lg font-semibold text-sm border border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed"
                            >
                              Email this budget
                            </button>
                          )}
                        </div>
                        {RESUME_LINK_ENABLED && resumeLink ? (
                          <p className="text-xs text-slate-400 mt-2">
                            {linkEmailed === 'sent' && `Sent to ${email}. `}
                            {linkEmailed === 'failed' && 'We could not send the email just now — copy the link instead. '}
                            The link opens this budget on any device. Anyone with it can see what you entered, so keep it to yourself.
                          </p>
                        ) : (
                          <p className="text-xs text-slate-400 mt-2">Coming soon — email isn&apos;t connected yet.</p>
                        )}
                        {pdfError && <p className="text-xs text-red-600 mt-2" role="alert">{pdfError}</p>}
                      </div>
                    )}

                  <section className="bg-white rounded-2xl border border-slate-200 p-6">
                    <h3 className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-2">Your details</h3>
                    <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
                      <div className="flex justify-between gap-3 border-b border-slate-100 py-1.5">
                        <dt className="text-slate-400">Name</dt>
                        <dd className="text-slate-800 font-medium text-right">{firstName} {lastName}</dd>
                      </div>
                      <div className="flex justify-between gap-3 border-b border-slate-100 py-1.5">
                        <dt className="text-slate-400">Email</dt>
                        <dd className="text-slate-800 font-medium text-right break-all">{email}</dd>
                      </div>
                      <div className="flex justify-between gap-3 border-b border-slate-100 py-1.5">
                        <dt className="text-slate-400">Company</dt>
                        <dd className="text-slate-800 font-medium text-right">{company || '—'}</dd>
                      </div>
                      <div className="flex justify-between gap-3 border-b border-slate-100 py-1.5">
                        <dt className="text-slate-400">Project</dt>
                        <dd className="text-slate-800 font-medium text-right">{project}</dd>
                      </div>
                      <div className="flex justify-between gap-3 border-b border-slate-100 py-1.5 sm:col-span-2">
                        <dt className="text-slate-400">Drawings</dt>
                        <dd className="text-slate-800 font-medium text-right">
                          {manual
                            ? 'None — figures typed in'
                            : drawings ? `${drawings.sources.length} file${drawings.sources.length !== 1 ? 's' : ''} read` : 'None uploaded'}
                        </dd>
                      </div>
                    </dl>

                    <div className="mt-4">
                      <h3 className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-2">Your design choices</h3>
                      <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-1 text-xs">
                        {INTAKE_QUESTIONS.map(q => (
                          <div key={q.key} className="flex justify-between gap-3 py-1 border-b border-slate-50 min-w-0">
                            <dt className="text-slate-400 truncate min-w-0">{q.question.replace(/\s*\(.*\)\s*/g, ' ').trim()}</dt>
                            <dd className="text-slate-700 font-medium text-right shrink-0">
                              {answers[q.key] ? optionLabel(q, answers[q.key]) : '—'}
                            </dd>
                          </div>
                        ))}
                        {fieldsFor(manual ? MANUAL_FIELDS : FIGURE_FIELDS, answers.projectType).filter(f => String(figures[f.key] ?? '').trim()).map(f => (
                          <div key={f.key} className="flex justify-between gap-3 py-1 border-b border-slate-50 min-w-0">
                            <dt className="text-slate-400 truncate min-w-0">{f.label} (entered by you)</dt>
                            <dd className="text-slate-700 font-medium text-right shrink-0">{figures[f.key]}</dd>
                          </div>
                        ))}
                      </dl>
                    </div>

                    {submitError && (
                      <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 mt-4">
                        <p className="text-xs text-red-700">{submitError} — please try again or email us directly.</p>
                      </div>
                    )}

                    <div className="flex items-center justify-between mt-6">
                      <button onClick={goPrev} className={backBtn}>← Back</button>
                      <button onClick={handleSubmit} disabled={!contactReady || submitting} className={navBtn(contactReady && !submitting)}>
                        {submitting ? 'Sending…' : 'Submit budget request'}
                      </button>
                    </div>
                  </section>
                  </div>
                )}
              </>
            )}

            <p className="text-xs text-slate-400 text-center pt-6 pb-6">
              Conceptual estimate only. An ILC Studios team member reviews every submission before a budget is issued.
            </p>
          </div>
        </div>

        {/* ── Live budget — the SAME BudgetSidebar the internal wizard renders ── */}
        {!submitted && (
          hasEstimate ? (
            <div className="hidden lg:flex shrink-0">
              <BudgetSidebar budget={budget} projectData={estimatePd} currentStep={step.budgetStep || null} range={range} />
            </div>
          ) : (
            <aside className="hidden lg:flex w-64 bg-white border-l border-slate-100 flex-col shrink-0">
              <div className="px-4 py-4 bg-navy-950 border-b border-navy-800">
                <div className="text-xs font-semibold text-navy-400 uppercase tracking-widest mb-1">Live Budget</div>
                <div className="text-2xl font-bold text-white tabular-nums">—</div>
              </div>
              <div className="px-4 py-4">
                <p className="text-xs text-slate-400 leading-relaxed">
                  Upload your drawings and answer the design questions to watch your budget build itself.
                </p>
                <p className="text-xs text-slate-400 mt-2 leading-relaxed">{CONFIRM_NOTE}</p>
              </div>
            </aside>
          )
        )}
      </div>
    </div>
  );
}
