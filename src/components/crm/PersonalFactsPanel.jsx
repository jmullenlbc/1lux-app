'use client';
import { useEffect, useState } from 'react';
import { PERSONAL_CATEGORIES, PERSONAL_LABEL } from '@/lib/contacts/personalFacts';
import { TILE, INPUT, BTN_COMPACT_PRIMARY, HELPER } from '@/components/ui/tokens';

/**
 * Personal things this person has mentioned: kids, golf, cold brew. Read out
 * of sales notes on publish, or typed here. Staff only. Put away, never deleted.
 */
export default function PersonalFactsPanel({ contactId, name }) {
  const [facts, setFacts] = useState(null);
  const [draft, setDraft] = useState({ category: 'FAMILY', fact: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [showAway, setShowAway] = useState(false);
  const [intel, setIntel] = useState([]);
  const url = `/api/crm/contacts/${contactId}/personal`;

  useEffect(() => {
    fetch(url).then(r => r.json()).then(d => setFacts(d.facts || [])).catch(() => setErr('Could not load.'));
  }, [url]);

  // Facts from meetings ("touring a property on the 13th"): notes only, never steps.
  useEffect(() => {
    fetch(`/api/crm/intel?contactId=${contactId}`).then(r => r.json()).then(d => setIntel(d.items || [])).catch(() => {});
  }, [contactId]);

  async function send(method, body) {
    setBusy(true); setErr('');
    try {
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || `Error ${res.status}`);
      setFacts(d.facts || []);
      return true;
    } catch (e) { setErr(e.message); return false; }
    finally { setBusy(false); }
  }

  async function add() {
    if (!draft.fact.trim()) return;
    if (await send('POST', draft)) setDraft(d => ({ ...d, fact: '' }));
  }

  if (!facts) return <p className="mt-2 text-xs text-slate-500">{err || 'Loading...'}</p>;
  const live = facts.filter(f => !f.archivedAt);
  const away = facts.filter(f => f.archivedAt);

  return (
    <div className={`mt-2 ${TILE}`}>
      {intel.length > 0 && (
        <div className="mb-3">
          <p className={`${HELPER} mb-1`}>Noted in meetings</p>
          <ul className="space-y-1">
            {intel.map(i => (
              <li key={i.id} className="text-xs text-slate-700">
                {i.detail || i.rawText}
                {i.note && <span className="text-slate-300"> · {i.note.title || 'note'}{i.note.meetingDate ? `, ${new Date(i.note.meetingDate).toLocaleDateString()}` : ''}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className={`${HELPER} mb-2`}>
        Things {name?.split(' ')[0] || 'they'} mentioned outside work. Picked up from sales notes, or add your own. Only staff see these.
      </p>
      {live.length === 0 && <p className="text-xs text-slate-500 mb-2">Nothing yet.</p>}
      <ul className="space-y-1 mb-2">
        {live.map(f => (
          <li key={f.id} className="group/f flex items-center gap-2 text-xs">
            <span className="px-1.5 py-0.5 rounded bg-white border border-slate-200 text-slate-500 shrink-0">{PERSONAL_LABEL[f.category] || 'Other'}</span>
            <span className="text-slate-700">{f.fact}</span>
            {f.sourceNote && <span className="text-slate-300" title={`From the note "${f.sourceNote.title || 'untitled'}"`}>from a note</span>}
            <button onClick={() => send('PATCH', { factId: f.id, archived: true })} disabled={busy}
              className="ml-auto text-slate-400 hover:text-orange-600 opacity-0 group-hover/f:opacity-100">Put away</button>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <select value={draft.category} onChange={e => setDraft(d => ({ ...d, category: e.target.value }))}
          className={`${INPUT} w-auto`}>
          {PERSONAL_CATEGORIES.map(c => <option key={c} value={c}>{PERSONAL_LABEL[c]}</option>)}
        </select>
        <input value={draft.fact} onChange={e => setDraft(d => ({ ...d, fact: e.target.value }))}
          onKeyDown={e => { if (e.key === 'Enter') add(); }} maxLength={200}
          placeholder="e.g. Two kids who play soccer" className={`${INPUT} flex-1`} />
        <button onClick={add} disabled={busy || !draft.fact.trim()}
          className={`${BTN_COMPACT_PRIMARY} disabled:opacity-40`}>Add</button>
      </div>
      {err && <p className="text-xs text-red-600 mt-1">{err}</p>}
      {away.length > 0 && (
        <div className="mt-2">
          <button onClick={() => setShowAway(s => !s)} className="text-[11px] text-slate-500 hover:underline">Put away ({away.length})</button>
          {showAway && (
            <ul className="mt-1 space-y-1">
              {away.map(f => (
                <li key={f.id} className="flex items-center gap-2 text-xs text-slate-400">
                  <span className="line-through">{f.fact}</span>
                  <button onClick={() => send('PATCH', { factId: f.id, archived: false })} disabled={busy}
                    className="text-orange-600 hover:underline">Restore</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
