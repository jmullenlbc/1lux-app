import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

// The Brief is a tab on the Sales dashboard now (Mike 10-6). BriefClient.jsx
// stays here and is rendered by dashboards/[section]/BriefPanel.jsx.
export default function BriefPage() {
  redirect('/dashboards/sales?tab=brief');
}
