export const dynamic = 'force-dynamic';

import IntakeClient from './IntakeClient';
import { PUBLIC_BRAND } from '@/lib/intake/brand';

export const metadata = {
  title: `Start a Conceptual Lighting Budget | ${PUBLIC_BRAND}`,
  description: `Upload your drawings and get a conceptual lighting and controls budget from ${PUBLIC_BRAND}.`,
};

export default function StartPage() {
  return <IntakeClient />;
}
