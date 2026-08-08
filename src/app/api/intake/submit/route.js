import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(req) {
  const { contactName, contactEmail, companyName, projectName, buildingType, grossSf, drawingsData } =
    await req.json();

  if (!contactName || !contactEmail || !projectName) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const emailLower = contactEmail.toLowerCase().trim();
  const domain = emailLower.split('@')[1] ?? '';

  const submission = await prisma.conceptualSubmission.create({
    data: {
      submitterName:   contactName,
      submitterEmail:  emailLower,
      submitterDomain: domain,
      proposedName:    companyName || projectName,
      buildingType:    buildingType || null,
      rawPayload: JSON.stringify({
        projectName,
        grossSf: grossSf ? Number(grossSf) : null,
        drawings: drawingsData || null,
        submittedAt: new Date().toISOString(),
      }),
    },
  });

  return NextResponse.json({ id: submission.id });
}
