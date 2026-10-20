import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { loadLink, linkState, ipHashOf, checkPassword, recentPasswordFails, PASSWORD_FAIL_LIMIT } from '@/lib/salesDocs/share';
import { signPass, setPass } from '@/lib/salesDocs/cookie';
import { normalizeEmail, emailDomain, matchVisitor } from '@/lib/salesDocs/matching';

export const runtime = 'nodejs';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function visitorFor(email, name) {
  const now = new Date();
  if (!email) return prisma.salesDocVisitor.create({ data: { name: name || null, firstSeenAt: now, lastSeenAt: now } });
  const existing = await prisma.salesDocVisitor.findUnique({ where: { email } });
  if (existing && existing.matchType !== 'NONE') {
    return prisma.salesDocVisitor.update({ where: { id: existing.id }, data: { lastSeenAt: now, ...(name && !existing.name ? { name } : {}) } });
  }
  const m = await matchVisitor(prisma, email);
  const data = { domain: emailDomain(email), matchType: m.matchType, clientId: m.clientId, contactId: m.contactId, lastSeenAt: now };
  if (existing) return prisma.salesDocVisitor.update({ where: { id: existing.id }, data: { ...data, ...(name && !existing.name ? { name } : {}) } });
  return prisma.salesDocVisitor.upsert({
    where: { email },
    create: { email, name: name || null, firstSeenAt: now, ...data },
    update: data,
  });
}

// POST /api/share/docs/[token]/gate  { email?, name?, password? }
// Checks what the link asks for and hands back a signed pass cookie.
// Sent with an empty body when the link asks for nothing, so every
// visitor still gets a visitor id for tracking.
export async function POST(request, { params }) {
  const link = await loadLink(params.token);
  if (linkState(link) !== 'OK') return NextResponse.json({ error: 'This link no longer works.' }, { status: 410 });
  const body = await request.json().catch(() => ({}));
  const ipHash = ipHashOf(request);

  const email = normalizeEmail(body.email);
  const name = String(body.name || '').trim().slice(0, 120) || null;
  if (link.requireEmail && (!email || !EMAIL_RE.test(email))) {
    return NextResponse.json({ error: 'Enter your work email to open this.' }, { status: 400 });
  }

  if (link.passwordHash) {
    if (await recentPasswordFails(link.id, ipHash) >= PASSWORD_FAIL_LIMIT) {
      return NextResponse.json({ error: 'Too many tries. Wait 15 minutes and try again.' }, { status: 429 });
    }
    if (!(await checkPassword(body.password, link.passwordHash))) {
      await prisma.salesDocEvent.create({ data: { type: 'PASSWORD_FAIL', linkId: link.id, docId: link.docId || null, email, ipHash } });
      return NextResponse.json({ error: 'That password is not right.' }, { status: 401 });
    }
  }

  const visitor = await visitorFor(email && EMAIL_RE.test(email) ? email : null, name);
  await prisma.salesDocEvent.create({
    data: { type: 'GATE_PASSED', linkId: link.id, visitorId: visitor.id, docId: link.docId || null, email: visitor.email, ipHash },
  });
  const token = await signPass({ linkId: link.id, visitorId: visitor.id });
  return setPass(NextResponse.json({ ok: true }), link.id, token);
}
