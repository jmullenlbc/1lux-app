export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { getSession, can, canSeeAllData } from '@/lib/auth';
import PoolAdmin from '@/components/unitSelections/PoolAdmin';

/**
 * The decorative option pool — the five fixtures a client picks per unit.
 *
 * Reading is open to staff; changing it rides on the same key as the rest of
 * the fixture library, so the people who keep Products up to date keep this up
 * to date too. Contractors never reach this screen at all: buy prices live on
 * these rows.
 */
export default async function DecorativeOptionsPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  // Mirrors the routes. They are the real boundary; this only saves somebody
  // from landing on a screen that would answer 403 to everything on it.
  if (!canSeeAllData(session)) redirect('/dashboard');

  const canEdit = can(session, 'editProducts');

  return (
    <div className="max-w-6xl mx-auto">
      <div className="px-6 py-8 border-b border-slate-200">
        <div className="flex items-center gap-2 text-sm text-slate-400 mb-2">
          <span>Pre-con</span>
          <span>/</span>
          <span className="text-slate-600">Unit Fixture Choices</span>
        </div>
        <h1 className="text-2xl font-bold text-slate-900">Unit Fixture Choices</h1>
        <p className="text-slate-500 text-sm mt-1 max-w-2xl">
          The fixtures a client gets to choose from inside a unit &mdash; the kitchen
          pendant, the bath vanity, the balcony sconce, the unit entry sconce and the
          ceiling fan. What is in here is what anybody ever gets offered. Fixtures that
          cost more than the job&apos;s decorative allowance are taken off the list
          automatically, so the prices below decide what a client actually sees.
        </p>
        {!canEdit && (
          <div className="mt-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 border border-slate-200 text-xs font-medium text-slate-600">
            You can look, but not change this list.
          </div>
        )}
      </div>

      <div className="px-6 py-6">
        <PoolAdmin canEdit={canEdit} />
      </div>
    </div>
  );
}
