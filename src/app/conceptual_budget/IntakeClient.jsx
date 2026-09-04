'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import DrawingDropzone from '@/components/intake/DrawingDropzone';
import BudgetSidebar from '@/components/wizard/BudgetSidebar';
import SummaryBudgetBreakdown from '@/app/(app)/project/[id]/summary/SummaryBudgetBreakdown';
import QuestionCard from '@/components/sections/QuestionCard';
import { classifyIntakeEmail } from '@/lib/intake';
import { INTAKE_QUESTIONS } from '@/lib/intake/questionnaire';
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

/**
 * The step list, mirroring the internal wizard's area order
 * (units → corridors → amenities → exterior → emergency → controls).
 * `sections` names the INTAKE_QUESTIONS groups shown on that page;
 * `budgetStep` is the internal step id BudgetSidebar highlights.
 */
const STEPS = [
  { id: 'about',     short: 'About You',     label: 'About You & Your Project' },
  { id: 'drawings',  short: 'Drawings',      label: 'Upload Drawings' },
  { id: 'units',     short: 'Units',         label: 'Residential Units',      sections: ['Residential units'],        budgetStep: 'units' },
  { id: 'corridors', short: 'Corridors',     label: 'Corridors & Stairwells', sections: ['Corridors and stairwells'], budgetStep: 'corridors' },
  { id: 'amenities', short: 'Amenities',     label: 'Interior Amenities',     sections: ['Interior amenities'],       budgetStep: 'amenities' },
  { id: 'exterior',  short: 'Exterior',      label: 'Exterior & Site',        sections: ['Exterior'],                 budgetStep: 'exterior' },
  { id: 'emergency', short: 'Emergency',     label: 'Emergency Lighting',     sections: ['Emergency'],                budgetStep: 'emergency' },
  { id: 'controls',  short: 'Controls',      label: 'Controls & Energy',      sections: ['Controls', 'Energy codes'], budgetStep: 'controls' },
  { id: 'review',    short: 'Review & Send', label: 'Review & Send' },
];

/**
 * The figures the wizard asks the visitor to TYPE when the drawings didn't
 * answer them (Mike, 2026-09-04: "answer as many of these questions as
 * possible and then ask them for what we can't find"). `key` matches
 * FIGURE_KEYS in questionnaire.js — the server-side whitelist that lets these
 * ride inside `answers`; `qKey` is the computeQuantities row each one settles.
 */
const FIGURE_FIELDS = [
  { key: 'figureGrossSf',        qKey: 'grossSf',          label: 'Total building gross SF',  placeholder: 'e.g. 364,000' },
  { key: 'figureTotalUnits',     qKey: 'totalUnits',       label: 'Total units',              placeholder: 'e.g. 234' },
  { key: 'figureStories',        qKey: 'stories',          label: '# Stories',                placeholder: 'e.g. 4' },
  { key: 'figureStairwells',     qKey: 'egressStairwells', label: '# Egress stairwells',      placeholder: 'e.g. 3' },
  { key: 'figureExitDoors',      qKey: 'exitDoors',        label: '# Exit doors',             placeholder: 'e.g. 8' },
  { key: 'figureSurfaceParking', qKey: 'surfaceParking',   label: '# Surface parking stalls', placeholder: 'e.g. 120' },
];

