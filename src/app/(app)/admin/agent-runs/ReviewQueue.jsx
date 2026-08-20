'use client';
import { useState, useEffect, useCallback } from 'react';

/**
 * The review queue — Step 17 of the Governed AI Layer.
 *
 * Three buttons: Accepted · Corrected · Rejected. The middle one is the reason
 * this exists — a correction records WHAT changed, and that field is the only
 * thing here that compounds. So "Corrected" opens a required text box rather
 * than submitting on click; a one-click "corrected" with nothing recorded is
 * indistinguishable from a reflex, and it teaches nothing.
 *
 * Tier labels arrive as plain data from the API. `agentTrust.js` reaches
 * node:crypto through the review store, so importing it here would fail the
 * webpack build outright.
 */

const STATUS_TABS = [
  { key: 'AWAITING_REVIEW', label: 'Needs review' },
  { key: 'CLOSED',          label: 'Signed off' },
  { key: 'AUTO_PASSED',     label: 'Auto-passed' },
  { key: 'ALL',             label: 'Everything' },
];

const TIER_STYLE = {
  0: 'bg-slate-100 text-slate-600 border-slate-200',
  1: 'bg-blue-50 text-blue-700 border-blue-200',
  2: 'bg-green-50 text-green-700 border-green-200',
};

const VERDICT_STYLE = {
  accepted:  'bg-green-50 text-green-700 border-green-200',
  corrected: 'bg-amber-50 text-amber-700 border-amber-200',
  rejected:  'bg-red-50 text-red-600 border-red-200',
};

