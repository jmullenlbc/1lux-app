'use client';

/**
 * Unit Selections — the screen somebody actually answers.
 *
 * Five fixtures, one at a time. For each one the person sees only the fixtures
 * this job can afford and the code allows, picks one, picks its finish, and can
 * cross off anything they hate. Nothing over the budget is ever rendered, not
 * even greyed out — showing somebody a fixture they cannot have is how a
 * settled budget gets reopened.
 *
 * ── Internal only, for now ──────────────────────────────────────────────────
 * Nothing here is shared outside ILC yet, so real prices are on the screen. The
 * moment a share link exists, `showPrices` goes false for that viewer and the
 * price band ($ / $$ / $$$) is what an outside respondent sees instead. The
 * band is computed from the target, not from the buy price, and no buy price
 * ever reaches this component — the route does not select it.
 *
 * ── The thing that must never be a blank panel ──────────────────────────────
 * When the budget takes everything away, `options` is empty and `hidden` is
 * full. That is the case the screen has to explain in words, with the reasons
 * and a way to raise the target — otherwise a person concludes it is broken.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';

const FINISH_LABEL = {
  matte_black: 'Matte black',
  brushed_nickel: 'Brushed nickel',
  aged_brass: 'Aged brass',
  bronze: 'Bronze',
  chrome: 'Chrome',
  white: 'White',
};
const finishLabel = k => FINISH_LABEL[k] || k || '—';

const LEVEL_LABEL = { low: 'Low finish', medium: 'Medium finish', high: 'High finish' };
const TIER_LABEL = { value: 'Value', standard: 'Standard', elevated: 'Elevated' };

const ROLES = [
  { key: 'ILC', label: 'ILC' },
  { key: 'DEVELOPER', label: 'Developer' },
  { key: 'ARCHITECT', label: 'Architect' },
  { key: 'INTERIOR_DESIGNER', label: 'Interior designer' },
];
const ROLE_LABEL = Object.fromEntries(ROLES.map(r => [r.key, r.label]));

const money = n => (n === null || n === undefined ? '—' : `$${Number(n).toLocaleString()}`);

/** What an outside respondent sees instead of a price. Target-relative, on purpose. */
function band(cnPrice, target) {
  if (cnPrice == null || !target) return '$$';
  if (cnPrice <= target * 0.6) return '$';
  if (cnPrice <= target * 0.85) return '$$';
  return '$$$';
}

