'use client';
import { useState, useMemo, useRef } from 'react';
import { CARD, CARD_PADDED, BTN_PRIMARY, BTN_COMPACT, H1, HELPER, TD, TAB_ACTIVE, TAB_INACTIVE, NUM } from '@/components/ui/tokens';
import { FilterToolbar, FilterPanel, countFilters, SearchBox } from '@/components/ui/FilterPanel';
import SortHeader, { Th, sortRows } from '@/components/ui/SortHeader';
import { WidgetEmpty } from '@/components/ui/WidgetFrame';
import { useUrlView } from '@/lib/useUrlView';

// ── Filter helpers ────────────────────────────────────────────────────────────
function textHas(v, q) {
  if (!q) return true;
  return String(v ?? '').toLowerCase().includes(String(q).toLowerCase());
}
function inRange(n, r) {
  if (!r) return true;
  const min = r.min === '' || r.min == null ? null : Number(r.min);
  const max = r.max === '' || r.max == null ? null : Number(r.max);
  if (min === null && max === null) return true;
  if (n == null || n === '') return false;
  const x = Number(n);
  if (min !== null && x < min) return false;
  if (max !== null && x > max) return false;
  return true;
}
function yesNo(v, want) {
  if (!want) return true;
  return want === 'yes' ? !!v : !v;
}

// ── Tier badge ────────────────────────────────────────────────────────────────
const TIER_STYLES = {
  STANDARD: 'bg-blue-50 text-blue-700 border border-blue-200',
  PREMIUM:  'bg-purple-50 text-purple-700 border border-purple-200',
  ECONOMY:  'bg-slate-100 text-slate-600 border border-slate-200',
};

function TierBadge({ tier }) {
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wide ${TIER_STYLES[tier] || TIER_STYLES.STANDARD}`}>
      {tier || 'STANDARD'}
    </span>
  );
}

// ── Master type chip ──────────────────────────────────────────────────────────
function TypeChip({ code }) {
  return (
    <span className="inline-flex items-center justify-center w-8 h-6 rounded bg-orange-50 text-orange-700 text-[11px] font-bold border border-orange-200">
      {code}
    </span>
  );
}

// ── Active toggle ─────────────────────────────────────────────────────────────
function Toggle({ checked, onChange, disabled }) {
  return (
    <button
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${
        checked ? 'bg-green-500' : 'bg-slate-200'
      } ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
    >
      <span className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transform ring-0 transition-transform duration-200 ${
        checked ? 'translate-x-4' : 'translate-x-0'
      }`} />
    </button>
  );
}

