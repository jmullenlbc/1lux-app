'use client';
// Drop a rep's quotes on the RFQ tab (Mike 10-30, 0148). Each file is stored on the
// project first, so nothing is lost if the read fails, then read, then a person
// checks the lines before saving. PDFs go to the AI; a clean spreadsheet is read
// here, and falls back to the AI when we cannot make it out.
import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import Button from '@/components/ui/Button';
import AlertMark from '@/components/ui/AlertMark';
import { HELPER, TH, TD, TONE } from '@/components/ui/tokens';
import QuoteReader, { CheckScreen, quoteToCheck, readQuoteFile } from '@/components/bidLeveling/QuoteReader';
import { appendUpload } from '@/lib/uploadClient';
import { oversizeMessage, uploadErrorMessage, uploadThrowMessage } from '@/lib/uploadErrorMessage';
import { postParked } from '@/lib/parkedFetch';

const ACCEPT = '.pdf,.xlsx,.xlsm,.xls,.csv';
const READABLE = /\.(pdf|xlsx|xlsm|xls|csv)$/i;
const AT_ONCE = 2;
const EMPTY_READ = { ok: true, lines: [], totals: {}, info: {}, bidderName: '' };
const LOST = 'We lost the connection while reading this file. The file is saved on the project. Press Try again. (RFQ_READ_LOST)';
const STATUS = {
  WAIT: { text: 'Waiting', tone: 'text-slate-500' },
  READING: { text: 'Reading', tone: 'text-slate-700' },
  READY: { text: 'Ready to check', tone: 'text-amber-700' },
  PROBLEM: { text: 'Could not read', tone: 'text-red-700' },
  DONE: { text: 'Saved', tone: 'text-emerald-700' },
  SKIPPED: { text: 'Skipped', tone: 'text-slate-400' },
  DUP: { text: 'Already brought in', tone: 'text-amber-700' },
};
let nextId = 0;

