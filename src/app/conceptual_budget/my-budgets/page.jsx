export const dynamic = 'force-dynamic';

import MyBudgetsClient from './MyBudgetsClient';
import { PUBLIC_BRAND } from '@/lib/intake/brand';

export const metadata = {
  title: `My Company's Budgets | ${PUBLIC_BRAND}`,
  description: `Every conceptual lighting budget your company has started with ${PUBLIC_BRAND}: open, copy or look back on one.`,
};

export default function MyBudgetsPage() {
  return <MyBudgetsClient />;
}
