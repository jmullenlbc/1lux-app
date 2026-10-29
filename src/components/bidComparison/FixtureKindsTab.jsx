'use client';

// Admin > Fixture kinds (Bid Comparison step 1, Mike 10-21). Internal only.
// What the check reads each bid line as (kind, size, grade), the builder vs
// spec grade explainer people will see, the brand grades, and a try-out on a
// past job: its ILC prices rated against every other past job. Staff edit
// kinds and brands here (0138, Mike 10-22); archive only.

import { useCallback, useEffect, useRef, useState } from 'react';
import { CARD, CARD_PADDED, H2, HELPER, LABEL, TH, TD, NUM, INPUT, SELECT, TONE } from '@/components/ui/tokens';
import { WidgetLoading, WidgetError } from '@/components/ui/WidgetFrame';
import Button from '@/components/ui/Button';

const LEVEL = {
  HIGH: { label: 'High', tone: TONE.danger },
  MEDIUM: { label: 'Medium', tone: TONE.success },
  LOW: { label: 'Low', tone: TONE.warning },
};
const SOURCE = { PRODUCT: 'same product', KIND: 'same kind, size and grade', SAGE: 'our Sage Brands price' };
const GRADE = { BUILDER: 'Builder', SPEC: 'Spec' };
const money = (n) => (n == null ? '' : `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: n < 100 ? 2 : 0, maximumFractionDigits: n < 100 ? 2 : 0 })}`);
const pct = (a, b) => (b ? `${Math.round((100 * a) / b)}%` : '0%');

function Level({ level }) {
  const l = LEVEL[level];
  if (!l) return <span className="text-xs text-slate-400">Not enough data</span>;
  return <span className={`inline-flex px-2 py-0.5 rounded-lg border text-xs font-semibold ${l.tone}`}>{l.label}</span>;
}

function Words({ list }) {
  if (!list?.length) return null;
  return <span className="text-xs text-slate-600">{list.join(', ')}</span>;
}

const UNIT = { IN: 'in', FT: 'ft' };

function sizeText(k) {
  if (k.sizeUnit === 'GRID') return 'Size matters (2x2, 2x4)';
  if (!k.sizeUnit) return 'One size';
  const u = UNIT[k.sizeUnit];
  if (k.sizeMin != null && k.sizeMax != null) return `${k.sizeMin} to ${k.sizeMax} ${u}`;
  if (k.sizeMin != null) return `${k.sizeMin} ${u} and up`;
  if (k.sizeMax != null) return `Up to ${k.sizeMax} ${u} (no size read counts too)`;
  return k.sizeUnit === 'IN' ? 'Size matters (inches)' : 'Size matters (feet)';
}

async function post(body) {
  const r = await fetch('/api/admin/bid-comparison', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'Could not save');
  return d;
}

const lines = (list) => (list || []).join('\n');
const BLANK_KIND = {
  key: '', name: '', sizeUnit: '', sizeMin: '', sizeMax: '', sageOnly: false, noTypical: false,
  builderNote: '', specNote: '', builderLow: '', builderHigh: '', specLow: '', specHigh: '',
  match: [], not: [], builderWords: [], specWords: [],
};

