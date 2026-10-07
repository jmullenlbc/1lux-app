'use client';
import { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';

// Fields we normalize every client's pipeline into.
const FIELDS = [
  { key: 'name',          label: 'Project name',        required: true },
  { key: 'units',         label: 'Total units' },
  { key: 'startDate',     label: 'Start / closing date' },
  { key: 'projectType',   label: 'Project type (New Construction / Rehab)' },
  { key: 'buildingType',  label: 'Building type' },
  { key: 'phase',         label: 'Design phase' },
  { key: 'ilcRevenue',    label: 'ILC revenue' },
  { key: 'architect',     label: 'Architect' },
  { key: 'gc',            label: 'General contractor' },
  { key: 'gcContact',     label: 'GC contact' },
  { key: 'gcEmail',       label: 'GC contact email' },
  { key: 'address',       label: 'Address' },
  { key: 'preconManager', label: 'Pre-con manager' },
];

// Fuzzy-match a spreadsheet header to one of our fields.
function autoMap(header) {
  const h = String(header || '').toLowerCase().replace(/[\s_()$.,-]/g, '');
  if (!h) return '';
  if (h.includes('email'))                                       return 'gcEmail';
  if (h.includes('dealname') || h.includes('projectname') || h === 'name' || h === 'deal' || h === 'project') return 'name';
  if (h.includes('unit'))                                        return 'units';
  if (h.includes('closing') || h.includes('startdate') || h === 'start' || h.includes('date')) return 'startDate';
  if (h.includes('projecttype') || h.includes('constructiontype')) return 'projectType';
  if (h.includes('buildingtype') || h.includes('producttype') || h === 'type') return 'buildingType';
  if (h.includes('phase') || h.includes('stage'))                return 'phase';
  if (h.includes('revenue') || h.includes('fee'))                return 'ilcRevenue';
  if (h.includes('architect'))                                   return 'architect';
  if (h.includes('poc') || h.includes('contact'))                return 'gcContact';
  if (h.includes('generalcontractor') || h === 'gc')             return 'gc';
  if (h.includes('address'))                                     return 'address';
  if (h.includes('precon'))                                      return 'preconManager';
  return '';
}

// Excel serial date (or any date-ish value) → ISO yyyy-mm-dd.
function toISO(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') {
    const d = new Date(Math.round((v - 25569) * 86400000));
    return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? String(v).trim() : d.toISOString().slice(0, 10);
}

const money = (n) => (n ? '$' + Math.round(n).toLocaleString() : '—');
const fmtDate = (s) => {
  if (!s) return '—';
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

export default function PipelineTab({ clientId, canEdit = false }) {
  const [data, setData]   = useState(null);  // { projects, uploads }
  const [view, setView]   = useState('list'); // 'list' | 'import'
  const [fileName, setFileName] = useState('');
  const [fileB64, setFileB64]   = useState('');
  const [headers, setHeaders]   = useState([]);
  const [rawRows, setRawRows]   = useState([]);
  const [mapping, setMapping]   = useState({});
  const [saving, setSaving]     = useState(false);
  const [err, setErr]           = useState('');
  const [drag, setDrag]         = useState(false);
  const [selected, setSelected] = useState(() => new Set());
  const [perUnit, setPerUnit]   = useState('');
  const [search, setSearch]     = useState('');
  const [fType, setFType]       = useState('');
  const [fBuilding, setFBuilding] = useState('');
  const [fPhase, setFPhase]     = useState('');
  const [dateRange, setDateRange] = useState('all');
  const [sort, setSort]         = useState({ col: 'startDate', dir: 'asc' });
  const fileInput = useRef(null);

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [clientId]);
  async function load() {
    try {
      const r = await fetch(`/api/clients/${clientId}/pipeline`);
      const d = await r.json();
      setData({ projects: d.projects || [], uploads: d.uploads || [] });
      setPerUnit(d.perUnit == null ? '' : String(d.perUnit));
    } catch { setData({ projects: [], uploads: [] }); }
  }

  function handleFile(file) {
    if (!file) return;
    setErr(''); setFileName(file.name);
    const ab = new FileReader();
    ab.onload = (e) => {
      try {
        const wb   = XLSX.read(e.target.result, { type: 'array' });
        const ws   = wb.Sheets[wb.SheetNames[0]];
        const grid = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
        // header row = first of the first 10 rows with >= 3 non-empty cells
        let hi = 0;
        for (let i = 0; i < Math.min(grid.length, 10); i++) {
          if (grid[i].filter(c => String(c).trim() !== '').length >= 3) { hi = i; break; }
        }
        const hdrs = (grid[hi] || []).map((h, i) => String(h ?? '').trim() || `Column ${i + 1}`);
        const rows = grid.slice(hi + 1).filter(r => r.some(c => String(c).trim() !== ''));
        const m = {};
        hdrs.forEach((h, i) => { const f = autoMap(h); if (f && m[f] === undefined) m[f] = i; });
        setHeaders(hdrs); setRawRows(rows); setMapping(m);
        const b = new FileReader();
        b.onload = (ev) => setFileB64(ev.target.result);
        b.readAsDataURL(file);
        setView('import');
      } catch { setErr('Could not read that file — please upload an .xlsx or .xls.'); }
    };
    ab.readAsArrayBuffer(file);
  }

  // Build normalized rows from the current mapping. Walks section markers
  // ("New Construction" / "Rehab") to tag each project's type, and skips
  // subtotal/section-header rows.
  function buildRows() {
    const get = (row, key) => { const i = mapping[key]; return i != null && i !== '' ? row[i] : ''; };
    const out = [];
    let currentType = 'New Construction';
    for (const row of rawRows) {
      const name         = String(get(row, 'name') || '').trim();
      const startDate    = toISO(get(row, 'startDate'));
      const buildingType = String(get(row, 'buildingType') || '').trim();
      const gc           = String(get(row, 'gc') || '').trim();
      const isProject    = name && !/\(\d+\)\s*$/.test(name) && (startDate || buildingType || gc);
      if (!isProject) {
        // section-header row (e.g. "New Construction (72)", "Rehab (38)") flips the
        // running type. Only the name column counts — a stray "Revenue - Rehab"
        // column header must not trip it.
        const t = name.toLowerCase();
        if (t.includes('rehab'))                 currentType = 'Rehab';
        else if (t.includes('new construction')) currentType = 'New Construction';
        continue;
      }
      const mappedType = String(get(row, 'projectType') || '').trim();
      out.push({
        name,
        units:         get(row, 'units'),
        startDate,
        projectType:   mappedType || currentType,
        buildingType,
        phase:         String(get(row, 'phase') || '').trim(),
        ilcRevenue:    get(row, 'ilcRevenue'),
        architect:     String(get(row, 'architect') || '').trim(),
        gc,
        gcContact:     String(get(row, 'gcContact') || '').trim(),
        gcEmail:       String(get(row, 'gcEmail') || '').trim(),
        address:       String(get(row, 'address') || '').trim(),
        preconManager: String(get(row, 'preconManager') || '').trim(),
      });
    }
    return out;
  }

  async function doImport() {
    if (mapping.name == null || mapping.name === '') { setErr('Map the “Project name” column first.'); return; }
    const rows = buildRows();
    if (!rows.length) { setErr('No project rows found after mapping.'); return; }
    setSaving(true); setErr('');
    try {
      const res = await fetch(`/api/clients/${clientId}/pipeline`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName, fileBase64: fileB64, rows }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Import failed'); }
      await load();
      resetImport();
      setView('list');
    } catch (e) { setErr(e.message); }
    finally { setSaving(false); }
  }

  function resetImport() {
    setFileName(''); setFileB64(''); setHeaders([]); setRawRows([]); setMapping({}); setErr('');
  }

  if (data === null) {
    return <div className="flex items-center justify-center h-48 text-sm text-slate-400">Loading pipeline…</div>;
  }

  // ── Import view ──
  if (view === 'import') {
    const preview = buildRows();
    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-800">Import pipeline — <span className="text-slate-500 font-normal">{fileName}</span></h3>
          <button onClick={() => { resetImport(); setView('list'); }} className="text-xs text-slate-500 hover:text-slate-700">Cancel</button>
        </div>

        {!fileName ? (
          <DropZone drag={drag} setDrag={setDrag} onFile={handleFile} fileInput={fileInput} />
        ) : (
          <>
            <p className="text-xs text-slate-500">Match your spreadsheet columns to our fields. We guessed from the headers — adjust any that are off.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-3xl">
              {FIELDS.map(f => (
                <div key={f.key} className="flex items-center gap-2">
                  <label className="text-xs font-medium text-slate-600 w-40 shrink-0">{f.label}{f.required && <span className="text-rose-500"> *</span>}</label>
                  <select
                    value={mapping[f.key] ?? ''}
                    onChange={e => setMapping(m => ({ ...m, [f.key]: e.target.value === '' ? '' : Number(e.target.value) }))}
                    className="flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-xs bg-white">
                    <option value="">— none —</option>
                    {headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
                  </select>
                </div>
              ))}
            </div>

            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-4 py-2 border-b border-slate-100 text-xs font-semibold text-slate-600">
                Preview — {preview.length} project{preview.length !== 1 ? 's' : ''} (subtotal rows skipped)
              </div>
              <div className="overflow-x-auto max-h-72 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 sticky top-0">
                    <tr className="text-[10px] font-bold text-slate-500 uppercase">
                      <th className="px-3 py-2 text-left">Project</th><th className="px-3 py-2 text-right">Units</th>
                      <th className="px-3 py-2 text-left">Start</th><th className="px-3 py-2 text-left">Building type</th>
                      <th className="px-3 py-2 text-left">GC</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {preview.slice(0, 50).map((r, i) => (
                      <tr key={i}>
                        <td className="px-3 py-1.5 font-medium text-slate-800">{r.name}</td>
                        <td className="px-3 py-1.5 text-right text-slate-600">{r.units || '—'}</td>
                        <td className="px-3 py-1.5 text-slate-600">{fmtDate(r.startDate)}</td>
                        <td className="px-3 py-1.5 text-slate-600">{r.buildingType || '—'}</td>
                        <td className="px-3 py-1.5 text-slate-600">{r.gc || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {err && <p className="text-xs text-rose-600">{err}</p>}
            <div className="flex gap-2">
              <button onClick={doImport} disabled={saving}
                className="px-4 py-2 text-sm font-semibold rounded-lg bg-orange-500 hover:bg-orange-600 text-white disabled:opacity-50">
                {saving ? 'Importing…' : `Import ${preview.length} project${preview.length !== 1 ? 's' : ''}`}
              </button>
              <button onClick={() => resetImport()} className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 text-sm hover:bg-slate-50">Choose a different file</button>
            </div>
            <p className="text-[11px] text-slate-400">Importing syncs the live pipeline (adds new, updates existing, removes dropped projects — matched by name) and keeps this file in the history.</p>
          </>
        )}
      </div>
    );
  }

  // ── List view ──
  const { projects, uploads } = data;
  const active  = projects.filter(p => !p.dismissed);
  const removed = projects.filter(p => p.dismissed);
  const distinct = (key) => [...new Set(active.map(p => p[key]).filter(Boolean))].sort();

  const inRange = (iso) => {
    if (dateRange === 'all') return true;
    if (!iso) return false;
    const d = new Date(iso); if (Number.isNaN(d.getTime())) return false;
    const now = new Date(); const y = now.getFullYear();
    if (dateRange === '6mo')  { const e = new Date(now); e.setMonth(e.getMonth() + 6);  return d >= now && d <= e; }
    if (dateRange === '12mo') { const e = new Date(now); e.setMonth(e.getMonth() + 12); return d >= now && d <= e; }
    if (dateRange === 'year')     return d.getFullYear() === y;
    if (dateRange === 'nextyear') return d.getFullYear() === y + 1;
    return true;
  };

  const q = search.trim().toLowerCase();
  let rows = active.filter(p => {
    if (fType && p.projectType !== fType) return false;
    if (fBuilding && p.buildingType !== fBuilding) return false;
    if (fPhase && p.phase !== fPhase) return false;
    if (!inRange(p.startDate)) return false;
    if (q) {
      const hay = [p.name, p.projectType, p.buildingType, p.phase, p.gc, p.architect, p.address, p.startDate]
        .map(x => String(x || '').toLowerCase()).join(' ');
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  rows = [...rows].sort((a, b) => {
    const { col, dir } = sort; const s = dir === 'asc' ? 1 : -1;
    if (col === 'units' || col === 'ilcRevenue') return ((a[col] || 0) - (b[col] || 0)) * s;
    const av = String(a[col] ?? '').toLowerCase(), bv = String(b[col] ?? '').toLowerCase();
    return av < bv ? -s : av > bv ? s : 0;
  });

  const shownUnits  = rows.reduce((n, p) => n + (p.units || 0), 0);
  const totalValue  = (Number(perUnit) || 0) * shownUnits;
  const allSelected = rows.length > 0 && rows.every(p => selected.has(p.id));
  const filtersOn   = !!(search || fType || fBuilding || fPhase || dateRange !== 'all');

  const toggleOne = (id) => setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(rows.map(p => p.id)));
  const sortBy = (col) => setSort(s => s.col === col ? { col, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: 'asc' });
  const sortTh = (col, label, right) => (
    <th onClick={() => sortBy(col)}
      className={`px-4 py-2.5 cursor-pointer select-none hover:text-slate-700 ${right ? 'text-right' : 'text-left'}`}>
      {label}{sort.col === col ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ''}
    </th>
  );

  async function patch(ids, body) {
    if (!ids.length) return;
    await fetch(`/api/clients/${clientId}/pipeline`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids, ...body }) }).catch(() => {});
    setSelected(new Set()); await load();
  }
  async function savePerUnit(v) {
    await fetch(`/api/clients/${clientId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pipelinePerUnit: v === '' ? null : Number(v) }) }).catch(() => {});
  }
  const clearFilters = () => { setSearch(''); setFType(''); setFBuilding(''); setFPhase(''); setDateRange('all'); };

  const DATE_RANGES = [
    { id: 'all', label: 'All' }, { id: '6mo', label: 'Next 6 mo' }, { id: '12mo', label: 'Next 12 mo' },
    { id: 'year', label: 'This year' }, { id: 'nextyear', label: 'Next year' },
  ];

  return (
    <div className="space-y-5">
      {/* Stats + $/unit + value · date range · update */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-3">
          <Stat label="Projects" value={rows.length} />
          <Stat label="Total units" value={shownUnits.toLocaleString()} />
          <div className="bg-white rounded-xl border border-slate-200 px-4 py-2 min-w-[120px]">
            <div className="text-[11px] text-slate-400 font-medium mb-0.5">ILC $/unit</div>
            <div className="flex items-center text-slate-800 font-bold text-xl leading-none">
              <span className="text-slate-400 mr-0.5 text-base">$</span>
              <input type="number" value={perUnit} disabled={!canEdit} placeholder="1,600"
                onChange={e => setPerUnit(e.target.value)} onBlur={e => savePerUnit(e.target.value)}
                className="w-20 bg-transparent outline-none disabled:opacity-70" />
            </div>
          </div>
          <Stat label="Total pipeline value" value={totalValue ? money(totalValue) : '—'} />
        </div>
        <div className="flex items-center gap-3">
          <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
            {DATE_RANGES.map(({ id, label }) => (
              <button key={id} onClick={() => setDateRange(id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${dateRange === id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                {label}
              </button>
            ))}
          </div>
          {canEdit && (
            <button onClick={() => { resetImport(); setView('import'); }}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg bg-orange-500 hover:bg-orange-600 text-white">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v12m0-12l-4 4m4-4l4 4M4 20h16" /></svg>
              {projects.length ? 'Update' : 'Import'}
            </button>
          )}
        </div>
      </div>

      {projects.length === 0 ? (
        canEdit ? (
          <DropZone drag={drag} setDrag={setDrag} onFile={(f) => { handleFile(f); }} fileInput={fileInput} />
        ) : (
          <div className="py-16 text-center text-slate-400 border-2 border-dashed border-slate-200 rounded-xl">No pipeline uploaded yet.</div>
        )
      ) : (
        <>
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search any column…"
              className="flex-1 min-w-[180px] rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500" />
            <FilterSelect value={fType} onChange={setFType} options={distinct('projectType')} placeholder="All project types" />
            <FilterSelect value={fBuilding} onChange={setFBuilding} options={distinct('buildingType')} placeholder="All building types" />
            <FilterSelect value={fPhase} onChange={setFPhase} options={distinct('phase')} placeholder="All phases" />
            {filtersOn && <button onClick={clearFilters} className="text-xs text-slate-500 hover:text-slate-700">Clear</button>}
          </div>

          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            {canEdit && selected.size > 0 && (
              <div className="flex flex-wrap items-center gap-2 px-4 py-2 bg-amber-50 border-b border-amber-100">
                <span className="text-xs font-medium text-amber-800 mr-auto">{selected.size} selected</span>
                <button onClick={() => patch([...selected], { projectType: 'New Construction' })} className="px-2.5 py-1 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-50">Set New Construction</button>
                <button onClick={() => patch([...selected], { projectType: 'Rehab' })} className="px-2.5 py-1 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-50">Set Rehab</button>
                <button onClick={() => patch([...selected], { dismissed: true })} className="px-2.5 py-1 rounded-lg bg-rose-500 hover:bg-rose-600 text-white text-xs font-semibold">Remove</button>
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    {canEdit && <th className="px-4 py-2.5 w-8"><input type="checkbox" checked={allSelected} onChange={toggleAll} /></th>}
                    {sortTh('name', 'Project')}
                    {sortTh('startDate', 'Start')}
                    {sortTh('units', 'Units', true)}
                    {sortTh('projectType', 'Project type')}
                    {sortTh('buildingType', 'Building type')}
                    {sortTh('phase', 'Phase')}
                    {sortTh('gc', 'GC')}
                    {sortTh('ilcRevenue', 'Revenue', true)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {rows.map(p => (
                    <tr key={p.id} className={`hover:bg-slate-50/50 ${selected.has(p.id) ? 'bg-amber-50/40' : ''}`}>
                      {canEdit && <td className="px-4 py-2.5"><input type="checkbox" checked={selected.has(p.id)} onChange={() => toggleOne(p.id)} /></td>}
                      <td className="px-4 py-2.5 font-medium text-slate-800">{p.name}</td>
                      <td className="px-4 py-2.5 text-slate-500">{fmtDate(p.startDate)}</td>
                      <td className="px-4 py-2.5 text-right text-slate-600">{p.units?.toLocaleString() || '—'}</td>
                      <td className="px-4 py-2.5"><TypePill t={p.projectType} /></td>
                      <td className="px-4 py-2.5 text-slate-600">{p.buildingType || '—'}</td>
                      <td className="px-4 py-2.5 text-slate-600">{p.phase || '—'}</td>
                      <td className="px-4 py-2.5 text-slate-600">{p.gc || '—'}</td>
                      <td className="px-4 py-2.5 text-right text-slate-600">{money(p.ilcRevenue)}</td>
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr><td colSpan={9} className="px-4 py-8 text-center text-sm text-slate-400">No projects match the filters.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {removed.length > 0 && (
        <details className="bg-white rounded-xl border border-slate-200 px-4 py-3">
          <summary className="text-xs font-semibold text-slate-500 cursor-pointer">Removed — not working on ({removed.length})</summary>
          <div className="mt-3 space-y-1.5">
            {removed.map(p => (
              <div key={p.id} className="flex items-center justify-between text-sm">
                <span className="text-slate-500 line-through">{p.name}{p.units ? ` · ${p.units} units` : ''}</span>
                {canEdit && (
                  <button onClick={() => setDismissed([p.id], false)} className="text-xs font-semibold text-amber-600 hover:text-amber-500">Restore</button>
                )}
              </div>
            ))}
          </div>
        </details>
      )}

      {uploads.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Uploaded files</h3>
          <div className="space-y-1.5">
            {uploads.map(u => (
              <div key={u.id} className="flex items-center justify-between bg-white rounded-lg border border-slate-200 px-3 py-2 text-sm">
                <span className="flex items-center gap-2 text-slate-700">
                  <svg className="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-6h6m-6 6h6m-9 4h12a2 2 0 002-2V7l-5-4H6a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                  {u.fileName}
                  <span className="text-xs text-slate-400">· {u.rowCount} rows · {fmtDate(u.createdAt)}</span>
                </span>
                {u.url && <a href={u.url} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-amber-600 hover:text-amber-500">Download</a>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 px-4 py-2.5 text-center min-w-[110px]">
      <div className="text-xl font-bold text-slate-800">{value}</div>
      <div className="text-[11px] text-slate-400 font-medium">{label}</div>
    </div>
  );
}

function FilterSelect({ value, onChange, options, placeholder }) {
  if (!options.length) return null;
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm bg-white text-slate-600 focus:outline-none focus:ring-2 focus:ring-amber-500">
      <option value="">{placeholder}</option>
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

function TypePill({ t }) {
  if (!t) return <span className="text-slate-300">—</span>;
  const rehab = /rehab/i.test(t);
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${rehab ? 'bg-violet-50 text-violet-700 border-violet-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
      {t}
    </span>
  );
}

function DropZone({ drag, setDrag, onFile, fileInput }) {
  return (
    <div
      onDragOver={e => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={e => { e.preventDefault(); setDrag(false); onFile(e.dataTransfer.files?.[0]); }}
      onClick={() => fileInput.current?.click()}
      className={`cursor-pointer py-16 text-center border-2 border-dashed rounded-xl transition-colors ${drag ? 'border-amber-400 bg-amber-50' : 'border-slate-200 hover:border-slate-300'}`}>
      <div className="text-3xl mb-2">📥</div>
      <p className="text-sm font-medium text-slate-600">Drag &amp; drop the pipeline Excel here</p>
      <p className="text-xs text-slate-400 mt-1">or click to choose a file (.xlsx / .xls)</p>
      <input ref={fileInput} type="file" accept=".xlsx,.xls" className="hidden"
        onChange={e => onFile(e.target.files?.[0])} />
    </div>
  );
}
