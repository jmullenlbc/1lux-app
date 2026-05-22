export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { prisma as db } from '@/lib/db';
import ProfileClient from './ProfileClient';

export default async function ProfilePage() {
  const session = await getSession();
  if (!session) redirect('/login');

  let user = null;
  try {
    user = await db.user.findUnique({
      where: { id: session.id },
      select: {
        id: true, name: true, email: true, role: true,
        createdAt: true, isActive: true,
      },
    });
  } catch (err) {
    console.error('[profile page]', err?.message ?? err);
  }

  return <ProfileClient user={user || session} />;
}
