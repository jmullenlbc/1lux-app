'use client';
/**
 * "Upload your drawings" — the questionnaires' front door to the extractors.
 *
 * Before this existed, every drawing-reading pipeline lived on the Project
 * Hub's Takeoffs tab, and someone filling out a questionnaire was never told
 * uploading was possible — they typed numbers a drawing already stated. This
 * panel puts both extractors (unit matrix, site plan) at the Project Data step
 * of BOTH questionnaires, which share that step, so it is one mount point each.
 *
 * It deliberately hosts the SAME two components the Takeoffs tab uses rather
 * than a new pipeline: same parsers, same review-and-tick modals, same trust
 * tiers and overwrite warnings, same commit allowlists. New location, not new
 * behavior. The only addition is `onProjectData`, threaded through each
 * widget's `onCommitted` so the questionnaire form and live budget refresh the
 * moment an apply lands instead of after a page reload.
 *
 * Open by default only while the project has no unit count yet — that is the
 * blank-questionnaire moment when uploading saves the most typing. Once
 * numbers exist it collapses to a single line so the form stays the focus.
 *
 * @see src/components/unitMatrix/UnitMatrixUpload.jsx
 * @see src/components/site/SiteDataUpload.jsx
 */
import { useState } from 'react';
import UnitMatrixUpload from '@/components/unitMatrix/UnitMatrixUpload';
import SiteDataUpload from '@/components/site/SiteDataUpload';

export default function QuestionnaireUploads({ projectId, projectData, onProjectData }) {
  const [open, setOpen] = useState(() => !(Number(projectData?.numUnits) > 0));

  return (
    <div className="mb-6 rounded-2xl border border-slate-200 bg-slate-50/60 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full px-5 py-3.5 flex items-center justify-between gap-3 text-left hover:bg-slate-100/60 transition-colors"
      >
        <div className="flex items-center gap-3 min-w-0">
          <svg className="w-5 h-5 text-amber-500 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"/>
          </svg>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-slate-800">Have drawings? Upload them instead of typing</div>
            <div className="text-xs text-slate-500 truncate">
              A unit mix table or site plan fills these fields for you — you review every number before it&apos;s saved.
            </div>
          </div>
        </div>
        <svg
          className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5"/>
        </svg>
      </button>

      {open && (
        <div className="px-5 pt-4 pb-2 border-t border-slate-200 grid grid-cols-1 lg:grid-cols-2 gap-x-6">
          <UnitMatrixUpload projectId={projectId} onCommitted={onProjectData} />
          <SiteDataUpload projectId={projectId} onCommitted={onProjectData} />
        </div>
      )}
    </div>
  );
}
