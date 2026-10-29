'use client';
import { useCallback, useEffect, useState } from 'react';
import Card, { CardHeader, CardBody } from '@/components/ui/Card';
import { showDateTime } from '@/lib/rfq/format';

// History at the bottom of a rep, manufacturer, office or RFQ (Mike 10-29):
// what changed, when, and by who. Pass a changing `version` to reload it
// after a save.

const ACTION = { CREATE: 'Added', UPDATE: 'Changed', ADD: 'Linked', REMOVE: 'Removed', SEND: 'Sent', RECEIVE: 'Price in', QUOTE: 'Quote in', LOAD: 'Upload' };

const show = (v) => (v == null || v === '' ? 'blank' : v === 'true' ? 'Yes' : v === 'false' ? 'No' : v);

export default function RecordHistory({ type, id, version = 0 }) {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    const res = await fetch(`/api/history?type=${type}&id=${encodeURIComponent(id)}`).catch(() => null);
    const d = await res?.json().catch(() => ({}));
    if (!res?.ok) { setErr(d?.error || 'Could not load the history. Nothing is lost. Reload the page. (HISTORY_LOAD)'); return; }
    setErr(''); setRows(d.history || []);
  }, [type, id]);
  useEffect(() => { load(); }, [load, version]);

  return (
    <Card>
      <CardHeader title="History" />
      <CardBody>
        {err && <p className="text-sm text-red-600">{err}</p>}
        {!err && rows === null && <p className="text-sm text-slate-400">Loading</p>}
        {rows?.length === 0 && <p className="text-sm text-slate-400">No changes yet.</p>}
        {rows?.length > 0 && (
          <ul className="divide-y divide-slate-100 text-sm">
            {rows.map((h) => (
              <li key={h.id} className="py-2 flex flex-wrap gap-x-3 gap-y-0.5">
                <span className="text-slate-400 tabular-nums w-40 shrink-0">{showDateTime(h.createdAt)}</span>
                <span className="text-slate-500 w-36 shrink-0 truncate">{h.userName || 'The app'}</span>
                <span className="text-slate-700 flex-1 min-w-[12rem]">
                  <span className="font-medium">{ACTION[h.action] || h.action}</span>
                  {h.field && <> {h.field}: <span className="text-slate-400 line-through">{show(h.oldValue)}</span> to {show(h.newValue)}</>}
                  {h.note && <span className="text-slate-500">{h.field ? '. ' : ': '}{h.note}</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
