import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import fs from 'fs';
import path from 'path';

export async function GET(request) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const key = searchParams.get('key');
  if (!key) return NextResponse.json({ error: 'Missing key' }, { status: 400 });

  // Sanitize — only allow qc/ prefix, block path traversal
  if (!key.startsWith('qc/') || key.includes('..') || key.includes('\\')) {
    return NextResponse.json({ error: 'Invalid key' }, { status: 400 });
  }

  const filePath = path.join(process.cwd(), 'uploads', key);
  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const buffer = fs.readFileSync(filePath);
  const ext    = path.extname(key).slice(1).toLowerCase();
  const types  = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webm: 'video/webm' };
  const contentType = types[ext] || 'application/octet-stream';

  return new NextResponse(buffer, {
    headers: {
      'Content-Type':  contentType,
      'Cache-Control': 'private, max-age=3600',
    },
  });
}
