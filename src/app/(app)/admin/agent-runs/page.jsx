export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import ReviewQueue from './ReviewQueue';

/**
 * /admin/agent-runs — the AI review queue. Step 17 of the Governed AI Layer.
 *
 * Mirrors the guard on /api/admin/agent-runs. Gating the page alone would be
 * decoration — the route is the boundary — but a COMPANY_ADMIN who can reach the
 * page and only sees a 403 is a worse experience than not seeing the link.
 */
export default async function AgentRunsPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.role !== 'ILC_ADMIN' && session.role !== 'SUPER_ADMIN') redirect('/dashboard');

  return (
    <div className="max-w-6xl mx-auto">
      <div className="px-6 py-8 border-b border-slate-200">
        <div className="flex items-center gap-2 text-sm text-slate-400 mb-2">
          <span>ILC Admin</span>
          <span>/</span>
          <span className="text-slate-600">AI Review Queue</span>
        </div>
        <h1 className="text-2xl font-bold text-slate-900">AI Review Queue</h1>
        <p className="text-slate-500 text-sm mt-1">
          Everything the AI produced that needs a human signature before it counts. Accepting or
          correcting a run here is what earns — or removes — that task&apos;s permission to work
          on its own.
        </p>
        <div className="mt-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 text-xs font-medium text-amber-700">
          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
          </svg>
          ILC Super Admin Only
        </div>
      </div>

      <ReviewQueue />
    </div>
  );
}
