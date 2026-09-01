'use client';
import { useEffect, useMemo, useState } from 'react';
import DrawingDropzone from '@/components/intake/DrawingDropzone';
import { classifyIntakeEmail } from '@/lib/intake';
import { INTAKE_QUESTIONS } from '@/lib/intake/questionnaire';

/**
 * Public conceptual-budget intake.
 *
 * Scope of this pass: contact capture + work-email gating + the multi-file
 * drawing upload/parse step. Submission is NOT wired yet — it needs the
 * `ConceptualSubmission` model that does not exist yet. The submit button
 * is deliberately disabled with a visible explanation rather than silently
 * dropping a stranger's work on the floor.
 *
 * Duplicate project-name checking is intentionally NOT done live here. Doing
 * so against all projects from an unauthenticated page would let anyone
 * enumerate the client project list by guessing names. It belongs either in
 * the ILC review queue, or scoped to the submitter's own resolved client once
 * email→client mapping exists. See `findDuplicateProjects` in lib/intake.js.
 */

function Field({ label, hint, error, children }) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-slate-700">{label}</span>
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
// project-type options so the dropdown arrives pre-answered when possible.
function guessProjectType(buildingType) {
  if (!buildingType) return null;
  const t = String(buildingType).toLowerCase();
  const q = INTAKE_QUESTIONS.find(x => x.key === 'projectType');
  const pick = (label) => (q?.options.includes(label) ? label : null);
  if (t.includes('townhome') || t.includes('townhouse')) return pick('Townhomes');
  if (t.includes('high')) return pick('High-rise');
  if (t.includes('mid')) return pick('Mid-rise');
  if (t.includes('podium')) return pick('Podium');
  if (t.includes('wrap')) return pick('Wrap');
  if (t.includes('4')) return pick('Garden (4 Levels)');
  if (t.includes('garden') || t.includes('walk')) return pick('Garden (3 Levels)');
  return null;
}

