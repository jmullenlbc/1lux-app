'use client';
import { useEffect, useState } from 'react';
import { formatMacroValue, formatMacroDelta, formatMacroDate } from '@/lib/market-intel/macroSeries';
import WidgetFrame, { WidgetEmpty, WidgetLoading, WidgetError } from '@/components/ui/WidgetFrame';
import StatTile from '@/components/ui/StatTile';
import { BTN_COMPACT } from '@/components/ui/tokens';

/**
 * The national numbers at the top of Market Intelligence (migration 0128,
 * Mike 10-8). Nine FRED series plus two of our own from the permit feeds.
 * Green means the move helps us sell lighting (more starts, more permits,
 * cheaper money), red the reverse; a cost or rate going up is red.
 */
const GOOD_WHEN_UP = { HOUST5F: true, COMPU5MUSA: true, PERMIT5: true, CUUR0000SEHA: true };
const GOOD_WHEN_DOWN = { DFF: true, DGS10: true, MORTGAGE30US: true, WPUSI012011: true, RRVRUSQ156N: true };

function tone(id, direction) {
  if (direction === 'flat') return 'muted';
  const good = (direction === 'up' && GOOD_WHEN_UP[id]) || (direction === 'down' && GOOD_WHEN_DOWN[id]);
  return good ? 'success' : 'danger';
}

function Tile({ s }) {
  const delta = formatMacroDelta(s.unit, s.latest?.value, s.yearAgo?.value);
  const date  = s.note ? s.note : s.latest ? formatMacroDate(s.cadence, s.latest.date) : '';
  return (
    <div title={s.blurb} className="min-w-0">
      <StatTile
        inset
        label={s.label}
        value={s.latest ? formatMacroValue(s.unit, s.latest.value) : 'no data'}
        tone={s.latest ? (delta.text ? tone(s.id, delta.direction) : 'default') : 'muted'}
        sub={[date, delta.text].filter(Boolean).join(', ')}
      />
    </div>
  );
}

export default function MacroStrip() {
  const [data,    setData]    = useState(null);
  const [busy,    setBusy]    = useState(false);
  const [failed,  setFailed]  = useState(false);

  async function load(method = 'GET') {
    setBusy(true);
    try {
      const res = await fetch('/api/market-intel/macro', { method });
      const d   = await res.json();
      if (!res.ok) throw new Error(d.error || 'failed');
      setData(d);
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => { load(); }, []);

  const cards = [...(data?.stats || []), ...(data?.ours || [])];
  const sub = data?.fetchedAt
    ? `FRED, pulled ${new Date(data.fetchedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
    : undefined;
  return (
    <WidgetFrame
      className="mb-5"
      title="National market numbers"
      sub={sub}
      actions={
        <button type="button" onClick={() => load('POST')} disabled={busy} className={BTN_COMPACT}>
          {busy ? 'Loading...' : 'Refresh numbers'}
        </button>
      }
    >
      {cards.length ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
          {cards.map(s => <Tile key={s.id} s={s} />)}
        </div>
      ) : failed ? (
        <WidgetError>Could not load the national numbers.</WidgetError>
      ) : busy ? (
        <WidgetLoading />
      ) : (
        <WidgetEmpty>No numbers yet.</WidgetEmpty>
      )}
      {failed && cards.length > 0 && <WidgetError className="py-2">Could not refresh.</WidgetError>}
    </WidgetFrame>
  );
}
