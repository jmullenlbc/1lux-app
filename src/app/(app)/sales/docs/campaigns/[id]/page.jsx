'use client';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import SectionTabs, { SALES_DOCS_TABS } from '@/components/ui/SectionTabs';
import { WidgetLoading } from '@/components/ui/WidgetFrame';
import { CARD_PADDED, CARD_TITLE, H1, HELPER, INPUT, SELECT, LABEL, BTN_COMPACT, BTN_COMPACT_PRIMARY } from '@/components/ui/tokens';
import { Modal } from '@/components/salesDocs/SalesDocsUi';
import { StatusPill, jsonCall } from '@/components/campaigns/CampaignUi';
import CampaignResults from '@/components/campaigns/CampaignResults';

// One campaign (0147): wording, who gets it, the email body in pieces, a
// preview, and Send. Once sent it is locked and shows results.

const KINDS = [
  { kind: 'HEADING', label: 'Heading' },
  { kind: 'TEXT', label: 'Text' },
  { kind: 'BUTTON', label: 'Button' },
  { kind: 'IMAGE', label: 'Image' },
  { kind: 'DOC', label: 'Document card' },
  { kind: 'FOLDER', label: 'Folder card' },
];
const KIND_LABEL = Object.fromEntries(KINDS.map((k) => [k.kind, k.label]));
let tempId = 0;

