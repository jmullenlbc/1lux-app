import './globals.css';
import EnvironmentBar from '@/components/layout/EnvironmentBar';

export const metadata = {
  title: 'ILC Studios | Quick Budget',
  description: 'Quick Budget: conceptual lighting & controls budgets for multifamily projects',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <EnvironmentBar />
        {children}
      </body>
    </html>
  );
}
