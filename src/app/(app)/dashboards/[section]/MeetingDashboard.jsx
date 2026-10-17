'use client';
import { useState, useEffect, useCallback } from 'react';
import { NEXT_ACTION_TYPES } from '@/lib/pipeline';
import { SERVICE_TYPES } from '@/lib/utils';
import { MEETING_LEVELS, cardLevel } from '@/lib/meeting/cards';
import WidgetFrame, { WidgetEmpty, WidgetLoading } from '@/components/ui/WidgetFrame';

// Weekly Sales Meeting, the run-of-show. Live queues you work down and edit in
// the meeting, so the pipeline maintains itself (no carried-forward doc).
//
// Maram runs this meeting, so it is a shared team screen: an admin sets the card
// list the whole room sees, and anyone can keep a personal order on top of it.
// Every card that lists deals shows an owner, because "who owes what" is the
// whole point of the hour.

const money = v => v ? `$${Math.round(v).toLocaleString()}` : '—';
const fmtDate = d => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
// An empty cell, in words rather than a dash (house rule: no dashes in copy).
const blank = <span className="text-slate-500">none</span>;

// `embedded`: rendered under the Sales dashboard tabs, which already pad the page.
export default function MeetingDashboard({ embedded = false }) {
  const [layout, setLayout] = useState(null);   // { cards, source, catalog, canEditShared, hasPersonal }
  const [data, setData]     = useState(null);
  const [loading, setLoad]  = useState(true);
  const [editing, setEdit]  = useState(false);
  const [saving, setSaving] = useState(false);
  // Maram 9-17: two tabs, project-level cards and people-level cards.
  const [tab, setTab]       = useState('project');

  // Load the layout first, then only the data the cards on screen actually need.
  const load = useCallback(async () => {
    setLoad(true);
    const lr = await fetch('/api/sales/meeting/layout');
    const l  = lr.ok ? await lr.json() : { cards: [], catalog: [], source: 'built-in' };
    setLayout(l);
    const dr = await fetch(`/api/sales/meeting?cards=${encodeURIComponent(l.cards.join(','))}`);
    setData(dr.ok ? await dr.json() : { salesUsers: [], counts: {} });
    setLoad(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  // Patch a project, then refresh so items move/drop live.
  async function patch(id, body) {
    await fetch(`/api/projects/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    load();
  }

  async function saveLayout(cards, scope) {
    setSaving(true);
    await fetch('/api/sales/meeting/layout', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cards, scope }),
    });
    setSaving(false);
    load();
  }

  async function resetToShared() {
    setSaving(true);
    await fetch('/api/sales/meeting/layout', { method: 'DELETE' });
    setSaving(false);
    load();
  }

  if (loading) return <div className={embedded ? 'p-2' : 'p-8'}><WidgetLoading>Loading the meeting...</WidgetLoading></div>;

  const users = data.salesUsers || [];
  const c = data.counts || {};
  const cards = layout.cards || [];
  const titleOf = k => (layout.catalog.find(x => x.key === k) || {}).title || k;
  const subOf   = k => (layout.catalog.find(x => x.key === k) || {}).subtitle || '';
  const levelOf = k => (layout.catalog.find(x => x.key === k) || {}).level || cardLevel(k);
  const shown   = cards.filter(k => levelOf(k) === tab);
  const countOn = lvl => cards.filter(k => levelOf(k) === lvl).length;

  return (
    <div className={embedded ? 'space-y-6' : 'p-6 space-y-6'}>
      <div>
        {!embedded && <p className="text-[11px] font-bold text-orange-500 uppercase tracking-wide">Sales</p>}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Weekly Meeting</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Work each card top-to-bottom and update as you go, the pipeline stays current, no separate doc.
            </p>
          </div>
          <button onClick={() => setEdit(v => !v)}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:border-amber-400 hover:text-orange-600 whitespace-nowrap">
            {editing ? 'Done' : 'Choose cards'}
          </button>
        </div>
        <div className="flex gap-2 mt-3 text-xs flex-wrap">
          {cards.includes('awaitingSignature') && <Chip tone="amber">{c.awaitingSignature || 0} awaiting signature</Chip>}
          {cards.includes('nextActions') && <Chip>{c.nextActions || 0} next actions</Chip>}
          {c.overdue > 0 && <Chip tone="red">{c.overdue} overdue</Chip>}
          {layout.source === 'personal' && <Chip tone="slate">your own order</Chip>}
        </div>
      </div>

      {editing && (
        <CardPicker layout={layout} saving={saving}
          onSave={saveLayout} onReset={resetToShared} />
      )}

      {/* Project-level / people-level tabs (Maram 9-17) */}
      <div className="flex items-center gap-1 border-b border-slate-200">
        {MEETING_LEVELS.map(l => (
          <button key={l.key} type="button" onClick={() => setTab(l.key)} title={l.hint}
            className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors ${
              tab === l.key ? 'border-orange-500 text-orange-600' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
            {l.label} <span className="ml-1 text-[11px] font-normal text-slate-500">{countOn(l.key)}</span>
          </button>
        ))}
      </div>

      {cards.length === 0 && <WidgetEmpty>No cards on the screen. Hit “Choose cards”.</WidgetEmpty>}
      {cards.length > 0 && shown.length === 0 && (
        <WidgetEmpty>No {tab === 'people' ? 'people' : 'project'}-level cards are switched on. Hit “Choose cards” to add some.</WidgetEmpty>
      )}

      {shown.map(key => (
        <Section key={key} title={titleOf(key)} subtitle={subOf(key)}>
          <CardBody cardKey={key} data={data} users={users} patch={patch} />
        </Section>
      ))}
    </div>
  );
}

// ── Which table a card renders ────────────────────────────────────────────────
function CardBody({ cardKey, data, users, patch }) {
  const rows = data[cardKey] || [];
  if (rows.length === 0) return <WidgetEmpty>{EMPTY_LINE[cardKey] || 'Nothing here this week.'}</WidgetEmpty>;

  switch (cardKey) {
    case 'awaitingSignature':
      return (
        <Table cols={['Project', 'Client', 'Owner', 'Value', 'Waiting', 'Next action', '']}>
          {rows.map(d => (
            <Row key={d.id}>
              <DealCell d={d} /><Td className="text-slate-500">{d.client || blank}</Td>
              <Owner d={d} /><Td className="text-slate-600">{money(d.value)}</Td>
              <Td><Waiting days={d.daysWaiting} /></Td>
              <Td><NextAction d={d} users={users} onSave={patch} /></Td>
              <Td><button onClick={() => patch(d.id, { proposalSentDate: null, designStatus: 'WON', procurementStage: 'PRECONSTRUCTION' })}
                className="text-[11px] font-semibold text-green-600 hover:text-green-700 whitespace-nowrap">Signed ✓</button></Td>
            </Row>
          ))}
        </Table>
      );

    case 'nextActions':
      return (
        <Table cols={['Project', 'Client', 'Action', 'Owner', 'Due', '']}>
          {rows.map(d => (
            <Row key={d.id} className={d.overdue ? 'bg-red-50/40' : ''}>
              <DealCell d={d} /><Td className="text-slate-500">{d.client || blank}</Td>
              <Td colSpan={3} className="p-0"><NextAction d={d} users={users} onSave={patch} inline /></Td>
              <Td><button onClick={() => patch(d.id, { nextActionType: null, nextActionOwnerId: null, nextActionDueDate: null })}
                className="text-[11px] font-semibold text-slate-500 hover:text-green-600 whitespace-nowrap">Done ✓</button></Td>
            </Row>
          ))}
        </Table>
      );

    case 'closingSoon':
      return (
        <Table cols={['Project', 'Client', 'Owner', 'Value', 'Expected order', 'Next action']}>
          {rows.map(d => (
            <Row key={d.id}>
              <DealCell d={d} /><Td className="text-slate-500">{d.client || blank}</Td>
              <Owner d={d} /><Td className="text-slate-600">{money(d.value)}</Td>
              <Td className="font-semibold text-slate-700">{fmtDate(d.expectedOrderDate)}</Td>
              <Td><NextAction d={d} users={users} onSave={patch} /></Td>
            </Row>
          ))}
        </Table>
      );

    case 'proposalsSentLastWeek':
      return (
        <Table cols={['Project', 'Client', 'Owner', 'Proposal', 'Fee', 'Sent', 'Status']}>
          {rows.map(d => (
            <Row key={d.id}>
              <DealCell d={d} /><Td className="text-slate-500">{d.client || blank}</Td>
              <Owner d={d} /><Td className="text-slate-500">{d.title}</Td>
              <Td className="text-slate-600">{money(d.value)}</Td>
              <Td className="text-slate-500">{fmtDate(d.sentAt)}</Td>
              <Td><span className="text-[11px] font-semibold text-slate-600">{d.status}</span></Td>
            </Row>
          ))}
        </Table>
      );

    case 'proposalsAwaiting':
      return (
        <Table cols={['Project', 'Client', 'Owner', 'Proposal', 'Fee', 'Waiting']}>
          {rows.map(d => (
            <Row key={d.id}>
              <DealCell d={d} /><Td className="text-slate-500">{d.client || blank}</Td>
              <Owner d={d} /><Td className="text-slate-500">{d.title}</Td>
              <Td className="text-slate-600">{money(d.value)}</Td>
              <Td><Waiting days={d.daysWaiting} /></Td>
            </Row>
          ))}
        </Table>
      );

    case 'designSubmissions':
      return (
        <Table cols={['Project', 'Client', 'Owner', 'Direction', 'Phase', 'Files', 'When']}>
          {rows.map(d => (
            <Row key={d.id}>
              <DealCell d={{ ...d, id: d.projectId }} /><Td className="text-slate-500">{d.client || blank}</Td>
              <Owner d={d} />
              <Td><span className={`px-1.5 py-0.5 rounded text-[11px] font-semibold ${
                d.direction === 'Sent out' ? 'bg-sky-50 text-sky-700' : 'bg-violet-50 text-violet-700'}`}>{d.direction}</span></Td>
              <Td className="font-semibold text-slate-700">{d.phaseTag || blank}</Td>
              <Td className="text-slate-500">{d.fileCount}</Td>
              <Td className="text-slate-500">{fmtDate(d.createdAt)}</Td>
            </Row>
          ))}
        </Table>
      );

    case 'budgetsAwaitingReply':
      return (
        <Table cols={['Project', 'Client', 'Owner', 'Value', 'Budget sent', 'Silent for', 'Next action']}>
          {rows.map(d => (
            <Row key={d.id}>
              <DealCell d={d} /><Td className="text-slate-500">{d.client || blank}</Td>
              <Owner d={d} /><Td className="text-slate-600">{money(d.value)}</Td>
              <Td className="text-slate-500">{fmtDate(d.budgetSentDate)}</Td>
              <Td><Waiting days={d.daysSinceSent} /></Td>
              <Td><NextAction d={d} users={users} onSave={patch} /></Td>
            </Row>
          ))}
        </Table>
      );

    case 'wonAndLost':
      return (
        <Table cols={['Project', 'Client', 'Owner', 'Value', 'Procurement', 'Design', 'Reason']}>
          {rows.map(d => (
            <Row key={d.id}>
              <DealCell d={d} /><Td className="text-slate-500">{d.client || blank}</Td>
              <Owner d={d} /><Td className="text-slate-600">{money(d.value)}</Td>
              <Td><Outcome s={d.procurementStatus} /></Td>
              <Td><Outcome s={d.designStatus} /></Td>
              <Td className="text-slate-600 max-w-xs">{d.reason || <span className="text-slate-500">no reason recorded</span>}</Td>
            </Row>
          ))}
        </Table>
      );

    case 'flagged':
      return (
        <Table cols={['Project', 'Client', 'Owner', 'Why it is flagged', '']}>
          {rows.map(d => (
            <Row key={d.id}>
              <DealCell d={d} /><Td className="text-slate-500">{d.client || blank}</Td>
              <Owner d={d} /><Td className="text-slate-600">{d.flagNote || blank}</Td>
              <Td><button onClick={() => patch(d.id, { flagged: false })}
                className="text-[11px] font-semibold text-slate-500 hover:text-green-600 whitespace-nowrap">Clear ✓</button></Td>
            </Row>
          ))}
        </Table>
      );

    case 'newLeads':
      return (
        <Table cols={['Project asked for', 'From', 'Building type', 'Waiting', '']}>
          {rows.map(d => (
            <Row key={d.id}>
              <Td><a href={`/admin/submissions`} className="font-semibold text-slate-800 hover:text-orange-600">{d.name}</a>
                {d.possibleDuplicate && <span className="ml-1.5 text-[11px] font-semibold text-amber-600">possible duplicate</span>}</Td>
              <Td className="text-slate-500">{d.from}<span className="block text-slate-500">{d.email}</span></Td>
              <Td className="text-slate-500">{d.buildingType || blank}</Td>
              <Td><Waiting days={d.daysWaiting} /></Td>
              <Td><a href="/admin/submissions" className="text-[11px] font-semibold text-amber-600 hover:text-amber-700">Review →</a></Td>
            </Row>
          ))}
        </Table>
      );

    case 'wentQuiet':
      return (
        <Table cols={['Person', 'Company', 'Tier', 'Last contact', 'Silent for', 'Their limit']}>
          {rows.map(d => (
            <Row key={d.id}>
              <Td><a href={`/crm/contacts`} className="font-semibold text-slate-800 hover:text-orange-600">{d.name}</a>
                {d.title && <span className="block text-slate-500">{d.title}</span>}</Td>
              <Td className="text-slate-500">{d.company || blank}</Td>
              <Td className="text-slate-500">{d.tier ? d.tier.replace(/_/g, ' ').toLowerCase() : '—'}</Td>
              <Td className="text-slate-500">{fmtDate(d.lastAt)}</Td>
              <Td><Waiting days={d.silentFor} /></Td>
              <Td className="text-slate-500">{d.limit}d</Td>
            </Row>
          ))}
        </Table>
      );

    // ── Maram's agenda cards (Oct 5) ─────────────────────────────────────────
    case 'newOpportunities':
      return (
        <Table cols={['Project', 'Client', 'Owner', 'Service type', 'Stage', 'Added']}>
          {rows.map(d => (
            <Row key={d.id}>
              <DealCell d={d} /><Td className="text-slate-500">{d.client || blank}</Td>
              <Owner d={d} />
              <Td className="text-slate-500">{SERVICE_TYPE_LABEL[d.serviceType] || d.serviceType || blank}</Td>
              <Td className="text-slate-500">{stageLabel(d.stage)}</Td>
              <Td className="text-slate-500">{fmtDate(d.createdAt)}</Td>
            </Row>
          ))}
        </Table>
      );

    case 'introductions':
      return (
        <Table cols={['Person', 'Who we asked', 'Client', 'Asked by', 'Asked', 'Status']}>
          {rows.map(d => (
            <Row key={d.id}>
              <Td><span className="font-semibold text-slate-800">{d.person || d.what}</span>
                {d.person && d.what && <span className="block text-slate-500 max-w-xs truncate">{d.what}</span>}</Td>
              <Td className="text-slate-500">{d.askedOf || blank}</Td>
              <Td className="text-slate-500">{d.client || blank}</Td>
              <Td className="text-slate-500">{d.askedBy || blank}</Td>
              <Td className="text-slate-500">{fmtDate(d.createdAt)}</Td>
              <Td><Chip tone={d.status === 'open' ? 'amber' : 'slate'}>{d.status}</Chip></Td>
            </Row>
          ))}
        </Table>
      );

    case 'ownership':
      return (
        <Table cols={['Project', 'Client', 'Service type', 'Where from', 'Unowned for', 'Owner']}>
          {rows.map(d => (
            <Row key={d.id}>
              <DealCell d={d} /><Td className="text-slate-500">{d.client || blank}</Td>
              <Td className="text-slate-500">{SERVICE_TYPE_LABEL[d.serviceType] || d.serviceType || blank}</Td>
              <Td>{d.fromWeb ? <Chip tone="amber">web budget</Chip> : <span className="text-slate-500">entered by hand</span>}</Td>
              <Td><Waiting days={d.daysUnowned} /></Td>
              <Td>
                <select value="" onChange={e => e.target.value && patch(d.id, { salesOwnerId: e.target.value })}
                  className="text-xs bg-transparent border border-slate-200 rounded px-1.5 py-1 outline-none focus:border-orange-500 text-slate-500">
                  <option value="">assign…</option>
                  {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </Td>
            </Row>
          ))}
        </Table>
      );

    case 'clientFollowUps':
      return (
        <Table cols={['Client', 'Waiting for', 'Project', 'Owner', 'Open for', 'Due']}>
          {rows.map((d, i) => {
            const sameClient = i > 0 && rows[i - 1].client === d.client;
            return (
              <Row key={d.id} className={sameClient ? 'border-t-0' : ''}>
                <Td className={sameClient ? 'text-transparent' : 'font-semibold text-slate-700'}>{d.client || 'No client'}</Td>
                <Td className="text-slate-600 max-w-sm">{d.what}<span className="block text-slate-500">{d.typeLabel}</span></Td>
                <Td>{d.projectId ? <a href={`/project/${d.projectId}`} className="text-slate-600 hover:text-orange-600">{d.name}</a> : <span className="text-slate-500">none</span>}</Td>
                <Owner d={d} />
                <Td><Waiting days={d.daysOpen} /></Td>
                <Td className={d.overdue ? 'text-red-600 font-semibold' : 'text-slate-500'}>{fmtDate(d.dueDate) || blank}</Td>
              </Row>
            );
          })}
        </Table>
      );

    case 'deadlines':
      return (
        <Table cols={['What', 'When', 'Project', 'Client', 'Owner']}>
          {rows.map(d => (
            <Row key={`${d.kind}-${d.id}`} className={d.overdue ? 'bg-red-50/40' : ''}>
              <Td className="text-slate-700">{d.what}{d.kind === 'step' && <span className="block text-slate-500">{d.typeLabel}</span>}</Td>
              <Td className={`font-semibold ${d.overdue ? 'text-red-600' : 'text-slate-700'}`}>{fmtDate(d.when)}</Td>
              <Td>{(d.projectId || d.kind === 'contract')
                ? <a href={`/project/${d.projectId || d.id}`} className="font-semibold text-slate-800 hover:text-orange-600">{d.name}</a>
                : <span className="text-slate-500">none</span>}</Td>
              <Td className="text-slate-500">{d.client || blank}</Td>
              <Owner d={d} />
            </Row>
          ))}
        </Table>
      );

    case 'blockers':
      return (
        <Table cols={['Project', 'Client', 'Owner', 'Why', 'Since', '']}>
          {rows.map(d => (
            <Row key={`${d.kind}-${d.id}`}>
              {d.kind === 'step'
                ? <Td>{d.projectId ? <a href={`/project/${d.projectId}`} className="font-semibold text-slate-800 hover:text-orange-600">{d.name}</a> : <span className="font-semibold text-slate-800">{d.name}</span>}</Td>
                : <DealCell d={d} />}
              <Td className="text-slate-500">{d.client || blank}</Td>
              <Owner d={d} />
              <Td className="text-slate-600 max-w-sm">
                <Chip tone={d.kind === 'flagged' ? 'red' : 'amber'}>{d.kind === 'flagged' ? 'flagged' : 'waiting'}</Chip>
                <span className="ml-2">{d.reason || <span className="text-slate-500">no reason recorded</span>}</span>
              </Td>
              <Td className="text-slate-500">{fmtDate(d.since)}</Td>
              <Td>{d.kind === 'flagged' && <button onClick={() => patch(d.id, { flagged: false })}
                className="text-[11px] font-semibold text-slate-500 hover:text-green-600 whitespace-nowrap">Clear ✓</button>}
                {d.kind === 'waiting' && <button onClick={() => patch(d.id, { nextActionType: null, nextActionOwnerId: null, nextActionDueDate: null })}
                  className="text-[11px] font-semibold text-slate-500 hover:text-green-600 whitespace-nowrap">Unblocked ✓</button>}</Td>
            </Row>
          ))}
        </Table>
      );

    default:
      return <WidgetEmpty>This card has nothing to show yet.</WidgetEmpty>;
  }
}

const SERVICE_TYPE_LABEL = Object.fromEntries(SERVICE_TYPES.map(s => [s.value, s.label]));
const stageLabel = (s) => s ? String(s).replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase()) : 'none';

const EMPTY_LINE = {
  awaitingSignature:    'Nothing waiting on a signature. 🎉',
  nextActions:          'No open next actions. Add one on any project or from the pipeline.',
  closingSoon:          'Nothing expected to close in the next two weeks.',
  proposalsSentLastWeek:'No proposals went out last week.',
  proposalsAwaiting:    'No proposals sitting unanswered.',
  designSubmissions:    'No drawing sets in or out this week.',
  budgetsAwaitingReply: 'Every budget we sent has been answered.',
  wonAndLost:           'Nothing closed since last week.',
  flagged:              'Nothing flagged.',
  newLeads:             'No website leads waiting on a review.',
  wentQuiet:            'Nobody has gone quiet past their check-in window.',
  newOpportunities:     'No new projects in the last 7 days.',
  introductions:        'No introductions asked for lately.',
  ownership:            'Every open job has an owner.',
  clientFollowUps:      'Nothing is waiting on a client right now.',
  deadlines:            'No dates landing in the next two weeks.',
  blockers:             'Nothing is waiting or blocked.',
};

// ── Add / remove / reorder the cards ──────────────────────────────────────────
function CardPicker({ layout, saving, onSave, onReset }) {
  const [picked, setPicked] = useState(layout.cards);

  const on   = k => picked.includes(k);
  const move = (i, by) => {
    const next = [...picked];
    const j = i + by;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    setPicked(next);
  };
  const toggle = k => setPicked(p => (p.includes(k) ? p.filter(x => x !== k) : [...p, k]));

  const available = layout.catalog.filter(c => !c.needs && !on(c.key));
  const notYet    = layout.catalog.filter(c => c.needs);

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 space-y-4">
      <div>
        <h3 className="text-sm font-bold text-slate-800">On the screen, in this order</h3>
        <ul className="mt-2 space-y-1">
          {picked.map((k, i) => {
            const card = layout.catalog.find(c => c.key === k) || { title: k };
            return (
              <li key={k} className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-1.5">
                <span className="flex-1 text-xs font-semibold text-slate-700">{card.title}</span>
                <button onClick={() => move(i, -1)} disabled={i === 0}
                  className="text-slate-500 hover:text-slate-700 disabled:opacity-25 text-xs px-1">↑</button>
                <button onClick={() => move(i, 1)} disabled={i === picked.length - 1}
                  className="text-slate-500 hover:text-slate-700 disabled:opacity-25 text-xs px-1">↓</button>
                <button onClick={() => toggle(k)} className="text-[11px] font-semibold text-slate-500 hover:text-red-600 px-1">remove</button>
              </li>
            );
          })}
          {picked.length === 0 && <li className="text-xs text-slate-500 py-2">Nothing chosen yet.</li>}
        </ul>
      </div>

      {available.length > 0 && (
        <div>
          <h3 className="text-sm font-bold text-slate-800">Add a card</h3>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {available.map(c => (
              <button key={c.key} onClick={() => toggle(c.key)} title={c.subtitle}
                className="text-xs px-2.5 py-1 rounded-lg bg-white border border-slate-300 text-slate-700 hover:border-orange-400 hover:text-orange-600">
                + {c.title}
              </button>
            ))}
          </div>
        </div>
      )}

      {notYet.length > 0 && (
        <div>
          <h3 className="text-sm font-bold text-slate-500">Not built yet</h3>
          <ul className="mt-2 space-y-1">
            {notYet.map(c => (
              <li key={c.key} className="text-[11px] text-slate-500">
                <span className="font-semibold text-slate-500">{c.title}</span>, needs {c.needs}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <button onClick={() => onSave(picked, 'personal')} disabled={saving}
          className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-slate-800 text-white hover:bg-slate-700 disabled:opacity-50">
          Save for me
        </button>
        {layout.canEditShared && (
          <button onClick={() => onSave(picked, 'shared')} disabled={saving}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-50">
            Save for everyone
          </button>
        )}
        {layout.hasPersonal && (
          <button onClick={onReset} disabled={saving}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-200 text-slate-500 hover:text-slate-800">
            Use the team’s set
          </button>
        )}
        {saving && <span className="text-xs text-slate-500">Saving…</span>}
      </div>
    </div>
  );
}

// ── Inline next-action editor (discrete: type + owner + due) ───────────────────
function NextAction({ d, users, onSave, inline }) {
  const set = (patch) => onSave(d.id, patch);
  const sel = 'text-xs bg-transparent border border-slate-200 rounded px-1.5 py-1 outline-none focus:border-orange-500';
  return (
    <div className={`flex ${inline ? 'gap-3' : 'gap-1.5 flex-wrap'} items-center`}>
      <select value={d.nextActionType || ''} onChange={e => set({ nextActionType: e.target.value })} className={`${sel} ${d.nextActionType ? 'font-semibold text-slate-700' : 'text-slate-500'}`}>
        <option value="">+ action…</option>
        {NEXT_ACTION_TYPES.map(a => <option key={a.key} value={a.key}>{a.label}</option>)}
      </select>
      {d.nextActionType && (
        <>
          <select value={d.nextActionOwnerId || ''} onChange={e => set({ nextActionOwnerId: e.target.value })} className={`${sel} ${d.nextActionOwnerId ? 'text-slate-700' : 'text-slate-500'}`}>
            <option value="">owner…</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
          <input type="date" value={d.nextActionDueDate ? new Date(d.nextActionDueDate).toISOString().slice(0, 10) : ''}
            onChange={e => set({ nextActionDueDate: e.target.value || null })}
            className={`${sel} ${d.overdue ? 'text-red-600 border-red-300 font-semibold' : 'text-slate-600'}`} />
        </>
      )}
    </div>
  );
}

// ── little presentational helpers ─────────────────────────────────────────────
function Section({ title, subtitle, children }) {
  return <WidgetFrame title={title} sub={subtitle}>{children}</WidgetFrame>;
}
function Table({ cols, children }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead><tr className="text-left">{cols.map((c, i) => <th key={i} className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{c}</th>)}</tr></thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
function Row({ children, className = '' }) { return <tr className={`border-t border-slate-100 align-top ${className}`}>{children}</tr>; }
function Td({ children, className = '', ...rest }) { return <td className={`px-2 py-2 ${className}`} {...rest}>{children}</td>; }
function Chip({ children, tone = 'default' }) {
  const cls = { amber: 'bg-amber-50 text-amber-700', red: 'bg-red-50 text-red-600', slate: 'bg-slate-100 text-slate-500' }[tone]
    || 'bg-slate-100 text-slate-600';
  return <span className={`px-2.5 py-1 rounded-full font-semibold ${cls}`}>{children}</span>;
}
function DealCell({ d }) {
  return <Td>{d.id
    ? <a href={`/project/${d.id}`} className="font-semibold text-slate-800 hover:text-orange-600">{d.name}</a>
    : <span className="font-semibold text-slate-800">{d.name}</span>}</Td>;
}
function Owner({ d }) {
  return <Td className={d.salesOwnerName ? 'text-slate-600 font-medium' : 'text-slate-500'}>
    {d.salesOwnerName || 'unassigned'}
  </Td>;
}
function Outcome({ s }) {
  if (!s || s === 'OPEN') return <span className="text-slate-500">open</span>;
  const cls = s === 'WON' ? 'bg-green-50 text-green-700'
    : s === 'LOST' ? 'bg-red-50 text-red-600'
      : 'bg-slate-100 text-slate-500';
  return <span className={`px-1.5 py-0.5 rounded text-[11px] font-semibold ${cls}`}>{s.toLowerCase()}</span>;
}
function Waiting({ days }) {
  if (days == null) return <span className="text-slate-500">—</span>;
  const cls = days >= 14 ? 'bg-red-50 text-red-600' : days >= 7 ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-500';
  return <span className={`px-1.5 py-0.5 rounded font-semibold ${cls}`}>{days}d</span>;
}
