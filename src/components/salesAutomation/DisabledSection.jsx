'use client';
import { useState } from 'react';

/**
 * Collapsible "Disabled" container. Keeps soft-disabled items out of the main
 * list but one click away, so they stop affecting automations yet stay re-enableable.
 * Renders nothing when count is 0.
 */
export default function DisabledSection({ count, children, label = 'Disabled' }) {
  const [open, setOpen] = useState(false);
  if (!count) return null;
  return (
    <div className="mt-4 border border-slate-200 rounded-lg bg-slate-50/60 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-slate-100 transition-colors"
      >
        <span className="text-xs font-semibold text-slate-500 flex items-center gap-2">
          <svg className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
          {label} <span className="text-slate-400 font-normal">({count})</span>
        </span>
        <span className="text-[11px] text-slate-500">{open ? 'Hide' : 'Show'}</span>
      </button>
      {open && <div className="px-4 pb-4 pt-1">{children}</div>}
    </div>
  );
}
