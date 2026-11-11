export const dynamic = 'force-dynamic';

import { requireAuth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import CodeSearchClient from './CodeSearchClient';

export const metadata = { title: 'Code Search: 1LUX' };

export default async function CodeSearchPage() {
  const { user, error } = await requireAuth();
  if (error) redirect('/login');

  // Load code corpus metadata on the server (no DB call needed)
  let codeMeta = [];
  try {
    const fs = (await import('fs')).default;
    const path = (await import('path')).default;
    const indexPath = path.join(process.cwd(), 'knowledge', 'codes', 'index.json');
    const index = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
    codeMeta = index.codes;
  } catch {
    // Silently fail, client will handle empty state
  }

  return <CodeSearchClient codeMeta={codeMeta} />;
}