// ── Inline editable cost cell ─────────────────────────────────────────────────
function CostCell({ value, onSave, disabled }) {
  const [editing, setEditing] = useState(false);
  const [draft,   setDraft]   = useState('');
  const inputRef = useRef(null);

  function startEdit() {
    if (disabled) return;
    setDraft(value != null ? String(value) : '');
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
  }

  function commit() {
    const n = draft.trim() === '' ? null : parseFloat(draft);
    if (draft.trim() !== '' && isNaN(n)) { setEditing(false); return; }
    if (n !== value) onSave(n);
    setEditing(false);
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="number"
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }}
        className="w-20 px-1.5 py-0.5 text-xs border border-orange-400 rounded-lg tabular-nums focus:outline-none focus:ring-2 focus:ring-orange-500"
        placeholder="0.00"
      />
    );
  }

  return (
    <button onClick={startEdit} disabled={disabled}
      className={`text-xs font-mono tabular-nums text-right w-20 px-1.5 py-0.5 rounded-lg hover:bg-slate-100 transition-colors ${
        value == null ? 'text-slate-400 italic' : 'text-slate-700'
      } ${disabled ? 'cursor-default' : 'cursor-pointer'}`}>
      {value != null ? `$${Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '-'}
    </button>
  );
}

// ── Tier selector ─────────────────────────────────────────────────────────────
function TierSelect({ value, onChange, disabled }) {
  if (disabled) return <TierBadge tier={value} />;
  return (
    <select
      value={value || 'STANDARD'}
      onChange={e => onChange(e.target.value)}
      className="text-[11px] font-semibold uppercase border border-slate-300 rounded-lg px-1 py-0.5 bg-white focus:outline-none focus:ring-2 focus:ring-orange-500 cursor-pointer"
    >
      <option value="STANDARD">STANDARD</option>
      <option value="PREMIUM">PREMIUM</option>
      <option value="ECONOMY">ECONOMY</option>
    </select>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  TABS
// ─────────────────────────────────────────────────────────────────────────────

// ── ILC Specs Tab ─────────────────────────────────────────────────────────────
const SPEC_FIELDS = [
  { key: 'type',         label: 'Type',         kind: 'pick' },
  { key: 'family',       label: 'Family',       kind: 'text' },
  { key: 'manufacturer', label: 'Manufacturer', kind: 'text' },
  { key: 'catalog',      label: 'Base catalog', kind: 'text' },
  { key: 'cost',         label: 'Budget cost',  kind: 'range' },
  { key: 'tier',         label: 'Tier',         kind: 'pick' },
  { key: 'default',      label: 'Default',      kind: 'yesno' },
  { key: 'active',       label: 'Active',       kind: 'yesno' },
];
const SPEC_GETTERS = {
  type:         s => s.master_type_id,
  family:       s => s.family,
  manufacturer: s => s.manufacturer,
  catalog:      s => s.base_catalog,
  cost:         s => (s.budget_cost == null ? null : Number(s.budget_cost)),
  tier:         s => s.tier || 'STANDARD',
};

function SpecsTab({ initialSpecs, masterTypes }) {
  const [specs,   setSpecs]   = useState(initialSpecs);
  const [search,  setSearch]  = useState('');
  const [saving,  setSaving]  = useState({});   // { [id]: true }
  const [panelOpen, setPanelOpen] = useState(false);
  const { filters, setFilter, clearFilters, sort, toggleSort } = useUrlView({ fields: SPEC_FIELDS });

  const typeOptions = useMemo(() => {
    const used = [...new Set(specs.map(s => s.master_type_id))].sort();
    return used;
  }, [specs]);

  const choices = useMemo(() => ({
    type: typeOptions.map(code => [code, `${code} (${specs.filter(s => s.master_type_id === code).length})`]),
    tier: ['STANDARD', 'PREMIUM', 'ECONOMY'],
  }), [typeOptions, specs]);

  const filtered = useMemo(() => {
    let list = specs;
    if (filters.type) list = list.filter(s => s.master_type_id === filters.type);
    if (filters.family) list = list.filter(s => textHas(s.family, filters.family));
    if (filters.manufacturer) list = list.filter(s => textHas(s.manufacturer, filters.manufacturer));
    if (filters.catalog) list = list.filter(s => textHas(s.base_catalog, filters.catalog) || textHas(s.full_catalog, filters.catalog));
    if (filters.cost) list = list.filter(s => inRange(s.budget_cost, filters.cost));
    if (filters.tier) list = list.filter(s => (s.tier || 'STANDARD') === filters.tier);
    if (filters.default) list = list.filter(s => yesNo(s.is_default, filters.default));
    if (filters.active) list = list.filter(s => yesNo(s.is_active, filters.active));
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(s =>
        s.description?.toLowerCase().includes(q) ||
        s.manufacturer?.toLowerCase().includes(q) ||
        s.base_catalog?.toLowerCase().includes(q) ||
        s.family?.toLowerCase().includes(q) ||
        s.master_type_id?.toLowerCase().includes(q)
      );
    }
    return sortRows(list, sort, SPEC_GETTERS);
  }, [specs, filters, search, sort]);

  async function patchSpec(id, patch) {
    setSaving(prev => ({ ...prev, [id]: true }));
    try {
      const res = await fetch(`/api/fixture-library/specs/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error('Save failed');
      const updated = await res.json();
      setSpecs(prev => prev.map(s => s.id === id ? { ...s, ...updated } : s));
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(prev => ({ ...prev, [id]: false }));
    }
  }

  const masterTypeMap = Object.fromEntries(masterTypes.map(m => [m.code, m]));
  const filterCount = countFilters(filters, SPEC_FIELDS);

  return (
    <div>
      {/* Filter bar */}
      <div className="mb-4">
        <FilterToolbar
          count={filterCount}
          open={panelOpen}
          onToggle={() => setPanelOpen(o => !o)}
          onClear={clearFilters}
          shown={filtered.length}
          total={specs.length}
          noun="specs"
          right={<SearchBox value={search} onChange={setSearch} placeholder="Search specs..." />}
        />
        <FilterPanel open={panelOpen} fields={SPEC_FIELDS} filters={filters} choices={choices} onChange={setFilter} />
      </div>

      {/* Stats row */}
      <div className={`flex items-center gap-4 mb-4 ${HELPER} ${NUM}`}>
        <span>{filtered.length} spec{filtered.length !== 1 ? 's' : ''} shown</span>
        <span>·</span>
        <span>{specs.filter(s => s.is_active).length} active</span>
        <span>·</span>
        <span>{specs.filter(s => s.is_default).length} defaults set</span>
        <span>·</span>
        <span>{specs.filter(s => s.budget_cost != null).length} with costs</span>
      </div>

      {/* Table */}
      <div className={`overflow-x-auto ${CARD}`}>
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <SortHeader label="Type" field="type" sort={sort} onSort={toggleSort} className="w-12" />
              <SortHeader label="Family / Description" field="family" sort={sort} onSort={toggleSort} />
              <SortHeader label="Manufacturer" field="manufacturer" sort={sort} onSort={toggleSort} />
              <SortHeader label="Base Catalog" field="catalog" sort={sort} onSort={toggleSort} />
              <SortHeader label="Budget Cost" field="cost" sort={sort} onSort={toggleSort} align="right" />
              <SortHeader label="Tier" field="tier" sort={sort} onSort={toggleSort} className="text-center" />
              <Th className="text-center w-14">Default</Th>
              <Th className="text-center w-14">Active</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map(spec => {
              const isSaving = saving[spec.id];
              return (
                <tr key={spec.id} className={`transition-colors ${spec.is_active ? 'hover:bg-slate-50' : 'bg-slate-50/50 opacity-60 hover:opacity-80'}`}>
                  <td className="px-3 py-2.5">
                    <TypeChip code={spec.master_type_id} />
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="font-medium text-slate-800">{spec.family}</div>
                    {spec.description && (
                      <div className="text-slate-500 text-[11px] mt-0.5 max-w-xs truncate">{spec.description}</div>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-slate-600">{spec.manufacturer || <span className="text-slate-400">-</span>}</td>
                  <td className="px-3 py-2.5">
                    <span className="font-mono text-slate-700">{spec.base_catalog || <span className="text-slate-400">-</span>}</span>
                    {spec.full_catalog && spec.full_catalog !== spec.base_catalog && (
                      <div className="text-[11px] text-slate-500 font-mono mt-0.5">{spec.full_catalog}</div>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    <CostCell
                      value={spec.budget_cost}
                      onSave={v => patchSpec(spec.id, { budget_cost: v })}
                      disabled={isSaving}
                    />
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <TierSelect
                      value={spec.tier}
                      onChange={t => patchSpec(spec.id, { tier: t })}
                      disabled={isSaving}
                    />
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <button
                      onClick={() => patchSpec(spec.id, { is_default: !spec.is_default })}
                      disabled={isSaving}
                      title={spec.is_default ? 'Remove default' : 'Set as default for this type'}
                      className={`transition-colors ${spec.is_default ? 'text-orange-500' : 'text-slate-200 hover:text-slate-400'} disabled:opacity-40`}
                    >
                      <svg className="w-4 h-4 mx-auto" fill={spec.is_default ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.562.562 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
                      </svg>
                    </button>
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <Toggle
                      checked={spec.is_active}
                      onChange={v => patchSpec(spec.id, { is_active: v })}
                      disabled={isSaving}
                    />
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-6">
                  <WidgetEmpty>
                    No specs found. {search ? `No results for "${search}".` : 'No specs match the current filter.'}
                  </WidgetEmpty>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className={`${HELPER} mt-3 text-right`}>
        Click a cost to edit inline · Click ★ to set/unset default · Tier dropdown to change tier
      </p>
    </div>
  );
}

// ── Master Types Tab ──────────────────────────────────────────────────────────
const MT_FIELDS = [
  { key: 'mt_code',   label: 'Code',           kind: 'text' },
  { key: 'mt_family', label: 'Fixture family', kind: 'text' },
  { key: 'mt_unit',   label: 'Unit type',      kind: 'yesno' },
  { key: 'mt_specs',  label: 'ILC specs',      kind: 'range' },
  { key: 'mt_active', label: 'Active',         kind: 'yesno' },
];

function MasterTypesTab({ initialMasterTypes, specCounts }) {
  const [types,  setTypes]  = useState(initialMasterTypes);
  const [saving, setSaving] = useState({});
  const [panelOpen, setPanelOpen] = useState(false);
  const { filters, setFilter, clearFilters, sort, toggleSort } = useUrlView({ fields: MT_FIELDS });

  async function patchType(code, patch) {
    setSaving(prev => ({ ...prev, [code]: true }));
    try {
      const res = await fetch(`/api/fixture-library/master-types/${code}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error('Save failed');
      const updated = await res.json();
      setTypes(prev => prev.map(t => t.code === code ? { ...t, ...updated } : t));
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(prev => ({ ...prev, [code]: false }));
    }
  }

  const active   = types.filter(t => t.is_active).length;
  const unitTypes = types.filter(t => t.is_unit_type).length;

  const getters = useMemo(() => ({
    mt_code:   t => t.code,
    mt_family: t => t.fixture_family,
    mt_unit:   t => (t.is_unit_type ? 1 : 0),
    mt_specs:  t => specCounts[t.code] || 0,
    mt_active: t => (t.is_active ? 1 : 0),
  }), [specCounts]);

  const filtered = useMemo(() => {
    let list = types;
    if (filters.mt_code) list = list.filter(t => textHas(t.code, filters.mt_code));
    if (filters.mt_family) list = list.filter(t => textHas(t.fixture_family, filters.mt_family));
    if (filters.mt_unit) list = list.filter(t => yesNo(t.is_unit_type, filters.mt_unit));
    if (filters.mt_specs) list = list.filter(t => inRange(specCounts[t.code] || 0, filters.mt_specs));
    if (filters.mt_active) list = list.filter(t => yesNo(t.is_active, filters.mt_active));
    return sortRows(list, sort, getters);
  }, [types, filters, sort, getters, specCounts]);

  return (
    <div>
      <div className="mb-4">
        <FilterToolbar
          count={countFilters(filters, MT_FIELDS)}
          open={panelOpen}
          onToggle={() => setPanelOpen(o => !o)}
          onClear={clearFilters}
          shown={filtered.length}
          total={types.length}
          noun="master types"
        />
        <FilterPanel open={panelOpen} fields={MT_FIELDS} filters={filters} onChange={setFilter} />
      </div>

      <div className={`flex items-center gap-4 mb-4 ${HELPER} ${NUM}`}>
        <span>{types.length} master types total</span>
        <span>·</span>
        <span>{active} active</span>
        <span>·</span>
        <span>{unitTypes} unit-drawing types</span>
      </div>

      <div className={`overflow-x-auto ${CARD}`}>
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <SortHeader label="Code" field="mt_code" sort={sort} onSort={toggleSort} className="w-16" />
              <SortHeader label="Fixture Family" field="mt_family" sort={sort} onSort={toggleSort} />
              <SortHeader label="Unit Type" field="mt_unit" sort={sort} onSort={toggleSort} className="text-center w-24" />
              <SortHeader label="ILC Specs" field="mt_specs" sort={sort} onSort={toggleSort} className="text-center w-20" />
              <SortHeader label="Active" field="mt_active" sort={sort} onSort={toggleSort} className="text-center w-16" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {types.length > 0 && filtered.length === 0 && (
              <tr><td colSpan={5}><WidgetEmpty>No master types match the current filter.</WidgetEmpty></td></tr>
            )}
            {filtered.map(t => {
              const isSaving = saving[t.code];
              const count    = specCounts[t.code] || 0;
              return (
                <tr key={t.code} className={`transition-colors ${t.is_active ? 'hover:bg-slate-50' : 'bg-slate-50/50 opacity-60 hover:opacity-80'}`}>
                  <td className="px-3 py-2.5">
                    <TypeChip code={t.code} />
                  </td>
                  <td className="px-3 py-2.5 font-medium text-slate-700">{t.fixture_family}</td>
                  <td className="px-3 py-2.5 text-center">
                    {t.is_unit_type ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                        Unit Type
                      </span>
                    ) : (
                      <span className="text-slate-400">-</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-center tabular-nums">
                    {count > 0 ? (
                      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-orange-50 text-orange-700 font-bold text-[11px] tabular-nums">
                        {count}
                      </span>
                    ) : (
                      <span className="text-slate-400">0</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <Toggle
                      checked={t.is_active}
                      onChange={v => patchType(t.code, { is_active: v })}
                      disabled={isSaving}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Fixture Types Tab ─────────────────────────────────────────────────────────
const FT_FIELDS = [
  { key: 'ft_code',   label: 'Code',        kind: 'text' },
  { key: 'ft_master', label: 'Master',      kind: 'pick' },
  { key: 'ft_family', label: 'Family',      kind: 'text' },
  { key: 'ft_desc',   label: 'Description', kind: 'text' },
  { key: 'ft_active', label: 'Active',      kind: 'yesno' },
];
const FT_GETTERS = {
  ft_code:   t => t.code,
  ft_master: t => t.master_type_id,
  ft_family: t => t.family,
  ft_desc:   t => t.description,
  ft_active: t => (t.is_active ? 1 : 0),
};

function FixtureTypesTab({ initialFixtureTypes, masterTypes }) {
  const [types,   setTypes]  = useState(initialFixtureTypes);
  const [search,  setSearch] = useState('');
  const [saving,  setSaving] = useState({});
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const fileRef = useRef(null);
  const { filters, setFilter, clearFilters, sort, toggleSort } = useUrlView({ fields: FT_FIELDS });

  const choices = useMemo(() => ({
    ft_master: [...new Set(types.map(t => t.master_type_id).filter(Boolean))].sort(),
  }), [types]);

  const filtered = useMemo(() => {
    let list = types;
    if (filters.ft_code) list = list.filter(t => textHas(t.code, filters.ft_code));
    if (filters.ft_master) list = list.filter(t => t.master_type_id === filters.ft_master);
    if (filters.ft_family) list = list.filter(t => textHas(t.family, filters.ft_family));
    if (filters.ft_desc) list = list.filter(t => textHas(t.description, filters.ft_desc));
    if (filters.ft_active) list = list.filter(t => yesNo(t.is_active, filters.ft_active));
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(t =>
        t.code?.toLowerCase().includes(q) ||
        t.family?.toLowerCase().includes(q) ||
        t.master_type_id?.toLowerCase().includes(q)
      );
    }
    return sortRows(list, sort, FT_GETTERS);
  }, [types, filters, search, sort]);

  async function handleCSVUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadMsg(null);

    const text = await file.text();
    const res  = await fetch('/api/fixture-library/fixture-types/import', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: text,
    });
    const data = await res.json();

    if (res.ok) {
      setUploadMsg({ ok: true, msg: `✓ ${data.upserted} fixture types imported, ${data.skipped} skipped.` });
      // Reload list
      const listRes = await fetch('/api/fixture-library/fixture-types');
      if (listRes.ok) setTypes(await listRes.json());
    } else {
      setUploadMsg({ ok: false, msg: data.error || 'Import failed.' });
    }
    setUploading(false);
    e.target.value = '';
  }

  async function patchType(code, patch) {
    setSaving(prev => ({ ...prev, [code]: true }));
    try {
      const res = await fetch(`/api/fixture-library/fixture-types/${code}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error('Save failed');
      const updated = await res.json();
      setTypes(prev => prev.map(t => t.code === code ? { ...t, ...updated } : t));
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(prev => ({ ...prev, [code]: false }));
    }
  }

  if (types.length === 0) {
    return (
      <div>
        {/* Upload section */}
        <div className={`${CARD} p-8 text-center mb-6`}>
          <h3 className="text-sm font-semibold text-slate-800 mb-1">No Fixture Types Imported Yet</h3>
          <p className="text-xs text-slate-500 mb-4 max-w-sm mx-auto">
            Upload the <span className="font-mono bg-slate-100 px-1 rounded">ILC_-_Types_2026-05-21.csv</span> from
            Trackvia to populate the Fixture Types table. Required columns: <strong>Type Code</strong>, <strong>Master Type</strong>, <strong>Family</strong>.
          </p>
          <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleCSVUpload} />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className={BTN_PRIMARY}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" /></svg>
            {uploading ? 'Importing…' : 'Upload CSV'}
          </button>
          {uploadMsg && (
            <div className={`mt-3 text-xs font-medium ${uploadMsg.ok ? 'text-green-600' : 'text-red-600'}`}>
              {uploadMsg.msg}
            </div>
          )}
        </div>

        {/* CSV format hint */}
        <div className={CARD_PADDED}>
          <h4 className="text-sm font-semibold text-slate-800 mb-2">Expected CSV Format</h4>
          <pre className="text-[11px] text-slate-600 bg-slate-50 rounded-lg p-3 overflow-x-auto font-mono">
{`Type Code,Master Type,Family,Description,Active
C1,C,CEILING SURFACE,Standard Ceiling Dome,yes
C2,C,CEILING SURFACE,Large Ceiling Dome,yes
D1,D,RECESSED DOWNLIGHT,4" Adjustable,yes
D2,D,RECESSED DOWNLIGHT,6" Fixed,yes`}
          </pre>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4">
        <FilterToolbar
          count={countFilters(filters, FT_FIELDS)}
          open={panelOpen}
          onToggle={() => setPanelOpen(o => !o)}
          onClear={clearFilters}
          shown={filtered.length}
          total={types.length}
          noun="types"
          right={(
            <>
              <SearchBox value={search} onChange={setSearch} placeholder="Search fixture types..." />
              <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleCSVUpload} />
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className={BTN_COMPACT}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" /></svg>
                {uploading ? 'Importing…' : 'Re-import CSV'}
              </button>
            </>
          )}
        />
        <FilterPanel open={panelOpen} fields={FT_FIELDS} filters={filters} choices={choices} onChange={setFilter} />
      </div>

      {uploadMsg && (
        <div className={`mb-4 px-4 py-2 rounded-lg text-xs font-medium ${uploadMsg.ok ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {uploadMsg.msg}
        </div>
      )}

      <div className={`overflow-x-auto ${CARD}`}>
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <SortHeader label="Code" field="ft_code" sort={sort} onSort={toggleSort} className="w-20" />
              <SortHeader label="Master" field="ft_master" sort={sort} onSort={toggleSort} className="w-16" />
              <SortHeader label="Family" field="ft_family" sort={sort} onSort={toggleSort} />
              <SortHeader label="Description" field="ft_desc" sort={sort} onSort={toggleSort} />
              <SortHeader label="Active" field="ft_active" sort={sort} onSort={toggleSort} className="text-center w-16" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map(t => (
              <tr key={t.code} className={`transition-colors ${t.is_active ? 'hover:bg-slate-50' : 'bg-slate-50/50 opacity-60 hover:opacity-80'}`}>
                <td className="px-3 py-2.5 font-mono font-semibold text-slate-700">{t.code}</td>
                <td className="px-3 py-2.5"><TypeChip code={t.master_type_id} /></td>
                <td className="px-3 py-2.5 text-slate-600">{t.family}</td>
                <td className="px-3 py-2.5 text-slate-500">{t.description || <span className="text-slate-400">-</span>}</td>
                <td className="px-3 py-2.5 text-center">
                  <Toggle
                    checked={t.is_active}
                    onChange={v => patchType(t.code, { is_active: v })}
                    disabled={saving[t.code]}
                  />
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={5}><WidgetEmpty>{search ? `No fixture types match "${search}"` : 'No fixture types match the current filter.'}</WidgetEmpty></td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
const TABS = [
  { key: 'specs',        label: 'ILC Specs',     count: null },
  { key: 'master-types', label: 'Master Types',  count: null },
  { key: 'fixture-types',label: 'Fixture Types', count: null },
];

export default function FixtureLibraryClient({ initialMasterTypes, initialSpecs, initialFixtureTypes }) {
  const [tab, setTab] = useState('specs');

  const specCounts = useMemo(() => {
    const counts = {};
    initialSpecs.forEach(s => { counts[s.master_type_id] = (counts[s.master_type_id] || 0) + 1; });
    return counts;
  }, [initialSpecs]);

  const tabCounts = {
    'specs':         initialSpecs.length,
    'master-types':  initialMasterTypes.length,
    'fixture-types': initialFixtureTypes.length,
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Page header */}
      <div className="bg-white border-b border-slate-200 px-6 py-5 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-orange-50 flex items-center justify-center text-lg shrink-0">
                🔦
              </div>
              <div>
                <h1 className={H1}>Fixture Library</h1>
                <p className={HELPER}>ILC standard product selections, master types &amp; fixture types</p>
              </div>
            </div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-orange-50 border border-orange-200 text-xs font-semibold text-orange-700">
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" /></svg>
              ILC Admin Only
            </div>
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-1 mt-4 -mb-px">
            {TABS.map(t => (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`flex items-center gap-1.5 px-4 py-2 text-xs font-semibold border-b-2 transition-colors ${
                  tab === t.key ? TAB_ACTIVE : TAB_INACTIVE
                }`}>
                {t.label}
                <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-full tabular-nums ${
                  tab === t.key ? 'bg-orange-50 text-orange-700' : 'bg-slate-100 text-slate-500'
                }`}>
                  {tabCounts[t.key]}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tab content */}
      <div className="max-w-6xl mx-auto px-6 py-6">
        {tab === 'specs' && (
          <SpecsTab initialSpecs={initialSpecs} masterTypes={initialMasterTypes} />
        )}
        {tab === 'master-types' && (
          <MasterTypesTab initialMasterTypes={initialMasterTypes} specCounts={specCounts} />
        )}
        {tab === 'fixture-types' && (
          <FixtureTypesTab initialFixtureTypes={initialFixtureTypes} masterTypes={initialMasterTypes} />
        )}
      </div>
    </div>
  );
}
