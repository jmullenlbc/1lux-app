'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';

const SEVERITY_CONFIG = {
  REQUIRED:    { label: 'Required',    dot: 'bg-red-500',    text: 'text-red-700',    badge: 'bg-red-50 text-red-700 border-red-200'    },
  RECOMMENDED: { label: 'Recommended', dot: 'bg-amber-500',  text: 'text-amber-700',  badge: 'bg-amber-50 text-amber-700 border-amber-200'  },
  NOTE:        { label: 'Note',        dot: 'bg-blue-400',   text: 'text-blue-700',   badge: 'bg-blue-50 text-blue-700 border-blue-200'   },
};

const CATEGORY_LABELS = {
  UNIT:         'Unit',
  CORRIDOR:     'Corridor',
  BOH:          'Back of House',
  GARAGE:       'Garage',
  CONTROLS:     'Controls',
  EXTERIOR:     'Exterior',
  FIXTURE_SPEC: 'Fixture Specs',
};

export default function StandardsHint({ category, className = '' }) {
  const [open,      setOpen]      = useState(false);
  const [standards, setStandards] = useState(null); // null = not loaded yet
  const [loading,   setLoading]   = useState(false);

  // Fetch on first open
  useEffect(() => {
    if (!open || standards !== null) return;
    setLoading(true);
    fetch(`/api/knowledge-base?category=${category}`)
      .then(r => r.json())
      .then(d => setStandards(d.standards || []))
      .catch(() => setStandards([]))
      .finally(() => setLoading(false));
  }, [open, category, standards]);

  const required    = standards?.filter(s => s.severity === 'REQUIRED')    || [];
  const recommended = standards?.filter(s => s.severity === 'RECOMMENDED') || [];
  const notes       = standards?.filter(s => s.severity === 'NOTE')        || [];
  const total       = standards?.length ?? 0;

  const catLabel = CATEGORY_LABELS[category] || category;

  return (
    <div className={`rounded-xl border transition-colors ${open ? 'border-blue-200 bg-blue-50/40' : 'border-slate-200 bg-white hover:border-slate-300'} ${className}`}>
      {/* Toggle header */}
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-2.5 px-4 py-3 text-left"
      >
        <span className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${open ? 'bg-blue-500' : 'bg-slate-200'}`}>
          <svg className={`w-3 h-3 ${open ? 'text-white' : 'text-slate-500'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
          </svg>
        </span>
        <span className={`text-xs font-semibold ${open ? 'text-blue-700' : 'text-slate-600'}`}>
          {catLabel} Design Standards
          {standards !== null && (
            <span className="ml-1.5 font-normal text-slate-400">
              · {required.length} required{recommended.length > 0 ? `, ${recommended.length} recommended` : ''}
            </span>
          )}
        </span>
        <svg
          className={`w-3.5 h-3.5 ml-auto shrink-0 transition-transform ${open ? 'rotate-180 text-blue-500' : 'text-slate-400'}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {/* Content */}
      {open && (
        <div className="px-4 pb-4 space-y-2">
          {loading && (
            <div className="flex items-center gap-2 py-4 text-xs text-slate-400">
              <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
              </svg>
              Loading standards…
            </div>
          )}

          {!loading && total === 0 && (
            <p className="text-xs text-slate-400 py-2">No standards found for this section.</p>
          )}

          {!loading && [...required, ...recommended, ...notes].map(std => {
            const sev = SEVERITY_CONFIG[std.severity] || SEVERITY_CONFIG.NOTE;
            const tags = (() => { try { return JSON.parse(std.tags || '[]'); } catch { return []; } })();
            return (
              <div key={std.id} className="bg-white rounded-lg border border-slate-200 p-3">
                <div className="flex items-start gap-2.5">
                  <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${sev.dot}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-semibold text-slate-800">{std.title}</span>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${sev.badge}`}>{sev.label}</span>
                    </div>
                    <p className="text-xs text-slate-600 mt-1 leading-relaxed">{std.content}</p>
                    {tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {tags.map(tag => (
                          <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                    {std.sourceUrl && (
                      <a href={std.sourceUrl} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[10px] text-blue-600 hover:text-blue-800 mt-1.5">
                        <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                        </svg>
                        Reference
                      </a>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {!loading && total > 0 && (
            <Link
              href={`/knowledge-base/${category.toLowerCase()}`}
              className="flex items-center gap-1 text-[11px] text-blue-600 hover:text-blue-800 font-medium pt-1"
            >
              View all {catLabel} standards
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
