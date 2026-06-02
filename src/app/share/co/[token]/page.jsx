export const dynamic = 'force-dynamic';
import SharedCOView from './SharedCOView';

export default function ShareCOPage({ params }) {
  return <SharedCOView token={params.token} />;
}
