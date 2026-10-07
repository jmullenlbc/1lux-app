export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import AutomationNav from '@/components/salesAutomation/AutomationNav';
import SignatureClient from './SignatureClient';

/**
 * Sales Automation → Signature (Mike 9-26).
 *
 * One company layout. Each salesperson's name, title, email and cell are
 * filled in from their profile, and the result is added to every email the
 * bot drafts for them. Sales Admins edit the layout; everyone sees a preview.
 */
export default async function SignaturePage() {
  const session = await getSession();
  if (!session) redirect('/login');

  return (
    <div className="px-6 py-6">
      <AutomationNav />
      <div className="max-w-5xl mx-auto">
      <div className="mb-5">
        <h1 className="text-xl font-bold text-slate-900">Email Signature</h1>
        <p className="text-slate-500 text-sm mt-1 max-w-3xl">
          One signature for the whole company. Each person&rsquo;s name, title, email and cell are filled in
          from their profile, and it is added to the bottom of every email the bot drafts for them.
        </p>
      </div>
      <SignatureClient />
      </div>
    </div>
  );
}
