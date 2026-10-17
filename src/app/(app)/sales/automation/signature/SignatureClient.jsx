'use client';
import { useEffect, useState } from 'react';
import { CARD_PADDED, CARD_TITLE } from '@/components/ui/tokens';
import { WidgetLoading } from '@/components/ui/WidgetFrame';
import { signatureBlock } from '@/lib/bot/emailStyle';
import MySignatureFields from '@/components/salesAutomation/MySignatureFields';

const FIELDS = [
  { key: '{name}',  what: 'Full name' },
  { key: '{first}', what: 'First name' },
  { key: '{title}', what: 'Job title' },
  { key: '{email}', what: 'Email' },
  { key: '{phone}', what: 'Cell, written 857.998.0556' },
  { key: '{office}', what: 'Office line and extension (optional)' },
];

export default function SignatureClient() {
  const [data, setData] = useState(null);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const [me, setMe] = useState(null);

  useEffect(() => {
    fetch('/api/sales/signature').then(r => r.json()).then(d => { setData(d); setDraft(d.template || ''); })
      .catch(() => setMsg({ type: 'error', text: 'Could not load the signature.' }));
  }, []);

  if (!data) return (msg?.text ? <p className="text-sm text-slate-500">{msg.text}</p> : <WidgetLoading />);

  const dirty = draft !== data.template;
  const who = me || data.me || {};
  const preview = signatureBlock(who, draft || data.defaultTemplate);

  async function save() {
    setSaving(true); setMsg(null);
    try {
      const res = await fetch('/api/sales/signature', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ template: draft }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || `Error ${res.status}`);
      setData(prev => ({ ...prev, template: d.template })); setDraft(d.template);
      setMsg({ type: 'success', text: 'Saved. Every new draft uses it.' });
    } catch (e) { setMsg({ type: 'error', text: e.message }); }
    finally { setSaving(false); }
  }

  const insert = key => setDraft(d => (d.endsWith('\n') || !d ? d : d + '\n') + key);

  return (
    <div className="grid md:grid-cols-2 gap-5">
      <div className={CARD_PADDED}>
        <h2 className={`${CARD_TITLE} mb-1`}>Layout</h2>
        <p className="text-xs text-slate-500 mb-3">
          {data.canEdit
            ? 'Type the lines as they should appear. The words in curly brackets are swapped for each person. A line whose details are blank is left out.'
            : 'Only a Sales Admin can change the layout.'}
        </p>
        <textarea value={draft} onChange={e => setDraft(e.target.value)} rows={7} disabled={!data.canEdit || saving}
          className="w-full font-mono border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:bg-slate-50 disabled:text-slate-600" />
        <div className="mt-3 space-y-1">
          {FIELDS.map(f => (
            <div key={f.key} className="flex items-center gap-2 text-xs">
              {data.canEdit
                ? <button onClick={() => insert(f.key)} className="font-mono text-orange-600 hover:underline w-16 text-left">{f.key}</button>
                : <span className="font-mono text-slate-600 w-16">{f.key}</span>}
              <span className="text-slate-500">{f.what}</span>
            </div>
          ))}
        </div>
        {data.canEdit && (
          <div className="flex items-center justify-between mt-4">
            <button onClick={() => setDraft(data.defaultTemplate)} disabled={saving}
              className="text-xs text-slate-500 hover:underline">Reset to standard</button>
            <div className="flex gap-2">
              {dirty && <button onClick={() => setDraft(data.template)} disabled={saving}
                className="text-sm text-slate-600 border border-slate-200 rounded-lg px-3 py-1.5">Cancel</button>}
              <button onClick={save} disabled={!dirty || saving}
                className="px-4 py-2 text-sm font-semibold rounded-lg bg-orange-500 hover:bg-orange-500 disabled:opacity-40 text-white">
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        )}
        {msg && <p className={`text-sm mt-3 ${msg.type === 'error' ? 'text-red-600' : 'text-green-700'}`}>{msg.text}</p>}
      </div>

      <div className={CARD_PADDED}>
        <h2 className={`${CARD_TITLE} mb-3`}>Your signature</h2>
        <div className="bg-slate-50 rounded-xl p-4 text-sm text-slate-700 whitespace-pre-line leading-relaxed">
          {preview || <span className="text-slate-400">Nothing to show yet.</span>}
        </div>
        <h3 className="text-xs font-semibold text-slate-600 mt-5 mb-2">Your details</h3>
        <MySignatureFields onChange={setMe} />
      </div>
    </div>
  );
}
