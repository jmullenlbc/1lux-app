'use client';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { appendUpload } from '@/lib/uploadClient';
import { SCAN_LABELS } from '@/lib/salesDocs/pricingScan';
import { MODAL, H2, INPUT, LABEL, HELPER, BTN_PRIMARY, BTN_SECONDARY, TONE } from '@/components/ui/tokens';

// Pieces every Sales Docs screen shares (0137): the pricing check pill, the
// upload and read step, and the Create link window.

const SCAN_TONE = { PENDING: TONE.info, CLEAN: TONE.success, WARN: TONE.warning, BLOCKED: TONE.danger, OVERRIDDEN: TONE.brand };

export function ScanPill({ version, className }) {
  if (!version) return null;
  if (version.processStatus === 'FAILED') return <span className={cn('inline-flex items-center px-2 py-0.5 rounded-lg border text-xs font-semibold', TONE.danger, className)}>Could not read</span>;
  const s = version.processStatus === 'READY' ? version.scanStatus : 'PENDING';
  return <span className={cn('inline-flex items-center px-2 py-0.5 rounded-lg border text-xs font-semibold whitespace-nowrap', SCAN_TONE[s] || TONE.info, className)}>{SCAN_LABELS[s] || s}</span>;
}

export const KIND_LABEL = { PDF: 'PDF', XLSX: 'Excel' };

export function formatBytes(n) {
  if (!n) return '';
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function ago(at) {
  if (!at) return '';
  const s = Math.round((Date.now() - new Date(at).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`;
  return new Date(at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Date and clock time, like Oct 19, 2026, 3:04 PM. */
export function formatWhen(at) {
  if (!at) return '';
  return new Date(at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function formatTime(ms) {
  const s = Math.round((ms || 0) / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, '0')}s`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
}

export const shareUrl = (token) => `${typeof window !== 'undefined' ? window.location.origin : ''}/share/docs/${token}`;

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** Read the file once it has landed. Polls when the first call is cut off. */
export async function processUntilDone(versionId) {
  let res = await fetch(`/api/sales-docs/versions/${versionId}/process`, { method: 'POST' }).catch(() => null);
  let data = res?.ok ? await res.json() : null;
  for (let i = 0; i < 60 && data?.version?.processStatus !== 'READY' && data?.version?.processStatus !== 'FAILED'; i++) {
    await wait(3000);
    res = await fetch(`/api/sales-docs/versions/${versionId}/process`).catch(() => null);
    data = res?.ok ? await res.json() : data;
    if (data?.stale) {
      res = await fetch(`/api/sales-docs/versions/${versionId}/process`, { method: 'POST' }).catch(() => null);
      data = res?.ok ? await res.json() : data;
    }
  }
  return data?.version || null;
}

/** Upload a new doc (or a new version when docId is given), then read it. */
export async function uploadSalesDoc(file, { docId, title, folderId, onStage } = {}) {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if (ext !== 'pdf' && ext !== 'xlsx') throw new Error('Sales Docs takes PDF and Excel (.xlsx) files.');
  if (file.size > 50 * 1024 * 1024) throw new Error('That file is over 50 MB.');
  onStage?.('Uploading');
  const fd = new FormData();
  await appendUpload(fd, file, { scope: 'salesdoc' });
  if (title) fd.append('title', title);
  if (folderId) fd.append('folderId', folderId);
  const res = await fetch(docId ? `/api/sales-docs/${docId}/versions` : '/api/sales-docs', { method: 'POST', body: fd });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'The upload did not finish.');
  onStage?.('Checking for cost columns');
  const version = await processUntilDone(data.version.id);
  return { doc: data.doc, version };
}

export function CopyButton({ text, label = 'Copy link', className }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={cn(BTN_SECONDARY, 'px-3 py-1.5 text-xs', className)}
      onClick={async () => {
        try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500); } catch { /* the field is still there to copy by hand */ }
      }}
    >
      {done ? 'Copied' : label}
    </button>
  );
}

export function CompletionBar({ value }) {
  const pct = Math.round((value || 0) * 100);
  return (
    <div className="flex items-center gap-2 min-w-[90px]">
      <div className="h-1.5 flex-1 rounded-full bg-slate-100 overflow-hidden">
        <div className="h-full bg-orange-500" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-slate-600 tabular-nums w-9 text-right">{pct}%</span>
    </div>
  );
}

