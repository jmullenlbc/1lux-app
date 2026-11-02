'use client';
import { useEffect, useRef, useState } from 'react';
import { RECEIPT_ACCEPT } from '@/lib/sales/receipts';
import { sendReceipt } from '@/lib/sales/receiptClient';
import { cn } from '@/lib/utils';
import { FOCUS, HELPER } from '@/components/ui/tokens';

const isFileDrag = (e) => Array.from(e.dataTransfer?.types || []).includes('Files');

function doneWords({ receipt, duplicate, readError }) {
  if (duplicate) return receipt.expenseId ? 'Already on a saved expense. Nothing new was added.' : 'Already waiting for your OK below.';
  if (readError) return readError;
  return 'Read. Check it below and press OK.';
}

// One box for every file. Files go one at a time so each gets its own line.
// The Snap page's photo buttons use this hook too.
export function useReceiptSender({ source = 'DROP', onDone }) {
  const [lines, setLines] = useState([]);
  const [busy, setBusy] = useState(false);

  async function send(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    setBusy(true);
    const stamp = Date.now();
    const mark = (i, patch) => setLines(ls => ls.map(l => l.key === `${stamp}-${i}` ? { ...l, ...patch } : l));
    setLines(ls => [...files.map((f, i) => ({ key: `${stamp}-${i}`, name: f.name, words: 'Waiting', bad: false })), ...ls].slice(0, 8));
    for (let i = 0; i < files.length; i += 1) {
      try {
        const out = await sendReceipt(files[i], { source, onStage: words => mark(i, { words }) });
        mark(i, { words: doneWords(out), bad: !!out.readError });
      } catch (e) {
        mark(i, { words: e.message, bad: true });
      }
      await onDone?.();
    }
    setBusy(false);
  }

  return { lines, busy, send };
}

export function ReceiptLines({ lines }) {
  if (!lines.length) return null;
  return (
    <ul className="mt-2 space-y-1" aria-live="polite">
      {lines.map(l => (
        <li key={l.key} className={cn('text-xs break-words', l.bad ? 'text-red-600' : 'text-slate-600')}>
          <span className="font-medium">{l.name}:</span> {l.words}
        </li>
      ))}
    </ul>
  );
}

export default function ReceiptDrop({ source = 'DROP', onDone, className }) {
  const input = useRef(null);
  const [over, setOver] = useState(false);
  const { lines, busy, send } = useReceiptSender({ source, onDone });
  const sendRef = useRef(send);
  sendRef.current = send;

  // A near miss must never open the file in the tab, so the whole page takes the drop.
  useEffect(() => {
    let depth = 0;
    const enter = (e) => { if (isFileDrag(e)) { depth += 1; setOver(true); } };
    const move = (e) => { if (isFileDrag(e)) e.preventDefault(); };
    const leave = (e) => { if (isFileDrag(e)) { depth = Math.max(0, depth - 1); if (!depth) setOver(false); } };
    const drop = (e) => {
      if (!isFileDrag(e)) return;
      e.preventDefault();
      depth = 0;
      setOver(false);
      sendRef.current(e.dataTransfer.files);
    };
    document.addEventListener('dragenter', enter);
    document.addEventListener('dragover', move);
    document.addEventListener('dragleave', leave);
    document.addEventListener('drop', drop);
    return () => {
      document.removeEventListener('dragenter', enter);
      document.removeEventListener('dragover', move);
      document.removeEventListener('dragleave', leave);
      document.removeEventListener('drop', drop);
    };
  }, []);

  return (
    <div className={className}>
      <button type="button" onClick={() => input.current?.click()} disabled={busy}
        className={cn(
          'w-full rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors',
          over ? 'border-orange-500 bg-orange-50' : 'border-slate-300 bg-slate-50 hover:bg-slate-100',
          busy && 'opacity-70',
          FOCUS,
        )}>
        <span className="block text-sm font-semibold text-slate-800">{busy ? 'Working on it…' : 'Drop a receipt here, or tap to choose'}</span>
        <span className={cn('block mt-1', HELPER)}>PDF, Excel, JPG or PNG</span>
      </button>
      <input ref={input} type="file" multiple accept={RECEIPT_ACCEPT} className="hidden"
        onChange={e => { send(e.target.files); e.target.value = ''; }} />
      <ReceiptLines lines={lines} />
    </div>
  );
}
