'use client';
import { useEffect, useRef, useState } from 'react';
import PersonPicker from '@/components/desk/PersonPicker';
import { QUICK_NOTE_TYPES, quickNoteTitle } from '@/lib/desk/needsPerson';

// Quick Note (Mike 9-26): right after the coffee, on the phone. Pick who, say
// what happened (the keyboard's mic does the typing), publish. Everything is
// kept on the phone as it is typed, so a dropped signal loses nothing: the note
// waits here until Publish goes through.
const KEY = 'ilc.quickNote.v1';
const today = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
const BLANK = () => ({ people: [], activityType: 'COFFEE', date: today(), text: '', noteId: null });

function readSaved() {
  try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); return s && typeof s === 'object' ? { ...BLANK(), ...s } : null; }
  catch { return null; }
}
function save(v) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* private window: still works, just not kept */ } }
function forget() { try { localStorage.removeItem(KEY); } catch { /* nothing kept */ } }

export default function QuickNote({ onPublished }) {
  const [open, setOpen] = useState(false);
  const [n, setN] = useState(BLANK);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null); // { tone: 'ok' | 'warn', text }
  const loaded = useRef(false);

  // An unsent note from last time opens straight back up.
  useEffect(() => {
    const s = readSaved();
    if (s && (s.text.trim() || s.people.length)) { setN(s); setOpen(true); setMsg({ tone: 'warn', text: 'This note is saved on this phone and has not been published yet.' }); }
    loaded.current = true;
  }, []);
  useEffect(() => { if (loaded.current && open) save(n); }, [n, open]);

  const set = patch => setN(v => ({ ...v, ...patch }));

  async function send(url, method, body) {
    const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || `Could not save (${r.status}).`);
    return d;
  }

  async function publish(asDraft = false) {
    if (!n.text.trim()) { setMsg({ tone: 'warn', text: 'Say or type what happened first.' }); return; }
    setBusy(true); setMsg(null);
    const fields = {
      title: quickNoteTitle(n.activityType, n.people),
      noteBody: n.text.trim(),
      meetingDate: n.date ? new Date(`${n.date}T12:00:00`).toISOString() : null,
      activityType: n.activityType,
    };
    const contactIds = n.people.map(p => p.id);
    try {
      // The note is made once; a retry after a dropped signal only finishes it.
      let noteId = n.noteId;
      if (!noteId) {
        const clientIds = [...new Set(n.people.map(p => p.client?.id).filter(Boolean))];
        noteId = (await send('/api/crm/notes', 'POST', { ...fields, contactIds, clientIds })).id;
        set({ noteId }); save({ ...n, noteId });
      } else {
        await send(`/api/crm/notes/${noteId}`, 'PATCH', { ...fields, contactIds });
      }
      if (!asDraft) await send(`/api/crm/notes/${noteId}`, 'PATCH', { publish: true });
      forget(); setN(BLANK()); setOpen(false);
      setMsg({ tone: 'ok', text: asDraft ? 'Saved to your notes to finish.' : 'Published. Next steps and any follow-up email will show on your desk.' });
      onPublished?.();
    } catch (e) {
      const offline = e.message === 'Failed to fetch' || (typeof navigator !== 'undefined' && navigator.onLine === false);
      setMsg({ tone: 'warn', text: offline ? 'No signal. Your note is saved on this phone. Tap Publish again when you have signal.' : e.message });
    }
    setBusy(false);
  }

  if (!open) {
    return (
      <div className="mb-6">
        <button type="button" onClick={() => { setOpen(true); setMsg(null); }}
          className="w-full min-h-[52px] rounded-lg bg-orange-500 text-white text-base font-semibold shadow-sm hover:bg-orange-600 active:bg-orange-600">+ Quick note</button>
        {msg && <p className={`mt-2 text-sm ${msg.tone === 'ok' ? 'text-green-700' : 'text-amber-700'}`}>{msg.text}</p>}
      </div>
    );
  }

  return (
    <section className="mb-6 rounded-lg border border-slate-200 bg-white shadow-sm p-3 space-y-3">
      <div className="flex items-center">
        <h2 className="text-sm font-semibold text-slate-700">Quick note</h2>
        <button type="button" onClick={() => setOpen(false)} className="ml-auto text-xs font-semibold text-slate-600 hover:underline">Hide (kept on this phone)</button>
      </div>

      <div>
        {n.people.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {n.people.map(p => (
              <span key={p.id} className="inline-flex items-center gap-1 rounded-lg bg-white border border-slate-200 pl-3 pr-1 py-1 text-sm text-slate-700">
                {p.name}
                <button type="button" aria-label={`Remove ${p.name}`} onClick={() => set({ people: n.people.filter(x => x.id !== p.id) })}
                  className="w-7 h-7 rounded-lg text-slate-500 hover:bg-slate-100">×</button>
              </span>
            ))}
          </div>
        )}
        <PersonPicker skipIds={n.people.map(p => p.id)}
          onPick={c => set({ people: [...n.people, { id: c.id, name: c.name, client: c.client ? { id: c.client.id } : null }] })} />
      </div>

      <div className="flex flex-wrap gap-2">
        {QUICK_NOTE_TYPES.map(t => (
          <button key={t.key} type="button" onClick={() => set({ activityType: t.key })}
            className={`min-h-[40px] px-3 rounded-lg text-sm font-semibold border ${n.activityType === t.key ? 'bg-orange-500 border-orange-500 text-white' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}>{t.label}</button>
        ))}
      </div>

      <label className="flex items-center gap-2 text-sm text-slate-600">
        When
        <input type="date" value={n.date} max={today()} onChange={e => set({ date: e.target.value })}
          className="min-h-[40px] rounded-lg border border-slate-200 bg-white px-2 text-base" />
      </label>

      <div>
        <textarea value={n.text} onChange={e => set({ text: e.target.value })} rows={6}
          placeholder="What did you talk about? What happens next?"
          className="w-full rounded-lg border border-slate-200 bg-white p-3 text-base text-slate-900 outline-none focus:border-orange-500" />
        <p className="text-xs text-slate-500">Tap the mic on your phone keyboard to talk instead of type.</p>
      </div>

      {msg && <p className={`text-sm ${msg.tone === 'ok' ? 'text-green-700' : 'text-amber-700'}`}>{msg.text}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => publish(false)} disabled={busy}
          className="min-h-[48px] flex-1 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-base font-semibold disabled:opacity-40">{busy ? 'Publishing…' : 'Publish'}</button>
        <button type="button" onClick={() => publish(true)} disabled={busy}
          className="min-h-[48px] px-4 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-sm font-semibold text-slate-600 disabled:opacity-40">Finish later</button>
      </div>
    </section>
  );
}
