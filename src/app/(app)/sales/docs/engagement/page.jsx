import { redirect } from 'next/navigation';
export const dynamic = 'force-dynamic';

// The Engagement tab is gone (Mike 10-20): who opened what, and the time on
// each page, now sit on each document, each Folder and each link row. Old
// addresses land on the nearest of those.
export default function SalesDocEngagementRedirect({ searchParams }) {
  const doc = String(searchParams?.doc || '');
  const space = String(searchParams?.space || '');
  if (/^[\w-]{1,64}$/.test(doc)) redirect(`/sales/docs/${doc}`);
  if (/^[\w-]{1,64}$/.test(space)) redirect(`/sales/docs/spaces/${space}`);
  redirect(searchParams?.link ? '/sales/docs/links' : '/sales/docs');
}
