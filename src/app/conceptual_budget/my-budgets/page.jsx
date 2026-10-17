export const dynamic = 'force-dynamic';

import MyBudgetsClient from './MyBudgetsClient';

export const metadata = {
  title: "My Company's Budgets | ILC Studios",
  description: 'Every conceptual lighting budget your company has started with ILC Studios: open, copy or look back on one.',
};

export default function MyBudgetsPage() {
  return <MyBudgetsClient />;
}
