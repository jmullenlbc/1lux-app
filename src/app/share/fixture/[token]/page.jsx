export const dynamic = 'force-dynamic';

import SharedFixtureSchedule from './SharedFixtureSchedule';

export default function SharePage({ params }) {
  return <SharedFixtureSchedule token={params.token} />;
}
