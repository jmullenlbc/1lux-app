'use client';
import { useState, useEffect } from 'react';
import { CARD, TH } from '@/components/ui/tokens';
import { WidgetLoading } from '@/components/ui/WidgetFrame';

const COLUMNS = [
  { key: 'type',          label: 'Type'        },
  { key: 'location',      label: 'Location'    },
  { key: 'description',   label: 'Description' },
  { key: 'manufacturer',  label: 'Mfr'         },
  { key: 'catalogNumber', label: 'Catalog #'   },
  { key: 'finish',        label: 'Finish'      },
  { key: 'cct',           label: 'CCT'         },
  { key: 'lumens',        label: 'Lumens'      },
  { key: 'wattage',       label: 'Watts'       },
  { key: 'voltage',       label: 'Voltage'     },
  { key: 'dimming',       label: 'Dimming'     },
  { key: 'mounting',      label: 'Mounting'    },
  { key: 'notes',         label: 'Notes'       },
];

function EditableCell({ value, onSave, readOnly }) {
  const [editing, setEditing] = useState(false);
  const [local,   setLocal]   = useState(value ?? '');

  useEffect(() => setLocal(value ?? ''), [value]);

  function commit() {
    setEditing(false);
    const trimmed = local.trim();
    if (trimmed !== (value ?? '').trim()) onSave(trimmed || null);
  }

  if (readOnly || !onSave) {
    return (
      <div className="px-2 py-1.5 text-xs text-slate-700 whitespace-normal break-words min-h-[28px]">
        {value || <span className="text-slate-300 italic">—</span>}
      </div>
    );
  }

  if (editing) {
    return (
      <input
        autoFocus
        className="w-full px-2 py-1.5 text-xs bg-orange-50 border border-orange-400 rounded-lg outline-none focus:ring-2 focus:ring-orange-500"
        value={local}
        onChange={e => setLocal(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); commit(); }
          if (e.key === 'Escape') { setLocal(value ?? ''); setEditing(false); }
        }}
      />
    );
  }

  return (
    <div
      onClick={() => setEditing(true)}
      className="px-2 py-1.5 text-xs cursor-text hover:bg-orange-50 rounded-lg min-h-[28px] whitespace-normal break-words text-slate-700"
    >
      {value || <span className="text-slate-300 italic">click to edit</span>}
    </div>
  );
}

export default function SharedFixtureSchedule({ token }) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  useEffect(() => {
    fetch(`/api/share/fixture/${token}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) setError(d.error);
        else setData(d);
      })
      .catch(() => setError('Failed to load schedule'))
      .finally(() => setLoading(false));
  }, [token]);

  async function saveCell(itemId, field, value) {
    if (data?.permission !== 'edit') return;
    try {
      await fetch(`/api/share/fixture/${token}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId, field, value }),
      });
      setData(prev => ({
        ...prev,
        schedule: {
          ...prev.schedule,
          items: prev.schedule.items.map(i => i.id === itemId ? { ...i, [field]: value } : i),
        },
      }));
    } catch {}
  }

  const canEdit = data?.permission === 'edit';
  const items   = data?.schedule?.items ?? [];

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-orange-500 flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-bold text-slate-800">
              {data?.project?.name ?? 'Fixture Schedule'}
            </p>
            {data?.project?.city && data?.project?.state && (
              <p className="text-xs text-slate-500">{data.project.city}, {data.project.state}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${
            canEdit
              ? 'bg-orange-50 text-orange-700 border-orange-200'
              : 'bg-slate-100 text-slate-500 border-slate-200'
          }`}>
            {canEdit ? '✎ Edit access' : '👁 View only'}
          </span>
          <span className="text-xs text-slate-500">Shared by ILC Studios</span>
        </div>
      </div>

      <div className="max-w-[1400px] mx-auto px-4 py-6">
        {loading && (
          <div className="py-14"><WidgetLoading>Loading fixture schedule...</WidgetLoading></div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
            <p className="text-red-700 font-semibold">{error}</p>
            <p className="text-red-400 text-sm mt-1">This link may have been revoked or doesn't exist.</p>
          </div>
        )}

        {!loading && !error && (
          <>
            <div className="mb-4 flex items-center justify-between">
              <p className="text-sm text-slate-500">
                {items.length} fixture type{items.length !== 1 ? 's' : ''}
                {canEdit && <span className="ml-2 text-orange-600">· Click any cell to edit</span>}
              </p>
            </div>

            <div className={`${CARD} overflow-x-auto`}>
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    {COLUMNS.map(col => (
                      <th key={col.key} className={`${TH} whitespace-nowrap`}>
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.length === 0 && (
                    <tr>
                      <td colSpan={COLUMNS.length} className="py-12 text-center text-sm text-slate-500">
                        No fixture data in this schedule yet.
                      </td>
                    </tr>
                  )}
                  {items.map((item, idx) => (
                    <tr key={item.id} className={`border-b last:border-0 align-top ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}>
                      {COLUMNS.map(col => (
                        <td key={col.key} className="px-0.5 py-0.5">
                          <EditableCell
                            value={item[col.key]}
                            readOnly={!canEdit}
                            onSave={canEdit ? (val) => saveCell(item.id, col.key, val) : null}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="text-xs text-slate-500 text-center mt-6">
              Shared via ILC Studios Budget Platform · {canEdit ? 'Changes save automatically' : 'Read-only view'}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
