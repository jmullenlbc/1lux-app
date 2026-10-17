export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import McpKeysClient from './McpKeysClient';

export default async function AdminMcpKeysPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  // Mirrors requireSuperAdmin on /api/admin/mcp-keys. The route is the real
  // boundary; this only saves a COMPANY_ADMIN from landing on a screen that
  // would answer 403 to everything on it.
  if (session.role !== 'ILC_ADMIN' && session.role !== 'SUPER_ADMIN') redirect('/dashboard');

  const users = await prisma.user.findMany({
    where: { isActive: true },
    select: { id: true, name: true, email: true, role: true },
    orderBy: [{ name: 'asc' }, { email: 'asc' }],
  });

  return (
    <div className="max-w-5xl mx-auto">
      <div className="px-6 py-8 border-b border-slate-200">
        <div className="flex items-center gap-2 text-sm text-slate-500 mb-2">
          <span>ILC Admin</span>
          <span>/</span>
          <span className="text-slate-600">AI Access Keys</span>
        </div>
        <h1 className="text-2xl font-bold text-slate-900">AI Access Keys</h1>
        <p className="text-slate-500 text-sm mt-1 max-w-2xl">
          A key lets an AI assistant read ILC data on somebody&apos;s behalf. Each key
          belongs to one person and shows that person exactly what they can already
          see in the app, no more. Every question asked with a key is recorded
          against their name.
        </p>
        <div className="mt-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 text-xs font-semibold text-amber-700">
          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
          </svg>
          ILC Super Admin Only
        </div>
      </div>

      <McpKeysClient users={users} />
    </div>
  );
}
