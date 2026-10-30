import { sendByToken } from '@/lib/campaigns/tracking';
import { fromAddress } from '@/lib/campaigns/sender';
import { prisma } from '@/lib/db';
import UnsubscribeButton from './UnsubscribeButton';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Unsubscribe', robots: { index: false } };

// Public unsubscribe page for campaign emails (0147). No sign in.
export default async function UnsubscribePage({ params }) {
  const send = await sendByToken(params.token);
  const from = fromAddress();
  const already = send ? !!(await prisma.campaignSuppression.findFirst({ where: { email: send.email, liftedAt: null }, select: { id: true } })) : false;
  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-white border border-gray-200 rounded-lg p-6">
        <h1 className="text-lg font-semibold text-gray-900">Unsubscribe from {from.name} emails</h1>
        {!send ? (
          <p className="mt-3 text-sm text-gray-600">This link is not one of ours, or it was cut short. Reply to the email and ask to be removed, and we will do it by hand.</p>
        ) : (
          <UnsubscribeButton token={params.token} email={send.email} already={already} />
        )}
      </div>
    </main>
  );
}
