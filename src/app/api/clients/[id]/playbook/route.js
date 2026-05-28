import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';

// GET /api/clients/[id]/playbook
export async function GET(req, { params }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const perms = (() => { try { return JSON.parse(session.permissions || '{}'); } catch { return {}; } })();
  const isIlcAdmin = session.role === 'ILC_ADMIN' || session.role === 'SUPER_ADMIN';
  const canView = isIlcAdmin || perms.clients === true || perms.clients === 'read';
  if (!canView) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  if (!prisma.clientPlaybook) return NextResponse.json(null);

  const playbook = await prisma.clientPlaybook.findUnique({
    where: { clientId: params.id },
  });

  return NextResponse.json(playbook);
}

// PUT /api/clients/[id]/playbook
// Body: { section: 'scope'|'approval'|'process'|'timeframes', data: any }
export async function PUT(req, { params }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const perms = (() => { try { return JSON.parse(session.permissions || '{}'); } catch { return {}; } })();
  const isIlcAdmin = session.role === 'ILC_ADMIN' || session.role === 'SUPER_ADMIN';
  const canEdit = isIlcAdmin || perms.clients === true;
  if (!canEdit) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  if (!prisma.clientPlaybook) return NextResponse.json({ error: 'Feature not available' }, { status: 503 });

  const body = await req.json();
  const { section, data } = body;

  const VALID_SECTIONS = ['scope', 'approval', 'process', 'timeframes'];
  if (!VALID_SECTIONS.includes(section)) {
    return NextResponse.json({ error: 'Invalid section' }, { status: 400 });
  }

  const serialized = JSON.stringify(data);

  const playbook = await prisma.clientPlaybook.upsert({
    where: { clientId: params.id },
    update: { [section]: serialized, updatedAt: new Date() },
    create: {
      clientId: params.id,
      scope: section === 'scope' ? serialized : '{}',
      approval: section === 'approval' ? serialized : '[]',
      process: section === 'process' ? serialized : '{}',
      timeframes: section === 'timeframes' ? serialized : '{}',
      updatedAt: new Date(),
    },
  });

  return NextResponse.json(playbook);
}
