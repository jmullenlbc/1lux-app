import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

// Templates is a tab on the Proposals page now (Mike 10-6).
export default function TemplatesPage() {
  redirect('/sales/proposals?tab=templates');
}
