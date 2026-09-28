'use client';
import { useEffect, useRef, useState } from 'react';
import { extractSentEmails, parseMessage, parsePastedEmail, newest } from '@/lib/tone/mbox';
import { extractPstEmails, extractOlmEmails, parseMsgFile, zipEntries, zipEntryStream } from '@/lib/tone/outlook';
import { postParked } from '@/lib/parkedFetch';
import { KEEP_PER_MAILBOX } from '@/lib/tone/voiceAge';

const CHUNK = 200;
const MAX_PER_FILE = KEEP_PER_MAILBOX;   // spread over every year, newest weighted (voiceAge.js)
const SOURCE_LABEL = { MBOX: 'Mailbox export', EML: 'Email file', TEXT: 'Text file', PASTE: 'Pasted', PST: 'Outlook export', OLM: 'Outlook for Mac export', MSG: 'Outlook email' };

// Several emails in one box or .txt file: separate them with a line of dashes or equals signs.
function splitPasted(text) {
  return String(text || '').split(/\n\s*(?:-{3,}|={3,})\s*\n/)
    .map(t => parsePastedEmail(t)).filter(Boolean);
}

// A Google Takeout .zip part: every .mbox inside it, streamed straight out of
// the zip, so nobody has to unzip a 20 GB download first (Mike 9-27).
async function readTakeoutZip(file, personEmail, onProgress) {
  const boxes = (await zipEntries(file, '.zip')).filter(e => /\.mbox$/i.test(e.name) && e.size > 0);
  if (!boxes.length) throw new Error(`There is no mailbox (.mbox) inside ${file.name}. In Google Takeout, export Mail and download every part.`);
  const out = [];
  for (const e of boxes) {
    const inner = await zipEntryStream(file, e);
    if (!inner) continue;
    const short = e.name.split('/').pop();
    const emails = await extractSentEmails(inner, personEmail, { max: MAX_PER_FILE, onProgress: (b, f) => onProgress(b, f, short) });
    if (emails.length) out.push({ fileName: `${file.name} / ${short}`, source: 'MBOX', emails });
  }
  return out;
}

// Every file comes back as a list, because one .zip part can hold several mailboxes.
async function readFile(file, personEmail, onProgress) {
  const name = file.name.toLowerCase();
  const one = (source, emails) => [{ fileName: file.name, source, emails }];
  if (name.endsWith('.zip')) return readTakeoutZip(file, personEmail, onProgress);
  if (name.endsWith('.mbox')) return one('MBOX', await extractSentEmails(file, personEmail, { max: MAX_PER_FILE, onProgress }));
  if (name.endsWith('.pst')) return one('PST', await extractPstEmails(file, personEmail, { max: MAX_PER_FILE, onProgress }));
  if (name.endsWith('.olm')) return one('OLM', await extractOlmEmails(file, personEmail, { max: MAX_PER_FILE, onProgress }));
  if (name.endsWith('.msg')) { const e = await parseMsgFile(file); return one('MSG', e ? [e] : []); }
  const text = await file.text();
  if (name.endsWith('.eml')) { const e = parseMessage(text, ''); return one('EML', e ? [e] : []); }
  return one('TEXT', newest(splitPasted(text), MAX_PER_FILE));
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

const times = w => `${w === 0.5 ? '\u00bd' : w === 0.25 ? '\u00bc' : w}x`;
const monthYear = d => (d ? new Date(d).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : '');

function Card({ title, note, children }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6">
      <h2 className="text-sm font-semibold text-slate-700">{title}</h2>
      {note && <p className="text-xs text-slate-500 mt-1 max-w-2xl">{note}</p>}
      <div className="mt-4">{children}</div>
    </div>
  );
}

// Counted from the emails, newest weighted most (Mike 9-27: "the top 10 phrases").
function TopPhrases({ phrases }) {
  if (!phrases?.length) return <p className="text-sm text-slate-500">Not enough emails yet. A phrase shows up here once it is in at least 3 emails.</p>;
  return (
    <ol className="space-y-1.5">
      {phrases.map((t, i) => (
        <li key={t.phrase} className="flex items-baseline gap-3 text-sm">
          <span className="w-5 text-right text-slate-400 shrink-0">{i + 1}.</span>
          <span className="text-slate-800 font-medium">&ldquo;{t.phrase}&rdquo;</span>
          <span className="text-xs text-slate-400">in {t.emails} emails{t.recent ? `, ${t.recent} in the last year` : ''}</span>
        </li>
      ))}
    </ol>
  );
}

