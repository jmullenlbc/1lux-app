'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { BTN_COMPACT, BTN_COMPACT_PRIMARY } from './tokens';

// Select all + the bar that edits or archives every picked row at once
// (Mike 10-29, Manufacturers and Sales Reps). The page owns the picks and the
// save; this only draws the controls.
//   fields: [{ key, label, kind: 'text' | 'yesno' | 'choice', options? }]
//   options (choice only): [{ value, label }]
//   onApply({ [key]: value }) and onArchive(true | false) return a promise.
//   archived: true when every picked row is archived, so the bar offers Restore.
// useBulkPicks holds the picks and posts { ids, set } to the page's bulk route.

// onDone runs after a save, for pages that fetch their own rows.
export function useBulkPicks(shown, url, code, onDone) {
  const router = useRouter();
  const [picked, setPicked] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const ids = shown.map((x) => x.id);
  const pickedIds = ids.filter((id) => picked.has(id));
  const allPicked = ids.length > 0 && pickedIds.length === ids.length;
  const toggle = (id) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleAll = () => setPicked(allPicked ? new Set() : new Set(ids));
  const archived = pickedIds.length > 0 && shown.every((x) => !picked.has(x.id) || !x.active);

  async function run(set, done) {
    setBusy(true); setMsg(''); setErr('');
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: pickedIds, set }) }).catch(() => null);
    const d = await res?.json().catch(() => ({}));
    setBusy(false);
    if (!res?.ok) { setErr(d?.error || `Could not reach the server, so nothing was changed. Try again. (${code}_${res?.status || 'NET'})`); return; }
    setMsg(`${done} ${d.updated} of ${pickedIds.length}.${d.updated < pickedIds.length ? ' The rest already had that value.' : ''}`);
    setPicked(new Set());
    router.refresh();
    onDone?.();
  }

  return { picked, pickedIds, allPicked, archived, busy, msg, err, toggle, toggleAll, clear: () => setPicked(new Set()), run };
}

export function SelectAllRow({ shown, picked, allPicked, onToggleAll }) {
  return (
    <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer select-none">
      <input type="checkbox" checked={allPicked} onChange={onToggleAll} disabled={!shown} className="w-4 h-4 accent-orange-500" />
      <span>Select all{shown ? ` (${shown})` : ''}</span>
      {picked > 0 && <span className="ml-auto font-semibold text-slate-800 tabular-nums">{picked} picked</span>}
    </label>
  );
}

export default function BulkEditBar({ count, noun, fields, archived, busy, onApply, onArchive, onClear }) {
  const [field, setField] = useState('');
  const [value, setValue] = useState('');
  const [confirm, setConfirm] = useState(false);
  if (!count) return null;
  const f = fields.find((x) => x.key === field);
  const ready = f && (f.kind === 'text' ? true : value !== '');

  async function apply() {
    if (!ready) return;
    await onApply({ [f.key]: f.kind === 'yesno' ? value === 'yes' : value });
    setField(''); setValue('');
  }

  return (
    <div className="rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-xs text-slate-700 flex flex-wrap items-center gap-2">
      <span className="font-semibold">Edit {count} {noun}:</span>
      <select value={field} onChange={(e) => { setField(e.target.value); setValue(''); }} disabled={busy}
        className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs">
        <option value="">Pick a field</option>
        {fields.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
      </select>
      {f?.kind === 'yesno' && (
        <select value={value} onChange={(e) => setValue(e.target.value)} disabled={busy}
          className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs">
          <option value="">Yes or no</option>
          <option value="yes">Yes</option>
          <option value="no">No</option>
        </select>
      )}
      {f?.kind === 'choice' && (
        <select value={value} onChange={(e) => setValue(e.target.value)} disabled={busy}
          className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs">
          <option value="">Pick one</option>
          {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      )}
      {f?.kind === 'text' && (
        <input value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && apply()} disabled={busy}
          placeholder="New value (blank clears it)" className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs w-52" />
      )}
      {f && <button type="button" className={BTN_COMPACT_PRIMARY} disabled={busy || !ready} onClick={apply}>Apply to {count}</button>}
      <span className="mx-1 h-5 border-l border-orange-200" />
      {archived ? (
        <button type="button" className={BTN_COMPACT} disabled={busy} onClick={() => onArchive(false)}>Restore {count}</button>
      ) : confirm ? (
        <>
          <span>Archive {count} {noun}? They hide from lists and pickers; nothing is deleted.</span>
          <button type="button" className={BTN_COMPACT_PRIMARY} disabled={busy} onClick={async () => { await onArchive(true); setConfirm(false); }}>Yes, archive</button>
          <button type="button" className={BTN_COMPACT} disabled={busy} onClick={() => setConfirm(false)}>Cancel</button>
        </>
      ) : (
        <button type="button" className={BTN_COMPACT} disabled={busy} onClick={() => setConfirm(true)}>Archive {count}</button>
      )}
      <button type="button" className={`${BTN_COMPACT} ml-auto`} disabled={busy} onClick={onClear}>Clear picks</button>
      {busy && <span>Saving…</span>}
    </div>
  );
}

// Select all, the bar, and the result line, wired to useBulkPicks.
export function BulkTools({ bulk, shown, noun, fields }) {
  return (
    <div className="space-y-2">
      <SelectAllRow shown={shown} picked={bulk.pickedIds.length} allPicked={bulk.allPicked} onToggleAll={bulk.toggleAll} />
      <BulkEditBar count={bulk.pickedIds.length} noun={noun} fields={fields} archived={bulk.archived} busy={bulk.busy}
        onApply={(set) => bulk.run(set, 'Changed')}
        onArchive={(archive) => bulk.run({ active: !archive }, archive ? 'Archived' : 'Restored')}
        onClear={bulk.clear} />
      {bulk.err && <p className="text-xs text-red-600">{bulk.err}</p>}
      {bulk.msg && <p className="text-xs text-green-700">{bulk.msg}</p>}
    </div>
  );
}
