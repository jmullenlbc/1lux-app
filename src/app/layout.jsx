import './globals.css';
import EnvironmentBar from '@/components/layout/EnvironmentBar';

export const metadata = {
  title: '1LUX',
  description: '1LUX: LOGIQ, SAGE and Shift',
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
