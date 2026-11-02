'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import ReceiptDrop, { ReceiptLines, useReceiptSender } from '@/components/sales/ReceiptDrop';
import ReceiptsToConfirm from '@/components/sales/ReceiptsToConfirm';
import { BTN_COMPACT, FOCUS, H1, HELPER } from '@/components/ui/tokens';

const PHOTO_BUTTON = `block w-full rounded-xl px-4 py-5 text-center text-lg font-semibold text-white bg-orange-500 hover:bg-orange-600 ${FOCUS}`;
const SECOND_BUTTON = `block w-full rounded-xl px-4 py-3 text-center text-sm font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 ${FOCUS}`;

export default function SnapReceiptPage() {
  const [receipts, setReceipts] = useState([]);
  const [users,    setUsers]    = useState([]);
  const [clients,  setClients]  = useState([]);
  const [projects, setProjects] = useState([]);
  const [me,       setMe]       = useState('');
  const [err,      setErr]      = useState('');
  const [saved,    setSaved]    = useState(0);
  const camera = useRef(null);
  const library = useRef(null);

  const loadReceipts = useCallback(async () => {
    try {
      const res = await fetch('/api/sales/expenses/receipts');
      if (!res.ok) throw new Error(`Your receipts did not load. Try again. (HTTP ${res.status})`);
      setReceipts((await res.json()).receipts || []);
      setErr('');
    } catch (e) {
      setErr(e instanceof TypeError ? 'No signal reaching our server. Your receipts did not load. Check your connection and try again.' : e.message);
    }
  }, []);

  const { lines, busy, send } = useReceiptSender({ source: 'SNAP', onDone: loadReceipts });

  useEffect(() => {
    loadReceipts();
    (async () => {
      const [u, c, p, m] = await Promise.all([
        fetch('/api/users').then(r => r.ok ? r.json() : { users: [] }).catch(() => ({ users: [] })),
        fetch('/api/clients').then(r => r.ok ? r.json() : { clients: [] }).catch(() => ({ clients: [] })),
        fetch('/api/projects').then(r => r.ok ? r.json() : { projects: [] }).catch(() => ({ projects: [] })),
        fetch('/api/auth/me').then(r => r.ok ? r.json() : null).catch(() => null),
      ]);
      setUsers((u.users || []).filter(x => x.role !== 'CLIENT_VIEWER'));
      setClients((c.clients || c || []).slice().sort((a, b) => (a.name || '').localeCompare(b.name || '')));
      setProjects((p.projects || p || []).map(x => ({ id: x.id, name: x.name, projectNumber: x.projectNumber || x.budgetNumber, clientId: x.clientId })));
      setMe(m?.user?.id || m?.id || '');
    })();
  }, [loadReceipts]);

  async function changed(wasSaved) {
    if (wasSaved) setSaved(n => n + 1);
    await loadReceipts();
  }

  return (
    <div className="px-4 py-6 pb-28">
      <div className="max-w-xl mx-auto space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className={H1}>Snap a receipt</h1>
            <p className={`${HELPER} mt-0.5`}>Take the picture now. AI reads it, you check it and press OK.</p>
          </div>
          <Link href="/sales/activity/expenses" className={`${BTN_COMPACT} shrink-0`}>All expenses</Link>
        </div>

        {err && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</p>}
        {saved > 0 && !receipts.length && <p className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">Saved. It is on your expenses now.</p>}

        <div className="space-y-2">
          <button type="button" disabled={busy} onClick={() => camera.current?.click()} className={PHOTO_BUTTON}>
            {busy ? 'Working on it…' : 'Take a photo'}
          </button>
          <button type="button" disabled={busy} onClick={() => library.current?.click()} className={SECOND_BUTTON}>
            Choose a photo
          </button>
          <input ref={camera} type="file" accept="image/*" capture="environment" className="hidden"
            onChange={e => { send(e.target.files); e.target.value = ''; }} />
          <input ref={library} type="file" accept="image/*" multiple className="hidden"
            onChange={e => { send(e.target.files); e.target.value = ''; }} />
          <ReceiptLines lines={lines} />
        </div>

        <ReceiptDrop source="DROP" onDone={loadReceipts} />

        <ReceiptsToConfirm receipts={receipts} me={me} users={users} clients={clients} projects={projects} onChanged={changed} />
      </div>
    </div>
  );
}
