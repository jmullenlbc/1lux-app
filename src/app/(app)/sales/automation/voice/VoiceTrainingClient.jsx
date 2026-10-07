'use client';
import { useEffect, useRef, useState } from 'react';
import { extractSentEmails, parseMessage, parsePastedEmail, newest } from '@/lib/tone/mbox';
import { extractPstEmails, extractOlmEmails, parseMsgFile, zipEntries, zipEntryStream } from '@/lib/tone/outlook';
import { postParked } from '@/lib/parkedFetch';
import { KEEP_PER_MAILBOX } from '@/lib/tone/voiceAge';
import { AUTO_REASONS } from '@/lib/tone/autoMail';
import { QUESTIONS, INTERVIEW_PREFIX, questionFor } from '@/lib/tone/interview';

const CHUNK = 200;
const MAX_PER_FILE = KEEP_PER_MAILBOX;   // spread over every year, newest weighted (voiceAge.js)
const SOURCE_LABEL = { MBOX: 'Mailbox export', EML: 'Email file', TEXT: 'Text file', PASTE: 'Pasted', PST: 'Outlook export', OLM: 'Outlook for Mac export', MSG: 'Outlook email', INTERVIEW: 'Q&A answer' };

// Several emails in one box or .txt file: separate them with a line of dashes or equals signs.
function splitPasted(text) {
  return String(text || '').split(/\n\s*(?:-{3,}|={3,})\s*\n/)
    .map(t => parsePastedEmail(t)).filter(Boolean);
}

// A Google Takeout .zip part: every .mbox inside it, streamed straight out of
// the zip, so nobody has to unzip a 20 GB download first (Mike 9-27).
async function readTakeoutZip(file, personEmail, onProgress, stats) {
  const boxes = (await zipEntries(file, '.zip')).filter(e => /\.mbox$/i.test(e.name) && e.size > 0);
  if (!boxes.length) throw new Error(`There is no mailbox (.mbox) inside ${file.name}. In Google Takeout, export Mail and download every part.`);
  const out = [];
  let compDone = 0;   // bytes of the .zip already read, so progress is a share of the whole part
  for (const e of boxes) {
    const inner = await zipEntryStream(file, e);
    if (!inner) { compDone += e.comp; continue; }
    const short = e.name.split('/').pop();
    const at = b => compDone + Math.round(e.comp * Math.min(1, b / (e.size || 1)));
    let emails;
    try {
      emails = await extractSentEmails(inner, personEmail, { max: MAX_PER_FILE, stats, onProgress: (b, f) => onProgress(at(b), f, short) });
    } catch (err) {
      // Keep every mailbox already read plus what this one got to.
      if (err?.partialEmails?.length) out.push({ fileName: `${file.name} / ${short}`, source: 'MBOX', emails: err.partialEmails });
      err.partialItems = out;
      err.bytesRead = at(err.bytesRead || 0);
      throw err;
    }
    compDone += e.comp;
    if (emails.length) out.push({ fileName: `${file.name} / ${short}`, source: 'MBOX', emails });
  }
  return out;
}

const gb = n => (n >= 1e9 ? `${(n / 1e9).toFixed(1)} GB` : `${Math.round(n / 1e6)} MB`);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const unreadable = e => /network error|NotReadable|could not be read/i.test(`${e?.name} ${e?.message}`);

// Chrome says only "network error" when it can no longer read a file on this
// computer: still downloading, moved, or in a Google Drive or OneDrive folder
// that streams files (Mike 9-30, 41 GB Takeout). Say that in plain words.
function plainReadError(file, e, { kept = 0, reached = 0, resumable = false } = {}) {
  if (!unreadable(e)) return e;
  const where = reached ? ` at ${gb(reached)} of ${gb(file.size)}` : '';
  const keptLine = kept ? ` Everything read before that is saved (${kept.toLocaleString()} emails kept).` : '';
  const next = resumable && reached
    ? ` Drop the same file again and it picks up at ${gb(reached)}, not the start. Nothing is doubled. If it stops at the same spot again, move the file to a normal folder like Downloads (not Google Drive or OneDrive) and drop it from there.`
    : ' Move it to a normal folder like Downloads and drop it again. Nothing saved is lost or doubled.';
  return new Error(`The browser stopped reading ${file.name}${where}.${keptLine}${next}`);
}

