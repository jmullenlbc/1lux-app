import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';

// Your own email signature fields (Mike 9-26). Email comes from the account;
// the printed name (blank = account name), title, cell and optional office
// line are typed here. Everyone edits only their own.
const FIELDS = { name: true, email: true, jobTitle: true, phone: true, signatureName: true, officePhone: true, officeExt: true };
const EDITABLE = ['signatureName', 'jobTitle', 'phone', 'officePhone', 'officeExt'];

export async function GET() {
  const { user, error } = await requireAuth();
  if (error) return error;
  const u = await prisma.user.findUnique({ where: { id: user.id }, select: FIELDS });
  return NextResponse.json(u || {});
}

export async function PATCH(request) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const b = await request.json().catch(() => ({}));
  const data = {};
  for (const k of EDITABLE) {
    if (k in b) data[k] = String(b[k] ?? '').trim().slice(0, 120) || null;
  }
  const u = await prisma.user.update({ where: { id: user.id }, data, select: FIELDS });
  return NextResponse.json(u);
}
