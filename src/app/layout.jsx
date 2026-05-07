import './globals.css';

export const metadata = {
  title: 'ILC Studios | Quick Budget',
  description: 'Quick Budget — conceptual lighting & controls budgets for multifamily projects',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
