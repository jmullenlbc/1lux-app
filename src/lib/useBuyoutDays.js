'use client';
/**
 * Buyout Duration for one project on a screen: days from entering Buyout to
 * entering CA / Procurement, read from the stage moves on the History tab.
 * Re-reads whenever a stage on the project changes (the `stages` key).
 * Returns null until both moves exist.
 */
import { useEffect, useState } from 'react';
import { buyoutDays } from '@/lib/pipeline';

export function useBuyoutDays(projectId, stages) {
  const [days, setDays] = useState(null);
  useEffect(() => {
    if (!projectId) return undefined;
    let alive = true;
    fetch(`/api/projects/${projectId}/activity?type=deal_stage&limit=200`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (alive) setDays(buyoutDays(null, d?.activities || [])); })
      .catch(() => { if (alive) setDays(null); });
    return () => { alive = false; };
  }, [projectId, stages]);
  return days;
}
