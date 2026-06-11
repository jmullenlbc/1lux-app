export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';

export default function QcRedirect({ searchParams }) {
  const focus = searchParams?.focus;
  redirect(focus ? `/admin/tasks?tab=bugs&focus=${focus}` : '/admin/tasks?tab=bugs');
}