// Where a big .mbox stopped, remembered on this computer by person, name and
// size, so dropping the same file again picks up there (Mike 9-30: "Could the
// system know if you dragged in the same file to start where it left off and
// not duplicate?"). Saving never doubles an email anyway.
const resumeKey = (file, who) => `voice-resume:${who}:${file.name}:${file.size}`;
function resumeAt(file, who) { try { return Number(localStorage.getItem(resumeKey(file, who))) || 0; } catch { return 0; } }
function rememberAt(file, who, at) {
  try { if (at > 0 && at < file.size) localStorage.setItem(resumeKey(file, who), String(at)); else localStorage.removeItem(resumeKey(file, who)); } catch {}
}

// A loose .mbox: read from where it last stopped, and when the read stops part
// way, save what was read and carry on from there. A spot that will not read
// at all is stepped over (1 MB, then 16 MB, then 256 MB) so one bad patch
// never blocks the rest of the mailbox.
async function readMbox(file, personEmail, onProgress, { stats, onPartial }) {
  const who = personEmail || 'me';
  let at = resumeAt(file, who), stuck = 0;
  const from = at;
  for (let tries = 0; ; tries++) {
    try {
      const emails = await extractSentEmails(file, personEmail, { max: MAX_PER_FILE, onProgress, startAt: at, stats });
      rememberAt(file, who, 0);
      return { emails, from };
    } catch (e) {
      if (!unreadable(e)) throw e;
      if (e.partialEmails?.length) await onPartial(e.partialEmails);
      const reached = Math.max(at, e.bytesRead || 0);
      if (reached > at + 1e6) { at = reached; stuck = 0; }
      else if (stuck < 3) at = Math.min(file.size, at + [1e6, 16e6, 256e6][stuck++]);
      else tries = 99;
      rememberAt(file, who, at);
      if (tries >= 8) { e.bytesRead = at; e.resumable = true; throw e; }
      await sleep(3000);
    }
  }
}

