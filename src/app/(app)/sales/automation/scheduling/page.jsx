export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';

// Scheduling was merged into the unified Rules tab (Bot Rules on top,
// then Scheduling, Exclusions, Classification, Cadence). Old links redirect.
export default function SchedulingRedirect() {
  redirect('/sales/automation/rules');
}
