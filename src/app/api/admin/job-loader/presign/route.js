import { NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/auth';
import { MULTIPART_MIN_BYTES, presignAvailable, presignMultipart, presignUpload, typesForScope } from '@/lib/uploadStorage';

export const dynamic = 'force-dynamic';

// A whole job holds sets far past the 25 MB a project upload allows. Super admin
// only, which is why this is its own desk and not a new scope on the public one.
const MAX_BYTES = 800 * 1024 * 1024;

/** Permission slip for one Job Loader file going straight to Amazon. */
export async function POST(request) {
  const { error } = await requireSuperAdmin(request);
  if (error) return error;
  if (!presignAvailable()) return NextResponse.json({ available: false });

  const body = await request.json().catch(() => null);
  const name = String(body?.fileName ?? '');
  const size = Number(body?.size);
  const ext = name.includes('.') ? name.split('.').pop().toLowerCase() : '';
  const contentType = typesForScope('knowledge')[ext];
  if (!contentType) {
    return NextResponse.json({ message: `${name} is a .${ext || 'unknown'} file, which the app does not hold. Set it to Skip on the sheet. (JOB_LOADER_TYPE)` }, { status: 400 });
  }
  if (!Number.isFinite(size) || size <= 0 || size > MAX_BYTES) {
    return NextResponse.json({ message: `${name} is ${Math.round(size / 1048576)} MB and the loader takes up to 800 MB. Set it to Skip on the sheet. (JOB_LOADER_SIZE)` }, { status: 400 });
  }
  try {
    const slip = body?.multipart === true && size >= MULTIPART_MIN_BYTES
      ? await presignMultipart({ scope: 'project', ext, contentType, size })
      : await presignUpload({ scope: 'project', ext, contentType });
    return NextResponse.json({ available: true, ...slip, contentType });
  } catch (e) {
    console.error('[job-loader:presign]', e);
    return NextResponse.json({ message: `Amazon storage would not take ${name}. Nothing was saved for this file. Press Continue to try again. (JOB_LOADER_PRESIGN)` }, { status: 502 });
  }
}
