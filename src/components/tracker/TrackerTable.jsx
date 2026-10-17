'use client';
import { useState } from 'react';
import { getItemOverallStatus, statusMeta } from './SubmittalTrackerClient';

const ROLE_LABELS = {
  ILC: 'ILC', Developer: 'Developer', Architect: 'Architect',
  LA: 'L. Arch', ID: 'Int. Designer', EE: 'Elec. Engineer',
  GC: 'GC', EC: 'EC',
};

function StatusBadge({ status, small }) {
  if (!status) return <span className="text-slate-200 text-xs">—</span>;
  const m = statusMeta(status);
  if (small) return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium ${m.color}`}>
      {m.label}
    </span>
  );
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-semibold ${m.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${m.dot}`} />
      {m.label}
    </span>
  );
}

// Latest review status for a role across all versions of an item
function getLatestRoleStatus(item, role) {
  let latest = null;
  const allVersions = [...(item.versions || [])].sort(
    (a, b) => new Date(a.createdAt) - new Date(b.createdAt)
  );
  for (const ver of allVersions) {
    for (const rev of ver.reviews || []) {
      if (rev.reviewerRole === role) latest = rev;
    }
  }
  return latest;
}

// Expanded row, shows all submissions for this item grouped
function ExpandedRow({ item, colSpan, onViewFull }) {
  const allVersions = [...(item.versions || [])].sort(
    (a, b) => new Date(b.createdAt) - new Date(a.createdAt) // newest first
  );

  if (allVersions.length === 0) {
    return (
      <tr>
        <td colSpan={colSpan} className="px-6 py-4 bg-slate-50 border-b border-slate-100">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500">No submissions yet for this type</p>
            <button
              onClick={onViewFull}
              className="text-xs font-medium text-orange-600 hover:text-orange-700"
            >
              View Full History →
            </button>
          </div>
        </td>
      </tr>
    );
  }

  const latest = allVersions[0];
  const prevMfr = allVersions[1]?.manufacturer;
  const specChanged = allVersions.length > 1 &&
    (latest.manufacturer !== prevMfr || latest.modelNumber !== allVersions[1]?.modelNumber);

  return (
    <tr>
      <td colSpan={colSpan} className="bg-amber-50/40 border-b border-amber-100">
        <div className="px-6 py-4 space-y-3">
          {/* Latest submission summary */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-semibold text-slate-600">
                  {latest.submission?.name}
                </span>
                {latest.submission?.submittedDate && (
                  <span className="text-xs text-slate-500">
                    · {new Date(latest.submission.submittedDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                )}
                {specChanged && (
                  <span className="px-1.5 py-0.5 rounded text-[11px] font-semibold bg-orange-100 text-orange-600">
                    ⚠ SPEC CHANGED
                  </span>
                )}
              </div>
              {(latest.manufacturer || latest.modelNumber) && (
                <p className="text-xs text-slate-500">
                  {latest.manufacturer} {latest.modelNumber && `· ${latest.modelNumber}`}
                </p>
              )}
            </div>
            <button
              onClick={onViewFull}
              className="text-xs font-semibold text-orange-600 hover:text-orange-700 shrink-0 whitespace-nowrap"
            >
              View Full History →
            </button>
          </div>

          {/* Reviews for latest version */}
          {latest.reviews.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {latest.reviews.map(rev => (
                <div key={rev.id} className={`flex items-start gap-2 border rounded-lg px-3 py-2 min-w-[180px] max-w-[300px] ${rev.isExtracted ? 'bg-amber-50 border-amber-200' : 'bg-white border-slate-100'}`}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                      <span className="text-[11px] font-semibold text-slate-600">{ROLE_LABELS[rev.reviewerRole] || rev.reviewerRole}</span>
                      {rev.reviewerName && <span className="text-[11px] text-slate-500">· {rev.reviewerName}</span>}
                      {rev.isExtracted && <span className="text-[11px] font-bold px-1 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">AI</span>}
                    </div>
                    <StatusBadge status={rev.status} small />
                    {rev.noteCategory && rev.noteCategory !== 'OTHER' && rev.noteCategory !== 'BOILERPLATE' && (
                      <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide ml-1">{rev.noteCategory.replace('_',' ')}</span>
                    )}
                    {rev.notes && (
                      <p className="text-[11px] text-slate-600 mt-1 line-clamp-3">{rev.notes}</p>
                    )}
                    {rev.pageNumber && (
                      <p className="text-[11px] text-slate-500 mt-0.5">p.{rev.pageNumber}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-500">No reviews added for this submission yet</p>
          )}
        </div>
      </td>
    </tr>
  );
}

// Add item row
function AddItemRow({ colSpan, onAdd }) {
  const [open,    setOpen]    = useState(false);
  const [typeCode, setTypeCode] = useState('');
  const [desc,    setDesc]    = useState('');
  const [loc,     setLoc]     = useState('');

  function submit(e) {
    e.preventDefault();
    if (!typeCode.trim()) return;
    onAdd({ typeCode: typeCode.trim(), description: desc.trim() || null, location: loc.trim() || null });
    setTypeCode(''); setDesc(''); setLoc(''); setOpen(false);
  }

  if (!open) {
    return (
      <tr>
        <td colSpan={colSpan} className="px-5 py-2.5 border-b border-slate-100">
          <button
            onClick={() => setOpen(true)}
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-orange-600 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Add type manually
          </button>
        </td>
      </tr>
    );
  }

  return (
    <tr>
      <td colSpan={colSpan} className="px-5 py-3 bg-amber-50 border-b border-amber-100">
        <form onSubmit={submit} className="flex items-center gap-2">
          <input
            autoFocus
            value={typeCode}
            onChange={e => setTypeCode(e.target.value)}
            placeholder="Type (e.g. D1)"
            className="w-24 text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-orange-500"
          />
          <input
            value={desc}
            onChange={e => setDesc(e.target.value)}
            placeholder="Description (optional)"
            className="flex-1 text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-orange-500"
          />
          <input
            value={loc}
            onChange={e => setLoc(e.target.value)}
            placeholder="Location"
            className="w-32 text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-orange-500"
          />
          <button type="submit"
            className="px-4 py-2 text-sm font-semibold rounded-lg bg-orange-500 hover:bg-orange-600 text-white transition-colors">
            Add
          </button>
          <button type="button" onClick={() => setOpen(false)}
            className="text-xs text-slate-500 hover:text-slate-600">
            Cancel
          </button>
        </form>
      </td>
    </tr>
  );
}

export default function TrackerTable({ tracker, roles, activeItemId, onSelectItem, onDeleteItem, onAddItem }) {
  const [expandedIds, setExpandedIds] = useState(new Set());

  function toggleExpand(id) {
    setExpandedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const colSpan = 3 + roles.length; // chevron + type + overall + roles

  if (tracker.items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <p className="text-sm font-medium text-slate-500">No fixture types yet</p>
        <p className="text-xs text-slate-500 mt-1">Import a fixture schedule or add types manually</p>
      </div>
    );
  }

  return (
    <table className="w-full text-sm border-collapse">
      <thead>
        <tr className="bg-slate-50 border-b border-slate-200">
          <th className="w-8 px-3 py-3" />
          <th className="px-5 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">
            Type
          </th>
          <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">
            Overall
          </th>
          {roles.map(role => (
            <th key={role} className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">
              {ROLE_LABELS[role] || role}
            </th>
          ))}
          <th className="w-10 px-3 py-3" />
        </tr>
      </thead>
      <tbody>
        {tracker.items.map(item => {
          const expanded  = expandedIds.has(item.id);
          const isActive  = activeItemId === item.id;
          const overall   = getItemOverallStatus(item);

          return (
            <>
              {/* Main row */}
              <tr
                key={item.id}
                onClick={() => onSelectItem(item)}
                className={[
                  'border-b border-slate-100 cursor-pointer transition-colors',
                  isActive ? 'bg-amber-50' : 'hover:bg-slate-50/80',
                ].join(' ')}
              >
                {/* Expand toggle */}
                <td className="px-3 py-3.5" onClick={e => { e.stopPropagation(); toggleExpand(item.id); }}>
                  <button className="text-slate-300 hover:text-slate-500 transition-colors">
                    <svg className={`w-4 h-4 transition-transform ${expanded ? 'rotate-90' : ''}`}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                </td>

                {/* Type + description + AI flags */}
                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-slate-800">{item.typeCode}</p>
                    {/* Flags from extracted notes */}
                    {item.versions?.some(v => v.wetLocationRequired) && (
                      <span className="text-[11px] font-bold px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200" title="Wet location required">💧 WET</span>
                    )}
                    {item.versions?.some(v => v.isDiscontinued) && (
                      <span className="text-[11px] font-bold px-1.5 py-0.5 rounded bg-red-50 text-red-700 border border-red-200" title="Discontinued product flagged">⚠ DISC</span>
                    )}
                    {(() => {
                      const allReviews = item.versions?.flatMap(v => v.reviews || []) || [];
                      const flags = [...new Set(allReviews
                        .filter(r => r.isExtracted && r.noteCategory && !['BOILERPLATE','OTHER'].includes(r.noteCategory))
                        .map(r => r.noteCategory))];
                      if (!flags.length) return null;
                      const FLAG_COLORS = {
                        FINISH:'bg-amber-50 text-amber-700 border-amber-200',
                        MODEL:'bg-slate-100 text-slate-600 border-slate-300',
                        VOLTAGE:'bg-purple-50 text-purple-700 border-purple-200',
                        LUMEN:'bg-cyan-50 text-cyan-700 border-cyan-200',
                        ACCESSORY:'bg-orange-50 text-orange-700 border-orange-200',
                        DRAWING_SYNC:'bg-red-50 text-red-700 border-red-200',
                      };
                      return flags.slice(0,3).map(f => (
                        <span key={f} className={`text-[11px] font-bold px-1.5 py-0.5 rounded border ${FLAG_COLORS[f] || 'bg-slate-100 text-slate-500 border-slate-200'}`}>{f.replace('_',' ')}</span>
                      ));
                    })()}
                  </div>
                  {item.description && (
                    <p className="text-xs text-slate-500 mt-0.5 max-w-[260px] truncate">{item.description}</p>
                  )}
                  {item.location && (
                    <span className="text-[11px] text-slate-500 uppercase tracking-wide">{item.location}</span>
                  )}
                </td>

                {/* Overall status */}
                <td className="px-4 py-3.5">
                  <StatusBadge status={overall} />
                </td>

                {/* Per-role latest status */}
                {roles.map(role => {
                  const latest = getLatestRoleStatus(item, role);
                  return (
                    <td key={role} className="px-4 py-3.5">
                      {latest
                        ? <StatusBadge status={latest.status} small />
                        : <span className="text-slate-200 text-xs">—</span>
                      }
                    </td>
                  );
                })}

                {/* Delete */}
                <td className="px-3 py-3.5" onClick={e => e.stopPropagation()}>
                  <button
                    onClick={() => { if (confirm(`Delete ${item.typeCode}?`)) onDeleteItem(item.id); }}
                    className="text-slate-200 hover:text-red-400 transition-colors"
                    title="Delete type"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </td>
              </tr>

              {/* Expanded history row */}
              {expanded && (
                <ExpandedRow
                  key={`${item.id}-expanded`}
                  item={item}
                  colSpan={colSpan + 1}
                  onViewFull={() => { onSelectItem(item); }}
                />
              )}
            </>
          );
        })}

        {/* Add manually */}
        <AddItemRow colSpan={colSpan + 1} onAdd={onAddItem} />
      </tbody>
    </table>
  );
}
