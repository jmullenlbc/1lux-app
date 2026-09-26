'use client';
import { useEffect, useRef, useState } from 'react';
import { extractSentEmails, parseMessage, parsePastedEmail, newest } from '@/lib/tone/mbox';
import { extractPstEmails, extractOlmEmails, parseMsgFile } from '@/lib/tone/outlook';
import { postParked } from '@/lib/parkedFetch';

const CHUNK = 200;
const MAX_PER_FILE = 500;
const SOURCE_LABEL = { MBOX: 'Mailbox export', EML: 'Email file', TEXT: 'Text file', PASTE: 'Pasted', PST: 'Outlook export', OLM: 'Outlook for Mac export', MSG: 'Outlook email' };

// Several emails in one box or .txt file: separate them with a line of dashes or equals signs.
function splitPasted(text) {
  return String(text || '').split(/\n\s*(?:-{3,}|={3,})\s*\n/)
    .map(t => parsePastedEmail(t)).filter(Boolean);
}

async function readFile(file, personEmail, onProgress) {
  const name = file.name.toLowerCase();
  if (name.endsWith('.mbox')) return { source: 'MBOX', emails: await extractSentEmails(file, personEmail, { max: MAX_PER_FILE, onProgress }) };
  if (name.endsWith('.pst')) return { source: 'PST', emails: await extractPstEmails(file, personEmail, { max: MAX_PER_FILE, onProgress }) };
  if (name.endsWith('.olm')) return { source: 'OLM', emails: await extractOlmEmails(file, personEmail, { max: MAX_PER_FILE, onProgress }) };
  if (name.endsWith('.msg')) { const e = await parseMsgFile(file); return { source: 'MSG', emails: e ? [e] : [] }; }
  const text = await file.text();
  if (name.endsWith('.eml')) { const e = parseMessage(text, ''); return { source: 'EML', emails: e ? [e] : [] }; }
  return { source: 'TEXT', emails: newest(splitPasted(text), MAX_PER_FILE) };
}

function Chips({ label, items, tone = 'slate' }) {
  if (!items?.length) return null;
  const cls = tone === 'orange' ? 'bg-orange-50 text-orange-700 border-orange-200' : 'bg-slate-50 text-slate-700 border-slate-200';
  return (
    <div>
      <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {items.map(t => <span key={t} className={`text-xs border px-2 py-0.5 rounded-full ${cls}`}>{t}</span>)}
      </div>
    </div>
  );
}

function Lines({ label, items }) {
  if (!items?.length) return null;
  return (
    <div>
      <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">{label}</p>
      <ul className="space-y-1">{items.map(t => <li key={t} className="text-sm text-slate-700">&ldquo;{t}&rdquo;</li>)}</ul>
    </div>
  );
}

