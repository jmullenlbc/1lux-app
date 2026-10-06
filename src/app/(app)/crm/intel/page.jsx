import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

// Intel now lives on My Desk as a tab (Mike 10-5). IntelClient.jsx stays here
// and is rendered by /sales/desk.
export default function CrmIntelPage() {
  redirect('/sales/desk?tab=intel');
}
