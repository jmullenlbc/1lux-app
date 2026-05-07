'use client';
import { useState } from 'react';

function formatCurrencyDisplay(val) {
  if (val == null) return null;
  const num = Number(val);
  if (isNaN(num) || num <= 0) return null;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num);
}

function formatDateDisplay(val) {
  if (!val) return null;
  const d = new Date(val + 'T12:00:00');
  if (isNaN(d)) return null;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function EditableField({ display, onSave, inputType = 'text', placeholder }) {
  const [editing, setEditing] = useState(false);
  const [raw,     setRaw]     = useState('');
  const [saved,   setSaved]   = useState(false);

  function start() { setRaw(''); setEditing(true); }

  async function commit() {
    setEditing(false);
    if (!raw.trim()) return;
    await onSave(raw.trim());
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  }

  function onKey(e) {
    if (e.key === 'Enter')  commit();
    if (e.key === 'Escape') setEditing(false);
  }

  return (
    <div className="flex items-center gap-2 min-w-0">
      {editing ? (
        <input
          type={inputType}
          value={raw}
          onChange={e => setRaw(e.target.value)}
          onBlur={commit}
          onKeyDown={onKey}
          placeholder={placeholder}
          className="w-full text-base font-semibold text-slate-800 border-b border-amber-400 bg-transparent outline-none pb-0.5"
          autoFocus
        />
      ) : (
        <button onClick={start} className="group flex items-center gap-2 text-left w-full min-w-0">
          {display ? (
            <span className="text-base font-semibold text-slate-800 group-hover:text-amber-600 transition-colors truncate">
              {display}
            </span>
          ) : (
            <span className="text-sm text-slate-300 group-hover:text-slate-400 transition-colors italic">
              Not found — click to enter
            </span>
          )}
          <span className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-300 text-xs shrink-0">✎</span>
        </button>
      )}
      {saved && <span className="text-[11px] text-green-500 font-medium shrink-0">Saved</span>}
    </div>
  );
}

function Widget({ label, autoParsed, children }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl px-5 py-4 flex-1 min-w-0">
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
        {autoParsed && (
          <span className="text-[10px] text-slate-300 font-medium">auto-parsed</span>
        )}
      </div>
      {children}
    </div>
  );
}

export default function ContractWidgets({
  projectId,
  // Supply contract
  value,          onValueChange,
  signedDate,     onSignedDateChange,
  // Design contract
  designValue,    onDesignValueChange,
  designDate,     onDesignDateChange,
}) {

  async function patch(body) {
    await fetch(`/api/projects/${projectId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  async function saveSupplyValue(raw) {
    const num = parseFloat(raw.replace(/[^0-9.]/g, ''));
    const next = isNaN(num) || num <= 0 ? null : num;
    onValueChange?.(next);
    await patch({ contractValue: next });
  }
  async function saveSupplyDate(raw) {
    onSignedDateChange?.(raw || null);
    await patch({ contractSignedDate: raw || null });
  }
  async function saveDesignValue(raw) {
    const num = parseFloat(raw.replace(/[^0-9.]/g, ''));
    const next = isNaN(num) || num <= 0 ? null : num;
    onDesignValueChange?.(next);
    await patch({ designContractValue: next });
  }
  async function saveDesignDate(raw) {
    onDesignDateChange?.(raw || null);
    await patch({ designContractSignedDate: raw || null });
  }

  return (
    <div className="space-y-3 mb-6">
      {/* Row 1 — Design contract */}
      <div className="flex gap-3">
        <Widget label="Design Contract Value" autoParsed={designValue != null}>
          <EditableField
            display={formatCurrencyDisplay(designValue)}
            onSave={saveDesignValue}
            placeholder="e.g. 36200"
          />
        </Widget>
        <Widget label="Design Contract Signed Date" autoParsed={designDate != null}>
          <EditableField
            display={formatDateDisplay(designDate)}
            onSave={saveDesignDate}
            inputType="date"
          />
        </Widget>
      </div>

      {/* Row 2 — Supply contract */}
      <div className="flex gap-3">
        <Widget label="Supply Contract Value" autoParsed={value != null}>
          <EditableField
            display={formatCurrencyDisplay(value)}
            onSave={saveSupplyValue}
            placeholder="e.g. 754000"
          />
        </Widget>
        <Widget label="Supply Contract Signed Date" autoParsed={signedDate != null}>
          <EditableField
            display={formatDateDisplay(signedDate)}
            onSave={saveSupplyDate}
            inputType="date"
          />
        </Widget>
      </div>
    </div>
  );
}