export default function IntakeClient() {
  const [firstName, setFirstName] = useState('');
  const [lastName,  setLastName]  = useState('');
  const [email,     setEmail]     = useState('');
  const [company,   setCompany]   = useState('');
  const [project,   setProject]   = useState('');
  const [touchedEmail, setTouchedEmail] = useState(false);
  const [drawings, setDrawings] = useState(null);
  const [answers, setAnswers] = useState(() => {
    const init = {};
    for (const q of INTAKE_QUESTIONS) init[q.key] = q.default ?? '';
    return init;
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitted,  setSubmitted]  = useState(false);
  const [submitError, setSubmitError] = useState(null);

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

  const sections = useMemo(() => {
    const out = [];
    for (const q of INTAKE_QUESTIONS) {
      let s = out.find(x => x.name === q.section);
      if (!s) { s = { name: q.section, questions: [] }; out.push(s); }
      s.questions.push(q);
    }
    return out;
  }, []);

  const contactReady =
    firstName.trim() && lastName.trim() && project.trim() && emailCheck?.ok;

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
          answers,
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

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-3xl mx-auto px-6 py-5 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-slate-900 flex items-center justify-center shrink-0">
            <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          </div>
          <div>
            <div className="text-base font-semibold text-slate-900 leading-tight">ILC Studios</div>
            <div className="text-xs text-slate-500">Conceptual Lighting Budget</div>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-10 space-y-8">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Start a conceptual budget</h1>
          <p className="text-sm text-slate-500 mt-2 max-w-xl">
            Tell us about your project and upload your drawings. We&apos;ll read the building data
            straight from them and put together a conceptual lighting and controls budget.
          </p>
        </div>

        {/* ── Step 1: About you ── */}
        <section className="bg-white rounded-2xl border border-slate-200 p-6">
          <div className="flex items-center gap-2.5 mb-5">
            <span className="w-6 h-6 rounded-full bg-amber-500 text-white text-xs font-bold flex items-center justify-center">1</span>
            <h2 className="text-base font-semibold text-slate-800">About you and the project</h2>
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

            <Field label="Company" hint="Optional">
              <input className={inputCls} value={company} onChange={e => setCompany(e.target.value)} placeholder="Your company" />
            </Field>
            <Field label="Project name">
              <input className={inputCls} value={project} onChange={e => setProject(e.target.value)} placeholder="Lincoln Avenue Phase 2" />
            </Field>
          </div>
        </section>

        {/* ── Step 2: Drawings ── */}
        <section className="bg-white rounded-2xl border border-slate-200 p-6">
          <div className="flex items-center gap-2.5 mb-2">
            <span className="w-6 h-6 rounded-full bg-amber-500 text-white text-xs font-bold flex items-center justify-center">2</span>
            <h2 className="text-base font-semibold text-slate-800">Upload your drawings</h2>
          </div>
          <p className="text-sm text-slate-500 mb-5 ml-8.5">
            The most useful sheet is the one with the <strong>unit matrix</strong> — building square footage and
            unit counts. We read it automatically so you don&apos;t have to type it in.
          </p>

          <DrawingDropzone onResults={setDrawings} />
        </section>

        {/* ── Step 3: Questionnaire ── */}
        <section className="bg-white rounded-2xl border border-slate-200 p-6">
          <div className="flex items-center gap-2.5 mb-2">
            <span className="w-6 h-6 rounded-full bg-amber-500 text-white text-xs font-bold flex items-center justify-center">3</span>
            <h2 className="text-base font-semibold text-slate-800">A few questions about the design</h2>
          </div>
          <p className="text-sm text-slate-500 mb-5 ml-8.5">
            These choices shape the budget more than anything else. Every question has a sensible
            default, so answer what you know and skip the rest.
          </p>

          <div className="space-y-6">
            {sections.map(sec => (
              <div key={sec.name}>
                <h3 className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-3">{sec.name}</h3>
                <div className="grid sm:grid-cols-2 gap-4">
                  {sec.questions.map(q => (
                    <div key={q.key} className={q.hint && q.hint.length > 120 ? 'sm:col-span-2' : ''}>
                      <Field label={q.question} hint={q.hint}>
                        <select
                          className={inputCls}
                          value={answers[q.key] ?? ''}
                          onChange={e => setAnswers(a => ({ ...a, [q.key]: e.target.value }))}
                        >
                          {(answers[q.key] ?? '') === '' && <option value="">Select…</option>}
                          {q.options.map(opt => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                      </Field>
                      {q.key === 'projectType' && guessedType && answers.projectType === guessedType && (
                        <p className="text-xs text-amber-600 mt-1">Pre-filled from your drawings — change it if we got it wrong.</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Submit ── */}
        <section className="bg-white rounded-2xl border border-slate-200 p-6">
          <div className="flex items-center gap-2.5 mb-4">
            <span className={`w-6 h-6 rounded-full text-white text-xs font-bold flex items-center justify-center ${contactReady ? 'bg-amber-500' : 'bg-slate-300'}`}>4</span>
            <h2 className="text-base font-semibold text-slate-800">Send it to us</h2>
          </div>

          {submitted ? (
            <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-4">
              <p className="text-sm text-green-800 font-semibold">Request received — thanks!</p>
              <p className="text-xs text-green-700 mt-1">
                An ILC Studios team member will review your submission and be in touch within 1–2 business days.
                If your project is a fit, you'll receive a secure link to the ILC client portal to view your conceptual budget.
              </p>
              <p className="text-xs text-green-700 mt-2">
                For now, every budget is reviewed by our team before you see the summary — soon you&apos;ll be
                able to complete the whole process and print your budget yourself.
              </p>
            </div>
          ) : (
            <>
              {submitError && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 mb-4">
                  <p className="text-xs text-red-700">{submitError} — please try again or email us directly.</p>
                </div>
              )}
              <div className="flex items-center gap-4">
                <button
                  onClick={handleSubmit}
                  disabled={!contactReady || submitting}
                  className={`px-5 py-2.5 rounded-lg font-semibold text-sm transition-colors ${
                    contactReady && !submitting
                      ? 'bg-amber-500 hover:bg-amber-400 text-white'
                      : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                  }`}
                >
                  {submitting ? 'Sending…' : 'Submit budget request'}
                </button>
                <span className="text-xs text-slate-400">
                  {contactReady ? 'Your details look good' : 'Fill in your details above'}
                  {drawings ? ` · ${drawings.sources.length} drawing${drawings.sources.length !== 1 ? 's' : ''} read` : ' · no drawings yet'}
                </span>
              </div>
            </>
          )}
        </section>

        <p className="text-xs text-slate-400 text-center pb-6">
          Conceptual estimate only. An ILC Studios team member reviews every submission before a budget is issued.
        </p>
      </main>
    </div>
  );
}