function Field({ label, labelRight, hint, error, children }) {
  return (
    <label className="block">
      <span className="flex items-baseline justify-between gap-2">
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
  const [touchedEmail, setTouchedEmail] = useState(false);
  const [drawings, setDrawings] = useState(null);
  // Figures the visitor types when the drawings couldn't answer them (or to
  // override a derived estimate). Kept apart from `answers` so the radio-group
  // state stays purely INTAKE_QUESTIONS; merged in at the payload boundary.
  const [figures, setFigures] = useState(() => {
    const init = {};
    for (const f of FIGURE_FIELDS) init[f.key] = '';
    return init;
  });
  const [answers, setAnswers] = useState(() => {
    const init = {};
    for (const q of INTAKE_QUESTIONS) init[q.key] = q.default ?? '';
    return init;
  });
  const [estimate, setEstimate] = useState(null); // { budget, projectData } from the server
  const [submitting, setSubmitting] = useState(false);
  const [submitted,  setSubmitted]  = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const mainRef = useRef(null);

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
    return out;
  }, [answers, figures]);

  // ── Live server-side estimate ──────────────────────────────────────────────
  // Debounced: every answer flip re-prices, but a burst of changes is one call.
  // Drawings are the ticket in (Mike, 2026-09-04): no live number without
  // them. Typed figures only REFINE an estimate the drawings started.
  const estimateSeq = useRef(0);
  useEffect(() => {
    if (!drawings) { setEstimate(null); return; }
    const seq = ++estimateSeq.current;
    const t = setTimeout(async () => {
      try {
        const res = await fetch('/api/intake/estimate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ answers: mergedAnswers, drawings }),
        });
        if (!res.ok) return; // keep the last good estimate
        const data = await res.json();
        if (seq === estimateSeq.current) setEstimate(data);
      } catch { /* transient network failure — keep the last good estimate */ }
    }, 500);
    return () => clearTimeout(t);
  }, [mergedAnswers, figures, drawings]);

  // ── "We couldn't find these" — the figures asked for on the Units page ────
  // Driven by the estimate's provenance rows: a figure whose source is
  // 'drawing' is settled and never asked. source null → plain ask; 'derived'
  // → show our estimate with its arithmetic and offer the override. Only
  // shown once drawings have been read — no drawings, no card, no number.
  const figureAsks = useMemo(() => {
    if (!estimate) return [];
    const rows = new Map((estimate?.quantities || []).map(r => [r.key, r]));
    return FIGURE_FIELDS.map(f => {
      const row = rows.get(f.qKey) || null;
      if (row && row.source === 'drawing') return null;
      return { ...f, row };
    }).filter(Boolean);
  }, [estimate]);

  const questionsBySection = useMemo(() => {
    const out = new Map();
    for (const q of INTAKE_QUESTIONS) {
      if (!out.has(q.section)) out.set(q.section, []);
      out.get(q.section).push(q);
    }
    return out;
  }, []);

  const contactReady =
    firstName.trim() && lastName.trim() && project.trim() && emailCheck?.ok;

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
          drawingsData: drawings || null,
          answers: mergedAnswers,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Submission failed');
      }
      setSubmitted(true);
    } catch (err) {
      setSubmitError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  const budget     = estimate?.budget || null;
  const estimatePd = estimate?.projectData || null;
  const hasEstimate = (estimatePd?.grossSf || 0) > 0 && budget;

  // ── Review page — the EXACT internal summary top (Mike, 2026-09-04: "The
  // summary page should match the exact summary page we have internally. You
  // cut the top of that summary page off."): navy hero, Project Data grid,
  // full Budget Breakdown. Same rows and markup as
  // src/app/(app)/project/[id]/summary/page.jsx.
  const pdRows = useMemo(() => {
    const pd = estimatePd || {};
    return [
      { label: 'Total Gross SF',         value: pd.grossSf             ? pd.grossSf.toLocaleString()           : null },
      { label: 'Units Gross SF',         value: pd.unitsSf             ? pd.unitsSf.toLocaleString()           : null },
      { label: '# of Units',             value: pd.numUnits            ? pd.numUnits.toLocaleString()          : null },
      { label: '# of Bedrooms',          value: pd.numBedrooms         ? pd.numBedrooms.toLocaleString()       : null },
      { label: '# of Bathrooms',         value: pd.numBathrooms        ? pd.numBathrooms.toLocaleString()      : null },
      { label: '# of Vanities',          value: pd.numVanities         ? pd.numVanities.toLocaleString()       : null },
      { label: '# of Balconies',         value: pd.numBalconies        ? pd.numBalconies.toLocaleString()      : null },
      { label: 'Stairwell Landings',     value: pd.numEgressStairwells ? pd.numEgressStairwells.toString()     : null },
      { label: 'Corridor SF',            value: pd.corridorSf          ? pd.corridorSf.toLocaleString()        : null },
      { label: 'Interior Amenity SF',    value: pd.interiorAmenitySf   ? pd.interiorAmenitySf.toLocaleString() : null },
      { label: 'Exterior Amenity SF',    value: pd.exteriorAmenitySf   ? pd.exteriorAmenitySf.toLocaleString() : null },
      { label: 'Garage SF',              value: pd.garageSf            ? pd.garageSf.toLocaleString()          : null },
      { label: 'BOH SF',                 value: pd.bohSf               ? pd.bohSf.toLocaleString()             : null },
      { label: 'Surface Parking Stalls', value: pd.numSurfaceParking   ? pd.numSurfaceParking.toString()       : null },
      { label: '# of Carports',          value: pd.numCarports         ? pd.numCarports.toString()             : null },
      { label: '# of Exterior Doors',    value: pd.numExteriorDoors    ? pd.numExteriorDoors.toString()        : null },
    ].filter(r => r.value);
  }, [estimatePd]);
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
                  <div className="flex-1 max-w-32 bg-slate-100 rounded-full h-1">
                    <div
                      className="bg-amber-500 h-1 rounded-full transition-all"
                      style={{ width: `${(stepIndex / (STEPS.length - 1)) * 100}%` }}
                    />
                  </div>
                </div>
                <h1 className="text-xl font-semibold text-slate-900">{step.label}</h1>
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
                    <p className="text-sm text-slate-500 mb-6 max-w-xl">
                      Tell us about your project and upload your drawings. We&apos;ll read the building data
                      straight from them and build a conceptual lighting and controls budget as you answer.
                    </p>

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
                    <p className="text-sm text-slate-500 mb-5">
                      The most useful sheet is the one with the <strong>unit matrix</strong> — building square footage and
                      unit counts. We read it automatically so you don&apos;t have to type it in.
                    </p>

                    <DrawingDropzone onResults={setDrawings} />

                    <div className="flex items-center justify-between mt-6">
                      <button onClick={goPrev} className={backBtn}>← Back</button>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-slate-400">
                          {drawings
                            ? `${drawings.sources.length} drawing${drawings.sources.length !== 1 ? 's' : ''} read`
                            : 'Upload drawings to see live pricing — you can still submit without them'}
                        </span>
                        <button onClick={goNext} className={navBtn(true)}>
                          {drawings ? 'Continue to units →' : 'Skip — continue to units →'}
                        </button>
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
                                  className={inputCls}
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
                      {step.sections.flatMap(name => questionsBySection.get(name) || []).map(q => (
                        <div key={q.key}>
                          <QuestionCard
                            question={q.question}
                            note={q.hint}
                            value={answers[q.key] ?? ''}
                            onChange={v => setAnswers(a => ({ ...a, [q.key]: v }))}
                            options={q.options.map(opt => ({ value: opt, label: optionLabel(q, opt) }))}
                          />
                          {q.key === 'projectType' && guessedType && answers.projectType === guessedType && (
                            <p className="text-xs text-amber-600 mt-1.5">Pre-filled from your drawings — change it if we got it wrong.</p>
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
                    {hasEstimate && pdRows.length > 0 && (
                      <div className="bg-white rounded-xl border border-slate-200 p-5">
                        <h3 className="font-bold text-slate-900 mb-3">Project Data</h3>
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-2">
                          {pdRows.map(row => (
                            <div key={row.label}>
                              <div className="text-xs text-slate-400">{row.label}</div>
                              <div className="text-sm font-semibold text-slate-900 tabular-nums">{row.value}</div>
                            </div>
                          ))}
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
                          {drawings ? `${drawings.sources.length} file${drawings.sources.length !== 1 ? 's' : ''} read` : 'None uploaded'}
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
                        {FIGURE_FIELDS.filter(f => String(figures[f.key] ?? '').trim()).map(f => (
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
              <BudgetSidebar budget={budget} projectData={estimatePd} currentStep={step.budgetStep || null} />
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
