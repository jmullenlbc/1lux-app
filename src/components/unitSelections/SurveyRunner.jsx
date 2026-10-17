'use client';

/**
 * Unit Selections — the screen somebody actually answers.
 *
 * Three ways in, one set of answers (Mike 2026-09-23, "can we do all 3"):
 *   1. Start with a look — one click fills every fixture in a style, then one
 *      finish for everything. Most people stop here.
 *   2. Walk the unit — a floor plan; tap the kitchen, the bath, the balcony,
 *      the front door or the living room to get to that fixture.
 *   3. Big pictures — heart the one you want, X the ones you hate.
 * Then "who agrees" lays everybody's answers side by side.
 *
 * ── Who is answering ────────────────────────────────────────────────────────
 * Nobody types their own name. The signed-in person gets their own answers
 * automatically; answering for somebody else in the room is a tucked-away link.
 *
 * ── Money ───────────────────────────────────────────────────────────────────
 * Only fixtures this job can afford and the code allows are ever rendered.
 * Staff see the sell price. An outside viewer (`showPrices` false) sees an
 * estimated sell price, rounded — never a buy price, which the route does not
 * even select, and never how the budget was worked out.
 *
 * ── The thing that must never be a blank panel ──────────────────────────────
 * When the budget takes everything away, `options` is empty and `hidden` is
 * full. The screen says why in words, with a way to raise the target.
 *
 * Imports looks.js only — never the engine, which reaches pricing.js.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LOOKS, FINISHES, finishColor, finishLabel, finishFor, lookBoard, lookPicks, refinishPicks } from '@/lib/unitSelections/looks';

const LEVEL_LABEL = { low: 'Low finish', medium: 'Medium finish', high: 'High finish' };

const ROLES = [
  { key: 'ILC', label: 'ILC' },
  { key: 'DEVELOPER', label: 'Developer' },
  { key: 'ARCHITECT', label: 'Architect' },
  { key: 'INTERIOR_DESIGNER', label: 'Interior designer' },
];
const ROLE_LABEL = Object.fromEntries(ROLES.map(r => [r.key, r.label]));

/** Where each fixture lives in the unit. */
const ROOM = { p1: 'Kitchen', v1: 'Bath', ew1: 'Balcony', w1: 'Front door', f1: 'Living room' };

const money = n => (n === null || n === undefined ? '—' : `$${Number(n).toLocaleString()}`);
/** An estimate for outside eyes: rounded, so it reads as one. */
const estimate = n => {
  if (n === null || n === undefined) return '—';
  const step = n < 100 ? 5 : n < 500 ? 10 : 25;
  return `≈ $${(Math.round(n / step) * step).toLocaleString()} est.`;
};

