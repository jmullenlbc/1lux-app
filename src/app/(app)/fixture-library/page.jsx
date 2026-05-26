export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import FixtureLibraryClient from './FixtureLibraryClient';

export default async function FixtureLibraryPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.role !== 'ILC_ADMIN' && session.role !== 'SUPER_ADMIN') redirect('/dashboard');

  const [masterTypes, specs, fixtureTypes] = await Promise.all([
    prisma.masterType  ? prisma.masterType.findMany({ orderBy: { code: 'asc' } }) : [],
    prisma.iLCSpec     ? prisma.iLCSpec.findMany({ orderBy: [{ master_type_id: 'asc' }, { family: 'asc' }] }) : [],
    prisma.fixtureType ? prisma.fixtureType.findMany({ orderBy: [{ master_type_id: 'asc' }, { code: 'asc' }] }) : [],
  ]);

  return (
    <FixtureLibraryClient
      initialMasterTypes={masterTypes}
      initialSpecs={specs}
      initialFixtureTypes={fixtureTypes}
    />
  );
}