export default function VoiceTrainingClient() {
  const [data, setData] = useState(null);
  const [userId, setUserId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);           // { type: 'info'|'success'|'error', text }
  const [paste, setPaste] = useState('');
  const [drag, setDrag] = useState(false);
  const fileRef = useRef(null);

  async function load(id) {
    const res = await fetch(`/api/sales/voice${id ? `?userId=${encodeURIComponent(id)}` : ''}`);
    const d = await res.json().catch(() => ({}));
    if (!res.ok) { setMsg({ type: 'error', text: d.error || 'Could not load.' }); return; }
    setData(d);
    if (!id) setUserId(d.me);
  }
  useEffect(() => { load(null); }, []);

  const person = data?.person;
  const isMe = !userId || userId === data?.me;
  const who = isMe ? 'your' : `${person?.name || 'their'}'s`;

  async function relearn() {
    setMsg({ type: 'info', text: 'Learning the voice from the whole library. This takes about a minute.' });
    const res = await postParked('/api/sales/voice/rebuild', { userId }, {
      onWait: ({ seconds }) => setMsg({ type: 'info', text: `Still learning the voice (${seconds}s)` }),
    });
    const d = await res.json();
    if (!res.ok) throw new Error(d.message || d.error || `Error ${res.status}`);
    setData(prev => ({ ...prev, ...d }));
    return d;
  }

  async function upload(items) {
    // items: [{ fileName, source, emails }]
    let added = 0, skipped = 0;
    for (const it of items) {
      for (let i = 0; i < it.emails.length; i += CHUNK) {
        setMsg({ type: 'info', text: `Saving ${it.fileName || 'emails'}: ${Math.min(i + CHUNK, it.emails.length)} of ${it.emails.length}` });
        const res = await fetch('/api/sales/voice', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, fileName: it.fileName, source: it.source,
            emails: it.emails.slice(i, i + CHUNK).map(({ subject, body, date }) => ({ subject, body, date })) }),
        });
        const d = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(d.error || `Error ${res.status}`);
        added += d.added || 0; skipped += d.skipped || 0;
        setData(prev => ({ ...prev, ...d }));
      }
    }
    const d = await relearn();
    const dupes = skipped ? ` ${skipped} were already in the library.` : '';
    if (d.rebuildError) setMsg({ type: 'error', text: `Added ${added} emails.${dupes} ${d.rebuildError}` });
    else setMsg({ type: 'success', text: `Added ${added} emails.${dupes} The voice is now learned from ${d.count} emails.` });
  }

  async function run(fn) {
    if (busy) return;
    setBusy(true); setMsg(null);
    try { await fn(); } catch (e) { setMsg({ type: 'error', text: e.message }); }
    finally { setBusy(false); if (fileRef.current) fileRef.current.value = ''; }
  }

  const onFiles = files => run(async () => {
    const items = [];
    for (const file of [...files]) {
      const { source, emails } = await readFile(file, person?.email || '', (bytes, found) =>
        setMsg({ type: 'info', text: `Reading ${file.name}: ${Math.round(bytes / 1e6)} MB, ${found} emails so far` }));
      if (emails.length) items.push({ fileName: file.name, source, emails });
    }
    const total = items.reduce((n, it) => n + it.emails.length, 0);
    if (!total) throw new Error(`No emails written by ${isMe ? 'you' : person?.name || 'this person'} were found in ${files.length === 1 ? 'that file' : 'those files'}.`);
    await upload(items);
  });

  const onPaste = () => run(async () => {
    const emails = splitPasted(paste);
    if (!emails.length) throw new Error('Paste at least one full email (a few sentences).');
    await upload([{ fileName: null, source: 'PASTE', emails }]);
    setPaste('');
  });

  const toggleBatch = (b) => run(async () => {
    const res = await fetch(`/api/sales/voice/batches/${b.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ archived: !b.archivedAt }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(d.error || `Error ${res.status}`);
    setData(prev => ({ ...prev, ...d }));
    const r = await relearn();
    setMsg(r.rebuildError ? { type: 'error', text: r.rebuildError }
      : { type: 'success', text: `${b.archivedAt ? 'Restored' : 'Put away'}. The voice is now learned from ${r.count} emails.` });
  });

  if (!data) return <p className="text-sm text-slate-400">{msg?.text || 'Loading…'}</p>;
  const p = data.profile;

  return (
    <div className="space-y-5">
      {data.canPickAnyone && (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-slate-500">Working on the voice of</span>
          <select value={userId || ''} disabled={busy}
            onChange={e => { setUserId(e.target.value); setMsg(null); load(e.target.value); }}
            className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm">
            {data.people.map(u => <option key={u.id} value={u.id}>{u.id === data.me ? `${u.name} (me)` : u.name}</option>)}
          </select>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-700">Add emails</h2>
            <p className="text-xs text-slate-500 mt-1 max-w-2xl">
              A whole Sent folder works best (hundreds of emails at once): a Google Takeout .mbox, or from Outlook
              a .pst (Windows: File, Open &amp; Export, Import/Export, Export to a file, pick Sent Items) or
              a .olm (Mac: File, Export). The file is read on this computer and never uploaded.
              Single .eml or .msg emails and .txt files work too. In a .txt file or the box below, put a line of dashes
              (<code>---</code>) between emails and start each with <code>Subject:</code> if you have it.
            </p>
          </div>
          <div className="text-right shrink-0">
            <div className="text-2xl font-bold text-slate-900">{data.count}</div>
            <div className="text-[11px] text-slate-500">emails in {who} library</div>
          </div>
        </div>

        <label
          onDragOver={e => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={e => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files?.length) onFiles(e.dataTransfer.files); }}
          className={`block border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${drag ? 'border-orange-400 bg-orange-50' : 'border-slate-200 hover:border-orange-300'} ${busy ? 'opacity-60 pointer-events-none' : ''}`}>
          <input ref={fileRef} type="file" multiple accept=".mbox,.pst,.olm,.eml,.msg,.txt" className="hidden"
            onChange={e => e.target.files?.length && onFiles(e.target.files)} />
          <div className="text-sm font-medium text-slate-700">Drop .mbox, .pst, .olm, .eml, .msg or .txt files here</div>
          <div className="text-xs text-slate-400 mt-1">or click to choose. Several at once is fine.</div>
        </label>

        <div className="mt-4">
          <textarea value={paste} onChange={e => setPaste(e.target.value)} rows={5} disabled={busy}
            placeholder={'Or paste emails here.\n\nSubject: Lunch next week?\nHi Lee, ...\n---\nSubject: ...'}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300" />
          <div className="flex justify-end mt-2">
            <button onClick={onPaste} disabled={busy || !paste.trim()}
              className="text-sm bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white rounded-lg px-4 py-1.5">Add pasted emails</button>
          </div>
        </div>

        {msg && (
          <p className={`text-sm mt-3 ${msg.type === 'error' ? 'text-red-600' : msg.type === 'success' ? 'text-green-700' : 'text-slate-500'}`}>{msg.text}</p>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-700">What the bot learned</h2>
            {data.builtAt && <p className="text-xs text-slate-400 mt-1">Learned {new Date(data.builtAt).toLocaleString()}</p>}
          </div>
          {data.count >= 5 && (
            <button onClick={() => run(async () => {
              const r = await relearn();
              setMsg(r.rebuildError ? { type: 'error', text: r.rebuildError } : { type: 'success', text: `Relearned from ${r.count} emails.` });
            })} disabled={busy} className="text-xs text-orange-600 hover:underline disabled:opacity-40">Relearn</button>
          )}
        </div>
        {!p ? (
          <p className="text-sm text-slate-500">Nothing yet. Add at least 5 emails and the bot learns {who} voice.</p>
        ) : (
          <div className="space-y-4">
            <div className="bg-slate-50 rounded-xl p-4 text-sm text-slate-700 leading-relaxed">
              {p.summary}
              <div className="text-xs text-slate-500 mt-2">
                {[p.formality, p.sentenceLength && `${p.sentenceLength} sentences`].filter(Boolean).join(', ')}
              </div>
            </div>
            <Chips label="Tone" items={p.tone} tone="orange" />
            <div className="grid sm:grid-cols-2 gap-4">
              <Lines label="Subject lines" items={p.subjects} />
              <div className="space-y-4">
                {p.subjectStyle && (
                  <div>
                    <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">How subjects are written</p>
                    <p className="text-sm text-slate-700">{p.subjectStyle}</p>
                  </div>
                )}
                <Lines label="Openers" items={p.openers} />
                <Lines label="Closers" items={p.closers} />
              </div>
            </div>
            <Lines label="Phrases" items={p.phrases} />
            <Chips label="Words used often" items={p.vocabulary} />
            <div className="grid sm:grid-cols-2 gap-4">
              <Chips label="Habits" items={p.patterns} />
              <Chips label="Never does" items={p.avoids} />
            </div>
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Uploads</h2>
        {!data.batches.length ? (
          <p className="text-sm text-slate-500">No uploads yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400 border-b border-slate-100">
                <th className="py-2 font-medium">Added</th><th className="py-2 font-medium">What</th>
                <th className="py-2 font-medium text-right">Emails</th><th className="py-2 font-medium">By</th><th />
              </tr>
            </thead>
            <tbody>
              {data.batches.map(b => (
                <tr key={b.id} className={`border-b border-slate-50 ${b.archivedAt ? 'text-slate-400' : 'text-slate-700'}`}>
                  <td className="py-2">{new Date(b.createdAt).toLocaleDateString()}</td>
                  <td className="py-2">{b.fileName || SOURCE_LABEL[b.source] || b.source}{b.archivedAt && <span className="ml-2 text-[11px] bg-slate-100 rounded px-1.5 py-0.5">put away</span>}</td>
                  <td className="py-2 text-right">{b.emailsAdded}</td>
                  <td className="py-2">{b.uploadedBy?.name || ''}</td>
                  <td className="py-2 text-right">
                    <button onClick={() => toggleBatch(b)} disabled={busy} className="text-xs text-orange-600 hover:underline disabled:opacity-40">
                      {b.archivedAt ? 'Restore' : 'Put away'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="text-xs text-slate-400 mt-3">Putting an upload away stops it teaching the voice. Nothing is deleted; Restore brings it back.</p>
      </div>
    </div>
  );
}
