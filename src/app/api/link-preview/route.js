import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { putQcObject, getQcObjectUrl } from '@/lib/qcStorage';

export const dynamic = 'force-dynamic';

function perms(s) { try { return JSON.parse(s.permissions || '{}'); } catch { return {}; } }
function isAdmin(s) { return s.role === 'ILC_ADMIN' || s.role === 'SUPER_ADMIN'; }
const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif' };

// Pull a <meta> content by property or name (either attribute order).
function meta(html, prop) {
  const p = prop.replace(/[:]/g, '\\:');
  const a = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${p}["'][^>]+content=["']([^"']*)["']`, 'i'));
  if (a) return a[1];
  const b = html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${p}["']`, 'i'));
  return b ? b[1] : null;
}
function decodeEntities(s) {
  return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d)).trim();
}
// Block obvious internal/private targets (basic SSRF guard).
function blocked(host) {
  return /^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.|\[?::1\]?)/i.test(host) || /\.local$/i.test(host)
    || /^172\.(1[6-9]|2\d|3[01])\./.test(host);
}

// POST { url } → { imageKey, imageUrl, title, description }
// Fetches a product page, extracts the Open Graph image + title, and stores the
// image durably (so pasting a link populates the thumbnail — no manual upload).
export async function POST(req) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(isAdmin(s) || perms(s).clients === true)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { url } = await req.json().catch(() => ({}));
  let u;
  try { u = new URL(url); } catch { return NextResponse.json({ error: 'Invalid URL' }, { status: 400 }); }
  if (!['http:', 'https:'].includes(u.protocol) || blocked(u.hostname)) {
    return NextResponse.json({ error: 'URL not allowed' }, { status: 400 });
  }

  let html = '';
  try {
    const r = await fetch(u.href, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ILCStudiosBot/1.0; +link-preview)', 'Accept': 'text/html' },
      redirect: 'follow', signal: AbortSignal.timeout(8000),
    });
    html = (await r.text()).slice(0, 500_000); // cap
  } catch {
    return NextResponse.json({ error: 'Could not fetch the page' }, { status: 502 });
  }

  let img = meta(html, 'og:image') || meta(html, 'og:image:secure_url') || meta(html, 'twitter:image') || meta(html, 'twitter:image:src');
  const rawTitle = meta(html, 'og:title') || (html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] ?? null);
  const description = meta(html, 'og:description') || meta(html, 'description');
  if (img && !/^https?:/i.test(img)) { try { img = new URL(img, u.href).href; } catch { img = null; } }

  let imageKey = null, imageUrl = null;
  if (img && !blocked((() => { try { return new URL(img).hostname; } catch { return 'x'; } })())) {
    try {
      const ir = await fetch(img, { signal: AbortSignal.timeout(8000), headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ILCStudiosBot/1.0)' } });
      const ct = (ir.headers.get('content-type') || '').split(';')[0].trim();
      if (ct.startsWith('image/')) {
        const buf = Buffer.from(await ir.arrayBuffer());
        if (buf.length > 0 && buf.length < 8 * 1024 * 1024) {
          imageKey = await putQcObject(buf, { ext: EXT[ct] || 'jpg', contentType: ct });
          imageUrl = await getQcObjectUrl(imageKey);
        }
      }
    } catch { /* image fetch failed — still return title */ }
  }

  return NextResponse.json({
    imageKey, imageUrl,
    title: rawTitle ? decodeEntities(rawTitle) : null,
    description: description ? decodeEntities(description) : null,
  });
}