export default function SurveyRunner({ projectId, showPrices = true }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [activeResponseId, setActiveResponseId] = useState(null);
  const [step, setStep] = useState(0);
  const [askingWho, setAskingWho] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/projects/${projectId}/unit-selections`);
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || 'That would not load.');
      setData(body);
      setActiveResponseId(id => id || body?.survey?.responses?.[0]?.id || null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const survey = data?.survey || null;
  const responses = survey?.responses || [];
  const active = responses.find(r => r.id === activeResponseId) || null;

  // The fixtures this job wants, in order. A category the questionnaire already
  // said no to never appears — it is not a step somebody has to click past.
  const steps = useMemo(
    () => (data?.categories || []).filter(c => !c.skipped),
    [data],
  );
  const current = steps[Math.min(step, Math.max(steps.length - 1, 0))] || null;

  // Is the survey running on older assumptions than the questionnaire?
  const drifted = useMemo(() => {
    if (!survey || !data?.liveFacts || !data?.facts) return [];
    return (data.categories || [])
      .filter(c => !c.skipped)
      .filter(c => (data.liveFacts.targets?.[c.key] ?? null) !== (data.facts.targets?.[c.key] ?? null))
      .map(c => c.label);
  }, [survey, data]);

  async function post(url, body, method = 'POST') {
    setBusy(true);
    setError('');
    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body || {}),
      });
      const out = await res.json();
      if (!res.ok) throw new Error(out?.error || 'That did not save.');
      return out;
    } catch (e) {
      setError(e.message);
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function startSurvey() {
    const out = await post(`/api/projects/${projectId}/unit-selections`, {});
    if (out) load();
  }

  async function addRespondent(respondentName, respondentRole) {
    const out = await post(`/api/unit-selections/surveys/${survey.id}/responses`, { respondentName, respondentRole });
    if (out?.response) {
      setActiveResponseId(out.response.id);
      setAskingWho(false);
      setStep(0);
      load();
    }
  }

  async function choose(category, optionId, kind, finishKey) {
    if (!active) return;
    const out = await post(`/api/unit-selections/responses/${active.id}/choices`, {
      category, optionId, kind, finishKey,
    });
    if (out?.response) {
      setData(d => ({
        ...d,
        survey: { ...d.survey, responses: d.survey.responses.map(r => (r.id === out.response.id ? out.response : r)) },
      }));
    }
  }

  async function setTarget(category, value) {
    const out = await post(`/api/projects/${projectId}/unit-selections`, { targets: { [category]: value } }, 'PATCH');
    if (out) load();
  }

  async function setAssumption(field, value) {
    const out = await post(`/api/projects/${projectId}/unit-selections`, { [field]: value }, 'PATCH');
    if (out) load();
  }

  if (loading) return <p className="text-sm text-slate-400 p-6">Loading&hellip;</p>;

  if (!survey) {
    return (
      <div className="p-6">
        <Intro />
        {error && <ErrorNote>{error}</ErrorNote>}
        <button
          onClick={startSurvey}
          disabled={busy}
          className="mt-5 px-5 py-2.5 rounded-2xl bg-amber-500 text-white text-sm font-medium hover:bg-amber-600 disabled:opacity-50"
        >
          Start the selections
        </button>
      </div>
    );
  }

  const pickFor = cat => active?.choices?.find(c => c.category === cat && c.kind === 'PICK') || null;
  const rejectedIn = cat => new Set((active?.choices || []).filter(c => c.category === cat && c.kind === 'REJECT').map(c => c.optionId));
  const answered = steps.filter(s => pickFor(s.key)).length;

  return (
    <div className="p-6 pb-28">
      {error && <ErrorNote>{error}</ErrorNote>}

      {/* ── Who is answering ── */}
      <div className="flex flex-wrap items-center gap-2 mb-5">
        {responses.map(r => (
          <button
            key={r.id}
            onClick={() => { setActiveResponseId(r.id); setStep(0); }}
            className={`px-3.5 py-1.5 rounded-full text-sm transition ${
              r.id === activeResponseId
                ? 'bg-slate-800 text-white'
                : 'bg-white text-slate-600 border border-slate-200 hover:border-slate-300'
            }`}
          >
            {r.respondentName}
            <span className={r.id === activeResponseId ? 'text-slate-300' : 'text-slate-400'}>
              {' '}&middot; {ROLE_LABEL[r.respondentRole] || r.respondentRole}
            </span>
            {r.submittedAt && <span className="ml-1.5 text-emerald-400">&#10003;</span>}
          </button>
        ))}
        <button
          onClick={() => setAskingWho(true)}
          className="px-3.5 py-1.5 rounded-full text-sm text-amber-600 border border-amber-200 bg-amber-50 hover:bg-amber-100"
        >
          + Somebody else
        </button>
        <span className="ml-auto text-xs text-slate-400">
          Version {survey.version} &middot; {survey.status === 'CLOSED' ? 'closed' : 'open'}
        </span>
      </div>

      {askingWho && <WhoForm onCancel={() => setAskingWho(false)} onAdd={addRespondent} busy={busy} />}

      {drifted.length > 0 && (
        <div className="mb-5 px-4 py-3 rounded-2xl bg-amber-50 border border-amber-200 text-sm text-amber-800">
          The design questionnaire has moved since this survey started &mdash; the budget for{' '}
          <strong>{drifted.join(', ')}</strong> is different now. These selections are still running on
          the older figures on purpose. Start a new version when you want the new ones.
        </div>
      )}

      {!active ? (
        <p className="text-sm text-slate-500">Add somebody to start answering.</p>
      ) : (
        <>
          {/* ── Where we are ── */}
          <div className="flex flex-wrap items-center gap-1.5 mb-5">
            {steps.map((s, i) => {
              const done = !!pickFor(s.key);
              return (
                <button
                  key={s.key}
                  onClick={() => setStep(i)}
                  className={`px-3 py-1.5 rounded-2xl text-xs font-medium transition ${
                    i === step
                      ? 'bg-amber-500 text-white'
                      : done
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-white text-slate-500 border border-slate-200'
                  }`}
                >
                  {done && <span className="mr-1">&#10003;</span>}
                  {s.label}
                </button>
              );
            })}
            <span className="ml-auto text-xs text-slate-400">{answered} of {steps.length} chosen</span>
          </div>

          {current && (
            <CategoryStep
              category={current}
              pick={pickFor(current.key)}
              rejected={rejectedIn(current.key)}
              showPrices={showPrices}
              facts={data.facts}
              busy={busy}
              onChoose={choose}
              onSetTarget={setTarget}
              onSetAssumption={setAssumption}
            />
          )}

          <div className="flex items-center justify-between mt-8">
            <button
              onClick={() => setStep(s => Math.max(0, s - 1))}
              disabled={step === 0}
              className="px-4 py-2 rounded-2xl text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40"
            >
              Back
            </button>
            {step < steps.length - 1 ? (
              <button
                onClick={() => setStep(s => Math.min(steps.length - 1, s + 1))}
                className="px-5 py-2 rounded-2xl bg-slate-800 text-white text-sm font-medium hover:bg-slate-700"
              >
                Next
              </button>
            ) : (
              <SubmitBar
                response={active}
                answered={answered}
                total={steps.length}
                busy={busy}
                onSubmit={async submitted => {
                  const out = await post(`/api/unit-selections/responses/${active.id}`, { submitted }, 'PATCH');
                  if (out) load();
                }}
              />
            )}
          </div>

          <FinishSummary response={active} showPrices={showPrices} />
        </>
      )}
    </div>
  );
}

function Intro() {
  return (
    <>
      <h3 className="font-semibold text-slate-900">Unit Selections</h3>
      <p className="text-sm text-slate-500 mt-1 max-w-2xl">
        The five decorative fixtures everybody argues about &mdash; the kitchen pendant, the bath
        vanity, the balcony sconce, the unit entry sconce and the ceiling fan. Each person picks one
        of each. Only fixtures this job can afford, and that the code allows, are shown. When people
        disagree the answer says so; nothing gets averaged.
      </p>
      <p className="text-sm text-slate-400 mt-2 max-w-2xl">
        The budget comes from the design questionnaire. Starting the selections freezes it, so the
        answers cannot change under somebody halfway through.
      </p>
    </>
  );
}

function WhoForm({ onAdd, onCancel, busy }) {
  const [name, setName] = useState('');
  const [role, setRole] = useState('ILC');
  return (
    <div className="mb-5 p-4 rounded-2xl border border-slate-200 bg-slate-50">
      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-sm font-medium text-slate-700 mb-1">Who is answering?</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Their name"
            className="w-full px-3 py-2 rounded-2xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">They are the</label>
          <select
            value={role}
            onChange={e => setRole(e.target.value)}
            className="px-3 py-2 rounded-2xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
          >
            {ROLES.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
          </select>
        </div>
        <button
          onClick={() => onAdd(name.trim(), role)}
          disabled={busy || !name.trim()}
          className="px-4 py-2 rounded-2xl bg-amber-500 text-white text-sm font-medium hover:bg-amber-600 disabled:opacity-50"
        >
          Add them
        </button>
        <button onClick={onCancel} className="px-3 py-2 text-sm text-slate-500 hover:text-slate-700">
          Cancel
        </button>
      </div>
    </div>
  );
}

/** One fixture: what the job decided, what is on offer, and what was taken away. */
function CategoryStep({ category, pick, rejected, showPrices, facts, busy, onChoose, onSetTarget, onSetAssumption }) {
  const [raising, setRaising] = useState('');
  const nothingLeft = category.options.length === 0;

  // The reasons, counted. "Four over the $40 target" reads better than four
  // separate lines saying the same thing.
  const reasons = {};
  for (const h of category.hidden) reasons[h.reason] = (reasons[h.reason] || 0) + 1;

  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="text-lg font-semibold text-slate-900">{category.label}</h3>
        {category.level && <Pill>{LEVEL_LABEL[category.level] || category.level}</Pill>}
        {category.count > 1 && <Pill>{category.count} per unit</Pill>}
      </div>
      <p className="text-sm text-slate-500 mt-1">
        {category.target !== null ? (
          <>
            Budget <strong className="text-slate-700">{money(category.target)}</strong> each
            {category.targetSource ? <> &mdash; from {category.targetSource}</> : null}.
          </>
        ) : (
          <>No budget on record for this one, so everything in the pool is on offer.</>
        )}
      </p>

      {/* The one question nothing in the app can answer for us. */}
      {category.key === 'w1' && (
        <EntryMountQuestion
          value={facts?.entryMountHigh ?? null}
          busy={busy}
          onSet={v => onSetAssumption('entryMountHigh', v)}
        />
      )}

      {nothingLeft ? (
        <div className="mt-5 px-5 py-6 rounded-2xl border border-amber-200 bg-amber-50">
          <p className="font-medium text-amber-900">Nothing in the pool fits this one.</p>
          <ul className="mt-2 text-sm text-amber-800 space-y-1">
            {Object.entries(reasons).map(([reason, n]) => (
              <li key={reason}>&bull; {n} {n === 1 ? 'fixture was' : 'fixtures were'} left out &mdash; {reason}.</li>
            ))}
          </ul>
          <p className="text-sm text-amber-800 mt-3">
            Either raise what this job is spending on this fixture, or add something at this price to
            the pool. Nothing is being hidden from you for any other reason.
          </p>
          <div className="flex items-center gap-2 mt-3">
            <input
              value={raising}
              onChange={e => setRaising(e.target.value)}
              inputMode="decimal"
              placeholder={category.target !== null ? String(category.target) : 'New budget'}
              className="px-3 py-2 rounded-2xl border border-amber-300 bg-white text-sm w-40 focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
            <button
              onClick={() => onSetTarget(category.key, raising)}
              disabled={busy || !raising.trim()}
              className="px-4 py-2 rounded-2xl bg-amber-500 text-white text-sm font-medium hover:bg-amber-600 disabled:opacity-50"
            >
              Raise the budget
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="grid gap-4 mt-5 sm:grid-cols-2 lg:grid-cols-3">
            {category.options.map(o => (
              <OptionTile
                key={o.id}
                option={o}
                target={category.target}
                showPrices={showPrices}
                picked={pick?.optionId === o.id}
                pickedFinish={pick?.optionId === o.id ? pick.finishKey : null}
                rejected={rejected.has(o.id)}
                busy={busy}
                onPick={finishKey => onChoose(category.key, o.id, 'PICK', finishKey)}
                onReject={() => onChoose(category.key, o.id, 'REJECT', null)}
              />
            ))}
          </div>

          {category.hidden.length > 0 && (
            <details className="mt-6">
              <summary className="text-sm text-slate-400 cursor-pointer hover:text-slate-600">
                {category.hidden.length} more {category.hidden.length === 1 ? 'fixture is' : 'fixtures are'} not
                on offer for this job
              </summary>
              <ul className="mt-2 text-sm text-slate-500 space-y-1">
                {Object.entries(reasons).map(([reason, n]) => (
                  <li key={reason}>&bull; {n} &mdash; {reason}.</li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </div>
  );
}

/** The 6'-8" question. Nowhere in the app knows it, so it gets asked once. */
function EntryMountQuestion({ value, onSet, busy }) {
  return (
    <div className="mt-4 px-4 py-3 rounded-2xl border border-slate-200 bg-slate-50">
      <p className="text-sm font-medium text-slate-700">
        How high does the sconce beside the unit door sit?
      </p>
      <p className="text-xs text-slate-500 mt-0.5">
        Below 6&#8242;-8&#8243; it reaches into the corridor, so anything sticking out more than 4in is
        off the table. Nothing else in the app records this.
      </p>
      <div className="flex gap-2 mt-2.5">
        {[
          { v: true, label: 'Above 6′-8″' },
          { v: false, label: 'At or below 6′-8″' },
          { v: null, label: 'Not sure yet' },
        ].map(o => (
          <button
            key={String(o.v)}
            onClick={() => onSet(o.v)}
            disabled={busy}
            className={`px-3.5 py-1.5 rounded-2xl text-sm transition disabled:opacity-50 ${
              value === o.v
                ? 'bg-slate-800 text-white'
                : 'bg-white text-slate-600 border border-slate-200 hover:border-slate-300'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
      {value === null && (
        <p className="text-xs text-amber-700 mt-2">
          While this is unanswered, deep sconces stay on the list. Answer it before anything goes out.
        </p>
      )}
    </div>
  );
}