function Field({ label, children, className = '' }) {
  return (
    <label className={`block ${className}`}>
      <span className={LABEL}>{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function KindEditor({ kind, onDone }) {
  const [f, setF] = useState(() => ({
    ...kind,
    sizeUnit: kind.sizeUnit || '',
    match: lines(kind.match), not: lines(kind.not), builderWords: lines(kind.builderWords), specWords: lines(kind.specWords),
    sizeMin: kind.sizeMin ?? '', sizeMax: kind.sizeMax ?? '',
    builderLow: kind.builderLow ?? '', builderHigh: kind.builderHigh ?? '', specLow: kind.specLow ?? '', specHigh: kind.specHigh ?? '',
  }));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const box = useRef(null);
  useEffect(() => { box.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, []);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  const save = async () => {
    setSaving(true);
    setErr('');
    try {
      await post({ action: 'saveKind', kind: { ...f, builder: f.builderWords, spec: f.specWords } });
      onDone(true);
    } catch (e) {
      setErr(e.message);
      setSaving(false);
    }
  };

  const area = (k) => <textarea className={`${INPUT} font-mono text-xs`} rows={4} value={f[k]} onChange={set(k)} />;
  const dollars = (k) => <input className={INPUT} inputMode="decimal" value={f[k]} onChange={set(k)} placeholder="$" />;

  return (
    <div ref={box} className="bg-slate-50 border-y border-slate-200 p-4 space-y-4">
      <div className="text-sm font-semibold text-slate-900">{kind.key ? `Editing ${kind.name}` : 'New kind'}</div>
      <div className="grid sm:grid-cols-4 gap-3">
        <Field label="Name" className="sm:col-span-2"><input className={INPUT} value={f.name} onChange={set('name')} /></Field>
        <Field label="Size">
          <select className={SELECT} value={f.sizeUnit} onChange={set('sizeUnit')}>
            <option value="">One size</option>
            <option value="IN">Inches</option>
            <option value="FT">Feet</option>
            <option value="GRID">Grid (2x2, 2x4)</option>
          </select>
        </Field>
        {f.sizeUnit === 'IN' || f.sizeUnit === 'FT' ? (
          <div className="grid grid-cols-2 gap-2">
            <Field label="Smallest"><input className={INPUT} inputMode="decimal" value={f.sizeMin} onChange={set('sizeMin')} /></Field>
            <Field label="Largest"><input className={INPUT} inputMode="decimal" value={f.sizeMax} onChange={set('sizeMax')} /></Field>
          </div>
        ) : <div />}
      </div>
      <div className="flex flex-wrap gap-6 text-sm text-slate-700">
        <label className="inline-flex items-center gap-2"><input type="checkbox" checked={f.sageOnly} onChange={set('sageOnly')} /> Sage Brands only (no builder or spec split)</label>
        <label className="inline-flex items-center gap-2"><input type="checkbox" checked={f.noTypical} onChange={set('noTypical')} /> Compare bid to bid only (no typical price)</label>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Reads it from (one phrase per line, * matches any ending)">{area('match')}</Field>
        <Field label="Not this kind when it says">{area('not')}</Field>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="space-y-2">
          <Field label={f.sageOnly ? 'Note people see' : 'Builder grade note'}><textarea className={INPUT} rows={2} value={f.builderNote} onChange={set('builderNote')} /></Field>
          {!f.sageOnly && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Builder low">{dollars('builderLow')}</Field>
                <Field label="Builder high">{dollars('builderHigh')}</Field>
              </div>
              <Field label="Builder words">{area('builderWords')}</Field>
            </>
          )}
        </div>
        {!f.sageOnly && (
          <div className="space-y-2">
            <Field label="Spec grade note"><textarea className={INPUT} rows={2} value={f.specNote} onChange={set('specNote')} /></Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Spec low">{dollars('specLow')}</Field>
              <Field label="Spec high">{dollars('specHigh')}</Field>
            </div>
            <Field label="Spec words">{area('specWords')}</Field>
          </div>
        )}
      </div>
      {err && <p className="text-sm text-red-600">{err}</p>}
      <div className="flex gap-2">
        <Button size="sm" onClick={save} loading={saving}>Save</Button>
        <Button size="sm" variant="secondary" onClick={() => onDone(false)} disabled={saving}>Cancel</Button>
      </div>
    </div>
  );
}

function KindsCard({ kinds, fromDb, reload }) {
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const live = kinds.filter((k) => !k.archived);
  const archived = kinds.filter((k) => k.archived);

  const act = async (body) => {
    setBusy(body.key);
    setErr('');
    try {
      await post(body);
      await reload();
    } catch (e) {
      setErr(e.message);
    }
    setBusy('');
  };
  const done = async (saved) => {
    if (saved) await reload();
    setEditing(null);
  };

  const row = (k, i) => (
    <tbody key={k.key} className="border-t border-slate-100">
      <tr className="align-top">
        <td className={TD}>
          <div className="font-semibold text-slate-900">{k.name}</div>
          <div className="text-xs text-slate-500">
            {sizeText(k)}
            {k.noTypical ? '; compared bid to bid only' : ''}
          </div>
          {k.sageOnly && <span className={`inline-flex mt-1 px-2 py-0.5 rounded-lg border text-xs font-semibold ${TONE.brand}`}>Sage Brands only</span>}
          {k.source === 'HUMAN' && <div className="text-xs text-slate-400 mt-0.5">Edited by staff</div>}
          <div className="mt-2 flex flex-wrap gap-1">
            {k.archived ? (
              <Button size="sm" variant="secondary" loading={busy === k.key} onClick={() => act({ action: 'archiveKind', key: k.key, archived: false })}>Bring back</Button>
            ) : (
              <>
                <Button size="sm" variant="secondary" onClick={() => setEditing(k.key)} disabled={!!editing}>Edit</Button>
                <Button size="sm" variant="ghost" disabled={i === 0 || !!busy} onClick={() => act({ action: 'moveKind', key: k.key, dir: -1 })} aria-label={`Move ${k.name} up`}>Up</Button>
                <Button size="sm" variant="ghost" disabled={i === live.length - 1 || !!busy} onClick={() => act({ action: 'moveKind', key: k.key, dir: 1 })} aria-label={`Move ${k.name} down`}>Down</Button>
                <Button size="sm" variant="ghost" loading={busy === k.key} onClick={() => act({ action: 'archiveKind', key: k.key })}>Archive</Button>
              </>
            )}
          </div>
        </td>
        <td className={`${TD} max-w-sm`}>
          <Words list={k.match} />
          {k.not.length > 0 && <div className="mt-1 text-xs text-slate-400">Not: {k.not.join(', ')}</div>}
        </td>
        {k.sageOnly ? (
          <td className={`${TD} max-w-md`} colSpan={2}><div className="text-xs">{k.builderNote}</div></td>
        ) : (
          <>
            <td className={`${TD} max-w-xs`}>
              <div className="text-xs">{k.builderNote}</div>
              {k.builderRange && <div className="text-xs font-semibold text-slate-700 mt-0.5">{k.builderRange}</div>}
              {k.builderWords.length > 0 && <div className="text-xs text-slate-400 mt-0.5">Words: {k.builderWords.join(', ')}</div>}
            </td>
            <td className={`${TD} max-w-xs`}>
              <div className="text-xs">{k.specNote}</div>
              {k.specRange && <div className="text-xs font-semibold text-slate-700 mt-0.5">{k.specRange}</div>}
              {k.specWords.length > 0 && <div className="text-xs text-slate-400 mt-0.5">Words: {k.specWords.join(', ')}</div>}
            </td>
          </>
        )}
      </tr>
    </tbody>
  );

  return (
    <div className={`${CARD} overflow-x-auto`}>
      <div className="p-5 pb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className={H2}>Fixture kinds ({live.length})</h2>
          <p className={`${HELPER} mt-1`}>
            The first kind whose words match wins, top to bottom, so narrow kinds go above broad ones. A trailing *
            matches any ending. Grade words name the grade outright; otherwise the brand decides.
            {fromDb?.kinds ? '' : ' These are the starting rules; your first edit saves them all.'}
          </p>
        </div>
        <Button size="sm" onClick={() => setEditing('new')} disabled={!!editing}>Add a kind</Button>
      </div>
      {err && <p className="px-5 pb-3 text-sm text-red-600">{err}</p>}
      {editing === 'new' && <KindEditor kind={BLANK_KIND} onDone={done} />}
      {editing && editing !== 'new' && <KindEditor key={editing} kind={kinds.find((k) => k.key === editing)} onDone={done} />}
      <table className="w-full">
        <thead className="bg-slate-50">
          <tr>
            <th className={TH}>Kind</th>
            <th className={TH}>Reads it from</th>
            <th className={TH}>Builder grade</th>
            <th className={TH}>Spec grade</th>
          </tr>
        </thead>
        {live.map(row)}
        {showArchived && archived.map(row)}
      </table>
      {archived.length > 0 && (
        <div className="p-3 border-t border-slate-100">
          <Button size="sm" variant="ghost" onClick={() => setShowArchived((x) => !x)}>
            {showArchived ? 'Hide archived' : `Show archived (${archived.length})`}
          </Button>
        </div>
      )}
    </div>
  );
}

const GRADE_OPTIONS = [
  ['BUILDER', 'Builder'],
  ['SPEC', 'Spec'],
  ['BOTH', 'Both (words decide)'],
  ['', 'Not set'],
];
const SOURCE_LABEL = { DEFAULT: 'Starting rule', HUMAN: 'Staff', AI: 'Suggested' };

function BrandsCard({ brands, fromDb, reload }) {
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [add, setAdd] = useState({ brand: '', grade: 'BUILDER', sage: false });

  const run = async (key, body) => {
    setBusy(key);
    setErr('');
    let ok = true;
    try {
      await post(body);
      await reload();
    } catch (e) {
      setErr(e.message);
      ok = false;
    }
    setBusy('');
    return ok;
  };
  const save = (b, change) => run(b.brand, { action: 'saveBrand', brand: { ...b, ...change } });
  const archive = (b, archived) => run(b.brand, { action: 'archiveBrand', brand: b.brand, archived });
  const addBrand = async () => {
    if (await run('__add', { action: 'saveBrand', brand: add })) setAdd({ brand: '', grade: 'BUILDER', sage: false });
  };

  const needle = q.trim().toUpperCase();
  const shown = brands.filter((b) => (showArchived || !b.archived) && (!needle || b.brand.includes(needle)));
  const live = brands.filter((b) => !b.archived && b.status === 'APPROVED');
  const count = (g) => live.filter((b) => b.grade === g).length;
  const proposed = brands.filter((b) => b.status === 'PROPOSED' && !b.archived).length;

  return (
    <div className={`${CARD} overflow-x-auto`}>
      <div className="p-5 pb-3">
        <h2 className={H2}>Brand grades</h2>
        <p className={`${HELPER} mt-1`}>
          A brand set to Builder or Spec grades its lines when the words do not. Both means the brand sells both grades,
          so the words decide. Sage Brands are ILC&apos;s cross (the Sage Brands pick).
          {fromDb?.brands ? '' : ' These are the starting rules; your first edit saves them all.'}
        </p>
        <div className="mt-3 flex flex-wrap gap-4 text-sm text-slate-700">
          <span>Builder <b className={NUM}>{count('BUILDER')}</b></span>
          <span>Spec <b className={NUM}>{count('SPEC')}</b></span>
          <span>Both <b className={NUM}>{count('BOTH')}</b></span>
          <span>Sage Brands <b className={NUM}>{live.filter((b) => b.sage).length}</b></span>
          {proposed > 0 && <span>Waiting on a decision <b className={NUM}>{proposed}</b></span>}
        </div>
        <div className="mt-3 grid sm:grid-cols-[1fr_auto_auto_auto] gap-2 items-end">
          <Field label="Add a brand"><input className={INPUT} value={add.brand} onChange={(e) => setAdd({ ...add, brand: e.target.value })} placeholder="Brand name" /></Field>
          <select className={SELECT} value={add.grade} onChange={(e) => setAdd({ ...add, grade: e.target.value })} aria-label="Grade for the new brand">
            {GRADE_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <label className="inline-flex items-center gap-2 text-sm text-slate-700 py-2"><input type="checkbox" checked={add.sage} onChange={(e) => setAdd({ ...add, sage: e.target.checked })} /> Sage Brands</label>
          <Button onClick={addBrand} loading={busy === '__add'} disabled={!add.brand.trim() || !!busy}>Add</Button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <input className={`${INPUT} max-w-xs`} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a brand" aria-label="Find a brand" />
          <label className="inline-flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Show archived</label>
        </div>
        {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
      </div>
      <table className="w-full">
        <thead className="bg-slate-50">
          <tr>
            <th className={TH}>Brand</th>
            <th className={TH}>Grade</th>
            <th className={TH}>Sage Brands</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {shown.map((b) => (
            <tr key={b.brand} className={b.archived ? 'opacity-60' : ''}>
              <td className={TD}>
                <div className="font-semibold text-slate-900">{b.brand}</div>
                <div className="text-xs text-slate-500">
                  {b.status === 'PROPOSED'
                    ? `Suggested${b.confidence != null ? ` (${Math.round(b.confidence * 100)}% sure)` : ''}`
                    : b.status === 'REJECTED' ? 'Turned down' : SOURCE_LABEL[b.source] || b.source}
                </div>
                {b.note && <div className="text-xs text-slate-400">{b.note}</div>}
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {b.status === 'PROPOSED' && !b.archived && (
                    <>
                      <Button size="sm" onClick={() => save(b, { status: 'APPROVED' })} disabled={!!busy}>Approve</Button>
                      <Button size="sm" variant="secondary" onClick={() => save(b, { status: 'REJECTED' })} disabled={!!busy}>Turn down</Button>
                    </>
                  )}
                  <Button size="sm" variant="ghost" loading={busy === b.brand} disabled={!!busy && busy !== b.brand} onClick={() => archive(b, !b.archived)}>{b.archived ? 'Bring back' : 'Archive'}</Button>
                </div>
              </td>
              <td className={TD}>
                <select className={`${SELECT} py-1 text-xs max-w-[11rem]`} value={b.grade || ''} disabled={b.archived || !!busy} onChange={(e) => save(b, { grade: e.target.value || null })} aria-label={`${b.brand} grade`}>
                  {GRADE_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </td>
              <td className={TD}>
                <input type="checkbox" checked={b.sage} disabled={b.archived || !!busy} onChange={(e) => save(b, { sage: e.target.checked })} aria-label={`${b.brand} is Sage Brands`} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// "Is this right?" on one comparison line (0139). One mark per person per
// line; three agreeing marks become a suggested change for a person to approve.
const MARK_LABEL = { RIGHT: 'Right', WRONG_KIND: 'Wrong kind', WRONG_GRADE: 'Wrong grade' };

function MarkCell({ job, row, kinds, mark, onMarked }) {
  const [mode, setMode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const cell = row.cells.ilc || {};
  const line = {
    job,
    lineKey: row.key,
    typeTag: row.typeTag,
    description: row.description,
    mfr: cell.mfr,
    catalog: cell.catalog,
    kindRead: row.kindKey || null,
    gradeRead: cell.grade || null,
    gradeBy: cell.gradeBy || null,
  };
  const send = async (body) => {
    setBusy(true);
    setErr('');
    try {
      await post(body);
      setMode('');
      onMarked?.();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };
  if (mark && !mode) {
    const said = mark.mark === 'WRONG_KIND' ? `should be ${kinds.find((k) => k.key === mark.kindShould)?.name || mark.kindShould}`
      : mark.mark === 'WRONG_GRADE' ? `should be ${GRADE[mark.gradeShould]}` : MARK_LABEL.RIGHT;
    return (
      <div className="text-xs">
        <div>You said: <b>{said}</b></div>
        <div className="mt-1 flex gap-1">
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => setMode('pick')}>Change</Button>
          <Button size="sm" variant="ghost" loading={busy} onClick={() => send({ action: 'clearMark', job, lineKey: row.key })}>Clear</Button>
        </div>
      </div>
    );
  }
  if (mode === 'kind') {
    return (
      <div className="text-xs">
        <select className={`${SELECT} text-xs`} disabled={busy} defaultValue="" onChange={(e) => e.target.value && send({ action: 'mark', ...line, mark: 'WRONG_KIND', kindShould: e.target.value })} aria-label="Kind it should be">
          <option value="">Should be...</option>
          {kinds.filter((k) => !k.archived).map((k) => <option key={k.key} value={k.key}>{k.name}</option>)}
        </select>
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => setMode('')}>Cancel</Button>
      </div>
    );
  }
  if (mode === 'grade') {
    return (
      <div className="flex flex-wrap gap-1">
        <Button size="sm" variant="secondary" loading={busy} onClick={() => send({ action: 'mark', ...line, mark: 'WRONG_GRADE', gradeShould: 'BUILDER' })}>Builder</Button>
        <Button size="sm" variant="secondary" loading={busy} onClick={() => send({ action: 'mark', ...line, mark: 'WRONG_GRADE', gradeShould: 'SPEC' })}>Spec</Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => setMode('')}>Cancel</Button>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap gap-1">
      <Button size="sm" variant="secondary" loading={busy} onClick={() => send({ action: 'mark', ...line, mark: 'RIGHT' })}>Right</Button>
      <Button size="sm" variant="ghost" disabled={busy} onClick={() => setMode('kind')}>Wrong kind</Button>
      <Button size="sm" variant="ghost" disabled={busy} onClick={() => setMode('grade')}>Wrong grade</Button>
      {err && <div className={`text-xs ${TONE.danger}`}>{err}</div>}
    </div>
  );
}

// Rule changes the marks add up to, waiting on a person (0139).
function SuggestedChangesCard({ proposals, kinds, reload }) {
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [edits, setEdits] = useState({});
  const waiting = (proposals || []).filter((p) => p.status === 'PROPOSED');
  const decided = (proposals || []).filter((p) => p.status !== 'PROPOSED').slice(0, 10);
  const kindName = (key) => kinds.find((k) => k.key === key)?.name || key;
  const decide = async (p, status) => {
    setBusy(p.id);
    setErr('');
    try {
      await post({ action: 'decideProposal', id: p.id, status, phrase: edits[p.id]?.phrase, grade: edits[p.id]?.grade });
      await reload();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy('');
    }
  };
  return (
    <div className={CARD_PADDED}>
      <h2 className={H2}>Suggested changes</h2>
      <p className={`${HELPER} mt-1`}>
        When 3 marks agree (from any mix of people and lines), the tool suggests one change here. Nothing changes
        until a person approves it; you can change the word or grade first. A turned down suggestion does not come back.
      </p>
      {err && <div className={`mt-2 text-sm ${TONE.danger}`}>{err}</div>}
      {waiting.length === 0 && <p className={`${HELPER} mt-3`}>Nothing waiting. Mark lines on a past job above and suggestions show up here.</p>}
      {waiting.length > 0 && (
        <div className={`${CARD} mt-3 overflow-x-auto`}>
          <table className="w-full">
            <thead className="bg-slate-50">
              <tr>
                <th className={TH}>Change</th>
                <th className={TH}>From the line</th>
                <th className={`${TH} text-right`}>Marks for</th>
                <th className={`${TH} text-right`}>Against</th>
                <th className={TH}></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {waiting.map((p) => (
                <tr key={p.id} className="align-top">
                  <td className={TD}>
                    {p.kind === 'KIND_WORD' ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <span>{kindName(p.kindKey)} also reads from</span>
                        <input className={`${INPUT} w-36`} value={edits[p.id]?.phrase ?? p.phrase} onChange={(e) => setEdits({ ...edits, [p.id]: { phrase: e.target.value.toUpperCase() } })} aria-label="Word" />
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center gap-2">
                        <span>{p.brand} is</span>
                        <select className={`${SELECT} w-28`} value={edits[p.id]?.grade ?? p.grade} onChange={(e) => setEdits({ ...edits, [p.id]: { grade: e.target.value } })} aria-label="Grade">
                          <option value="BUILDER">Builder</option>
                          <option value="SPEC">Spec</option>
                        </select>
                      </div>
                    )}
                  </td>
                  <td className={`${TD} max-w-xs`}><div className="line-clamp-2 text-xs text-slate-600">{p.sample}</div></td>
                  <td className={`${TD} text-right ${NUM}`}>{p.marks}</td>
                  <td className={`${TD} text-right ${NUM}`}>{p.against}</td>
                  <td className={TD}>
                    <div className="flex gap-1">
                      <Button size="sm" loading={busy === p.id} onClick={() => decide(p, 'APPROVED')}>Approve</Button>
                      <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => decide(p, 'REJECTED')}>Turn down</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {decided.length > 0 && (
        <div className="mt-3 text-xs text-slate-500">
          Decided lately:{' '}
          {decided.map((p) => (
            <span key={p.id} className="mr-3">
              {p.kind === 'KIND_WORD' ? `${kindName(p.kindKey)} reads from ${p.appliedAs || p.phrase}` : `${p.brand} is ${GRADE[p.appliedAs || p.grade]}`}
              {' '}({p.status === 'APPROVED' ? 'approved' : 'turned down'})
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function TryPastJob({ jobs, kinds, onMarked }) {
  const [job, setJob] = useState('');
  const [data, setData] = useState(null);
  const [state, setState] = useState('idle');
  const [marks, setMarks] = useState({});

  useEffect(() => {
    if (!job) { setData(null); setState('idle'); return; }
    let live = true;
    setState('loading');
    fetch(`/api/admin/bid-comparison?job=${encodeURIComponent(job)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((d) => { if (live) { setData(d); setMarks(d.marks || {}); setState('ok'); } })
      .catch(() => { if (live) setState('error'); });
    return () => { live = false; };
  }, [job]);

  // After a mark, read this person's marks again (cheap) and tell the page so
  // the suggested changes refresh.
  const marked = () => {
    fetch(`/api/admin/bid-comparison?job=${encodeURIComponent(job)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((d) => setMarks(d.marks || {}))
      .catch(() => {});
    onMarked?.();
  };

  const bid = data?.result?.bids?.[0];
  const rows = data?.result?.rows || [];
  const c = bid?.counts?.vsTypical;
  const priced = c ? c.HIGH + c.MEDIUM + c.LOW + c.NONE : 0;

  return (
    <div className={CARD_PADDED}>
      <h2 className={H2}>Try it on a past job</h2>
      <p className={`${HELPER} mt-1`}>
        Rates ILC&apos;s prices on one past job against every other past job, the way a new bid would be checked.
        Medium is within 15% of the typical price. Mark a line Right or Wrong to teach the tool.
      </p>
      <select className={`${SELECT} mt-3 max-w-md`} value={job} onChange={(e) => setJob(e.target.value)}>
        <option value="">Pick a past job</option>
        {jobs.map((j) => (
          <option key={j.job} value={j.job}>{j.job} ({j.priced} priced lines)</option>
        ))}
      </select>

      {state === 'loading' && <WidgetLoading className="mt-4">Checking...</WidgetLoading>}
      {state === 'error' && <WidgetError className="mt-4">Could not check that job.</WidgetError>}
      {state === 'ok' && bid && (
        <>
          <div className="mt-4 flex flex-wrap gap-4 text-sm text-slate-700">
            <span><b className={NUM}>{priced}</b> priced lines</span>
            <span><b className={NUM}>{pct(priced - c.NONE, priced)}</b> get a price level</span>
            <span>High <b className={NUM}>{c.HIGH}</b></span>
            <span>Medium <b className={NUM}>{c.MEDIUM}</b></span>
            <span>Low <b className={NUM}>{c.LOW}</b></span>
            <span>Not enough data <b className={NUM}>{c.NONE}</b></span>
          </div>
          <div className={`${CARD} mt-3 overflow-x-auto`}>
            <table className="w-full">
              <thead className="bg-slate-50">
                <tr>
                  <th className={TH}>Type</th>
                  <th className={TH}>Description</th>
                  <th className={TH}>Brand and catalog</th>
                  <th className={TH}>Read as</th>
                  <th className={`${TH} text-right`}>Our price</th>
                  <th className={TH}>Vs past jobs</th>
                  <th className={TH}>Sage Brands pick</th>
                  <th className={TH}>Is this right?</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => {
                  const cell = r.cells.ilc;
                  const t = cell?.vsTypical;
                  return (
                    <tr key={r.key} className="align-top">
                      <td className={`${TD} whitespace-nowrap`}>{r.typeTag}</td>
                      <td className={`${TD} max-w-xs`}><div className="line-clamp-2">{r.description}</div></td>
                      <td className={TD}>
                        <div>{cell?.mfr}</div>
                        <div className="text-xs text-slate-500">{cell?.catalog?.split(/\r?\n/)[0]}</div>
                      </td>
                      <td className={TD}>
                        <div>{r.kindName || <span className="text-slate-400">No kind</span>}{r.size ? ` ${r.size}` : ''}</div>
                        <div className="text-xs text-slate-500">
                          {cell?.grade ? `${GRADE[cell.grade]} grade (${cell.gradeBy === 'words' ? 'by words' : 'by brand'})` : 'Grade not known'}
                        </div>
                      </td>
                      <td className={`${TD} text-right ${NUM} whitespace-nowrap`}>
                        {money(cell?.unitPrice)}{r.basis === 'FT' ? ' / ft' : ''}
                      </td>
                      <td className={TD}>
                        <Level level={t?.level} />
                        {t && (
                          <div className="text-xs text-slate-500 mt-0.5">
                            typical {money(t.price)}, {SOURCE[t.source]}, {t.n} lines on {t.jobs} jobs
                          </div>
                        )}
                      </td>
                      <td className={TD}>
                        {r.sage ? (
                          <>
                            <div className="text-xs">{r.sage.family?.replace('|', ' ')}</div>
                            <div className="text-xs text-slate-500">{money(r.sage.price)}{r.sage.source === 'SWAP' ? ', what we swapped it to before' : ', our usual for this kind'}</div>
                          </>
                        ) : <span className="text-xs text-slate-400">{cell?.sage ? 'Already Sage Brands' : 'None'}</span>}
                      </td>
                      <td className={TD}>
                        <MarkCell job={job} row={r} kinds={kinds} mark={marks[r.key]} onMarked={marked} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

export default function FixtureKindsTab() {
  const [data, setData] = useState(null);
  const [state, setState] = useState('loading');

  const reload = useCallback(
    () =>
      fetch('/api/admin/bid-comparison')
        .then((r) => (r.ok ? r.json() : Promise.reject(r)))
        .then((d) => { setData(d); setState('ok'); })
        .catch(() => setState('error')),
    [],
  );
  useEffect(() => { reload(); }, [reload]);

  if (state === 'loading') return <WidgetLoading>Loading fixture kinds...</WidgetLoading>;
  if (state === 'error') return <WidgetError>Could not load fixture kinds.</WidgetError>;

  return (
    <div className="space-y-6">
      <p className={HELPER}>
        Bid Comparison, internal only. How each bid line is read (kind, size, grade) and the builder vs spec grade
        explainer people will see. Edits take effect on the next check.
      </p>

      <TryPastJob jobs={data.jobs} kinds={data.kinds} onMarked={reload} />
      <SuggestedChangesCard proposals={data.proposals} kinds={data.kinds} reload={reload} />
      <KindsCard kinds={data.kinds} fromDb={data.fromDb} reload={reload} />
      <BrandsCard brands={data.brands} fromDb={data.fromDb} reload={reload} />
    </div>
  );
}