export default function CampaignPage() {
  const { id } = useParams();
  const [d, setD] = useState(null);
  const [form, setForm] = useState(null);
  const [blocks, setBlocks] = useState([]);
  const [lists, setLists] = useState([]);
  const [docs, setDocs] = useState([]);
  const [spaces, setSpaces] = useState([]);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [preview, setPreview] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [progress, setProgress] = useState(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/campaigns/${id}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setErr(data.error || 'We could not load this campaign. Reload the page. (CAMPAIGN_LOAD)'); return; }
    setD(data);
    setForm({ name: data.campaign.name, subject: data.campaign.subject || '', previewText: data.campaign.previewText || '', listId: data.campaign.listId || '' });
    setBlocks(data.blocks.map((b) => ({ ...b, key: b.id })));
    setDirty(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    fetch('/api/campaign-lists').then((r) => (r.ok ? r.json() : { lists: [] })).then((x) => setLists(x.lists)).catch(() => {});
    fetch('/api/sales-docs').then((r) => (r.ok ? r.json() : { docs: [] })).then((x) => setDocs(x.docs)).catch(() => {});
    fetch('/api/sales-docs/spaces').then((r) => (r.ok ? r.json() : { spaces: [] })).then((x) => setSpaces(x.spaces)).catch(() => {});
  }, []);

  if (!d || !form) return <div className="px-4 py-6"><SectionTabs tabs={SALES_DOCS_TABS} className="mb-5" />{err ? <p className="max-w-3xl mx-auto text-sm text-red-600">{err}</p> : <WidgetLoading />}</div>;

  const c = d.campaign;
  const locked = c.status !== 'DRAFT';
  const setField = (k, v) => { setForm((f) => ({ ...f, [k]: v })); setDirty(true); };
  const setBlock = (key, patch) => { setBlocks((bs) => bs.map((b) => (b.key === key ? { ...b, ...patch } : b))); setDirty(true); };
  const move = (i, step) => {
    setBlocks((bs) => { const n = [...bs]; const j = i + step; if (j < 0 || j >= n.length) return bs; [n[i], n[j]] = [n[j], n[i]]; return n; });
    setDirty(true);
  };
  const addBlock = (kind) => { tempId += 1; setBlocks((bs) => [...bs, { key: `new-${tempId}`, kind, text: '', url: '', salesDocId: '', spaceId: '' }]); setDirty(true); };
  const removeBlock = (key) => { setBlocks((bs) => bs.filter((b) => b.key !== key)); setDirty(true); };

  async function save() {
    setBusy(true); setErr(''); setMsg('');
    const a = await jsonCall(`/api/campaigns/${id}`, 'PATCH', { ...form, listId: form.listId || null });
    const b = a.error ? a : await jsonCall(`/api/campaigns/${id}/blocks`, 'PUT', {
      blocks: blocks.map((x) => ({ id: x.id, kind: x.kind, text: x.text, url: x.url, salesDocId: x.salesDocId, spaceId: x.spaceId })),
    });
    setBusy(false);
    if (b.error) { setErr(b.error); return; }
    setMsg('Saved.');
    setPreview(null);
    await load();
  }

  async function showPreview() {
    if (dirty) await save();
    const res = await fetch(`/api/campaigns/${id}/preview`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setErr(data.error || 'We could not build the preview. Your campaign is saved. (CAMPAIGN_PREVIEW)'); return; }
    setPreview(data);
  }

  async function archive(archived) {
    const r = await jsonCall(`/api/campaigns/${id}`, 'PATCH', { archived });
    if (r.error) setErr(r.error); else load();
  }

  // Keeps pressing Send until the queue is empty, so each call stays under the server time wall.
  async function sendAll() {
    setConfirming(false); setErr('');
    let total = { sent: 0, failed: 0, skipped: 0, remaining: null };
    setProgress(total);
    for (let i = 0; i < 400; i += 1) {
      const r = await jsonCall(`/api/campaigns/${id}/send`, 'POST');
      if (r.error) { setErr(`${r.error}${total.sent ? ` ${total.sent} were already sent; press Send again to finish the rest.` : ''}`); break; }
      total = { sent: total.sent + r.data.sent, failed: total.failed + r.data.failed, skipped: total.skipped + r.data.skipped, remaining: r.data.remaining };
      setProgress(total);
      if (r.data.done) break;
    }
    await load();
  }

  return (
    <div className="px-4 py-6">
      <SectionTabs tabs={SALES_DOCS_TABS} className="mb-5" />
      <div className="max-w-5xl mx-auto space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Link href="/sales/docs/campaigns" className="text-xs text-slate-500 hover:text-orange-600">Campaigns</Link>
            <h1 className={`${H1} flex items-center gap-2`}>{c.name} <StatusPill status={c.status} /></h1>
            {c.archivedAt && <p className="text-xs text-slate-500">Archived.</p>}
          </div>
          <div className="flex gap-2">
            {!locked && <button type="button" onClick={showPreview} className={BTN_COMPACT}>Preview</button>}
            {!locked && <button type="button" onClick={save} disabled={busy || !dirty} className={BTN_COMPACT_PRIMARY}>{busy ? 'Saving...' : 'Save'}</button>}
            <button type="button" onClick={() => archive(!c.archivedAt)} className={BTN_COMPACT}>{c.archivedAt ? 'Restore' : 'Archive'}</button>
          </div>
        </div>

        {err && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</p>}
        {msg && !dirty && <p className="text-xs text-emerald-700">{msg}</p>}

        {locked ? (
          <CampaignResults id={id} campaign={c} onSendMore={c.status === 'SENDING' && d.canSend ? sendAll : null} progress={progress} />
        ) : (
          <>
            <div className={`${CARD_PADDED} grid gap-4 sm:grid-cols-2`}>
              <Field label="Campaign name (only staff see this)"><input value={form.name} onChange={(e) => setField('name', e.target.value)} className={INPUT} /></Field>
              <Field label="Who gets it">
                <select value={form.listId} onChange={(e) => setField('listId', e.target.value)} className={SELECT}>
                  <option value="">Pick an email list</option>
                  {lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
                {d.audience && !dirty && (
                  <p className={`${HELPER} mt-1`}>
                    {d.audience.ready} will get it.
                    {d.audience.noEmail ? ` ${d.audience.noEmail} have no email.` : ''}
                    {d.audience.suppressed ? ` ${d.audience.suppressed} are on the do-not-email list.` : ''}
                    {d.audience.duplicate ? ` ${d.audience.duplicate} share an address with someone else.` : ''}
                  </p>
                )}
              </Field>
              <Field label="Subject line"><input value={form.subject} onChange={(e) => setField('subject', e.target.value)} placeholder="Hi {{first_name}}, our new price sheet" className={INPUT} /></Field>
              <Field label="Preview text (shows after the subject in the inbox)"><input value={form.previewText} onChange={(e) => setField('previewText', e.target.value)} className={INPUT} /></Field>
            </div>

            <div className={CARD_PADDED}>
              <p className={CARD_TITLE}>Email body</p>
              <p className={`${HELPER} mt-0.5`}>Type {'{{first_name}}'} anywhere to use the person&apos;s first name. A document or folder card opens as that person&apos;s own tracked link.</p>
              <div className="mt-4 space-y-3">
                {blocks.map((b, i) => (
                  <div key={b.key} className="rounded-lg border border-slate-200 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className={LABEL}>{KIND_LABEL[b.kind]}</span>
                      <div className="flex gap-1">
                        <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className={BTN_COMPACT} aria-label="Move up">Up</button>
                        <button type="button" onClick={() => move(i, 1)} disabled={i === blocks.length - 1} className={BTN_COMPACT} aria-label="Move down">Down</button>
                        <button type="button" onClick={() => removeBlock(b.key)} className={BTN_COMPACT}>Remove</button>
                      </div>
                    </div>
                    <div className="mt-2 space-y-2">
                      <BlockFields b={b} docs={docs} spaces={spaces} onChange={(patch) => setBlock(b.key, patch)} />
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {KINDS.map((k) => <button key={k.kind} type="button" onClick={() => addBlock(k.kind)} className={BTN_COMPACT}>Add {k.label.toLowerCase()}</button>)}
              </div>
            </div>

            <div className={CARD_PADDED}>
              <p className={CARD_TITLE}>Send</p>
              {dirty ? <p className={`${HELPER} mt-1`}>Save first to check what is left before sending.</p>
                : d.problems.length ? (
                  <ul className="mt-2 space-y-1">{d.problems.map((p) => <li key={p} className="text-sm text-slate-700">{p}</li>)}</ul>
                ) : !d.canSend ? (
                  <p className={`${HELPER} mt-1`}>Ready. A sales admin presses Send.</p>
                ) : (
                  <div className="mt-2 flex items-center gap-3">
                    <button type="button" onClick={() => setConfirming(true)} className={BTN_COMPACT_PRIMARY}>Send to {d.audience?.ready || 0} people</button>
                    {d.sender.mode === 'dryrun' && <span className={HELPER}>Test mode: no email leaves this computer.</span>}
                  </div>
                )}
            </div>
          </>
        )}
      </div>

      {preview && (
        <Modal title={`Preview: ${preview.subject || '(no subject)'}`} onClose={() => setPreview(null)} width="max-w-3xl">
          <iframe title="Email preview" sandbox="" srcDoc={preview.html} className="w-full h-[70vh] rounded-lg border border-slate-200" />
        </Modal>
      )}
      {confirming && (
        <Modal title="Send this campaign?" onClose={() => setConfirming(false)}>
          <p className="text-sm text-slate-700">This emails {d.audience?.ready || 0} people now. Once it starts it cannot be changed or called back.</p>
          <div className="mt-4 flex gap-2">
            <button type="button" onClick={sendAll} className={BTN_COMPACT_PRIMARY}>Send now</button>
            <button type="button" onClick={() => setConfirming(false)} className={BTN_COMPACT}>Cancel</button>
          </div>
        </Modal>
      )}
      {progress && progress.remaining !== 0 && c.status !== 'SENT' && (
        <p className="max-w-5xl mx-auto mt-3 text-xs text-slate-600">Sending: {progress.sent} sent{progress.remaining != null ? `, ${progress.remaining} to go` : ''}. Keep this page open.</p>
      )}
    </div>
  );
}

function Field({ label, children }) {
  return <label className="block"><span className={LABEL}>{label}</span><div className="mt-1">{children}</div></label>;
}

function BlockFields({ b, docs, spaces, onChange }) {
  const t = (placeholder, rows) => (rows
    ? <textarea rows={rows} value={b.text || ''} onChange={(e) => onChange({ text: e.target.value })} placeholder={placeholder} className={INPUT} />
    : <input value={b.text || ''} onChange={(e) => onChange({ text: e.target.value })} placeholder={placeholder} className={INPUT} />);
  const url = (placeholder) => <input value={b.url || ''} onChange={(e) => onChange({ url: e.target.value })} placeholder={placeholder} className={INPUT} />;
  if (b.kind === 'HEADING') return t('Heading');
  if (b.kind === 'TEXT') return t('Text. Leave a blank line between paragraphs.', 5);
  if (b.kind === 'BUTTON') return <>{t('Button words, like See the project')}{url('https://')}</>;
  if (b.kind === 'IMAGE') return <>{url('Image web address, https://')}{t('What the image shows (for people who cannot see it)')}</>;
  if (b.kind === 'DOC') {
    return (
      <>
        <select value={b.salesDocId || ''} onChange={(e) => onChange({ salesDocId: e.target.value })} className={SELECT}>
          <option value="">Pick a document</option>
          {docs.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}
        </select>
        {t('A line about it (optional)')}
      </>
    );
  }
  return (
    <>
      <select value={b.spaceId || ''} onChange={(e) => onChange({ spaceId: e.target.value })} className={SELECT}>
        <option value="">Pick a Folder</option>
        {spaces.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
      </select>
      {t('A line about it (optional)')}
    </>
  );
}