export function Modal({ title, onClose, children, width = 'max-w-lg' }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 backdrop-blur-sm p-4 pt-12 overflow-y-auto" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={cn(MODAL, 'w-full mx-auto mb-8', width)} role="dialog" aria-modal="true" aria-label={title}>
        <div className="px-6 pt-5 pb-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className={H2}>{title}</h2>
          <button type="button" onClick={onClose} className="text-slate-600 p-1 rounded-lg hover:bg-slate-100" aria-label="Close">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

function Check({ label, hint, checked, onChange }) {
  return (
    <label className="flex items-start gap-2 text-sm text-slate-700 cursor-pointer">
      <input type="checkbox" className="mt-0.5 accent-orange-500" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}{hint ? <span className={cn(HELPER, 'block')}>{hint}</span> : null}</span>
    </label>
  );
}

/** Create link for one doc or one Space. Shows the address to copy when made. */
/** Live companies, A to Z, for pickers. */
export function useClients() {
  const [clients, setClients] = useState([]);
  useEffect(() => {
    fetch('/api/clients').then((r) => (r.ok ? r.json() : { clients: [] })).then((d) => {
      setClients((d.clients || []).filter((c) => !c.archivedAt).sort((a, b) => a.name.localeCompare(b.name)));
    }).catch(() => {});
  }, []);
  return clients;
}

export function CreateLinkModal({ docId, spaceId, defaultName = '', defaultClientId = '', onClose, onCreated }) {
  const clients = useClients();
  const [f, setF] = useState({
    name: defaultName, clientId: defaultClientId || '', recipientEmail: '', requireEmail: true, password: '',
    expiresAt: '', allowDownload: false, notifyOnFirstOpen: true,
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [made, setMade] = useState(null);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  async function save() {
    setBusy(true); setErr('');
    const body = {
      ...(docId ? { docId } : { spaceId }),
      name: f.name, clientId: f.clientId || null, recipientEmail: f.recipientEmail || null,
      requireEmail: f.requireEmail, allowDownload: f.allowDownload, notifyOnFirstOpen: f.notifyOnFirstOpen,
      expiresAt: f.expiresAt ? `${f.expiresAt}T23:59:59` : null,
      ...(f.password ? { password: f.password } : {}),
    };
    const res = await fetch('/api/sales-docs/links', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setErr(data.error || 'The link was not made.'); return; }
    setMade(data.link);
    onCreated?.(data.link);
  }

  const label = cn('block', LABEL, 'mb-1');
  if (made) {
    const url = shareUrl(made.token);
    return (
      <Modal title="Link ready" onClose={onClose}>
        <p className="text-sm text-slate-700 mb-3">Send this address to <strong>{made.name}</strong>. You will get a bell alert when it is opened{made.recipientEmail ? ' and if it is forwarded' : ''}.</p>
        <div className="flex gap-2">
          <input readOnly className={INPUT} value={url} onFocus={(e) => e.target.select()} />
          <CopyButton text={url} />
        </div>
        <div className="flex justify-end mt-5"><button type="button" className={BTN_PRIMARY} onClick={onClose}>Done</button></div>
      </Modal>
    );
  }

  return (
    <Modal title="Create link" onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className={label} htmlFor="sdl-name">Link name *</label>
          <input id="sdl-name" className={INPUT} value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="Who it is for, like Jane at Mill Creek" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={label} htmlFor="sdl-client">Company</label>
            <select id="sdl-client" className={INPUT} value={f.clientId} onChange={(e) => set('clientId', e.target.value)}>
              <option value="">None</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className={label} htmlFor="sdl-to">Sent to (email)</label>
            <input id="sdl-to" type="email" className={INPUT} value={f.recipientEmail} onChange={(e) => set('recipientEmail', e.target.value)} placeholder="name@company.com" />
          </div>
          <div>
            <label className={label} htmlFor="sdl-pw">Password</label>
            <input id="sdl-pw" type="text" autoComplete="off" className={INPUT} value={f.password} onChange={(e) => set('password', e.target.value)} placeholder="Leave blank for none" />
          </div>
          <div>
            <label className={label} htmlFor="sdl-exp">Expires</label>
            <input id="sdl-exp" type="date" className={INPUT} value={f.expiresAt} onChange={(e) => set('expiresAt', e.target.value)} />
          </div>
        </div>
        <div className="space-y-2">
          <Check label="Ask for their email before opening" hint="Needed to see who opened it and to spot forwards." checked={f.requireEmail} onChange={(v) => set('requireEmail', v)} />
          <Check label="Allow download" checked={f.allowDownload} onChange={(v) => set('allowDownload', v)} />
          <Check label="Alert me the first time it is opened" checked={f.notifyOnFirstOpen} onChange={(v) => set('notifyOnFirstOpen', v)} />
        </div>
        {err && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className={BTN_SECONDARY} onClick={onClose}>Cancel</button>
          <button type="button" className={BTN_PRIMARY} disabled={busy || !f.name.trim()} onClick={save}>{busy ? 'Making link...' : 'Create link'}</button>
        </div>
      </div>
    </Modal>
  );
}
