import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { putQcObject, getQcObjectUrl } from '@/lib/qcStorage';

export async function POST(request) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  let formData;
  try { formData = await request.formData(); }
  catch { return NextResponse.json({ error: 'Invalid form data' }, { status: 400 }); }

  const metaStr = formData.get('meta');
  if (!metaStr) return NextResponse.json({ error: 'Missing meta' }, { status: 400 });

  let meta;
  try { meta = JSON.parse(metaStr); }
  catch { return NextResponse.json({ error: 'Invalid meta JSON' }, { status: 400 }); }

  const {
    title, description, severity, module: bugModule, pageUrl,
    expectedText, actualText, consoleJson, networkJson,
    pageStateJson, browserInfo, viewport, projectId,
  } = meta;

  if (!title?.trim()) return NextResponse.json({ error: 'Title required' }, { status: 400 });

  let screenshotKey = null;
  const screenshot = formData.get('screenshot');
  if (screenshot && screenshot.size > 0) {
    const buf = Buffer.from(await screenshot.arrayBuffer());
    screenshotKey = await putQcObject(buf, { ext: 'png' });
  }

  const report = await prisma.bugReport.create({
    data: {
      title:         title.trim(),
      description:   description?.trim() || '',
      status:        'NEW',
      severity:      (severity || 'MAJOR').toUpperCase(),
      module:        bugModule || null,
      pageUrl:       pageUrl || null,
      projectId:     projectId || null,
      expectedText:  expectedText?.trim() || null,
      actualText:    actualText?.trim() || null,
      screenshotKey,
      consoleJson:   consoleJson  || '[]',
      networkJson:   networkJson  || '[]',
      pageStateJson: pageStateJson || null,
      browserInfo:   browserInfo  || null,
      viewport:      viewport     || null,
      reporterId:    user.id,
    },
    include: {
      reporter: { select: { id: true, name: true, email: true } },
      assignee: { select: { id: true, name: true, email: true } },
    },
  });

  // Blocker alert → notify all super admins
  if (report.severity === 'BLOCKER') {
    const admins = await prisma.user.findMany({
      where: { role: { in: ['ILC_ADMIN', 'SUPER_ADMIN'] }, isActive: true },
      select: { id: true },
    });
    await Promise.all(admins.map(a =>
      prisma.userAlert.create({
        data: {
          userId:    a.id,
          type:      'BUG_BLOCKER',
          title:     `Blocker: ${title.trim()}`,
          message:   `${user.name || user.email} — ${bugModule || 'app'}`,
          link:      `/admin/qc?focus=${report.id}`,
          dedupeKey: `bug-blocker-${report.id}-${a.id}`,
        },
      }).catch(() => {})
    ));
  }

  return NextResponse.json({
    ...report,
    consoleJson:   JSON.parse(report.consoleJson),
    networkJson:   JSON.parse(report.networkJson),
    pageStateJson: report.pageStateJson ? JSON.parse(report.pageStateJson) : null,
    screenshotUrl: report.screenshotKey ? await getQcObjectUrl(report.screenshotKey) : null,
  }, { status: 201 });
}

export async function GET(request) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const where = {};
  const status   = searchParams.get('status');
  const severity = searchParams.get('severity');
  const module   = searchParams.get('module');
  if (status)   where.status   = status;
  if (severity) where.severity = severity;
  if (module)   where.module   = module;

  const reports = await prisma.bugReport.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      reporter: { select: { id: true, name: true, email: true } },
      assignee: { select: { id: true, name: true, email: true } },
    },
  });

  const out = await Promise.all(reports.map(async r => ({
    ...r,
    consoleJson:   JSON.parse(r.consoleJson  || '[]'),
    networkJson:   JSON.parse(r.networkJson  || '[]'),
    pageStateJson: r.pageStateJson ? JSON.parse(r.pageStateJson) : null,
    screenshotUrl: r.screenshotKey ? await getQcObjectUrl(r.screenshotKey) : null,
  })));

  return NextResponse.json(out);
}
