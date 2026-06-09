export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';

export default function SalesAutomationRoot() {
  redirect('/sales/automation/rules');
}
