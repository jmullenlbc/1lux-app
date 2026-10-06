'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import Button from '@/components/ui/Button';
import Chart from '@/components/dashboards/Chart';
import CalibrationTable from '@/components/dashboards/CalibrationTable';
import VerificationCard from '@/components/dashboards/VerificationCard';
import DeskCard from '@/components/dashboards/DeskCard';
import { CALIBRATION_REPORTS } from '@/lib/calibration/report';
import { measuresFor, dimensionsFor, fieldByKey } from '@/lib/dashboards/fieldCatalog';
import { AGG_OPS, MATH_OPS, AGG_LABEL, MATH_LABEL } from '@/lib/dashboards/formula';

const AGG_OPTS  = AGG_OPS.map(k => ({ k, label: AGG_LABEL[k] }));
const MATH_OPTS = MATH_OPS.map(k => ({ k, label: MATH_LABEL[k] }));

export default function DashboardView({ section, sectionLabel }) {
  const [dash, setDash]       = useState(null);     // active dashboard { id, name, ownerUserId, widgets[] }
  const [meta, setMeta]       = useState({ isPersonal: false, isAdmin: false, shared: [], hiddenCards: [] });
  const [series, setSeries]   = useState({});       // widgetId -> { chartType, series }
  const [loading, setLoading] = useState(true);
  const [editor, setEditor]   = useState(null);     // null | { widget? , spec }
  const [sharing, setSharing] = useState(false);
  const [users, setUsers]     = useState([]);
  const [filters, setFilters] = useState([]);       // global filters [{field, op:'is', value}]
  const [facets, setFacets]   = useState({});        // dimKey -> [values] for the filter bar
  const dragId = useRef(null);

  const measures   = measuresFor(section);
  const dimensions = dimensionsFor(section);

  // ── Load the resolved dashboard ─────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/dashboards?section=${section}`);
    const d = res.ok ? await res.json() : {};
    setDash(d.active || null);
    setMeta({ isPersonal: !!d.isPersonal, isAdmin: !!d.isAdmin, shared: d.shared || [], hiddenCards: d.hiddenCards || [] });
    setLoading(false);
  }, [section]);

  useEffect(() => { load(); }, [load]);

  // ── Render widgets → series (server-side compute) ───────────────────────────
  const render = useCallback(async (d, activeFilters) => {
    if (!d?.widgets?.length) { setSeries({}); return; }
    const res = await fetch('/api/dashboards/render', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ section, filters: activeFilters || [], widgets: d.widgets }),
    });
    if (res.ok) { const j = await res.json(); setSeries(j.results || {}); if (j.facets) setFacets(j.facets); }
  }, [section]);

  useEffect(() => { if (dash) render(dash, filters); }, [dash, filters, render]);

  // Global filter bar: set a dimension to a value (or clear it back to "All").
  function setFilter(field, value) {
    setFilters(prev => {
      const rest = prev.filter(f => f.field !== field);
      return value ? [...rest, { field, op: 'is', value }] : rest;
    });
  }
  const filterValue = (field) => filters.find(f => f.field === field)?.value || '';

  // ── Editable target: fork the admin default to a personal copy if needed ────
  // Returns the editable dashboard object (its widgets may have fresh ids if we
  // forked), or null.
  async function ensureEditable() {
    if (!dash) return null;
    const canEditDirect = dash.ownerUserId !== null || meta.isAdmin; // own personal, or admin editing default
    if (canEditDirect) return dash;
    const res = await fetch(`/api/dashboards/${dash.id}/fork`, { method: 'POST' });
    if (!res.ok) return null;
    const forked = (await res.json()).dashboard;
    setDash(forked); setMeta(m => ({ ...m, isPersonal: true }));
    return forked;
  }

  // Map a widget to its id on the editable dashboard. Same dashboard → same id;
  // a forked copy keeps the same position/name, so match on that.
  function resolveWidgetId(target, widget) {
    if (!widget) return null;
    if ((target.widgets || []).some(w => w.id === widget.id)) return widget.id;
    // Positions can repeat (two cards at 10 on the Sales default), so a
    // position-only match could hand the edit to the wrong card.
    const ws = target.widgets || [];
    const copy = ws.find(w => w.position === widget.position && w.name === widget.name)
              || ws.find(w => w.name === widget.name && w.dataSpec === widget.dataSpec)
              || ws.find(w => w.position === widget.position)
              || ws.find(w => w.name === widget.name);
    return copy?.id || null;
  }

  // ── CRUD ─────────────────────────────────────────────────────────────────────
  async function createDefault() {
    const res = await fetch('/api/dashboards', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ section, name: `${sectionLabel} Dashboard`, makeDefault: true }),
    });
    if (res.ok) load();
  }

  // Returns null on success, or a sentence the editor shows in red. Before
  // 2026-09-23 a failed save closed the editor anyway and the change vanished.
  async function saveWidget(spec, widget) {
    const target = await ensureEditable();
    if (!target) return 'Could not make your own copy of this dashboard to edit. Please try again.';
    const { legacy, ...clean } = spec;
    // An older chart with no measure picked keeps its original settings —
    // only the title and width change.
    const keepOld = legacy && !clean.terms?.[0]?.field;
    const body = keepOld
      ? { name: clean.name || 'Untitled', width: clean.width }
      : { name: clean.name || 'Untitled', chartType: clean.chartType, width: clean.width, dataSpec: clean };
    const editId = resolveWidgetId(target, widget);
    let res;
    try {
      res = editId
        ? await fetch(`/api/dashboards/${target.id}/widgets/${editId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        : await fetch(`/api/dashboards/${target.id}/widgets`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    } catch {
      return 'Could not reach the server. Check your connection and try again.';
    }
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      return j.error ? `That widget did not save: ${j.error}.` : `That widget did not save (error ${res.status}). Please try again.`;
    }
    setEditor(null);
    await reloadKeepId(target.id);
    return null;
  }

  async function deleteWidget(w) {
    const target = await ensureEditable(); if (!target) return;
    const wid = resolveWidgetId(target, w); if (!wid) return;
    await fetch(`/api/dashboards/${target.id}/widgets/${wid}`, { method: 'DELETE' });
    await reloadKeepId(target.id);
  }

  // Put back a prebuilt card that was taken off. Taking one off now lasts
  // (Mike, 2026-09-11: "Make it stick"), so there has to be a way back.
  async function putBack(key) {
    if (!key) return;
    const target = await ensureEditable(); if (!target) return;
    await fetch(`/api/dashboards/${target.id}/hidden`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key }) });
    await reloadKeepId(target.id);
  }

  async function toggleWidth(w) {
    const target = await ensureEditable(); if (!target) return;
    const wid = resolveWidgetId(target, w); if (!wid) return;
    await fetch(`/api/dashboards/${target.id}/widgets/${wid}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ width: w.width === 'FULL' ? 'HALF' : 'FULL' }) });
    await reloadKeepId(target.id);
  }

  async function reorder(fromId, toId) {
    if (!dash || fromId === toId) return;
    const ws = [...dash.widgets];
    const fi = ws.findIndex(w => w.id === fromId), ti = ws.findIndex(w => w.id === toId);
    if (fi < 0 || ti < 0) return;
    const [moved] = ws.splice(fi, 1); ws.splice(ti, 0, moved);
    setDash(d => ({ ...d, widgets: ws }));                 // optimistic
    const target = await ensureEditable(); if (!target) return;
    await Promise.all(ws.map((w, i) => {
      const wid = resolveWidgetId(target, w); if (!wid) return null;
      return fetch(`/api/dashboards/${target.id}/widgets/${wid}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ position: i }) });
    }));
  }

  async function resetToDefault() {
    if (!dash || dash.ownerUserId === null) return;
    if (!confirm('Reset to the default dashboard? Your personal changes will be removed.')) return;
    await fetch(`/api/dashboards/${dash.id}`, { method: 'DELETE' });
    load();
  }

  async function reloadKeepId(id) {
    const res = await fetch(`/api/dashboards?section=${section}`);
    if (res.ok) { const d = await res.json(); setDash(d.active); setMeta(m => ({ ...m, isPersonal: !!d.isPersonal, hiddenCards: d.hiddenCards || [] })); }
  }

  async function openShare() {
    if (!users.length) { const r = await fetch('/api/users'); if (r.ok) setUsers((await r.json()).users || []); }
    setSharing(true);
  }
  async function share(userId) {
    await fetch(`/api/dashboards/${dash.id}/share`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId }) });
    setSharing(false);
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  if (loading) return <div className="p-8 text-sm text-slate-400">Loading…</div>;

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <p className="text-[10px] font-bold text-orange-500 uppercase tracking-wider">{sectionLabel}</p>
          <h1 className="text-xl font-bold text-slate-900">{dash?.name || `${sectionLabel} Dashboard`}
            {dash && <span className={`ml-2 text-[10px] font-semibold px-2 py-0.5 rounded-full ${dash.ownerUserId ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>{dash.ownerUserId ? 'Your view' : 'Default'}</span>}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {section === 'SALES' && <Link href="/sales/visitors" className="px-3 py-1.5 rounded-lg border border-orange-200 bg-orange-50 text-orange-700 text-xs font-semibold hover:bg-orange-100">Budget page visitors</Link>}
          {/* Maram 9-17: the Brief lives here now, beside + Widget, not on the CRM boards. */}
          {section === 'SALES' && <Link href="/crm/brief" className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50" title="The written pipeline brief">Brief →</Link>}
          {dash && <Button size="sm" variant="amber" onClick={() => setEditor({ spec: newSpec() })} className="text-xs font-semibold bg-orange-500 hover:bg-orange-600">+ Widget</Button>}
          {dash && <Button size="sm" variant="secondary" onClick={openShare} className="text-xs font-semibold shadow-none">Share</Button>}
          {dash && meta.hiddenCards?.length > 0 && (
            <select value="" onChange={e => putBack(e.target.value)} title="Cards that were taken off this dashboard"
              className="text-xs rounded-lg border border-slate-200 px-2 py-1.5 text-slate-500 hover:bg-slate-50">
              <option value="">Put back a card ({meta.hiddenCards.length})</option>
              {meta.hiddenCards.map(c => <option key={c.key} value={c.key}>{c.name}</option>)}
            </select>
          )}
          {dash?.ownerUserId && <Button size="sm" variant="secondary" onClick={resetToDefault} className="text-xs font-semibold text-slate-500 shadow-none">Reset to default</Button>}
        </div>
      </div>

      {dash && Object.keys(facets).length > 0 && (
        <div className="flex items-center gap-2 flex-wrap mb-4">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mr-1">Filter</span>
          {dimensions.filter(d => d.type === 'dimension' && (facets[d.key] || []).length > 0).map(d => (
            <select key={d.key} value={filterValue(d.key)} onChange={e => setFilter(d.key, e.target.value)}
              className={`text-xs rounded-lg border px-2 py-1.5 ${filterValue(d.key) ? 'border-orange-400 bg-orange-50 text-orange-700 font-semibold' : 'border-slate-200 text-slate-600'}`}>
              <option value="">{d.label}: All</option>
              {facets[d.key].map(v => <option key={v} value={v}>{d.valueLabels?.[v] || v}</option>)}
            </select>
          ))}
          {filters.length > 0 && (
            <Button size="sm" variant="ghost" onClick={() => setFilters([])} className="text-xs text-slate-400 hover:text-slate-700 underline px-1.5 py-0.5">Clear all</Button>
          )}
        </div>
      )}

      {!dash ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center">
          <p className="text-sm text-slate-500 mb-3">No dashboard for {sectionLabel} yet.</p>
          {meta.isAdmin
            ? <Button size="md" variant="amber" onClick={createDefault} className="font-semibold bg-orange-500 hover:bg-orange-600">Create the default</Button>
            : <p className="text-xs text-slate-400">Ask an admin to set up the {sectionLabel} default.</p>}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {dash.widgets.map(w => {
            const r = series[w.id] || { chartType: w.chartType, series: [] };
            const unit = unitForWidget(section, w);
            return (
              <div key={w.id} draggable
                onDragStart={() => { dragId.current = w.id; }}
                onDragOver={e => e.preventDefault()}
                onDrop={() => { const f = dragId.current; dragId.current = null; if (f) reorder(f, w.id); }}
                className={`bg-white border border-slate-200 rounded-2xl shadow-sm ${w.width === 'FULL' ? 'col-span-2' : ''}`}>
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                  <span className="text-xs font-bold text-slate-700 cursor-grab">⠿ {w.name}</span>
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="ghost" onClick={() => toggleWidth(w)} title="Half / full width" className={CARD_BTN}>{w.width === 'FULL' ? '◧' : '▭'}</Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditor({ widget: w, spec: specFromWidget(w) })} className={CARD_BTN}>Edit</Button>
                    <Button size="sm" variant="ghost" onClick={() => deleteWidget(w)} className={`${CARD_BTN} hover:text-red-600 hover:bg-red-50`}>✕</Button>
                  </div>
                </div>
                <div className="px-2 py-3">
                  {r.error
                    ? <p className="text-xs text-red-500 px-2">{r.error}</p>
                    : r.chartType === 'VERIFICATION'
                      ? <VerificationCard />
                    : r.chartType === 'DESK'
                      ? <DeskCard />
                    : r.chartType === 'TABLE'
                      ? <CalibrationTable table={r.table} isAdmin={meta.isAdmin} onApplied={() => render(dash, filters)} />
                      : <Chart chartType={r.chartType} series={r.series} unit={unit} />}
                </div>
              </div>
            );
          })}
          {dash.widgets.length === 0 && <div className="col-span-2 text-center text-sm text-slate-400 py-10">No widgets yet — click <b>+ Widget</b>.</div>}
        </div>
      )}

      {editor && <WidgetEditor section={section} measures={measures} dimensions={dimensions} init={editor} onSave={saveWidget} onClose={() => setEditor(null)} />}
      {sharing && <ShareModal users={users} onShare={share} onClose={() => setSharing(false)} />}
    </div>
  );
}

// ── helpers ─────────────────────────────────────────────────────────────────
// The tiny buttons on a widget card's title bar (same look as before, one component).
const CARD_BTN = 'text-[10px] text-slate-400 hover:text-slate-700 px-1.5 py-0.5 rounded rounded-lg font-normal';
// What each built-in Sales card (dataSpec.tpl) is for, shown in the editor.
const TPL_DESCRIPTION = {
  'procurement-open-80':               'Open jobs, next 12 months, 80 percent and up, by expected order month.',
  'procurement-open-20':               'Open jobs, next 12 months, 20 percent and up, by expected order month.',
  'procurement-open-won-20-cumulative':'Open and won jobs, next 12 months, 20 percent and up, as a running total.',
  'procurement-won-not-ordered':       'Won jobs with no purchase order yet, expected to order in the next 6 months. A job counts as ordered once it has a shipment.',
  'design-won-not-ordered':            'Design fees on won design jobs with no purchase order yet, next 6 months.',
  'procurement-buyout-open':           'Open jobs sitting in Buyout, by client.',
  'procurement-buyout-days':           'Average days a job spent in Buyout, by owner.',
  'procurement-on-hold':               'Product and design fee revenue on jobs that are On Hold, by client.',
};
function newSpec() { return { name: '', terms: [{ field: '', agg: 'sum' }], op: 'single', groupBy: '', timeBucket: 'month', customStart: '', customEnd: '', chartType: 'BAR', width: 'HALF' }; }
function specFromWidget(w) {
  let s = {}; try { s = typeof w.dataSpec === 'string' ? JSON.parse(w.dataSpec || '{}') : (w.dataSpec || {}); } catch {}
  // Prebuilt (kind-tagged) widgets keep their kind/report through an edit —
  // the editor only lets you retitle/resize them.
  const prebuilt = s.kind ? { kind: s.kind, report: s.report } : {};
  // An older chart built before the field picker has no terms. Without this
  // flag its editor opened with every field blank and Save greyed out.
  const legacy = !s.kind && !Array.isArray(s.terms);
  return { ...prebuilt, legacy, name: w.name, terms: s.terms || [{ field: '', agg: 'sum' }], op: s.op || 'single', groupBy: s.groupBy || '', timeBucket: s.timeBucket || 'month', customStart: s.customStart || '', customEnd: s.customEnd || '', filters: s.filters || [], cumulative: !!s.cumulative, hideZero: !!s.hideZero, ...(s.tpl ? { tpl: s.tpl } : {}), chartType: w.chartType || 'BAR', width: w.width || 'HALF' };
}
function unitForWidget(section, w) {
  try {
    const s = typeof w.dataSpec === 'string' ? JSON.parse(w.dataSpec) : w.dataSpec;
    if (s?.kind === 'calibration') return CALIBRATION_REPORTS[s.report]?.unit || null;
    const f = fieldByKey(section, s?.terms?.[0]?.field); return s?.op === 'percent' ? '%' : (f?.unit || null);
  } catch { return null; }
}

// ── Widget editor modal ───────────────────────────────────────────────────────
function WidgetEditor({ section, measures, dimensions, init, onSave, onClose }) {
  const [spec, setSpec] = useState(init.spec);
  const set = (k, v) => setSpec(s => ({ ...s, [k]: v }));
  const setTerm = (i, k, v) => setSpec(s => { const t = [...s.terms]; t[i] = { ...(t[i] || { agg: 'sum' }), [k]: v }; return { ...s, terms: t }; });
  const dim = dimensions.find(d => d.key === spec.groupBy);
  const prebuilt = !!spec.kind;
  const picked = spec.terms[0]?.field && (spec.op === 'single' || spec.terms[1]?.field);
  const valid = prebuilt || picked || (spec.legacy && !spec.terms[0]?.field);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  async function save() {
    setSaving(true); setSaveError(null);
    const err = await onSave(spec, init.widget);
    if (err) { setSaveError(err); setSaving(false); }
  }
  const errorLine = saveError && <p className="mt-4 text-xs text-red-600">{saveError}</p>;

  if (prebuilt) {
    const report = CALIBRATION_REPORTS[spec.report];
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-4" onClick={onClose}>
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5" onClick={e => e.stopPropagation()}>
          <h3 className="text-sm font-bold text-slate-800 mb-1">Edit widget</h3>
          <p className="text-xs text-slate-500 mb-4">{spec.kind === 'verification'
            ? <>Prebuilt card — <b>Things Needing a Look</b>. It works out its own list every time it loads, so there is no field to pick; you can retitle or resize it.</>
            : spec.kind === 'desk'
            ? <>Prebuilt card: <b>My Desk</b>. It shows each person their own reminders and emails to review, so there is no field to pick; you can retitle or resize it.</>
            : <>Prebuilt pricing-calibration widget — <b>{report?.label || spec.report}</b>. It reads the engine&apos;s model-vs-actual samples, so there is no field to pick; you can retitle or resize it.</>}</p>
          <div className="space-y-3">
            <Field label="Title"><input value={spec.name} onChange={e => set('name', e.target.value)} className="inp" /></Field>
            <Field label="Width"><select value={spec.width} onChange={e => set('width', e.target.value)} className="inp"><option value="HALF">Half</option><option value="FULL">Full</option></select></Field>
          </div>
          {errorLine}
          <div className="flex justify-end gap-2 mt-5">
            <Button size="sm" variant="secondary" onClick={onClose} className="text-xs font-semibold text-slate-500 shadow-none">Cancel</Button>
            <Button size="sm" variant="amber" disabled={saving} onClick={save} className="text-xs font-semibold bg-orange-500 hover:bg-orange-600">{saving ? 'Saving…' : 'Save'}</Button>
          </div>
          <style jsx>{`.inp{ width:100%; border:1px solid #e2e8f0; border-radius:8px; padding:7px 9px; font-size:13px; outline:none; } .inp:focus{ border-color:#f59e0b; }`}</style>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5" onClick={e => e.stopPropagation()}>
        <h3 className="text-sm font-bold text-slate-800 mb-4">{init.widget ? 'Edit widget' : 'New widget'}</h3>
        {spec.legacy && <p className="text-xs text-slate-500 -mt-2 mb-4">This is an older chart. Save as it is to change only the title or width, or pick a measure below to rebuild it.</p>}
        {spec.tpl && <p className="text-xs text-slate-500 -mt-2 mb-4">Built-in Sales card. {TPL_DESCRIPTION[spec.tpl] || 'It arrives on every Sales dashboard by itself.'} You can change anything here and it keeps its place.</p>}
        <div className="space-y-3">
          <Field label="Title"><input value={spec.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Product $ by client" className="inp" /></Field>

          <Field label="Measure A">
            <div className="flex gap-2">
              <select value={spec.terms[0]?.field || ''} onChange={e => setTerm(0, 'field', e.target.value)} className="inp flex-1"><option value="">Pick a field…</option>{measures.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}</select>
              <select value={spec.terms[0]?.agg || 'sum'} onChange={e => setTerm(0, 'agg', e.target.value)} className="inp w-28">{AGG_OPTS.map(o => <option key={o.k} value={o.k}>{o.label}</option>)}</select>
            </div>
          </Field>

          <Field label="Math"><select value={spec.op} onChange={e => set('op', e.target.value)} className="inp">{MATH_OPTS.map(o => <option key={o.k} value={o.k}>{o.label}</option>)}</select></Field>

          {spec.op !== 'single' && (
            <Field label="Measure B">
              <div className="flex gap-2">
                <select value={spec.terms[1]?.field || ''} onChange={e => setTerm(1, 'field', e.target.value)} className="inp flex-1"><option value="">Pick a field…</option>{measures.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}</select>
                <select value={spec.terms[1]?.agg || 'sum'} onChange={e => setTerm(1, 'agg', e.target.value)} className="inp w-28">{AGG_OPTS.map(o => <option key={o.k} value={o.k}>{o.label}</option>)}</select>
              </div>
            </Field>
          )}

          {spec.filters?.length > 0 && (
            <p className="text-xs text-gray-500">Only counts projects where {spec.filters.map(f => `${(measures.concat(dimensions).find(m => m.key === f.field)?.label) || f.field} ${f.op === 'gte' ? '≥' : f.op === 'lte' ? '≤' : 'is'} ${Array.isArray(f.value) ? f.value.join(' or ') : f.value}`).join(', ')}. These stay when you save.</p>
          )}
          <Field label="Group by">
            <select value={spec.groupBy} onChange={e => set('groupBy', e.target.value)} className="inp"><option value="">Single total</option>{dimensions.map(d => <option key={d.key} value={d.key}>{d.label}</option>)}</select>
          </Field>
          {dim?.type === 'date' && (
            <Field label="Time bucket"><select value={spec.timeBucket} onChange={e => set('timeBucket', e.target.value)} className="inp"><option value="week">Week</option><option value="month">Month</option><option value="quarter">Quarter</option><option value="year">Annual</option><option value="ytd">Year to Date</option><option value="next6">Next 6 Months</option><option value="next12">Next 12 Months</option><option value="custom">Custom Range</option></select></Field>
          )}
          {dim?.type === 'date' && (
            <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={!!spec.cumulative} onChange={e => set('cumulative', e.target.checked)} /> Running total (each bar adds up everything before it)</label>
          )}
          {dim?.type === 'date' && spec.timeBucket === 'custom' && (
            <div className="flex gap-3">
              <Field label="From" className="flex-1"><input type="date" value={spec.customStart || ''} onChange={e => set('customStart', e.target.value)} className="inp" /></Field>
              <Field label="To" className="flex-1"><input type="date" value={spec.customEnd || ''} onChange={e => set('customEnd', e.target.value)} className="inp" /></Field>
            </div>
          )}

          <div className="flex gap-3">
            <Field label="Chart" className="flex-1"><select value={spec.chartType} onChange={e => set('chartType', e.target.value)} className="inp"><option value="BAR">Bar</option><option value="LINE">Line</option></select></Field>
            <Field label="Width" className="flex-1"><select value={spec.width} onChange={e => set('width', e.target.value)} className="inp"><option value="HALF">Half</option><option value="FULL">Full</option></select></Field>
          </div>
        </div>

        {errorLine}
        <div className="flex justify-end gap-2 mt-5">
          <Button size="sm" variant="secondary" onClick={onClose} className="text-xs font-semibold text-slate-500 shadow-none">Cancel</Button>
          <Button size="sm" variant="amber" disabled={!valid || saving} onClick={save} className="text-xs font-semibold bg-orange-500 hover:bg-orange-600">{saving ? 'Saving…' : 'Save'}</Button>
        </div>
      </div>
      <style jsx>{`.inp{ width:100%; border:1px solid #e2e8f0; border-radius:8px; padding:7px 9px; font-size:13px; outline:none; } .inp:focus{ border-color:#f59e0b; }`}</style>
    </div>
  );
}
function Field({ label, children, className = '' }) {
  return <label className={`block ${className}`}><span className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">{label}</span>{children}</label>;
}

function ShareModal({ users, onShare, onClose }) {
  const [q, setQ] = useState('');
  const filtered = users.filter(u => (u.name || u.email || '').toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5" onClick={e => e.stopPropagation()}>
        <h3 className="text-sm font-bold text-slate-800 mb-3">Share dashboard</h3>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search people…" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mb-2 outline-none focus:border-amber-400" />
        <div className="max-h-60 overflow-y-auto">
          {filtered.map(u => <button key={u.id} onClick={() => onShare(u.id)} className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-50 text-sm text-slate-700">{u.name || u.email}</button>)}
          {!filtered.length && <p className="text-xs text-slate-400 px-3 py-2">No people found.</p>}
        </div>
        <div className="flex justify-end mt-3"><Button size="sm" variant="secondary" onClick={onClose} className="text-xs font-semibold text-slate-500 shadow-none">Close</Button></div>
      </div>
    </div>
  );
}
