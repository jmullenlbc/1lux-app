'use client';
import { useState } from 'react';
import { PersonOptions } from '@/components/people/PeopleOptions';
import { BUDGET_QC_ITEMS, QC_SECTIONS } from '@/lib/budgetQCItems';

function fmtDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function initials(name) {
  if (!name) return '?';
  return name.split(/\s+/).map(p => p[0]).join('').toUpperCase().slice(0, 2);
}

// ── Per-item row ──────────────────────────────────────────────────────────────
function QCItem({ def, dbItem, autoResult, canCheck, onToggle }) {
  const isAuto = def.autoCheck;
  const autoPass = isAuto && autoResult?.status === 'pass';
  const autoWarn = isAuto && autoResult?.status === 'warn';
  const isChecked = dbItem?.checked || autoPass;
  const isLocked = !canCheck || (isAuto && autoPass);

  function cbCls() {
    if (autoPass) return 'w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 mt-0.5 bg-green-50 border-green-300';
    if (autoWarn && isChecked) return 'w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 mt-0.5 bg-green-50 border-green-300';
    if (autoWarn) return 'w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 mt-0.5 bg-amber-50 border-amber-300';
    if (isChecked) return 'w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 mt-0.5 bg-amber-500 border-amber-500';
    return 'w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 mt-0.5 border-slate-300 bg-white';
  }

  function badge() {
    if (autoPass) return <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-green-50 text-green-700 border border-green-200 flex-shrink-0">PASS</span>;
    if (autoWarn && isChecked) return <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-green-50 text-green-700 border border-green-200 flex-shrink-0">REVIEWED</span>;
    if (autoWarn) return <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 flex-shrink-0">REVIEW</span>;
    if (!isAuto) return <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-50 text-slate-500 border border-slate-200 flex-shrink-0">MANUAL</span>;
    return null;
  }

  const checkedBy = dbItem?.checkedBy;
  const checkedAt = dbItem?.checkedAt;

  return (
    <div
      onClick={() => !isLocked && onToggle(def.key, !isChecked)}
      className={`flex items-start gap-2.5 px-4 py-2.5 border-b border-slate-50 last:border-0 ${isLocked ? 'cursor-default' : 'cursor-pointer hover:bg-slate-50'} transition-colors`}
    >
      <div className={cbCls()}>
        {(isChecked || autoPass) && (
          <svg className={`w-2.5 h-2.5 ${autoPass ? 'text-green-600' : autoWarn && isChecked ? 'text-green-600' : 'text-white'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        )}
        {autoWarn && !isChecked && (
          <span className="text-amber-600 text-[9px] font-bold">!</span>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className={`text-[12.5px] font-medium leading-snug ${isChecked ? 'text-slate-400 line-through decoration-slate-200' : 'text-slate-800'}`}>
          {def.label}
        </div>
        {/* Auto-check detail */}
        {isAuto && autoResult?.detail && (
          <div className={`text-[10.5px] font-mono mt-0.5 ${autoPass ? 'text-green-600' : autoWarn ? 'text-amber-600' : 'text-slate-400'}`}>
            {autoResult.detail}
          </div>
        )}
        {/* Checked-by stamp */}
        {isChecked && (checkedBy || checkedAt) && (
          <div className="text-[10.5px] font-mono text-green-600 mt-0.5">
            {checkedBy ? initials(checkedBy.name) : '?'} · {fmtDate(checkedAt)}
            {dbItem?.note && <span className="text-slate-400"> · {dbItem.note}</span>}
          </div>
        )}
        {/* Auto-warn unchecked hint */}
        {autoWarn && !isChecked && (
          <div className="text-[10.5px] text-amber-600 mt-0.5">Click to acknowledge</div>
        )}
      </div>

      {badge()}
    </div>
  );
}

// ── Main Drawer ───────────────────────────────────────────────────────────────
export default function BudgetQCDrawer({
  open, onClose,
  projectId, projectName,
  checklist, autoChecks, summary,
  currentUserId, currentUserRole,
  allUsers,
  onItemToggle, onAssign,
}) {
  const [assigningOpen, setAssigningOpen] = useState(false);

  const assignedTo = checklist?.assignedTo;
  const isAdmin = currentUserRole === 'ILC_ADMIN' || currentUserRole === 'SUPER_ADMIN';
  const canCheck = isAdmin || !assignedTo || assignedTo.id === currentUserId;

  const remaining = summary ? summary.total - summary.checked : 0;

  function itemState(key) {
    return checklist?.items?.find(i => i.itemKey === key) ?? null;
  }

  return (
    <>
      {/* Overlay */}
      <div
        onClick={onClose}
        className={`fixed inset-0 bg-black/30 backdrop-blur-[2px] z-40 transition-opacity ${open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
      />

      {/* Drawer */}
      <div className={`fixed top-0 right-0 bottom-0 w-[420px] bg-white border-l border-slate-200 shadow-2xl flex flex-col z-50 transition-transform duration-200 ${open ? 'translate-x-0' : 'translate-x-full'}`}>

        {/* Header */}
        <div className="px-5 pt-4 pb-3 border-b border-slate-100 flex-shrink-0">
          <div className="text-[9.5px] font-mono text-slate-400 uppercase tracking-widest mb-1">Budget QC · {projectName}</div>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900">Pre-Flight Checklist</h2>
            <button onClick={onClose} className="w-7 h-7 rounded-md border border-slate-200 flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-50 transition-colors text-xs">✕</button>
          </div>
        </div>

        {/* Progress */}
        <div className="px-5 py-2.5 border-b border-slate-100 flex items-center gap-3 flex-shrink-0">
          <div className="flex-1 h-1 bg-slate-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${summary?.isComplete ? 'bg-green-500' : 'bg-amber-500'}`}
              style={{ width: `${summary?.pct ?? 0}%` }}
            />
          </div>
          <span className="text-[10px] font-mono text-slate-500 flex-shrink-0">
            {summary?.checked ?? 0} / {summary?.total ?? 0} complete
          </span>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto">
          {QC_SECTIONS.map(section => {
            const sectionItems = BUDGET_QC_ITEMS.filter(i => i.section === section.key);
            const sectionChecked = sectionItems.filter(i => {
              const db = itemState(i.key);
              const auto = autoChecks?.[i.key];
              return db?.checked || (i.autoCheck && auto?.status === 'pass');
            }).length;
            const sectionDone = sectionChecked === sectionItems.length;
            const sectionPartial = sectionChecked > 0 && !sectionDone;

            return (
              <div key={section.key} className="border-b border-slate-100">
                {/* Section header */}
                <div className="flex items-center gap-2 px-4 py-2 bg-slate-50">
                  <span className="text-[9px] font-mono uppercase tracking-wider text-slate-400 flex-1">{section.label}</span>
                  <span className={`text-[9px] font-mono px-2 py-0.5 rounded-full border ${
                    sectionDone    ? 'bg-green-50 text-green-700 border-green-200' :
                    sectionPartial ? 'bg-blue-50 text-blue-700 border-blue-200' :
                                     'bg-slate-50 text-slate-400 border-slate-200'
                  }`}>
                    {sectionChecked} / {sectionItems.length} {sectionDone ? 'done' : 'checked'}
                  </span>
                </div>

                {/* Items */}
                {sectionItems.map(def => (
                  <QCItem
                    key={def.key}
                    def={def}
                    dbItem={itemState(def.key)}
                    autoResult={autoChecks?.[def.key]}
                    canCheck={canCheck}
                    onToggle={onItemToggle}
                  />
                ))}
              </div>
            );
          })}

          {/* Reviewer section */}
          <div className="border-b border-slate-100">
            <div className="flex items-center gap-2 px-4 py-2 bg-slate-50">
              <span className="text-[9px] font-mono uppercase tracking-wider text-slate-400 flex-1">Pre-Con Reviewer</span>
              <span className={`text-[9px] font-mono px-2 py-0.5 rounded-full border ${assignedTo ? 'bg-green-50 text-green-700 border-green-200' : 'bg-slate-50 text-slate-400 border-slate-200'}`}>
                {assignedTo ? '✓ Assigned' : 'Unassigned'}
              </span>
            </div>
            {assignedTo ? (
              <div className="flex items-center gap-3 px-4 py-3">
                <div className="w-7 h-7 rounded-full bg-amber-100 border border-amber-200 flex items-center justify-center text-[9px] font-bold text-amber-800 flex-shrink-0">
                  {initials(assignedTo.name)}
                </div>
                <div className="flex-1">
                  <div className="text-sm font-medium text-slate-800">{assignedTo.name}</div>
                  <div className="text-[10px] font-mono text-slate-400">{assignedTo.email}</div>
                </div>
                {isAdmin && (
                  <button onClick={() => setAssigningOpen(v => !v)} className="text-[11px] text-slate-400 hover:text-slate-600 border border-slate-200 px-2 py-1 rounded-md">Change</button>
                )}
              </div>
            ) : isAdmin ? (
              <div className="px-4 py-3">
                <button onClick={() => setAssigningOpen(v => !v)} className="text-[11px] text-amber-600 hover:text-amber-700 font-medium">+ Assign reviewer</button>
              </div>
            ) : (
              <div className="px-4 py-2.5 text-[11px] text-slate-400">Not assigned — any team member can check items.</div>
            )}

            {/* Assign dropdown */}
            {assigningOpen && isAdmin && allUsers && (
              <div className="px-4 pb-3">
                <select
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-400"
                  value={assignedTo?.id ?? ''}
                  onChange={e => { onAssign(e.target.value || null); setAssigningOpen(false); }}
                >
                  <option value="">— Unassigned —</option>
                  <PersonOptions users={allUsers} picker="qcAssignee" />
                </select>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 flex items-center gap-3 flex-shrink-0">
          <div className={`flex-1 text-[11.5px] ${summary?.isComplete ? 'text-green-700 font-semibold' : 'text-slate-600'}`}>
            {summary?.isComplete
              ? '✓ All checks complete — ready to send'
              : <><strong className="text-slate-900">{remaining} item{remaining !== 1 ? 's' : ''}</strong> need{remaining === 1 ? 's' : ''} attention.</>
            }
          </div>
          <button onClick={onClose} className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-white transition-colors">Done</button>
        </div>
      </div>
    </>
  );
}