export default function SurveyRunner({ projectId, showPrices = true }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [activeResponseId, setActiveResponseId] = useState(null);
  const [sel, setSel] = useState('p1');
  const [askingWho, setAskingWho] = useState(false);
  const claiming = useRef(false);

  const load = useCallback(async () => {
    setError('');
    try {
      const res = await fetch(`/api/projects/${projectId}/unit-selections`);
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || 'That would not load.');
      // First visit to an open survey: give this person their own answers.
      const survey = body?.survey;
      let mine = survey?.responses?.find(r => r.userId && r.userId === body?.me?.id) || null;
      if (survey && !mine && survey.status !== 'CLOSED' && !claiming.current) {
        claiming.current = true;
        const r = await fetch(`/api/unit-selections/surveys/${survey.id}/responses`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ me: true }),
        });
        const out = await r.json();
        if (r.ok && out?.response) {
          mine = out.response;
          if (!survey.responses.some(x => x.id === mine.id)) survey.responses.push(mine);
        }
      }
      setData(body);
      setActiveResponseId(id => id || mine?.id || survey?.responses?.[0]?.id || null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const survey = data?.survey || null;
  const me = data?.me || null;
  const responses = survey?.responses || [];
  const active = responses.find(r => r.id === activeResponseId) || null;
  const categories = data?.categories || [];
  const included = survey?.overrides?.include || [];
  const inPlay = categories.filter(c => !c.skipped);
  const current = categories.find(c => c.key === sel) || categories[0] || null;

  // Every option by id, for the grid and the summaries.
  const optionById = useMemo(() => {
    const m = {};
    for (const c of categories) for (const o of c.options || []) m[o.id] = o;
    return m;
  }, [categories]);

  // Is the survey running on older assumptions than the questionnaire?
  const drifted = useMemo(() => {
    if (!survey || !data?.liveFacts || !data?.facts) return [];
    return inPlay
      .filter(c => (data.liveFacts.targets?.[c.key] ?? null) !== (data.facts.targets?.[c.key] ?? null))
      .map(c => c.label);
  }, [survey, data, inPlay]);

  async function send(url, body, method = 'POST') {
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

  /** Swap one person's answers into state without a full reload. */
  function putResponse(response) {
    if (!response) return;
    setData(d => ({
      ...d,
      survey: { ...d.survey, responses: d.survey.responses.map(r => (r.id === response.id ? { ...r, ...response } : r)) },
    }));
  }

  const patchResponse = async fields => {
    const out = await send(`/api/unit-selections/responses/${active.id}`, fields, 'PATCH');
    putResponse(out?.response);
    return out?.response || null;
  };
  const bulkPick = async picks => {
    if (!picks.length) return;
    const out = await send(`/api/unit-selections/responses/${active.id}/choices`, { picks });
    putResponse(out?.response);
  };
  const choose = async (category, optionId, kind, finishKey) => {
    const out = await send(`/api/unit-selections/responses/${active.id}/choices`, { category, optionId, kind, finishKey });
    putResponse(out?.response);
  };
  const patchSurvey = async fields => {
    const out = await send(`/api/projects/${projectId}/unit-selections`, fields, 'PATCH');
    if (out) load();
  };

  async function pickLook(style) {
    const updated = await patchResponse({ styleChoice: style });
    if (!updated) return;
    await bulkPick(lookPicks(style, categories, {
      finishKey: updated.finishOverride, fanHoldWhite: updated.fanHoldWhite !== false,
    }));
  }

  async function pickFinish(key) {
    const next = active.finishOverride === key ? null : key;
    const updated = await patchResponse({ finishOverride: next });
    if (!updated || !next) return;
    await bulkPick(refinishPicks(updated.choices, categories, next, { fanHoldWhite: updated.fanHoldWhite !== false }));
  }

  async function addSomeone(respondentName, respondentRole) {
    const out = await send(`/api/unit-selections/surveys/${survey.id}/responses`, { respondentName, respondentRole });
    if (out?.response) {
      setActiveResponseId(out.response.id);
      setAskingWho(false);
      load();
    }
  }

  if (loading) return <p className="text-sm text-slate-400 p-6">Loading&hellip;</p>;

  if (!survey) {
    return (
      <div className="p-4 sm:p-6">
        <Intro />
        {error && <ErrorNote>{error}</ErrorNote>}
        <button
          onClick={async () => { if (await send(`/api/projects/${projectId}/unit-selections`, {})) load(); }}
          disabled={busy}
          className="mt-5 px-5 py-2.5 rounded-lg bg-orange-500 text-white text-sm font-semibold hover:bg-orange-600 disabled:opacity-50"
        >
          Start the selections
        </button>
      </div>
    );
  }

  const pickFor = (resp, cat) => resp?.choices?.find(c => c.category === cat && c.kind === 'PICK') || null;
  const answered = inPlay.filter(c => pickFor(active, c.key)).length;
  const isMine = active && me && active.userId === me.id;

  return (
    <div className="p-4 sm:p-6 pb-28">
      {error && <ErrorNote>{error}</ErrorNote>}

      {/* ── Who is answering ── */}
      <div className="flex flex-wrap items-center gap-2 mb-5">
        <span className="text-sm text-slate-600">
          {isMine ? <>You&rsquo;re answering as <strong className="text-slate-900">{active.respondentName}</strong></>
            : active ? <>Answering for <strong className="text-slate-900">{active.respondentName}</strong></> : null}
        </span>
        {responses.filter(r => r.id !== activeResponseId).map(r => (
          <button
            key={r.id}
            onClick={() => setActiveResponseId(r.id)}
            className="px-3 py-1 rounded-full text-xs bg-white text-slate-600 border border-slate-200 hover:border-slate-300"
          >
            {r.userId && me && r.userId === me.id ? 'Back to mine' : r.respondentName}
            {r.submittedAt && <span className="ml-1 text-green-500">&#10003;</span>}
          </button>
        ))}
        <button onClick={() => setAskingWho(v => !v)} className="text-xs text-slate-400 hover:text-slate-600 underline">
          Answer for someone in the room
        </button>
        <span className="ml-auto text-xs text-slate-400">
          Version {survey.version} &middot; {survey.status === 'CLOSED' ? 'closed' : 'open'}
        </span>
      </div>

      {askingWho && <WhoForm onCancel={() => setAskingWho(false)} onAdd={addSomeone} busy={busy} />}

      {drifted.length > 0 && (
        <div className="mb-5 px-4 py-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800">
          The design questionnaire has moved since this survey started &mdash; the budget for{' '}
          <strong>{drifted.join(', ')}</strong> is different now. These selections are still running on
          the older figures on purpose. Start a new version when you want the new ones.
        </div>
      )}

      {!active ? (
        <p className="text-sm text-slate-500">Nobody is answering yet.</p>
      ) : (
        <>
          {/* ── 1. Start with a look ── */}
          <Section title="Start with a look" hint="One click fills every fixture. Change anything you don't like below.">
            <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 snap-x">
              {LOOKS.map(look => {
                const board = lookBoard(look.key, categories);
                const on = active.styleChoice === look.key;
                return (
                  <button
                    key={look.key}
                    onClick={() => pickLook(look.key)}
                    disabled={busy}
                    className={`snap-start shrink-0 w-56 text-left rounded-lg border bg-white p-3 transition disabled:opacity-60 ${
                      on ? 'border-orange-500 ring-2 ring-orange-500' : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="grid grid-cols-3 gap-1 h-24">
                      {Object.entries(board).slice(0, 6).map(([cat, { option }]) => (
                        <div key={cat} className="bg-slate-50 rounded-lg flex items-center justify-center">
                          <FixtureSketch category={cat} shape={option.shape}
                            finishKey={finishFor(option, cat === 'f1' && active.fanHoldWhite !== false ? 'white' : active.finishOverride)} size={40} />
                        </div>
                      ))}
                    </div>
                    <p className="mt-2 text-sm font-semibold text-slate-900">{look.label}{on && <span className="ml-1 text-amber-600">&#10003;</span>}</p>
                    <p className="text-xs text-slate-500">{look.blurb}</p>
                  </button>
                );
              })}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-slate-700 mr-1">One finish for everything</span>
              {FINISHES.map(f => (
                <button
                  key={f.key}
                  onClick={() => pickFinish(f.key)}
                  disabled={busy}
                  title={f.label}
                  className={`flex items-center gap-1.5 pl-1 pr-2.5 py-1 rounded-full text-xs border transition disabled:opacity-60 ${
                    active.finishOverride === f.key ? 'border-orange-500 bg-amber-50 text-amber-800' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                  }`}
                >
                  <span className="w-5 h-5 rounded-full border border-slate-300" style={{ background: f.color }} />
                  {f.label}
                </button>
              ))}
              <label className="flex items-center gap-1.5 text-xs text-slate-600 ml-1">
                <input
                  type="checkbox"
                  checked={active.fanHoldWhite !== false}
                  onChange={e => patchResponse({ fanHoldWhite: e.target.checked })}
                  disabled={busy}
                  className="accent-amber-500"
                />
                Fans stay white
              </label>
            </div>
          </Section>

          {/* ── 2. Walk the unit ── */}
          <Section title="Walk the unit" hint="Tap a room to see its fixture.">
            <FloorPlan
              categories={categories}
              sel={sel}
              onSel={setSel}
              picked={key => !!pickFor(active, key)}
              pickFor={key => pickFor(active, key)}
            />
          </Section>

          {/* ── 3. The fixture ── */}
          {current && (
            <FixturePanel
              category={current}
              added={included.includes(current.key)}
              pick={pickFor(active, current.key)}
              rejected={new Set((active.choices || []).filter(c => c.category === current.key && c.kind === 'REJECT').map(c => c.optionId))}
              wantedFinish={current.key === 'f1' && active.fanHoldWhite !== false ? 'white' : active.finishOverride}
              showPrices={showPrices}
              facts={data.facts}
              busy={busy}
              onChoose={choose}
              onInclude={on => patchSurvey({ include: on ? [...new Set([...included, current.key])] : included.filter(k => k !== current.key) })}
              onSetTarget={value => patchSurvey({ targets: { [current.key]: value } })}
              onSetMount={v => patchSurvey({ entryMountHigh: v })}
            />
          )}

          {/* ── Who agrees ── */}
          {responses.length > 1 && (
            <Section title="Who agrees" hint="Amber rows are where people picked different fixtures.">
              <WhoAgrees categories={inPlay} responses={responses} optionById={optionById} pickFor={pickFor} onOpen={setSel} />
            </Section>
          )}

          {/* ── Hand it in ── */}
          <div className="mt-8 flex flex-wrap items-center justify-between gap-3 px-5 py-4 rounded-lg bg-slate-50 border border-slate-200">
            <p className="text-sm text-slate-600">
              <strong className="text-slate-900">{answered} of {inPlay.length}</strong> fixtures chosen
              {active.finishOverride && <> &middot; {finishLabel(active.finishOverride).toLowerCase()} throughout</>}
              {active.fanHoldWhite !== false && <> &middot; fans white</>}
            </p>
            {active.submittedAt ? (
              <div className="flex items-center gap-3">
                <span className="text-sm text-green-700">Handed in.</span>
                <button onClick={() => patchResponse({ submitted: false })} disabled={busy} className="text-sm text-slate-500 hover:text-slate-700 disabled:opacity-50">
                  Change something
                </button>
              </div>
            ) : (
              <button
                onClick={() => patchResponse({ submitted: true })}
                disabled={busy || answered === 0}
                className="px-5 py-2 rounded-lg bg-orange-500 text-white text-sm font-semibold hover:bg-orange-600 disabled:opacity-50"
              >
                Hand it in
              </button>
            )}
          </div>
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
        The five decorative fixtures in every unit &mdash; the kitchen pendant, the bath vanity, the
        balcony sconce, the front door sconce and the ceiling fan. Pick a look, walk the unit, heart
        what you like. Only fixtures this job can afford are shown. When people disagree the answer
        says so; nothing gets averaged.
      </p>
      <p className="text-sm text-slate-400 mt-2 max-w-2xl">
        Starting the selections freezes the budget, so the answers cannot change under somebody
        halfway through.
      </p>
    </>
  );
}

function Section({ title, hint, children }) {
  return (
    <section className="mb-7">
      <h3 className="text-base font-semibold text-slate-900">{title}</h3>
      {hint && <p className="text-xs text-slate-500 mt-0.5 mb-3">{hint}</p>}
      {children}
    </section>
  );
}

function WhoForm({ onAdd, onCancel, busy }) {
  const [name, setName] = useState('');
  const [role, setRole] = useState('DEVELOPER');
  return (
    <div className="mb-5 p-4 rounded-xl border border-slate-200 bg-slate-50 flex flex-wrap gap-3 items-end">
      <div className="flex-1 min-w-[180px]">
        <label className="block text-xs font-medium text-slate-600 mb-1">Their name</label>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
        />
      </div>
      <select
        value={role}
        onChange={e => setRole(e.target.value)}
        className="px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
      >
        {ROLES.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
      </select>
      <button
        onClick={() => onAdd(name.trim(), role)}
        disabled={busy || !name.trim()}
        className="px-4 py-2 rounded-lg bg-orange-500 text-white text-sm font-semibold hover:bg-orange-600 disabled:opacity-50"
      >
        Start their answers
      </button>
      <button onClick={onCancel} className="px-3 py-2 text-sm text-slate-500 hover:text-slate-700">Cancel</button>
    </div>
  );
}

/**
 * A simple one-bedroom plan. Each fixture is a dot in its room: amber when
 * chosen, white when still open, dashed grey when this job does not have it.
 */
function FloorPlan({ categories, sel, onSel, picked, pickFor }) {
  const spots = {
    p1: { x: 95, y: 70 }, v1: { x: 330, y: 150 }, ew1: { x: 225, y: 245 },
    w1: { x: 40, y: 205 }, f1: { x: 190, y: 150 },
  };
  const byKey = Object.fromEntries(categories.map(c => [c.key, c]));
  return (
    <svg viewBox="0 0 400 280" className="w-full max-w-xl h-auto select-none" role="img" aria-label="Unit floor plan">
      <g fill="none" stroke="#cbd5e1" strokeWidth="3">
        <rect x="10" y="10" width="380" height="215" rx="6" fill="#f8fafc" />
        <line x1="180" y1="10" x2="180" y2="110" />
        <line x1="10" y1="120" x2="120" y2="120" />
        <line x1="270" y1="10" x2="270" y2="225" />
        <line x1="270" y1="110" x2="390" y2="110" />
      </g>
      <rect x="130" y="225" width="190" height="45" rx="4" fill="#f1f5f9" stroke="#cbd5e1" strokeWidth="2" strokeDasharray="5 4" />
      <line x1="10" y1="185" x2="10" y2="220" stroke="#f8fafc" strokeWidth="5" />
      <g fontSize="11" fill="#94a3b8">
        <text x="20" y="28">Kitchen</text>
        <text x="190" y="28">Living</text>
        <text x="280" y="28">Bedroom</text>
        <text x="280" y="128">Bath</text>
        <text x="20" y="140">Entry</text>
        <text x="140" y="262">Balcony</text>
      </g>
      {Object.entries(spots).map(([key, p]) => {
        const cat = byKey[key];
        if (!cat) return null;
        const on = sel === key;
        const done = picked(key);
        const skip = cat.skipped;
        const pick = pickFor(key);
        return (
          <g key={key} onClick={() => onSel(key)} className="cursor-pointer">
            <circle cx={p.x} cy={p.y} r={on ? 22 : 18}
              fill={skip ? '#f8fafc' : done ? '#fef3c7' : '#ffffff'}
              stroke={on ? '#f59e0b' : skip ? '#cbd5e1' : done ? '#f59e0b' : '#94a3b8'}
              strokeWidth={on ? 3 : 2} strokeDasharray={skip ? '4 3' : undefined} />
            {done && pick?.finishKey && <circle cx={p.x + 13} cy={p.y - 13} r="6" fill={finishColor(pick.finishKey)} stroke="#fff" strokeWidth="1.5" />}
            <text x={p.x} y={p.y + 4} textAnchor="middle" fontSize="10" fontWeight="600" fill={skip ? '#94a3b8' : '#334155'}>
              {done ? '✓' : skip ? '+' : '?'}
            </text>
            <text x={p.x} y={p.y + (on ? 36 : 32)} textAnchor="middle" fontSize="10" fill={on ? '#b45309' : '#64748b'}>
              {cat.label.replace(/ with light kit$/i, '')}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** One fixture: big pictures, heart or X, and the reasons when nothing fits. */
function FixturePanel({ category, added, pick, rejected, wantedFinish, showPrices, facts, busy, onChoose, onInclude, onSetTarget, onSetMount }) {
  const [raising, setRaising] = useState('');
  const reasons = {};
  for (const h of category.hidden) reasons[h.reason] = (reasons[h.reason] || 0) + 1;

  return (
    <section className="mb-7 p-4 sm:p-5 rounded-3xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <p className="text-xs uppercase tracking-wide text-slate-500">{ROOM[category.key]}</p>
        <h3 className="text-lg font-semibold text-slate-900">{category.label}</h3>
        {!category.skipped && category.level && <Pill>{LEVEL_LABEL[category.level] || category.level}</Pill>}
        {!category.skipped && category.count > 1 && <Pill>{category.count} per unit</Pill>}
        {added && (
          <button onClick={() => onInclude(false)} disabled={busy} className="ml-auto text-xs text-slate-400 hover:text-slate-600 underline">
            Added on this survey &mdash; take it back out
          </button>
        )}
      </div>

      {category.skipped ? (
        <div className="mt-4 px-5 py-6 rounded-lg border border-dashed border-slate-300 bg-slate-50">
          <p className="font-medium text-slate-700">Not in this job.</p>
          <p className="text-sm text-slate-500 mt-1">The design questionnaire left this fixture out. Add it here if people should pick one anyway.</p>
          <button
            onClick={() => onInclude(true)}
            disabled={busy}
            className="mt-3 px-4 py-2 rounded-lg bg-orange-500 text-white text-sm font-semibold hover:bg-orange-600 disabled:opacity-50"
          >
            Add it to this job
          </button>
        </div>
      ) : (
        <>
          {showPrices && (
            <p className="text-sm text-slate-500 mt-1">
              {category.target !== null
                ? <>Budget <strong className="text-slate-700">{money(category.target)}</strong> each{category.targetSource ? <> &mdash; from {category.targetSource}</> : null}.</>
                : <>No budget on record for this one, so everything in the pool is on offer.</>}
            </p>
          )}

          {category.key === 'w1' && <EntryMountQuestion value={facts?.entryMountHigh ?? null} busy={busy} onSet={onSetMount} />}

          {category.options.length === 0 ? (
            <div className="mt-5 px-5 py-6 rounded-lg border border-amber-200 bg-amber-50">
              <p className="font-medium text-amber-900">Nothing in the pool fits this one.</p>
              <ul className="mt-2 text-sm text-amber-800 space-y-1">
                {Object.entries(reasons).map(([reason, n]) => (
                  <li key={reason}>&bull; {n} {n === 1 ? 'fixture was' : 'fixtures were'} left out &mdash; {reason}.</li>
                ))}
              </ul>
              {showPrices && (
                <div className="flex flex-wrap items-center gap-2 mt-3">
                  <input
                    value={raising}
                    onChange={e => setRaising(e.target.value)}
                    inputMode="decimal"
                    placeholder={category.target !== null ? String(category.target) : 'New budget'}
                    className="px-3 py-2 rounded-lg border border-amber-300 bg-white text-sm w-40 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                  <button
                    onClick={() => onSetTarget(raising)}
                    disabled={busy || !raising.trim()}
                    className="px-4 py-2 rounded-lg bg-orange-500 text-white text-sm font-semibold hover:bg-orange-600 disabled:opacity-50"
                  >
                    Raise the budget
                  </button>
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="grid gap-4 mt-5 sm:grid-cols-2 lg:grid-cols-3">
                {category.options.map(o => (
                  <OptionCard
                    key={o.id}
                    category={category.key}
                    option={o}
                    showPrices={showPrices}
                    pick={pick?.optionId === o.id ? pick : null}
                    wantedFinish={wantedFinish}
                    rejected={rejected.has(o.id)}
                    busy={busy}
                    onPick={finishKey => onChoose(category.key, o.id, 'PICK', finishKey)}
                    onReject={() => onChoose(category.key, o.id, 'REJECT', null)}
                  />
                ))}
              </div>
              {category.hidden.length > 0 && (
                <details className="mt-5">
                  <summary className="text-sm text-slate-400 cursor-pointer hover:text-slate-600">
                    {category.hidden.length} more {category.hidden.length === 1 ? 'fixture is' : 'fixtures are'} not on offer for this job
                  </summary>
                  <ul className="mt-2 text-sm text-slate-500 space-y-1">
                    {Object.entries(reasons).map(([reason, n]) => <li key={reason}>&bull; {n} &mdash; {reason}.</li>)}
                  </ul>
                </details>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}

/** The 6'-8" question. Nowhere in the app knows it, so it gets asked once. */
function EntryMountQuestion({ value, onSet, busy }) {
  return (
    <div className="mt-4 px-4 py-3 rounded-lg border border-slate-200 bg-slate-50">
      <p className="text-sm font-medium text-slate-700">How high does the sconce beside the unit door sit?</p>
      <p className="text-xs text-slate-500 mt-0.5">
        Below 6&#8242;-8&#8243; it reaches into the corridor, so anything sticking out more than 4in is off the table.
      </p>
      <div className="flex flex-wrap gap-2 mt-2.5">
        {[
          { v: true, label: 'Above 6′-8″' },
          { v: false, label: 'At or below 6′-8″' },
          { v: null, label: 'Not sure yet' },
        ].map(o => (
          <button
            key={String(o.v)}
            onClick={() => onSet(o.v)}
            disabled={busy}
            className={`px-3.5 py-1.5 rounded-lg text-sm transition disabled:opacity-50 ${
              value === o.v ? 'bg-orange-50 text-orange-700 border border-orange-400' : 'bg-white text-slate-600 border border-slate-200 hover:border-slate-300'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
      {value === null && <p className="text-xs text-amber-700 mt-2">While this is unanswered, deep sconces stay on the list.</p>}
    </div>
  );
}

function OptionCard({ category, option, showPrices, pick, wantedFinish, rejected, busy, onPick, onReject }) {
  const finishes = option.finishes || [];
  // The finish on show: what was picked, else what the person asked for
  // everywhere, else the fixture's own default. Tapping a chip on an unpicked
  // card only previews it; on the picked card it changes the pick.
  const [preview, setPreview] = useState(null);
  const shownKey = pick?.finishKey || preview || finishFor(option, wantedFinish);
  const shown = finishes.find(f => f.finishKey === shownKey) || finishes[0] || null;
  const picked = !!pick;

  return (
    <div className={`rounded-xl border bg-white overflow-hidden transition ${
      picked ? 'border-orange-500 ring-2 ring-orange-500' : rejected ? 'border-slate-200 opacity-40' : 'border-slate-200'
    }`}>
      <div className="relative h-48 bg-slate-50 flex items-center justify-center">
        {(shown?.imageUrl || option.imageUrl) ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={shown?.imageUrl || option.imageUrl} alt={option.name} className="h-full w-full object-contain" />
        ) : (
          <FixtureSketch category={category} shape={option.shape} finishKey={shown?.finishKey} size={130} />
        )}
        <div className="absolute top-2 right-2 flex gap-1.5">
          <button
            onClick={onReject}
            disabled={busy}
            aria-label={rejected ? 'Uncross' : 'Cross it off'}
            title={rejected ? 'Crossed off, tap to undo' : 'Not for us'}
            className={`w-9 h-9 rounded-full flex items-center justify-center text-base shadow-sm transition disabled:opacity-50 ${
              rejected ? 'bg-slate-700 text-white' : 'bg-white text-slate-400 hover:text-slate-700'
            }`}
          >
            &#10005;
          </button>
          <button
            onClick={() => onPick(shown?.finishKey || null)}
            disabled={busy}
            aria-label={picked ? 'Un-choose' : 'Choose this'}
            title={picked ? 'Chosen, tap to undo' : 'This one'}
            className={`w-9 h-9 rounded-full flex items-center justify-center text-lg shadow-sm transition disabled:opacity-50 ${
              picked ? 'bg-orange-500 text-white' : 'bg-white text-slate-400 hover:text-amber-500'
            }`}
          >
            &#9829;
          </button>
        </div>
      </div>

      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <h4 className="text-sm font-semibold text-slate-900 leading-snug">{option.name}</h4>
          <span className="shrink-0 text-sm font-semibold text-slate-700">
            {showPrices ? money(shown?.cnPrice) : estimate(shown?.cnPrice)}
          </span>
        </div>
        {option.dimLabel && <p className="text-xs text-slate-500 mt-1">{option.dimLabel}</p>}
        <div className="flex flex-wrap gap-1.5 mt-3">
          {finishes.map(f => (
            <button
              key={f.id}
              onClick={() => (picked ? onPick(f.finishKey) : setPreview(f.finishKey))}
              disabled={busy}
              title={finishLabel(f.finishKey)}
              className={`w-7 h-7 rounded-full border-2 transition disabled:opacity-50 ${
                shown?.finishKey === f.finishKey ? 'border-orange-500 scale-110' : 'border-white ring-1 ring-slate-200'
              }`}
              style={{ background: finishColor(f.finishKey) }}
            />
          ))}
          {shown && <span className="self-center text-xs text-slate-500 ml-1">{finishLabel(shown.finishKey)}</span>}
        </div>
      </div>
    </div>
  );
}

/** Rows are fixtures, columns are people. Disagreement is amber, never averaged. */
function WhoAgrees({ categories, responses, optionById, pickFor, onOpen }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50">
          <tr>
            <th className="text-left font-medium text-slate-500 px-3 py-2">Fixture</th>
            {responses.map(r => (
              <th key={r.id} className="text-left font-medium text-slate-500 px-3 py-2 whitespace-nowrap">
                {r.respondentName}
                <span className="block text-[11px] font-normal text-slate-400">{ROLE_LABEL[r.respondentRole] || r.respondentRole}{r.submittedAt ? ' · handed in' : ''}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {categories.map(c => {
            const picks = responses.map(r => pickFor(r, c.key));
            const distinct = new Set(picks.filter(Boolean).map(p => p.optionId));
            const split = distinct.size > 1;
            return (
              <tr key={c.key} className={`border-t border-slate-100 ${split ? 'bg-amber-50' : ''}`}>
                <td className="px-3 py-2 whitespace-nowrap">
                  <button onClick={() => onOpen(c.key)} className="font-semibold text-slate-700 hover:text-orange-600">{c.label}</button>
                  {split && <span className="block text-[11px] text-amber-700">people differ</span>}
                </td>
                {picks.map((p, i) => (
                  <td key={responses[i].id} className="px-3 py-2">
                    {p ? (
                      <span className="flex items-center gap-1.5">
                        <span className="w-3 h-3 rounded-full border border-slate-300 shrink-0" style={{ background: finishColor(p.finishKey) }} />
                        <span className="text-slate-700">{optionById[p.optionId]?.name || 'No longer offered'}</span>
                      </span>
                    ) : <span className="text-slate-300">&mdash;</span>}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * A placeholder picture until the real ones are loaded: a line drawing of the
 * fixture's shape, in its finish. Glass glows, metal takes the finish colour.
 */
function FixtureSketch({ category, shape, finishKey, size = 100 }) {
  const metal = finishColor(finishKey);
  const glass = '#fef3c7';
  const line = '#64748b';
  const s = { stroke: line, strokeWidth: 1.5 };
  let body;

  if (category === 'f1') {
    body = (
      <g>
        <rect x="47" y="8" width="6" height="14" fill={metal} {...s} />
        {[0, 72, 144, 216, 288].map(a => (
          <ellipse key={a} cx="50" cy="42" rx="34" ry="6" fill={metal} {...s} opacity="0.85" transform={`rotate(${a} 50 42) translate(17 0)`} />
        ))}
        <circle cx="50" cy="42" r="10" fill={metal} {...s} />
        <ellipse cx="50" cy="56" rx="9" ry="6" fill={glass} {...s} />
      </g>
    );
  } else if (category === 'v1') {
    if (shape === 'mirror') {
      body = (
        <g>
          <rect x="22" y="12" width="56" height="76" rx="14" fill="#e0f2fe" stroke={glass} strokeWidth="5" />
          <rect x="22" y="12" width="56" height="76" rx="14" fill="none" {...s} />
        </g>
      );
    } else {
      const n = shape === 'linear' || shape === 'bar' ? 0 : 3;
      body = (
        <g>
          <rect x="12" y="40" width="76" height="8" rx="3" fill={metal} {...s} />
          {n === 0
            ? <rect x="16" y="50" width="68" height="10" rx="5" fill={glass} {...s} />
            : [26, 50, 74].map(x => <Shade key={x} shape={shape} x={x} y={56} r={9} glass={glass} s={s} />)}
        </g>
      );
    }
  } else if (category === 'ew1' || category === 'w1') {
    body = (
      <g>
        <rect x="18" y="30" width="12" height="40" rx="3" fill={metal} {...s} />
        <path d="M30 50 H48" stroke={metal} strokeWidth="4" />
        <Shade shape={shape || 'lantern'} x={62} y={50} r={16} glass={glass} s={s} metal={metal} />
      </g>
    );
  } else {
    // Pendant.
    body = shape === 'linear' || shape === 'bar' ? (
      <g>
        <path d="M30 4 V40 M70 4 V40" {...s} />
        <rect x="14" y="40" width="72" height="14" rx="6" fill={metal} {...s} />
        <rect x="18" y="52" width="64" height="5" rx="2" fill={glass} />
      </g>
    ) : (
      <g>
        <path d="M50 4 V32" {...s} />
        <Shade shape={shape} x={50} y={54} r={24} glass={glass} s={s} metal={metal} />
      </g>
    );
  }

  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true">{body}</svg>
  );
}

function Shade({ shape, x, y, r, glass, s, metal }) {
  switch (shape) {
    case 'globe':
      return <circle cx={x} cy={y} r={r} fill={glass} {...s} />;
    case 'drum':
      return <rect x={x - r} y={y - r * 0.7} width={r * 2} height={r * 1.4} rx="2" fill={metal || glass} {...s} />;
    case 'lantern':
      return (
        <g>
          <path d={`M${x - r * 0.8} ${y - r * 0.8} L${x} ${y - r * 1.3} L${x + r * 0.8} ${y - r * 0.8} Z`} fill={metal || '#94a3b8'} {...s} />
          <rect x={x - r * 0.7} y={y - r * 0.8} width={r * 1.4} height={r * 1.6} fill={glass} {...s} />
          <path d={`M${x} ${y - r * 0.8} V${y + r * 0.8}`} stroke={metal || s.stroke} strokeWidth="1.5" />
        </g>
      );
    default: // round / dome
      return <path d={`M${x - r} ${y + r * 0.35} A${r} ${r} 0 0 1 ${x + r} ${y + r * 0.35} Z`} fill={metal || glass} {...s} />;
  }
}

function Pill({ children }) {
  return <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[11px] font-medium">{children}</span>;
}

function ErrorNote({ children }) {
  return <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{children}</div>;
}