// Every file comes back as a list, because one .zip part can hold several mailboxes.
async function readFile(file, personEmail, onProgress, { stats, onPartial } = {}) {
  const name = file.name.toLowerCase();
  const one = (source, emails) => [{ fileName: file.name, source, emails }];
  if (name.endsWith('.zip')) return readTakeoutZip(file, personEmail, onProgress, stats);
  if (name.endsWith('.mbox')) {
    const { emails, from } = await readMbox(file, personEmail, onProgress, { stats, onPartial });
    return [{ fileName: from ? `${file.name} (from ${gb(from)})` : file.name, source: 'MBOX', emails, from }];
  }
  if (name.endsWith('.pst')) return one('PST', await extractPstEmails(file, personEmail, { max: MAX_PER_FILE, onProgress }));
  if (name.endsWith('.olm')) return one('OLM', await extractOlmEmails(file, personEmail, { max: MAX_PER_FILE, onProgress }));
  if (name.endsWith('.msg')) { const e = await parseMsgFile(file); return one('MSG', e ? [e] : []); }
  const text = await file.text();
  if (name.endsWith('.eml')) { const e = parseMessage(text, '', stats); return one('EML', e ? [e] : []); }
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

// Counted from the emails, newest weighted most (Mike 10-1: "the top phrases
// should be top 20 sentences").
function TopSentences({ sentences }) {
  if (!sentences?.length) return <p className="text-sm text-slate-500">Not enough emails yet. A sentence shows up here once it is in at least 3 emails.</p>;
  return (
    <ol className="space-y-1.5">
      {sentences.map((t, i) => (
        <li key={t.sentence} className="flex items-baseline gap-3 text-sm">
          <span className="w-5 text-right text-slate-400 shrink-0">{i + 1}.</span>
          <span className="text-slate-800 font-medium">&ldquo;{t.sentence}&rdquo;</span>
          <span className="text-xs text-slate-400 shrink-0">in {t.emails} emails{t.recent ? `, ${t.recent} in the last year` : ''}</span>
        </li>
      ))}
    </ol>
  );
}

// Mike 10-1: "Pull out what kind of things I say in a personal way".
function Personal({ items }) {
  if (!items?.length) return <p className="text-sm text-slate-500">Nothing personal found yet. Press Relearn after adding emails.</p>;
  return (
    <div className="grid sm:grid-cols-2 gap-4">
      {items.map(x => (
        <div key={x.kind}>
          <p className="text-sm font-semibold text-slate-800">{x.kind}</p>
          <ul className="mt-1 space-y-0.5">
            {(x.examples || []).map(e => <li key={e} className="text-sm text-slate-600">&ldquo;{e}&rdquo;</li>)}
          </ul>
        </div>
      ))}
    </div>
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
      {!live.length && <p className="text-sm text-slate-500">None yet. After a relearn, any topic you have written about in 3 or more emails shows up here.</p>}
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
                    className="px-4 py-2 text-sm font-semibold rounded-lg bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white">Save as email template</button>
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
  const [prog, setProg] = useState(null);         // { title, frac (0..1, null = no end known), detail }
  const fileRef = useRef(null);
  const lastTick = useRef(0);

  // Leaving the page mid-read loses the part being read.
  useEffect(() => {
    if (!busy) return undefined;
    const stay = e => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', stay);
    return () => window.removeEventListener('beforeunload', stay);
  }, [busy]);

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
    const learning = s => setProg({ title: 'Learning the voice from the whole library', frac: null, detail: `${s}s so far, usually a minute or two` });
    learning(0);
    const res = await postParked('/api/sales/voice/rebuild', { userId }, { onWait: ({ seconds }) => learning(seconds) });
    const d = await res.json();
    if (!res.ok) throw new Error(d.message || d.error || `Error ${res.status}`);
    setData(prev => ({ ...prev, ...d }));
    return d;
  }

  // Saves one file's emails. Returns { added, skipped }.
  async function save(it, tag = '') {
    let added = 0, skipped = 0;
    for (let i = 0; i < it.emails.length; i += CHUNK) {
      const upTo = Math.min(i + CHUNK, it.emails.length);
      setProg({ title: `${tag}Saving ${it.fileName || 'emails'}`, frac: upTo / it.emails.length, detail: `${upTo.toLocaleString()} of ${it.emails.length.toLocaleString()} emails` });
      const body = JSON.stringify({ userId, fileName: it.fileName, source: it.source,
        emails: it.emails.slice(i, i + CHUNK).map(({ subject, body, date }) => ({ subject, body, date })) });
      // A dropped connection or a busy server gets three more tries. Safe to
      // repeat: an email already in the library is skipped, never doubled.
      let res;
      for (let t = 0; ; t++) {
        try {
          res = await fetch('/api/sales/voice', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
          if (![502, 503, 504].includes(res.status) || t >= 3) break;
        } catch (e) {
          if (t >= 3) throw new Error('Lost the connection to the app while saving. Check the internet and drop the file again. Emails already saved stay saved and are never doubled.');
        }
        await sleep(2000 * (t + 1));
      }
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || `Error ${res.status}`);
      added += d.added || 0; skipped += d.skipped || 0;
      setData(prev => ({ ...prev, ...d }));
    }
    return { added, skipped };
  }

  async function finish(added, skipped, stats = {}) {
    const d = await relearn();
    const dupes = skipped ? ` ${skipped} were already in the library.` : '';
    const text = `Added ${added} emails.${dupes}${leftOutLine(stats, d.setAside)}`;
    if (d.rebuildError) setMsg({ type: 'error', text: `${text} ${d.rebuildError}` });
    else setMsg({ type: 'success', text: `${text} The voice is now learned from ${d.count} emails.` });
  }

  async function run(fn) {
    if (busy) return false;
    setBusy(true); setMsg(null); setProg(null);
    try { await fn(); return true; } catch (e) { setMsg({ type: 'error', text: e.message }); return false; }
    finally { setBusy(false); setProg(null); if (fileRef.current) fileRef.current.value = ''; }
  }

  // Several files (e.g. every Google Takeout part) in one go. Each file is saved
  // as soon as it is read, so a bad part 3 never loses parts 1 and 2. The voice
  // is relearned once, at the end.
  const onFiles = files => run(async () => {
    const list = [...files];
    let added = 0, skipped = 0, found = 0;
    const failed = [];
    const stats = {};   // out-of-office and calendar emails left out, by reason
    // One bar across every part: bytes read out of all the files dropped.
    const total = list.reduce((n, f) => n + f.size, 0);
    let before = 0, readMs = 0;
    for (const [n, file] of list.entries()) {
      const tag = list.length > 1 ? `File ${n + 1} of ${list.length}. ` : '';
      const t0 = Date.now();
      const onProgress = (bytes, got, inner) => {
        const now = Date.now();
        if (now - lastTick.current < 250) return;   // millions of pieces in a big part; redraw 4 times a second
        lastTick.current = now;
        const done = before + Math.min(bytes, file.size);
        const ms = readMs + (now - t0);
        const left = ms > 15_000 && done > 0 ? Math.round((ms * (total - done)) / done / 60_000) : null;
        setProg({
          title: `${tag}Reading ${inner ? `${file.name} / ${inner}` : file.name}`,
          frac: total ? done / total : null,
          detail: `${gb(done)} of ${gb(total)}, ${(found + got).toLocaleString()} emails found${left == null ? '' : left < 1 ? ', under a minute left' : `, about ${left} min left`}. Keep this tab open.`,
        });
      };
      // A read that stops part way saves what it found before trying again,
      // so a failure at 30 GB never throws away the first 30 GB (Mike 9-30).
      let items, kept = 0, reached = 0;
      // A big .mbox saves each stretch it read as it goes (readMbox).
      const onPartial = async emails => {
        const r = await save({ fileName: file.name, source: 'MBOX', emails }, `${tag}Keeping what was read. `);
        found += emails.length; kept += r.added + r.skipped;
        added += r.added; skipped += r.skipped;
      };
      const keepPartial = async e => {
        reached = Math.max(reached, e?.bytesRead || 0);
        for (const it of (e?.partialItems || []).filter(x => x.emails.length)) {
          const r = await save(it, `${tag}Keeping what was read. `);
          found += it.emails.length; kept = Math.max(kept, r.added + r.skipped);
          added += r.added; skipped += r.skipped;
        }
      };
      try {
        try { items = await readFile(file, person?.email || '', onProgress, { stats, onPartial }); }
        catch (e) {
          // A file on a streaming drive can hiccup once; one more try (a .mbox picks up where it stopped).
          if (!unreadable(e) || e.resumable) throw e;
          await keepPartial(e);
          await sleep(3000);
          items = await readFile(file, person?.email || '', onProgress, { stats, onPartial });
        }
      } catch (e) {
        if (unreadable(e)) await keepPartial(e);
        const err = plainReadError(file, e, { kept, reached, resumable: e?.resumable });
        if (list.length === 1 && !kept) throw err;
        failed.push(`${file.name}: ${err.message}`);
        before += file.size; readMs += Date.now() - t0;
        continue;
      }
      before += file.size; readMs += Date.now() - t0;
      for (const it of items) {
        found += it.emails.length;
        if (!it.emails.length) continue;
        const r = await save(it, tag);
        added += r.added; skipped += r.skipped;
      }
    }
    if (!found) throw new Error([`No emails written by ${isMe ? 'you' : person?.name || 'this person'} were found in ${list.length === 1 ? 'that file' : 'those files'}.${leftOutLine(stats)}`, ...failed].join(' '));
    await finish(added, skipped, stats);
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
    if (action === 'restore') return;
    // Mike 10-1: a saved or put-away template frees a slot; a new kind of email takes it.
    const tick = s => setProg({ title: 'Writing a new template to take its place', frac: null, detail: `${s}s so far, usually under a minute` });
    tick(0);
    const r = await postParked('/api/sales/voice/templates/refill', { userId }, { onWait: ({ seconds }) => tick(seconds) });
    const f = await r.json().catch(() => ({}));
    if (r.ok && f.templates) setData(prev => ({ ...prev, templates: f.templates }));
    if (f.error) setMsg({ type: 'error', text: f.error });
  });

  // Mike 10-1: one big Relearn at the top, styled like every other button.
  const relearnNow = () => run(async () => {
    const r = await relearn();
    setMsg(r.rebuildError ? { type: 'error', text: `${leftOutLine({}, r.setAside)} ${r.rebuildError}`.trim() }
      : { type: 'success', text: `Relearned from ${r.count} emails.${leftOutLine({}, r.setAside)}` });
  });

  const putBack = s => run(async () => {
    const res = await fetch(`/api/sales/voice/samples/${s.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ keep: true }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(d.error || `Error ${res.status}`);
    setData(prev => ({ ...prev, ...d }));
    setMsg({ type: 'success', text: 'Put back. Press Relearn when you are done putting emails back.' });
  });

  // One Q&A answer is saved as its own upload, dated now (interview.js).
  const saveAnswer = (q, subject, body) => run(async () => {
    const r = await save({ fileName: INTERVIEW_PREFIX + q.title, source: 'INTERVIEW', emails: [{ subject: subject.trim() || q.subject, body: body.trim(), date: Date.now() }] });
    if (!r.added && !r.skipped) throw new Error('That reads like an automatic reply or is too short. Write it the way you would really send it.');
    setMsg({ type: 'success', text: 'Saved. Answer a few more, then press "Learn from my answers".' });
  });
  const learnNow = () => run(async () => {
    const r = await relearn();
    setMsg(r.rebuildError ? { type: 'error', text: r.rebuildError } : { type: 'success', text: `Learned. Your answers come first, then ${r.count} emails in the library.` });
  });

  if (!data) return <p className="text-sm text-slate-400">{msg?.text || 'Loading…'}</p>;
  const p = data.profile;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <p className="text-sm text-slate-600 max-w-2xl">
          Relearn reads the whole library again: sets aside away mail, studies the newest 250 emails and
          rewrites the templates below. Press it after adding or putting back emails.
        </p>
        <button onClick={relearnNow} disabled={busy || data.count < 5}
          className="px-4 py-2 text-sm font-semibold rounded-lg bg-orange-500 hover:bg-orange-600 text-white transition-colors disabled:opacity-40 shrink-0">
          Relearn
        </button>
      </div>
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

      <QandA batches={data.batches} busy={busy} who={who} onSave={saveAnswer} onLearn={learnNow} />

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

        {prog && (
          <div className="mt-3" role="status" aria-live="polite">
            <div className="flex justify-between gap-3 text-xs text-slate-700 mb-1">
              <span className="truncate font-medium">{prog.title}</span>
              {prog.frac != null && <span className="shrink-0 font-semibold">{Math.floor(prog.frac * 100)}%</span>}
            </div>
            <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
              {prog.frac != null
                ? <div className="h-full bg-orange-500 rounded-full transition-[width] duration-300" style={{ width: `${Math.max(1, prog.frac * 100)}%` }} />
                : <div className="h-full w-full bg-orange-300 rounded-full animate-pulse" />}
            </div>
            {prog.detail && <p className="text-[11px] text-slate-500 mt-1">{prog.detail}</p>}
          </div>
        )}

        <div className="mt-4">
          <textarea value={paste} onChange={e => setPaste(e.target.value)} rows={5} disabled={busy}
            placeholder={'Or paste emails here.\n\nSubject: Lunch next week?\nHi Lee, ...\n---\nSubject: ...'}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300" />
          <div className="flex justify-end mt-2">
            <button onClick={onPaste} disabled={busy || !paste.trim()}
              className="px-4 py-2 text-sm font-semibold rounded-lg bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white">Add pasted emails</button>
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

      <Card title="Top 20 sentences"
        note="Whole sentences written word for word in 3 or more emails, counted once per email. Newer emails count more, so these lean to how you write now.">
        <TopSentences sentences={data.insights?.sentences} />
      </Card>

      <Card title="How you get personal"
        note="The personal things you say: family, weekends, trips, congratulations, catching up. Found across every email, sorted into kinds at each relearn. The bot only uses one when it knows a real fact about the person.">
        <Personal items={p?.personal} />
      </Card>

      <Card title="How the writing has changed"
        note="The bot copies how you write now. One email from the last 3 months counts 8 times as much as one from 2 to 3 years ago, and 32 times as much as one from over 5 years ago.">
        <Evolution insights={data.insights} profile={p} />
      </Card>

      <Card title="Emails written over and over"
        note="Emails you send again and again on the same topic, even when the wording changes, written up as templates in today's wording. Out-of-office and calendar mail never counts. Save one and it joins the email templates.">
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

      <Card title="Set aside automatically"
        note="Out-of-office replies and calendar invites, accepts and declines come from a template or a machine, so they never teach the voice. Every relearn checks the whole library for them. Nothing is deleted.">
        <SetAside data={data.autoSetAside} busy={busy} onPutBack={putBack} />
      </Card>
    </div>
  );
}

// "Left out 12 out-of-office replies and 40 calendar emails." from the read
// (stats) and from the relearn's sweep of the saved library (swept).
function leftOutLine(stats = {}, swept = null) {
  const say = (o, c) => [o && `${o.toLocaleString()} out-of-office ${o === 1 ? 'reply' : 'replies'}`, c && `${c.toLocaleString()} calendar ${c === 1 ? 'email' : 'emails'}`].filter(Boolean).join(' and ');
  const read = say(stats.OUT_OF_OFFICE || 0, stats.CALENDAR || 0);
  const lib = swept ? say(swept.OUT_OF_OFFICE || 0, swept.CALENDAR || 0) : '';
  const cut = swept?.STRIPPED ? ` Took out-of-office and focus-time sentences out of ${swept.STRIPPED.toLocaleString()} more.` : '';
  return `${read ? ` Left out ${read}.` : ''}${lib ? ` Set aside ${lib} already in the library.` : ''}${cut}`;
}

function SetAside({ data, busy, onPutBack }) {
  const [open, setOpen] = useState(false);
  const counts = data?.counts || {};
  const total = (counts.OUT_OF_OFFICE || 0) + (counts.CALENDAR || 0);
  if (!total) return <p className="text-sm text-slate-500">None so far.</p>;
  return (
    <div>
      <p className="text-sm text-slate-700">
        {Object.entries(AUTO_REASONS).filter(([k]) => counts[k]).map(([k, label]) => `${label}: ${counts[k].toLocaleString()}`).join(', ')}
        <button onClick={() => setOpen(v => !v)} className="ml-3 text-xs text-orange-600 hover:underline">{open ? 'Hide' : 'Show'}</button>
      </p>
      {open && (
        <ul className="mt-3 divide-y divide-slate-100">
          {data.items.map(s => (
            <li key={s.id} className="py-2 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm text-slate-800 truncate">{s.subject || '(no subject)'}</div>
                <div className="text-xs text-slate-500 truncate">{AUTO_REASONS[s.reason]}{s.sentAt ? `, ${monthYear(s.sentAt)}` : ''}. {s.snippet}</div>
              </div>
              <button onClick={() => onPutBack(s)} disabled={busy} className="text-xs text-orange-600 hover:underline disabled:opacity-40 shrink-0">Put back</button>
            </li>
          ))}
        </ul>
      )}
      {open && total > data.items.length && <p className="text-xs text-slate-400 mt-2">Showing the newest {data.items.length}.</p>}
    </div>
  );
}

// Q&A starter (Mike 9-30): the screen asks for a typical email, the person
// writes it as they would really send it, and the relearn reads every answer
// first, so a few answers aim the voice before (or without) a big mailbox.
function QandA({ batches, busy, who, onSave, onLearn }) {
  const answered = new Set((batches || []).filter(b => b.source === 'INTERVIEW' && !b.archivedAt).map(b => questionFor(b.fileName)?.key).filter(Boolean));
  const open = QUESTIONS.filter(q => !answered.has(q.key));
  const [pick, setPick] = useState(null);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const q = QUESTIONS.find(x => x.key === pick) || open[0] || null;
  const next = () => {
    const rest = open.filter(x => x.key !== q?.key);
    setPick(rest[0]?.key || null); setSubject(''); setBody('');
  };
  return (
    <Card title="Start here: write a few typical emails"
      note={`Each question is an everyday sales email. Write it the way you would really send it, in ${who} own words. These answers count most when the bot learns the voice, so a handful aims it in the right place, even before a mailbox is added.`}>
      <div className="flex items-center justify-between gap-3 mb-3">
        <p className="text-xs text-slate-500">{answered.size} of {QUESTIONS.length} answered</p>
        <select value={q?.key || ''} disabled={busy} onChange={e => { setPick(e.target.value); setSubject(''); setBody(''); }}
          className="border border-slate-200 rounded-lg px-2 py-1 text-xs max-w-[60%]">
          {QUESTIONS.map(x => <option key={x.key} value={x.key}>{answered.has(x.key) ? '\u2713 ' : ''}{x.title}</option>)}
        </select>
      </div>
      {q && (
        <div className="space-y-2">
          <p className="text-sm text-slate-800 font-medium">{q.ask}</p>
          {answered.has(q.key) && <p className="text-xs text-green-700">Already answered. Another answer adds a second example.</p>}
          <input value={subject} onChange={e => setSubject(e.target.value)} disabled={busy} placeholder={`Subject (blank uses "${q.subject}")`}
            className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300" />
          <textarea value={body} onChange={e => setBody(e.target.value)} rows={7} disabled={busy}
            placeholder={'Hi Lee,\n\n...'}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300" />
          <div className="flex flex-wrap items-center justify-end gap-3">
            <button onClick={next} disabled={busy} className="text-xs text-slate-500 hover:underline disabled:opacity-40">Skip</button>
            <button onClick={async () => { if (await onSave(q, subject, body)) next(); }} disabled={busy || body.trim().length < 40}
              className="px-4 py-2 text-sm font-semibold rounded-lg bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white">Save and next</button>
            {answered.size > 0 && (
              <button onClick={onLearn} disabled={busy} className="text-sm border border-orange-300 text-orange-700 hover:bg-orange-50 disabled:opacity-40 rounded-lg px-4 py-1.5">Learn from my answers</button>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
