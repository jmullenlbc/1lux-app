'use client';
import { useState, useEffect, useCallback } from 'react';

// Client-level Standard Fixture Schedule — the typed list assembled after spec
// approvals. Mirrors the project fixture schedule columns (minus SKU-locking: the
// exact manufacturer/catalog is picked per project). Cells autosave on blur.

// Column order mirrors the LAC "National Lighting Schedule" sheet. (Image + Target $
// live on Product Options, not here — this is the spec schedule.)
const COLS = [
  { key: 'typeCode',      label: 'Type',        w: 'w-16' },
  { key: 'location',      label: 'Location',    w: 'w-32' },
  { key: 'description',   label: 'Description',  w: 'w-56' },
  { key: 'manufacturer',  label: 'Manufacturer', w: 'w-28' },
  { key: 'catalogNumber', label: 'Catalog #',   w: 'w-32' },
  { key: 'finish',        label: 'Finish',      w: 'w-24' },
  { key: 'cct',           label: 'CCT',         w: 'w-20' },
  { key: 'lumens',        label: 'Lumens',      w: 'w-20' },
  { key: 'wattage',       label: 'Watts',       w: 'w-20' },
  { key: 'voltage',       label: 'Voltage',     w: 'w-20' },
  { key: 'dimming',       label: 'Dim',         w: 'w-24' },
  { key: 'mounting',      label: 'Mounting',    w: 'w-24' },
  { key: 'notes',         label: 'Notes',       w: 'w-48' },
];

const LOCATIONS = ['', 'UNITS', 'CORRIDOR', 'GARAGE', 'BOH', 'AMENITY', 'EXTERIOR', 'EMERGENCY'];

export default function StandardFixtureScheduleTab({ clientId, canEdit }) {
  const [rows, setRows]     = useState([]);
  const [loading, setLoad]  = useState(true);

  const load = useCallback(async () => {
    setLoad(true);
    const r = await fetch(`/api/clients/${clientId}/standard-fixtures`);
    setRows(r.ok ? (await r.json()).fixtures || [] : []);
    setLoad(false);
  }, [clientId]);
  useEffect(() => { load(); }, [load]);

  async function addRow() {
    const r = await fetch(`/api/clients/${clientId}/standard-fixtures`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sortOrder: rows.length }),
    });
    if (r.ok) { const f = (await r.json()).fixture; setRows(rs => [...rs, f]); }
  }

  async function saveCell(rowId, key, value) {
    setRows(rs => rs.map(r => r.id === rowId ? { ...r, [key]: value } : r));
    await fetch(`/api/clients/${clientId}/standard-fixtures`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rowId, [key]: value }),
    });
  }

  async function delRow(rowId) {
    if (!confirm('Remove this fixture row?')) return;
    setRows(rs => rs.filter(r => r.id !== rowId));
    await fetch(`/api/clients/${clientId}/standard-fixtures?rowId=${rowId}`, { method: 'DELETE' });
  }

  if (loading) return <div className="p-6 text-sm text-slate-400">Loading fixture schedule…</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">Standard Fixture Schedule</h3>
          <p className="text-xs text-slate-500">The client's blessed fixture types — assembled after spec approvals. Exact SKUs are picked per project.</p>
        </div>
        {canEdit && <button onClick={addRow} className="px-3 py-1.5 rounded-lg bg-amber-500 text-white text-xs font-semibold hover:bg-amber-600">+ Fixture</button>}
      </div>

      {rows.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center text-sm text-slate-500">
          No standard fixtures yet.{canEdit && <> Click <b>+ Fixture</b> to add the first row.</>}
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-x-auto">
          <table className="text-xs min-w-full border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-500 text-left">
                {COLS.map(c => <th key={c.key} className={`border border-slate-200 px-2 py-2 font-semibold ${c.w}`}>{c.label}</th>)}
                {canEdit && <th className="border border-slate-200 px-2 py-2 w-10" />}
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.id} className="align-top hover:bg-amber-50/30">
                  {COLS.map(c => (
                    <td key={c.key} className="border border-slate-200 p-0">
                      {c.key === 'location' ? (
                        <select defaultValue={row[c.key] || ''} disabled={!canEdit}
                          onChange={e => saveCell(row.id, c.key, e.target.value)}
                          className="w-full bg-transparent focus:bg-amber-50 outline-none pl-2 pr-7 py-1.5 cursor-pointer">
                          {LOCATIONS.map(l => <option key={l} value={l}>{l || '—'}</option>)}
                        </select>
                      ) : (
                        <input defaultValue={row[c.key] ?? ''} disabled={!canEdit}
                          type={c.num ? 'number' : 'text'}
                          onBlur={e => { const v = e.target.value; if (String(row[c.key] ?? '') !== v) saveCell(row.id, c.key, v); }}
                          className={`w-full bg-transparent focus:bg-amber-50 outline-none px-2 py-1.5 ${c.key === 'typeCode' ? 'font-semibold text-slate-800' : 'text-slate-600'}`} />
                      )}
                    </td>
                  ))}
                  {canEdit && (
                    <td className="border border-slate-200 px-2 py-1.5 text-center">
                      <button onClick={() => delRow(row.id)} title="Remove" className="text-slate-300 hover:text-red-500">✕</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
