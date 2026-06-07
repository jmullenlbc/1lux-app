'use client';
import { useState, useEffect } from 'react';

export default function BudgetQCBadge({ projectId }) {
  const [summary, setSummary] = useState(null);

  useEffect(() => {
    if (!projectId) return;
    fetch(`/api/projects/${projectId}/budget-qc`)
      .then(r => r.json())
      .then(d => setSummary(d.summary))
      .catch(() => {});
  }, [projectId]);

  if (!summary) return null;
  if (summary.isComplete) return null; // hidden when complete

  const { checked, total } = summary;
  const pct = total > 0 ? checked / total : 0;

  let cls;
  if (pct === 0)      cls = 'bg-amber-50 text-amber-700 border-amber-200';
  else if (pct < 1)   cls = 'bg-blue-50 text-blue-700 border-blue-200';
  else                cls = 'bg-green-50 text-green-700 border-green-200';

  return (
    <span className={`inline-flex items-center text-[10px] font-mono font-semibold px-2 py-0.5 rounded border ${cls}`}>
      QC · {checked}/{total}
    </span>
  );
}
