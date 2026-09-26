export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import AutomationNav from '@/components/salesAutomation/AutomationNav';
import VoiceTrainingClient from './VoiceTrainingClient';

/**
 * Sales Automation → Voice Training (Mike 9-26).
 *
 * Each salesperson drops in batches of their own emails. Every email is kept,
 * and the bot learns their tone, their words, their phrases and how they
 * title an email. Every draft written for them then sounds like them.
 */
export default async function VoiceTrainingPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  return (
    <div className="px-6 py-6 max-w-5xl mx-auto">
      <AutomationNav />
      <div className="mb-5">
        <h1 className="text-xl font-bold text-slate-900">Voice Training</h1>
        <p className="text-slate-500 text-sm mt-1 max-w-3xl">
          Drop in emails you wrote. The bot learns how you sound: your greetings, your words, your phrases
          and how you title an email. Every email it drafts for you, subject line included, is written in
          that voice. The more you add, the better it gets. Big files are read on your computer and only the
          words you wrote are sent.
        </p>
      </div>
      <VoiceTrainingClient />
    </div>
  );
}
