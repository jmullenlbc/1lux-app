export const dynamic = 'force-dynamic';
import { SALES_DOCS_BRAND } from '@/lib/salesDocsBrand';
import SalesDocShareView from './SalesDocShareView';

// Public Sales Docs link page (0137). No sign in; the link's own gate decides.
export const metadata = { title: SALES_DOCS_BRAND.name, robots: { index: false, follow: false } };

export default function SalesDocSharePage({ params }) {
  return <SalesDocShareView token={params.token} />;
}
