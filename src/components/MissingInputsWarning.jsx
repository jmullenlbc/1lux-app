'use client';
import Link from 'next/link';
import { findMissingProjectInputs, groupMissingBySection } from '@/lib/projectInputChecks';

/**
 * Warns the user when critical Project Data fields are blank, causing the
 * conceptual budget engine to silently zero out entire calculation sections.
 *
 * Renders nothing if no critical inputs are missing — auto-hides cleanly.
 *
 * Two modes:
 *   - 'compact' — one-line for the Project Overview / Dashboard tab. Always
 *     visible above the budget number; tells the user at a glance that the
 *     number they're looking at may be incomplete.
 *   - 'full'    — itemized, grouped by section, with an Edit Project Data
 *     button. For the Summary page where the user is reviewing the budget.
 *
 * Amber, not red, because this is "your budget may be under-counting", not
 * "you broke production".
 *
 * Background on the design call:
 *   - https://github.com/OperationsILC/ilc-lighting-app/blob/main/.claude/coordination.md
 *     (the 2026-06-19 entry covers the Manuel report that surfaced the gap)
 */
export default function MissingInputsWarning({ projectData, projectId, mode = 'full' }) {
  const missing = findMissingProjectInputs(projectData);
  if (missing.length === 0) return null;

  const grouped      = groupMissingBySection(missing);
  const sectionCount = Object.keys(grouped).length;
  const editUrl      = `/project/${projectId}/wizard?step=project-data`;

  if (mode === 'compact') {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 flex items-center gap-3 print:hidden">
        <span className="text-amber-600 text-base shrink-0" aria-hidden="true">⚠</span>
        <div className="flex-1 text-xs text-amber-900 min-w-0">
          <span className="font-semibold">
            {missing.length} Project Data {missing.length === 1 ? 'input is' : 'inputs are'} blank
          </span>
          <span className="text-amber-700">
            {' — '}
            {sectionCount === 1 ? '1 section' : `${sectionCount} sections`}
            {' may be incomplete. Budget may be under-counting.'}
          </span>
        </div>
        <Link
          href={editUrl}
          className="text-xs font-medium text-amber-700 hover:text-amber-900 underline whitespace-nowrap"
        >
          Review →
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 p-5 mb-6 print:hidden">
      <div className="flex items-start gap-3">
        <span className="text-amber-600 text-2xl leading-none shrink-0" aria-hidden="true">⚠</span>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-amber-900 mb-1">
            This budget may be under-counting
          </div>
          <div className="text-sm text-amber-800 mb-3">
            {missing.length} Project Data {missing.length === 1 ? 'field is' : 'fields are'} blank,
            which is silently zeroing out parts of {sectionCount === 1 ? '1 section' : `${sectionCount} sections`}.
            Fill in any that apply to this project so the budget reflects the real scope.
          </div>
          <div className="space-y-2 mb-4">
            {Object.entries(grouped).map(([section, items]) => (
              <div key={section} className="bg-white border border-amber-200 rounded-lg px-3 py-2">
                <div className="text-xs font-semibold text-slate-700 mb-1">{section}</div>
                <ul className="text-xs text-slate-600 space-y-0.5">
                  {items.map(item => (
                    <li key={item.field}>
                      <span className="font-medium text-slate-700">{item.label}</span>
                      <span className="text-slate-400">{' — '}{item.impact}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <Link
            href={editUrl}
            className="inline-block px-4 py-2 text-sm font-semibold rounded-lg bg-orange-500 hover:bg-orange-600 text-white transition-colors"
          >
            Edit Project Data
          </Link>
        </div>
      </div>
    </div>
  );
}
