export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';

// Overview was retired — the universal Main dashboard replaces it. Every /home
// link (login, root, nav) now lands on the engine-driven dashboard.
// (Legacy HomeClient is kept in this folder, unused, for reference.)
export default function HomePage() {
  redirect('/dashboards/main');
}