export default function QuoteDrop({ projectId, known = [], onAdd, busy, error, pasteKey }) {
  const [items, setItems] = useState([]); // { id, file, status, read, fileId, problem, seconds }
  const [openId, setOpenId] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [note, setNote] = useState('');
  const picker = useRef(null);
  const running = useRef(0);
  const started = useRef(new Set());

  const patch = useCallback((id, changes) => {
    setItems((cur) => cur.map((it) => (it.id === id ? { ...it, ...changes } : it)));
  }, []);

  const readOne = useCallback(async (it) => {
    const finish = (changes) => { running.current -= 1; patch(it.id, changes); };
    patch(it.id, { status: 'READING', seconds: 0 });
    let { fileId } = it;
    if (!fileId) {
      const big = oversizeMessage(it.file);
      if (big) return finish({ status: 'PROBLEM', problem: big });
      try {
        const form = new FormData();
        form.append('tab', 'rfqs');
        await appendUpload(form, it.file, { scope: 'project' });
        const res = await fetch(`/api/projects/${projectId}/files`, { method: 'POST', body: form });
        if (!res.ok) return finish({ status: 'PROBLEM', problem: await uploadErrorMessage(res, it.file) });
        fileId = (await res.json()).file?.id;
      } catch (e) {
        return finish({ status: 'PROBLEM', problem: uploadThrowMessage(e, it.file) });
      }
    }
    if (!/\.pdf$/i.test(it.file.name)) {
      try {
        const r = await readQuoteFile(it.file);
        if (r.ok && r.lines.length) return finish({ status: 'READY', fileId, read: quoteToCheck(r, it.file.name) });
      } catch { /* the AI read below takes it */ }
    }
    try {
      const res = await postParked(`/api/projects/${projectId}/rfqs/quotes/read`, { fileId }, { onWait: (w) => patch(it.id, { seconds: w.seconds }) });
      const got = await res.json();
      if (!res.ok || !got?.ok) {
        return finish({ status: 'PROBLEM', fileId, problem: got?.message || got?.error || 'We could not read this file. The file is saved on the project. Press Try again. (RFQ_READ_FAILED)' });
      }
      finish({ status: 'READY', fileId, read: quoteToCheck(got, it.file.name) });
    } catch {
      finish({ status: 'PROBLEM', fileId, problem: LOST });
    }
  }, [projectId, patch]);

  useEffect(() => {
    items.filter((it) => it.status === 'WAIT' && !started.current.has(it.id)).slice(0, AT_ONCE - running.current).forEach((it) => {
      started.current.add(it.id);
      running.current += 1;
      readOne(it);
    });
  }, [items, readOne]);

  useEffect(() => {
    setOpenId((cur) => (items.some((it) => it.id === cur && it.status === 'READY') ? cur : items.find((it) => it.status === 'READY')?.id ?? null));
  }, [items]);

  const addFiles = (list) => {
    const files = [...list];
    const good = files.filter((f) => READABLE.test(f.name));
    const left = files.length - good.length;
    setNote(left ? `${left} item${left === 1 ? ' was' : 's were'} left out. We read PDF, Excel and CSV files. Folders do not come through, so open a folder and pick the files inside.` : '');
    setItems((cur) => {
      const seen = new Set(cur.map((it) => `${it.file.name}|${it.file.size}`));
      const fresh = [];
      good.forEach((file) => {
        const key = `${file.name}|${file.size}`;
        if (seen.has(key)) return;
        seen.add(key);
        fresh.push({ id: nextId++, file, status: known.includes(file.name) ? 'DUP' : 'WAIT', read: null, fileId: null, problem: '', seconds: 0 });
      });
      return [...cur, ...fresh];
    });
  };

  const tryAgain = (it) => {
    started.current.delete(it.id);
    patch(it.id, { status: 'WAIT', problem: '' });
  };

  const byHand = (it) => {
    patch(it.id, { status: 'READY', problem: '', read: quoteToCheck(EMPTY_READ, it.file.name) });
    setOpenId(it.id);
  };

  const skip = async (it) => {
    patch(it.id, { status: 'SKIPPED', read: null, problem: '' });
    if (!it.fileId) return;
    const res = await fetch(`/api/projects/${projectId}/files/${it.fileId}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ archived: true }),
    }).catch(() => null);
    if (!res?.ok) setNote(`${it.file.name} was skipped, but its stored copy is still on the project. It does no harm there. (RFQ_SKIP_KEPT)`);
  };

  const clearList = () => {
    setItems([]);
    started.current.clear();
    setNote('');
  };

  const at = items.findIndex((it) => it.id === openId);
  const open = items[at]?.status === 'READY' ? items[at] : null;
  const allDone = items.length > 0 && !items.some((it) => ['WAIT', 'READING', 'READY'].includes(it.status));

  return (
    <div className="mt-3">
      <div
        role="button" tabIndex={0}
        onClick={() => picker.current?.click()}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); picker.current?.click(); } }}
        onDragEnter={(e) => { e.preventDefault(); setDragging(true); }}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={(e) => { e.preventDefault(); setDragging(false); }}
        onDrop={(e) => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files); }}
        className={`border-2 border-dashed rounded-xl px-6 py-8 text-center cursor-pointer transition-colors ${dragging ? 'border-orange-400 bg-amber-50' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'}`}
      >
        <p className="text-sm font-medium text-slate-700">Drop rep quotes here, or click to pick them</p>
        <p className={`${HELPER} mt-1`}>PDF, Excel or CSV. Several at once is fine. Keep this page open until the list is done.</p>
        <input ref={picker} type="file" multiple accept={ACCEPT} className="hidden" onClick={(e) => e.stopPropagation()}
          onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
      </div>
      {note && <p className={`mt-2 rounded-lg border px-3 py-2 text-sm ${TONE.warning}`}>{note}</p>}

      {items.length > 0 && (
        <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200">
          <table className="min-w-full">
            <thead className="bg-slate-50">
              <tr>
                <th className={TH}>File</th>
                <th className={TH}>Status</th>
                <th className={TH}><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => {
                const st = STATUS[it.status];
                return (
                  <Fragment key={it.id}>
                    <tr className="border-t border-slate-100 align-top">
                      <td className={`${TD} break-all`}>{it.file.name}</td>
                      <td className={`${TD} whitespace-nowrap font-medium ${st.tone}`}>
                        <span className="inline-flex items-center gap-1.5">
                          {it.status === 'PROBLEM' && <AlertMark size={14} label="Could not read" />}
                          {st.text}{it.status === 'READING' && it.seconds ? `, ${it.seconds} s` : ''}
                        </span>
                      </td>
                      <td className={`${TD} text-right whitespace-nowrap`}>
                        {it.status === 'READY' && it.id !== openId && <Button size="sm" variant="secondary" onClick={() => setOpenId(it.id)}>Check</Button>}
                        {it.status === 'READY' && it.id === openId && <span className={HELPER}>Checking now</span>}
                        {it.status === 'DUP' && (
                          <span className="inline-flex gap-2">
                            <Button size="sm" variant="secondary" onClick={() => tryAgain(it)}>Read it anyway</Button>
                            <Button size="sm" variant="ghost" onClick={() => skip(it)}>Skip</Button>
                          </span>
                        )}
                        {it.status === 'PROBLEM' && (
                          <span className="inline-flex gap-2">
                            <Button size="sm" variant="secondary" onClick={() => tryAgain(it)}>Try again</Button>
                            <Button size="sm" variant="secondary" onClick={() => byHand(it)}>Type it by hand</Button>
                            <Button size="sm" variant="ghost" onClick={() => skip(it)}>Skip</Button>
                          </span>
                        )}
                      </td>
                    </tr>
                    {it.status === 'PROBLEM' && (
                      <tr><td colSpan={3} className="px-3 pb-2.5 text-sm text-red-700">{it.problem}</td></tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {allDone && <button type="button" className="mt-2 text-sm text-slate-500 underline hover:text-slate-700" onClick={clearList}>Clear this list</button>}

      {open && (
        <CheckScreen
          key={open.id}
          read={open.read}
          setRead={(r) => patch(open.id, { read: r })}
          onAdd={async (r) => { if (await onAdd({ ...r, fileId: open.fileId })) patch(open.id, { status: 'DONE', read: null }); }}
          busy={busy}
          error={error}
          saveLabel="Save this quote"
          repQuote
          position={items.length > 1 ? `File ${at + 1} of ${items.length}` : ''}
          startOverLabel="Skip this file"
          onStartOver={() => skip(open)}
        />
      )}
      {/* Stays mounted so a pasted table being checked is not lost when a file opens. */}
      <div className={open ? 'hidden' : ''}>
        <QuoteReader key={pasteKey} pasteOnly repQuote saveLabel="Save this quote" onAdd={onAdd} busy={busy} error={error} />
      </div>
    </div>
  );
}
