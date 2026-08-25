import { NextResponse } from 'next/server';
import { requireAuth, canSeeAllData } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function GET(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const project = await prisma.project.findUnique({ where: { id: params.id } });
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!canSeeAllData(user) && project.createdById !== user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get('q') || '').trim().toLowerCase();

  if (!q || q.length < 2) return NextResponse.json({ results: [] });

  const files = await prisma.projectFile.findMany({
    where: { projectId: params.id, textContent: { not: null } },
    select: { id: true, originalName: true, tab: true, fileType: true, tags: true, textContent: true, createdAt: true, storedPath: true },
  });

  const results = [];

  for (const file of files) {
    const text = file.textContent || '';
    const lc   = text.toLowerCase();
    const idx  = lc.indexOf(q);
    if (idx === -1) continue;

    // Extract surrounding context (up to 3 snippets)
    const snippets = [];
    let pos = 0;
    let found = 0;
    while ((pos = lc.indexOf(q, pos)) !== -1 && found < 3) {
      const start   = Math.max(0, pos - 120);
      const end     = Math.min(text.length, pos + q.length + 120);
      const snippet = (start > 0 ? '…' : '') + text.slice(start, end).replace(/\n+/g, ' ').trim() + (end < text.length ? '…' : '');
      snippets.push(snippet);
      pos += q.length;
      found++;
    }

    results.push({
      fileId:       file.id,
      originalName: file.originalName,
      tab:          file.tab,
      fileType:     file.fileType,
      tags:         file.tags ? JSON.parse(file.tags) : [],
      createdAt:    file.createdAt,
      storedPath:   file.storedPath,
      snippets,
    });
  }

  return NextResponse.json({ results, query: q });
}
