'use client';
import { useCallback, useEffect, useState } from 'react';
import WidgetFrame from '@/components/ui/WidgetFrame';
import { rfqApi } from './rfqApi';
import { GroupCard } from './RfqTab';
import RfqReceived from './RfqReceived';
import RfqReview, { useRfqQuotes } from './RfqReview';
import SentNotice from './SentNotice';
import SentRfqs from './SentRfqs';

// RFQs for one change order, the same send, quote and price steps as the RFQs
// tab. Lines stay on the change order; a rep's price goes on the line when a
// person approves it while the CO is a draft (0164). stamp changes when the
// CO's lines do; onApproved reloads the CO.
export default function CoRfqPanel({ projectId, coId, stamp, onApproved }) {
  const [state, setState] = useState(null);
  const [sent, setSent] = useState([]);
  const [err, setErr] = useState('');
  const quotes = useRfqQuotes(projectId);

  const load = useCallback(async () => {
    const d = await rfqApi(`/api/projects/${projectId}/rfqs?coId=${coId}`, { what: 'Loading the RFQs' });
    if (d.error) setErr(d.error); else { setState(d); setErr(''); }
  }, [projectId, coId]);
  useEffect(() => { load(); }, [load, stamp]);

  const onSent = (d) => { setState(d.state); setSent((s) => [{ rfq: d.rfq, email: d.email }, ...s]); };

  if (!state) return err ? <p className="text-sm text-red-600">{err}</p> : null;
  if (!state.groups.length && !state.rfqs.length) return null;

  return (
    <div className="space-y-4">
      <WidgetFrame title="RFQs for this change order" sub="Lines group by rep. A credit line asks for the credit and any restocking fee. Rep prices go on the lines when someone approves them, while this change order is a draft.">
        {err && <p className="text-sm text-red-600 mb-2">{err}</p>}
        <div className="space-y-3">
          {state.groups.map((g) => <GroupCard key={g.key} projectId={projectId} group={g} onState={load} onSent={onSent} setErr={setErr} coId={coId} />)}
        </div>
      </WidgetFrame>
      {sent.map((s) => <SentNotice key={s.rfq.id} projectId={projectId} rfq={s.rfq} email={s.email} onClose={() => setSent((x) => x.filter((y) => y.rfq.id !== s.rfq.id))} />)}
      {state.rfqs.length > 0 && <SentRfqs projectId={projectId} state={state} onState={load} onSent={onSent} reload={load} coId={coId} />}
      {state.rfqs.length > 0 && (quotes.data || quotes.loadErr) && <RfqReview projectId={projectId} state={state} onState={setState} reload={load} quotes={quotes} coId={coId} onApproved={onApproved} />}
      {state.rfqs.length > 0 && <RfqReceived projectId={projectId} rfqs={state.rfqs} quotes={quotes} onChanged={() => { load(); quotes.load(); }} forCo />}
    </div>
  );
}