// How the writing changed period by period (Mike 9-27: "show evolvement and improvement").
function Evolution({ insights, profile: p }) {
  const periods = insights?.periods || [];
  const plan = Object.fromEntries((insights?.plan || []).map(b => [b.key, b]));
  if (!periods.length) return <p className="text-sm text-slate-500">Nothing yet.</p>;
  const cell = 'py-2 px-2 text-right';
  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead>
            <tr className="text-[11px] uppercase tracking-wide text-slate-400 border-b border-slate-100">
              <th className="py-2 pr-2 font-medium text-left">When sent</th>
              <th className={`${cell} font-medium`}>Emails</th>
              <th className={`${cell} font-medium`} title="How much one email from this period counts">Counts</th>
              <th className={`${cell} font-medium`} title="Share of the emails the bot reads when it learns the voice">Bot reads</th>
              <th className={`${cell} font-medium`}>Avg words</th>
              <th className={`${cell} font-medium`}>Words per sentence</th>
              <th className={`${cell} font-medium`}>Ask a question</th>
              <th className={`${cell} font-medium`} title="just, maybe, sorry, I think, touch base and the like">Soft words</th>
            </tr>
          </thead>
          <tbody>
            {periods.map(r => (
              <tr key={r.key} className="border-b border-slate-50 text-slate-700">
                <td className="py-2 pr-2">{r.label}</td>
                <td className={cell}>{r.emails}</td>
                <td className={`${cell} font-semibold text-orange-600`}>{times(r.weight)}</td>
                <td className={cell}>{plan[r.key]?.share ?? 0}%</td>
                <td className={cell}>{r.avgWords}</td>
                <td className={cell}>{r.wordsPerSentence}</td>
                <td className={cell}>{r.questionPct}%</td>
                <td className={cell}>{r.softPerEmail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {p?.evolution?.length ? (
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-3">
            {p.then && <p className="text-sm text-slate-600"><span className="font-semibold text-slate-700">Then: </span>{p.then}</p>}
            {p.now && <p className="text-sm text-slate-600"><span className="font-semibold text-slate-700">Now: </span>{p.now}</p>}
            <Bullets label="What changed" items={p.evolution} />
          </div>
          <div className="space-y-3">
            <Bullets label="Better now" items={p.improved} tone="green" />
            <Bullets label="Still showing up" items={p.stillWorkingOn} />
          </div>
        </div>
      ) : (
        <p className="text-xs text-slate-500">Add older emails to see how the writing changed. A full Google Takeout covers every year.</p>
      )}
    </div>
  );
}

function Bullets({ label, items, tone }) {
  if (!items?.length) return null;
  return (
    <div>
      <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">{label}</p>
      <ul className="space-y-1 list-disc pl-4">
        {items.map(t => <li key={t} className={`text-sm ${tone === 'green' ? 'text-green-800' : 'text-slate-700'}`}>{t}</li>)}
      </ul>
    </div>
  );
}

// Emails written over and over, written up as templates (Mike 9-27).
function Templates({ templates, busy, onAction }) {
  const [showPut, setShowPut] = useState(false);
  const live = (templates || []).filter(t => t.status !== 'DISMISSED');
  const put = (templates || []).filter(t => t.status === 'DISMISSED');
  return (
    <div className="space-y-3">
      {!live.length && <p className="text-sm text-slate-500">None yet. After a relearn, any email sent 3 or more times in nearly the same words shows up here.</p>}
      {live.map(t => (
        <div key={t.id} className="border border-slate-200 rounded-xl p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-slate-800">{t.name}</div>
              <div className="text-xs text-slate-500 mt-0.5">
                Sent {t.basedOn} times{t.recentCount ? `, ${t.recentCount} in the last year` : ''}{t.lastSentAt ? `, last ${monthYear(t.lastSentAt)}` : ''}
              </div>
              {t.whenToUse && <div className="text-xs text-slate-600 mt-1">{t.whenToUse}</div>}
            </div>
            <div className="flex items-center gap-3 shrink-0">
              {t.status === 'SAVED' ? (
                <a href="/sales/automation/templates" className="text-xs text-green-700 hover:underline">Saved to email templates</a>
              ) : (
                <>
                  <button onClick={() => onAction(t, 'dismiss')} disabled={busy} className="text-xs text-slate-500 hover:underline disabled:opacity-40">Not useful</button>
                  <button onClick={() => onAction(t, 'save')} disabled={busy}
                    className="text-xs bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white rounded-lg px-3 py-1">Save as email template</button>
                </>
              )}
            </div>
          </div>
          <div className="mt-3 bg-slate-50 rounded-lg p-3 text-sm text-slate-700">
            {t.subject && <div className="font-medium mb-1">Subject: {t.subject}</div>}
            <div className="whitespace-pre-wrap">{t.body}</div>
          </div>
        </div>
      ))}
      {put.length > 0 && (
        <div>
          <button onClick={() => setShowPut(v => !v)} className="text-xs text-slate-500 hover:underline">
            {showPut ? 'Hide' : 'Show'} not useful ({put.length})
          </button>
          {showPut && (
            <ul className="mt-2 space-y-1">
              {put.map(t => (
                <li key={t.id} className="text-sm text-slate-500 flex items-center gap-3">
                  <span>{t.name}</span>
                  <button onClick={() => onAction(t, 'restore')} disabled={busy} className="text-xs text-orange-600 hover:underline disabled:opacity-40">Bring back</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
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

  // Saves one file's emails. Returns { added, skipped }.
  async function save(it, tag = '') {
    let added = 0, skipped = 0;
    for (let i = 0; i < it.emails.length; i += CHUNK) {
      setMsg({ type: 'info', text: `${tag}Saving ${it.fileName || 'emails'}: ${Math.min(i + CHUNK, it.emails.length)} of ${it.emails.length}` });
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
    return { added, skipped };
  }

  async function finish(added, skipped) {
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

  // Several files (e.g. every Google Takeout part) in one go. Each file is saved
  // as soon as it is read, so a bad part 3 never loses parts 1 and 2. The voice
  // is relearned once, at the end.
  const onFiles = files => run(async () => {
    const list = [...files];
    let added = 0, skipped = 0, found = 0;
    const failed = [];
    for (const [n, file] of list.entries()) {
      const tag = list.length > 1 ? `File ${n + 1} of ${list.length}. ` : '';
      let items;
      try {
        items = await readFile(file, person?.email || '', (bytes, got, inner) =>
          setMsg({ type: 'info', text: `${tag}Reading ${inner ? `${file.name} / ${inner}` : file.name}: ${Math.round(bytes / 1e6)} MB, ${got} emails so far` }));
      } catch (e) {
        if (list.length === 1) throw e;
        failed.push(`${file.name}: ${e.message}`);
        continue;
      }
      for (const it of items) {
        found += it.emails.length;
        if (!it.emails.length) continue;
        const r = await save(it, tag);
        added += r.added; skipped += r.skipped;
      }
    }
    if (!found) throw new Error([`No emails written by ${isMe ? 'you' : person?.name || 'this person'} were found in ${list.length === 1 ? 'that file' : 'those files'}.`, ...failed].join(' '));
    await finish(added, skipped);
    if (failed.length) setMsg(m => ({ type: 'error', text: `${m?.text || ''} Could not read: ${failed.join('; ')}` }));
  });

  const onPaste = () => run(async () => {
    const emails = splitPasted(paste);
    if (!emails.length) throw new Error('Paste at least one full email (a few sentences).');
    const r = await save({ fileName: null, source: 'PASTE', emails });
    await finish(r.added, r.skipped);
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

  const templateAction = (t, action) => run(async () => {
    const res = await fetch(`/api/sales/voice/templates/${t.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(d.error || `Error ${res.status}`);
    setData(prev => ({ ...prev, templates: d.templates }));
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
              A whole Sent folder works best (hundreds of emails at once). From Gmail, Google Takeout sends several
              .zip parts: drop them all here together, no need to unzip. A loose .mbox works too. From Outlook,
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
          <input ref={fileRef} type="file" multiple accept=".zip,.mbox,.pst,.olm,.eml,.msg,.txt" className="hidden"
            onChange={e => e.target.files?.length && onFiles(e.target.files)} />
          <div className="text-sm font-medium text-slate-700">Drop Takeout .zip parts, or .mbox, .pst, .olm, .eml, .msg or .txt files here</div>
          <div className="text-xs text-slate-400 mt-1">or click to choose. Drop every part at once.</div>
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
              {p.now && <div className="mt-2 text-slate-800"><span className="font-semibold">Today: </span>{p.now}</div>}
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
            <Lines label="Phrases the bot borrows" items={p.phrases} />
            <Chips label="Words used often" items={p.vocabulary} />
            <div className="grid sm:grid-cols-2 gap-4">
              <Chips label="Habits" items={p.patterns} />
              <Chips label="Never does" items={p.avoids} />
            </div>
          </div>
        )}
      </div>

      <Card title="Top 10 phrases"
        note="Counted from the emails themselves, once per email. Newer emails count more, so these lean to how you write now.">
        <TopPhrases phrases={data.insights?.phrases} />
      </Card>

      <Card title="How the writing has changed"
        note="The bot copies how you write now. One email from the last 3 months counts 8 times as much as one from 2 to 3 years ago, and 32 times as much as one from over 5 years ago.">
        <Evolution insights={data.insights} profile={p} />
      </Card>

      <Card title="Emails written over and over"
        note="Groups of emails sent 3 or more times in nearly the same words, written up as templates in today's wording. Save one and it joins the email templates.">
        <Templates templates={data.templates} busy={busy} onAction={templateAction} />
      </Card>

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
