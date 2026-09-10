'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import Chart from '@/components/dashboards/Chart';
import CalibrationTable from '@/components/dashboards/CalibrationTable';
import VerificationCard from '@/components/dashboards/VerificationCard';
import { CALIBRATION_REPORTS } from '@/lib/calibration/report';
import { measuresFor, dimensionsFor, fieldByKey } from '@/lib/dashboards/fieldCatalog';
import { AGG_OPS, MATH_OPS, AGG_LABEL, MATH_LABEL } from '@/lib/dashboards/formula';

const AGG_OPTS  = AGG_OPS.map(k => ({ k, label: AGG_LABEL[k] }));
const MATH_OPTS = MATH_OPS.map(k => ({ k, label: MATH_LABEL[k] }));

export default function DashboardView({ section, sectionLabel }) {
  const [dash, setDash]       = useState(null);     // active dashboard { id, name, ownerUserId, widgets[] }
  const [meta, setMeta]       = useState({ isPersonal: false, isAdmin: false, shared: [] });
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
    setMeta({ isPersonal: !!d.isPersonal, isAdmin: !!d.isAdmin, shared: d.shared || [] });
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
    const copy = (target.widgets || []).find(w => w.position === widget.position)
              || (target.widgets || []).find(w => w.name === widget.name);
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

  async function saveWidget(spec, widget) {
    const target = await ensureEditable();
    if (!target) return;
    const body = { name: spec.name || 'Untitled', chartType: spec.chartType, width: spec.width, dataSpec: spec };
    const editId = resolveWidgetId(target, widget);
    if (editId) {
      await fetch(`/api/dashboards/${target.id}/widgets/${editId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    } else {
      await fetch(`/api/dashboards/${target.id}/widgets`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    }
    setEditor(null);
    await reloadKeepId(target.id);
  }

  async function deleteWidget(w) {
    const target = await ensureEditable(); if (!target) return;
    const wid = resolveWidgetId(target, w); if (!wid) return;
    await fetch(`/api/dashboards/${target.id}/widgets/${wid}`, { method: 'DELETE' });
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
    if (res.ok) { const d = await res.json(); setDash(d.active); setMeta(m => ({ ...m, isPersonal: !!d.isPersonal })); }
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
          {dash && <button onClick={() => setEditor({ spec: newSpec() })} className="px-3 py-1.5 rounded-lg bg-orange-500 text-white text-xs font-semibold hover:bg-orange-600">+ Widget</button>}
          {dash && <button onClick={openShare} className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50">Share</button>}
          {dash?.ownerUserId && <button onClick={resetToDefault} className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-500 hover:bg-slate-50">Reset to default</button>}
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
            <button onClick={() => setFilters([])} className="text-xs text-slate-400 hover:text-slate-700 underline">Clear all</button>
          )}
        </div>
      )}

      {!dash ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center">
          <p className="text-sm text-slate-500 mb-3">No dashboard for {sectionLabel} yet.</p>
          {meta.isAdmin
            ? <button onClick={createDefault} className="px-4 py-2 rounded-lg bg-orange-500 text-white text-sm font-semibold">Create the default</button>
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
                    <button onClick={() => toggleWidth(w)} title="Half / full width" className="text-[10px] text-slate-400 hover:text-slate-700 px-1.5 py-0.5 rounded hover:bg-slate-100">{w.width === 'FULL' ? '◧' : '▭'}</button>
                    <button onClick={() => setEditor({ widget: w, spec: specFromWidget(w) })} className="text-[10px] text-slate-400 hover:text-slate-700 px-1.5 py-0.5 rounded hover:bg-slate-100">Edit</button>
                    <button onClick={() => deleteWidget(w)} className="text-[10px] text-slate-400 hover:text-red-600 px-1.5 py-0.5 rounded hover:bg-red-50">✕</button>
                  </div>
                </div>
                <div className="px-2 py-3">
                  {r.error
                    ? <p className="text-xs text-red-500 px-2">{r.error}</p>
                    : r.chartType === 'VERIFICATION'
                      ? <VerificationCard />
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
function newSpec() { return { name: '', terms: [{ field: '', agg: 'sum' }], op: 'single', groupBy: '', timeBucket: 'month', customStart: '', customEnd: '', chartType: 'BAR', width: 'HALF' }; }
function specFromWidget(w) {
  let s = {}; try { s = typeof w.dataSpec === 'string' ? JSON.parse(w.dataSpec || '{}') : (w.dataSpec || {}); } catch {}
  // Prebuilt (kind-tagged) widgets keep their kind/report through an edit —
  // the editor only lets you retitle/resize them.
  const prebuilt = s.kind ? { kind: s.kind, report: s.report } : {};
  return { ...prebuilt, name: w.name, terms: s.terms || [{ field: '', agg: 'sum' }], op: s.op || 'single', groupBy: s.groupBy || '', timeBucket: s.timeBucket || 'month', customStart: s.customStart || '', customEnd: s.customEnd || '', chartType: w.chartType || 'BAR', width: w.width || 'HALF' };
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
  const valid = prebuilt || (spec.terms[0]?.field && (spec.op === 'single' || spec.terms[1]?.field));

  if (prebuilt) {
    const report = CALIBRATION_REPORTS[spec.report];
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-4" onClick={onClose}>
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5" onClick={e => e.stopPropagation()}>
          <h3 className="text-sm font-bold text-slate-800 mb-1">Edit widget</h3>
          <p className="text-xs text-slate-500 mb-4">{spec.kind === 'verification'
            ? <>Prebuilt card — <b>Things Needing a Look</b>. It works out its own list every time it loads, so there is no field to pick; you can retitle or resize it.</>
            : <>Prebuilt pricing-calibration widget — <b>{report?.label || spec.report}</b>. It reads the engine&apos;s model-vs-actual samples, so there is no field to pick; you can retitle or resize it.</>}</p>
          <div className="space-y-3">
            <Field label="Title"><input value={spec.name} onChange={e => set('name', e.target.value)} className="inp" /></Field>
            <Field label="Width"><select value={spec.width} onChange={e => set('width', e.target.value)} className="inp"><option value="HALF">Half</option><option value="FULL">Full</option></select></Field>
          </div>
          <div className="flex justify-end gap-2 mt-5">
            <button onClick={onClose} className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-500">Cancel</button>
            <button onClick={() => onSave(spec, init.widget)} className="px-3 py-1.5 rounded-lg bg-orange-500 text-white text-xs font-semibold">Save</button>
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

          <Field label="Group by">
            <select value={spec.groupBy} onChange={e => set('groupBy', e.target.value)} className="inp"><option value="">Single total</option>{dimensions.map(d => <option key={d.key} value={d.key}>{d.label}</option>)}</select>
          </Field>
          {dim?.type === 'date' && (
            <Field label="Time bucket"><select value={spec.timeBucket} onChange={e => set('timeBucket', e.target.value)} className="inp"><option value="week">Week</option><option value="month">Month</option><option value="quarter">Quarter</option><option value="year">Annual</option><option value="ytd">Year to Date</option><option value="custom">Custom Range</option></select></Field>
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

        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-500">Cancel</button>
          <button disabled={!valid} onClick={() => onSave(spec, init.widget)} className="px-3 py-1.5 rounded-lg bg-orange-500 text-white text-xs font-semibold disabled:opacity-40">Save</button>
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
        <div className="flex justify-end mt-3"><button onClick={onClose} className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-500">Close</button></div>
      </div>
    </div>
  );
}
