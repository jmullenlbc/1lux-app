import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

// Budget page visitors is a tab on the Sales dashboard now (Mike 10-6).
// The panel itself lives in src/app/(app)/dashboards/[section]/VisitorsPanel.jsx.
export default function VisitorsPage({ searchParams }) {
  const days = searchParams?.days ? `&days=${encodeURIComponent(searchParams.days)}` : '';
  redirect(`/dashboards/sales?tab=visitors${days}`);
}
