export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { phoneTabsFor } from '@/lib/deptScreens';

// Where the home screen icon lands. There is one manifest for everybody, so
// this sends each person to their own first phone tab.
export default async function StartPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  redirect(phoneTabsFor(session)[0].href);
}