function fmtWhen(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d) ? '—' : d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export default function ReviewQueue() {
  const [status, setStatus]   = useState('AWAITING_REVIEW');
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setError] = useState(null);
  const [openId, setOpenId]   = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await fetch(`/api/admin/agent-runs?status=${status}&limit=200`);
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
      setData(await r.json());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => { load(); }, [load]);

  const runs = data?.runs || [];

  return (
    <div className="px-6 py-6 space-y-5">
      {/* The store is a stand-in until the AgentRun table lands. An empty queue
          means two very different things depending on which, so say which. */}
      {data?.health && !data.health.durable && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3">
          <p className="text-sm font-semibold text-amber-900">
            {data.health.sink === 'memory' ? 'Verdicts are not being saved' : 'Running on the local stand-in'}
          </p>
          <p className="text-xs text-amber-800 mt-1">{data.health.note}</p>
          <p className="text-xs text-amber-700 mt-1.5">
            An empty queue below does not necessarily mean nothing needs review.
          </p>
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        {STATUS_TABS.map(t => (
          <button
            key={t.key}
            onClick={() => { setStatus(t.key); setOpenId(null); }}
            className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${
              status === t.key
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
            }`}
          >
            {t.label}
            {t.key === 'AWAITING_REVIEW' && data?.counts?.awaitingReview > 0 && (
              <span className="ml-1.5 opacity-70">{data.counts.awaitingReview}</span>
            )}
          </button>
        ))}
        <button onClick={load} className="ml-auto text-xs font-semibold text-slate-500 hover:text-slate-700">
          Refresh
        </button>
      </div>

      {loading && <p className="text-sm text-slate-400">Loading…</p>}
      {loadError && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Could not load the queue: {loadError}
        </div>
      )}

      {!loading && !loadError && runs.length === 0 && (
        <div className="rounded-xl border border-slate-200 bg-white px-6 py-10 text-center">
          <p className="text-sm font-semibold text-slate-700">Nothing here</p>
          <p className="text-xs text-slate-500 mt-1">
            {status === 'AWAITING_REVIEW'
              ? 'No AI output is waiting on a signature.'
              : 'No runs with this status yet.'}
          </p>
        </div>
      )}

      <ul className="space-y-3">
        {runs.map(run => (
          <RunCard
            key={run.id}
            run={run}
            tier={data.tiers?.[`${run.taskType}@${run.promptVersion || 'unversioned'}`]}
            open={openId === run.id}
            onToggle={() => setOpenId(openId === run.id ? null : run.id)}
            onReviewed={load}
          />
        ))}
      </ul>
    </div>
  );
}

function RunCard({ run, tier, open, onToggle, onReviewed }) {
  const [verdict, setVerdict]       = useState(null);   // pending 'corrected' entry
  const [correction, setCorrection] = useState('');
  const [note, setNote]             = useState('');
  const [saving, setSaving]         = useState(false);
  const [saveError, setSaveError]   = useState(null);

  async function submit(v, corr = null) {
    setSaving(true); setSaveError(null);
    try {
      const r = await fetch(`/api/admin/agent-runs/${run.id}/verdict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ verdict: v, correction: corr, note: note || null }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setVerdict(null); setCorrection(''); setNote('');
      onReviewed();
    } catch (e) {
      setSaveError(e.message);
    } finally {
      setSaving(false);
    }
  }

  const checksFailed = run.autoCheckPass === false;
  const canSign = run.status === 'AWAITING_REVIEW' && !run.verdict;

  return (
    <li className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <button onClick={onToggle} className="w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-mono font-semibold text-slate-800">{run.taskType}</span>

          {tier && (
            <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${TIER_STYLE[tier.tier]}`}
                  title={tier.reason}>
              Tier {tier.tier} · {tier.label}
              {tier.demoted && ' ↓'}
            </span>
          )}

          {checksFailed && (
            <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border bg-red-50 text-red-600 border-red-200">
              Auto-check failed
            </span>
          )}
          {run.autoCheckPass === null && (
            <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border bg-slate-50 text-slate-400 border-slate-200"
                  title="No deterministic check could run for this task type — that is not the same as passing.">
              Unchecked
            </span>
          )}

          {run.verdict && (
            <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${VERDICT_STYLE[run.verdict]}`}>
              {run.verdict}
            </span>
          )}

          <span className="ml-auto text-xs text-slate-400">{fmtWhen(run.createdAt)}</span>
        </div>
        <div className="mt-1 flex items-center gap-3 text-xs text-slate-500">
          {run.feature && <span>{run.feature}</span>}
          {run.model && <span className="font-mono">{run.model}</span>}
          {run.promptVersion && <span>prompt {run.promptVersion}</span>}
          {run.confidence != null && <span>{Math.round(run.confidence * 100)}% confident</span>}
        </div>
      </button>

      {open && (
        <div className="border-t border-slate-100 px-4 py-4 space-y-4 bg-slate-50/50">
          {/* Input — a hash and a descriptor, never the document itself. */}
          <Section title="Input">
            <p className="text-xs font-mono text-slate-500 break-all">{run.inputSummary || '—'}</p>
            <p className="text-[11px] text-slate-400 mt-1">
              The source document is deliberately not stored here — only a fingerprint of it.
            </p>
          </Section>

          <Section title="Auto-checks">
            {run.autoChecks?.length ? (
              <ul className="space-y-1">
                {run.autoChecks.map((c, i) => (
                  <li key={i} className="text-xs flex items-start gap-2">
                    <span className={`font-bold shrink-0 ${
                      c.status === 'PASS' ? 'text-green-600' : c.status === 'FAIL' ? 'text-red-600' : 'text-slate-400'
                    }`}>{c.status}</span>
                    <span className="text-slate-600"><span className="font-mono">{c.key}</span> — {c.detail}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-slate-400">No deterministic check is defined for this task type.</p>
            )}
          </Section>

          <Section title="Output">
            <pre className="text-[11px] font-mono text-slate-700 bg-white border border-slate-200 rounded-lg p-3 overflow-x-auto max-h-72">
              {JSON.stringify(run.output, null, 2)}
            </pre>
          </Section>

          {run.citations && (
            <Section title="Citations">
              <pre className="text-[11px] font-mono text-slate-600 bg-white border border-slate-200 rounded-lg p-3 overflow-x-auto max-h-48">
                {JSON.stringify(run.citations, null, 2)}
              </pre>
            </Section>
          )}

          {run.verdict ? (
            <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
              <p className="text-xs font-semibold text-slate-700">
                Signed off as <span className="uppercase">{run.verdict}</span>
              </p>
              {run.correction && <p className="text-xs text-slate-600 mt-1">Changed: {run.correction}</p>}
            </div>
          ) : canSign ? (
            <div className="space-y-3">
              {verdict === 'corrected' ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2">
                  <label className="block text-xs font-semibold text-amber-900">
                    What did you have to change? <span className="font-normal">(required)</span>
                  </label>
                  <textarea
                    value={correction}
                    onChange={e => setCorrection(e.target.value)}
                    rows={3}
                    placeholder="e.g. Type B2 qty was read as 16, actual is 6 — the schedule wraps that row."
                    className="w-full text-xs border border-amber-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-1 focus:ring-amber-400"
                  />
                  <p className="text-[11px] text-amber-700">
                    This is the only field here that compounds — it is what teaches the next version
                    of the prompt.
                  </p>
                  <div className="flex gap-2">
                    <button
                      disabled={saving || !correction.trim()}
                      onClick={() => submit('corrected', correction)}
                      className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-amber-600 text-white disabled:opacity-40"
                    >
                      {saving ? 'Saving…' : 'Save correction'}
                    </button>
                    <button onClick={() => setVerdict(null)} className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600">
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2 flex-wrap">
                  <button disabled={saving} onClick={() => submit('accepted')}
                    className="text-xs font-semibold px-4 py-2 rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-40">
                    Accepted
                  </button>
                  <button disabled={saving} onClick={() => setVerdict('corrected')}
                    className="text-xs font-semibold px-4 py-2 rounded-lg bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-40">
                    Corrected…
                  </button>
                  <button disabled={saving} onClick={() => submit('rejected')}
                    className="text-xs font-semibold px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-40">
                    Rejected
                  </button>
                </div>
              )}

              {saveError && (
                <p className="text-xs text-red-600">
                  {/^already reviewed/.test(saveError)
                    ? 'Someone else signed this one off while you had it open. Refresh to see their verdict.'
                    : saveError}
                </p>
              )}
            </div>
          ) : null}
        </div>
      )}
    </li>
  );
}

function Section({ title, children }) {
  return (
    <div>
      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">{title}</div>
      {children}
    </div>
  );
}