function OptionTile({ option, target, showPrices, picked, pickedFinish, rejected, busy, onPick, onReject }) {
  const finishes = option.finishes || [];
  const defaultFinish = finishes.find(f => f.isDefault) || finishes[0] || null;
  const shown = pickedFinish
    ? finishes.find(f => f.finishKey === pickedFinish) || defaultFinish
    : defaultFinish;

  return (
    <div
      className={`rounded-2xl border bg-white overflow-hidden transition ${
        picked ? 'border-amber-500 ring-2 ring-amber-200' : rejected ? 'border-slate-200 opacity-45' : 'border-slate-200'
      }`}
    >
      <div className="h-40 bg-slate-50 flex items-center justify-center">
        {option.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={option.imageUrl} alt={option.name} className="h-full w-full object-contain" />
        ) : (
          <span className="text-xs text-slate-300">No picture yet</span>
        )}
      </div>

      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <h4 className="text-sm font-semibold text-slate-900 leading-snug">{option.name}</h4>
          <span className="shrink-0 text-sm font-semibold text-slate-700">
            {showPrices ? money(shown?.cnPrice) : band(shown?.cnPrice, target)}
          </span>
        </div>
        {option.dimLabel && <p className="text-xs text-slate-500 mt-1">{option.dimLabel}</p>}

        {/* Finishes. Picking one is picking the fixture. */}
        <div className="flex flex-wrap gap-1.5 mt-3">
          {finishes.map(f => {
            const on = picked && (pickedFinish || defaultFinish?.finishKey) === f.finishKey;
            return (
              <button
                key={f.id}
                onClick={() => onPick(f.finishKey)}
                disabled={busy}
                className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition disabled:opacity-50 ${
                  on ? 'bg-amber-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {finishLabel(f.finishKey)}
              </button>
            );
          })}
          {!finishes.length && <span className="text-xs text-slate-400">No finishes on record.</span>}
        </div>

        <div className="flex items-center gap-3 mt-4">
          <button
            onClick={() => onPick(shown?.finishKey || null)}
            disabled={busy}
            className={`px-3.5 py-1.5 rounded-2xl text-xs font-medium transition disabled:opacity-50 ${
              picked ? 'bg-amber-500 text-white' : 'bg-slate-800 text-white hover:bg-slate-700'
            }`}
          >
            {picked ? 'Chosen' : 'Choose this'}
          </button>
          <button
            onClick={onReject}
            disabled={busy}
            className={`text-xs font-medium transition disabled:opacity-50 ${
              rejected ? 'text-slate-600' : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            {rejected ? 'Crossed off' : 'Cross it off'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** What the picks add up to, said back in one line. */
function FinishSummary({ response, showPrices }) {
  const picks = (response?.choices || []).filter(c => c.kind === 'PICK');
  if (!picks.length) return null;
  const tally = {};
  for (const c of picks.filter(p => p.category !== 'f1' && p.finishKey)) {
    tally[c.finishKey] = (tally[c.finishKey] || 0) + 1;
  }
  const leading = Object.entries(tally).sort((a, b) => b[1] - a[1])[0];

  return (
    <div className="mt-8 px-5 py-4 rounded-2xl bg-slate-50 border border-slate-200">
      <p className="text-sm text-slate-600">
        <strong className="text-slate-900">{response.respondentName}</strong> is leaning{' '}
        {leading ? <strong className="text-slate-900">{finishLabel(leading[0]).toLowerCase()}</strong> : 'no finish in particular'}
        {' '}across {picks.filter(p => p.category !== 'f1').length} of the fixtures.
        {' '}Fans stay white unless somebody says otherwise.
      </p>
      {!showPrices && (
        <p className="text-xs text-slate-400 mt-1">
          Prices are shown as a band on this screen.
        </p>
      )}
    </div>
  );
}

function SubmitBar({ response, answered, total, busy, onSubmit }) {
  if (response.submittedAt) {
    return (
      <div className="flex items-center gap-3">
        <span className="text-sm text-emerald-700">Handed in.</span>
        <button
          onClick={() => onSubmit(false)}
          disabled={busy}
          className="text-sm text-slate-500 hover:text-slate-700 disabled:opacity-50"
        >
          Change something
        </button>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-3">
      {answered < total && (
        <span className="text-sm text-slate-400">{total - answered} still to choose</span>
      )}
      <button
        onClick={() => onSubmit(true)}
        disabled={busy || answered === 0}
        className="px-5 py-2 rounded-2xl bg-amber-500 text-white text-sm font-medium hover:bg-amber-600 disabled:opacity-50"
      >
        Hand it in
      </button>
    </div>
  );
}

function Pill({ children }) {
  return <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[11px] font-medium">{children}</span>;
}

function ErrorNote({ children }) {
  return (
    <div className="mb-4 px-4 py-3 rounded-2xl bg-red-50 border border-red-200 text-sm text-red-700">{children}</div>
  );
}
