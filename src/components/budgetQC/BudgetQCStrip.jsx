'use client';
import { useState, useEffect, useImperativeHandle, forwardRef } from 'react';
import BudgetQCDrawer from './BudgetQCDrawer';

// Phase → dot states: [DD, GMP, IFC]
function getStageDots(phase) {
  const order = { sd: 0, dd: 1, cd: 2, ifc: 3, construction: 4, closeout: 5 };
  const idx = order[phase] ?? -1;
  if (idx < 1)  return ['pending', 'pending', 'pending'];  // pre-DD
  if (idx === 1) return ['current', 'pending', 'pending'];  // DD
  if (idx === 2) return ['done',    'current', 'pending'];  // CD → GMP
  if (idx === 3) return ['done',    'done',    'current'];  // IFC
  return             ['done',    'done',    'done'];         // past IFC
}

function initials(name) {
  if (!name) return '?';
  return name.split(/\s+/).map(p => p[0]).join('').toUpperCase().slice(0, 2);
}

function StageDot({ state }) {
  const cls = {
    done:    'w-2 h-2 rounded-full bg-green-500',
    current: 'w-2 h-2 rounded-full bg-amber-500 ring-2 ring-amber-200',
    pending: 'w-2 h-2 rounded-full bg-slate-200',
  }[state];
  return <div className={cls} />;
}

function DotConnector({ done }) {
  return <div className={`h-px w-3.5 flex-shrink-0 ${done ? 'bg-green-400' : 'bg-slate-200'}`} />;
}

// Strip is exposed via ref so PeerReviewClient can call checkCanSend()
const BudgetQCStrip = forwardRef(function BudgetQCStrip(
  { projectId, projectName, phase, currentUserId, currentUserRole, allUsers },
  ref
) {
  const [data,       setData]       = useState(null);  // { checklist, autoChecks, summary }
  const [loading,    setLoading]    = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    if (!projectId) return;
    fetch(`/api/projects/${projectId}/budget-qc`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [projectId]);

  // Expose checkCanSend to parent via ref
  useImperativeHandle(ref, () => ({
    checkCanSend() {
      if (!data) return true; // no checklist yet, allow
      const { summary } = data;
      if (phase === 'ifc' && !summary.isComplete) {
        setDrawerOpen(true); // open drawer so they can see what's left
        return false;        // hard gate, caller must abort send
      }
      if (!summary.isComplete) {
        return window.confirm(
          `${summary.total - summary.checked} QC item${summary.total - summary.checked !== 1 ? 's are' : ' is'} unchecked.\n\nSend anyway?`
        );
      }
      return true;
    },
  }));

  async function toggleItem(itemKey, checked) {
    // Optimistic update
    setData(prev => {
      if (!prev) return prev;
      const items = prev.checklist.items.map(i =>
        i.itemKey === itemKey
          ? { ...i, checked, checkedBy: checked ? { id: currentUserId, name: 'You' } : null, checkedAt: checked ? new Date().toISOString() : null }
          : i
      );
      const checkedCount = items.filter(i => {
        const def = prev.checklist.items.find(x => x.itemKey === i.itemKey);
        return i.checked;
      }).length;
      return {
        ...prev,
        checklist: { ...prev.checklist, items },
        summary: {
          ...prev.summary,
          checked: checkedCount,
          pct: Math.round((checkedCount / prev.summary.total) * 100),
          isComplete: checkedCount === prev.summary.total,
        },
      };
    });

    // Persist
    await fetch(`/api/projects/${projectId}/budget-qc/items/${encodeURIComponent(itemKey)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ checked }),
    });

    // Refresh for accurate auto-check results
    fetch(`/api/projects/${projectId}/budget-qc`)
      .then(r => r.json())
      .then(d => setData(d))
      .catch(() => {});
  }

  async function handleAssign(userId) {
    await fetch(`/api/projects/${projectId}/budget-qc/assign`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    });
    fetch(`/api/projects/${projectId}/budget-qc`).then(r => r.json()).then(setData).catch(() => {});
  }

  // Hide strip if IFC + complete
  if (!loading && data?.summary?.isComplete && phase === 'ifc') return null;
  // Hide if no budget data yet
  if (!loading && !data) return null;

  const summary    = data?.summary;
  const checklist  = data?.checklist;
  const dots       = getStageDots(phase);
  const STAGE_LABELS = ['DD', 'GMP', 'IFC'];
  const isIFC      = phase === 'ifc';
  const pct        = summary?.pct ?? 0;
  const isComplete = summary?.isComplete ?? false;

  return (
    <>
      <div className="border-b border-slate-100 bg-white px-5 h-10 flex items-center gap-3 flex-shrink-0 print:hidden">
        {/* Label */}
        <span className="text-[9.5px] font-mono uppercase tracking-widest text-slate-400 flex-shrink-0">Budget QC</span>

        {/* Stage dots */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {dots.map((state, i) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <DotConnector done={dots[i - 1] === 'done'} />}
              <span className="flex items-center gap-1">
                <StageDot state={state} />
              </span>
            </span>
          ))}
        </div>

        {/* Stage labels (small) */}
        <span className="text-[9px] font-mono text-slate-400 flex-shrink-0">
          {STAGE_LABELS.map((l, i) => (
            <span key={l} className={`${i > 0 ? 'ml-1' : ''} ${dots[i] === 'current' ? 'text-amber-600 font-bold' : dots[i] === 'done' ? 'text-green-600' : ''}`}>{l}</span>
          ))}
        </span>

        {/* Progress fill */}
        <div className="flex-1 h-1 bg-slate-100 rounded-full overflow-hidden min-w-[60px]">
          <div
            className={`h-full rounded-full transition-all duration-300 ${isComplete ? 'bg-green-500' : 'bg-amber-500'}`}
            style={{ width: `${pct}%` }}
          />
        </div>

        {/* Count */}
        <span className="text-[11px] font-mono text-slate-500 flex-shrink-0">
          {loading ? '—' : `${summary.checked} / ${summary.total}`}
        </span>

        {/* Divider */}
        <div className="w-px h-4 bg-slate-200 flex-shrink-0" />

        {/* Reviewer */}
        {checklist?.assignedTo ? (
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <div className="w-5 h-5 rounded-full bg-amber-100 border border-amber-200 flex items-center justify-center text-[7.5px] font-bold text-amber-800 flex-shrink-0">
              {initials(checklist.assignedTo.name)}
            </div>
            <span className="text-[11px] text-slate-600 truncate max-w-[100px]">{checklist.assignedTo.name}</span>
          </div>
        ) : (
          <span className="text-[11px] text-slate-400 flex-shrink-0">Unassigned</span>
        )}

        {/* IFC locked indicator */}
        {isIFC && !isComplete && (
          <span className="text-[9px] font-bold px-2 py-0.5 rounded border bg-red-50 text-red-600 border-red-200 flex-shrink-0">LOCKED</span>
        )}

        {/* View checklist */}
        <button
          onClick={() => setDrawerOpen(true)}
          className="text-[11px] font-medium text-amber-600 px-2.5 py-1 rounded-md border border-amber-200 bg-amber-50 hover:bg-amber-100 transition-colors flex-shrink-0"
        >
          View Checklist →
        </button>
      </div>

      <BudgetQCDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        projectId={projectId}
        projectName={projectName}
        checklist={checklist}
        autoChecks={data?.autoChecks}
        summary={summary}
        currentUserId={currentUserId}
        currentUserRole={currentUserRole}
        allUsers={allUsers}
        onItemToggle={toggleItem}
        onAssign={handleAssign}
      />
    </>
  );
});

export default BudgetQCStrip;
