/**
 * Seed 6 mock email threads for any project.
 *
 * Usage:
 *   node prisma/seed-correspondence.js                        ← first project in DB
 *   node prisma/seed-correspondence.js <projectId>           ← ID from URL bar
 *   node prisma/seed-correspondence.js "The Summit"          ← name search
 *
 * IMPORTANT: EmailAccount records represent ILC-CONTROLLED inboxes only.
 * External senders are identified via fromEmail/fromName, not EmailAccount records.
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // ── 1. Find target project ──────────────────────────────────────────────────
  const arg = process.argv[2]?.trim();
  let project = null;

  if (arg) {
    // Try exact ID match first (from URL bar)
    project = await prisma.project.findUnique({
      where:  { id: arg },
      select: { id: true, name: true },
    });
    // Fall back to name search
    if (!project) {
      project = await prisma.project.findFirst({
        where:   { name: { contains: arg } },
        select:  { id: true, name: true },
        orderBy: { createdAt: 'desc' },
      });
    }
    if (!project) {
      console.error(`ERROR: No project found matching "${arg}"`);
      console.error('Tip: copy the ID from your browser URL bar, e.g.:');
      console.error('  node prisma/seed-correspondence.js cmp3jmk01000bdhgo6don6055');
      process.exit(1);
    }
  } else {
    // No argument, use the most recently created project
    project = await prisma.project.findFirst({
      select:  { id: true, name: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  if (!project) {
    console.error('ERROR: No projects found in DB. Create a project first.');
    process.exit(1);
  }
  console.log(`Seeding: ${project.name} (${project.id})`);

  // ── 2. ILC email account ────────────────────────────────────────────────────
  const mikeAccount = await prisma.emailAccount.upsert({
    where: { email: 'mike@ilcstudios.com' },
    update: {},
    create: {
      id:          'acc-mike-ilc',
      email:       'mike@ilcstudios.com',
      displayName: 'Mike Kershner',
      accountType: 'USER',
      inboxRole:   'PERSONAL',
      provider:    'MOCK',
    },
  });
  console.log(`Account: ${mikeAccount.email}`);

  // ── 3. Clean up any prior seed data for this project ───────────────────────
  await prisma.emailMessage.deleteMany({
    where: { projectId: project.id, matchMethod: 'SEEDED' },
  });
  console.log('Cleared prior seed messages');

  // Helpers
  const ago = (days, hours = 0) => {
    const d = new Date();
    d.setDate(d.getDate() - days);
    d.setHours(d.getHours() - hours);
    return d;
  };

  // ── 4. Thread 1, Design review (3 msgs, 1 unread) ─────────────────────────
  const [t1m1] = await createThread({
    projectId:     project.id,
    accountId:     mikeAccount.id,
    conversationId: 'conv-design-review-001',
    tags:          ['Design', 'Schedule'],
    messages: [
      {
        fromEmail: 'mike@ilcstudios.com', fromName: 'Mike Kershner',
        toEmails:  JSON.stringify([{ email: 't.romero@vca-arch.com', name: 'Travis Romero' }]),
        subject:   'Grove St: Design review comments',
        bodyPreview: 'Sending over the updated fixture schedule for Grove St ahead of the DD review…',
        bodyHtml:  '<p>Hi Travis,</p><p>Sending over the updated fixture schedule for Grove St ahead of the DD review meeting next week. Let me know if anything needs clarification.</p><p>Thanks,<br>Mike</p>',
        sentAt:    ago(11), receivedAt: ago(11), isRead: true,
      },
      {
        fromEmail: 't.romero@vca-arch.com', fromName: 'Travis Romero',
        toEmails:  JSON.stringify([{ email: 'mike@ilcstudios.com', name: 'Mike Kershner' }]),
        subject:   'RE: Grove St: Design review comments',
        bodyPreview: 'Thanks for the updated schedule. A few notes on the unit A1 disk spec…',
        bodyHtml:  '<p>Mike,</p><p>Thanks for the updated schedule. A few notes on the unit A1 disk spec. Can we discuss the trim ring finish? Current spec shows brushed nickel but ownership is leaning toward matte white for unit interiors.</p><p>Best,<br>Travis</p>',
        sentAt:    ago(10), receivedAt: ago(10), isRead: true,
      },
      {
        fromEmail: 't.romero@vca-arch.com', fromName: 'Travis Romero',
        toEmails:  JSON.stringify([{ email: 'mike@ilcstudios.com', name: 'Mike Kershner' }]),
        subject:   'RE: Grove St: Design review comments',
        bodyPreview: 'Interior designer approved the Visa pendant, good to proceed',
        bodyHtml:  '<p>Mike,</p><p>One more update: <strong>the interior designer has approved the amenity pendant</strong> (Visa Lighting PD-4422-BN). We\'re good to proceed on that spec. I\'ve noted this in our review log.</p><p>Everything else from the last round of comments is resolved on our end. Let us know if you need anything before the CD submittal.</p><p>Best,<br>Travis Romero<br>VCA Architecture</p>',
        sentAt:    ago(0, 2), receivedAt: ago(0, 2), isRead: false,
        attachments: [{ filename: 'updated-fixture-schedule-v3.pdf', size: 284500, mimeType: 'application/pdf' }],
      },
    ],
  });

  // ── 5. Thread 2, RFI #12 (2 msgs, 1 unread) ───────────────────────────────
  await createThread({
    projectId: project.id, accountId: mikeAccount.id,
    conversationId: 'conv-rfi-12-001',
    tags: ['RFI', 'Design'],
    messages: [
      {
        fromEmail: 'mike@ilcstudios.com', fromName: 'Mike Kershner',
        toEmails:  JSON.stringify([{ email: 'engineer@jordanskala.com', name: 'Jordan Skala Engineers' }]),
        subject:   'RFI #12: Emergency egress circuit question',
        bodyPreview: 'We have a question regarding the egress lighting circuit at stair tower 2…',
        bodyHtml:  '<p>Hi,</p><p>We have a question regarding the egress lighting circuit at stair tower 2. The spec calls for a dedicated circuit but the electrical drawings show it sharing with the corridor lighting. Please clarify the intent.</p><p>Thanks,<br>Mike Kershner, ILC Studios</p>',
        sentAt:    ago(1, 3), receivedAt: ago(1, 3), isRead: true,
      },
      {
        fromEmail: 'engineer@jordanskala.com', fromName: 'Jordan Skala Engineers',
        toEmails:  JSON.stringify([{ email: 'mike@ilcstudios.com', name: 'Mike Kershner' }]),
        subject:   'RE: RFI #12: Emergency egress circuit question',
        bodyPreview: 'See attached red-line. Our recommendation is to add a dedicated circuit…',
        bodyHtml:  '<p>Mike,</p><p>See attached red-line markup. Our recommendation is to add a dedicated 20A circuit for the egress lighting at stair tower 2. The shared circuit scenario in the current drawings does not meet NEC 700 requirements for legally required standby systems.</p><p>Please issue an ASI to update the electrical drawings accordingly.</p><p>Regards,<br>Jordan Skala Engineers</p>',
        sentAt:    ago(0, 18), receivedAt: ago(0, 18), isRead: false,
        attachments: [{ filename: 'RFI-12-redline-JSE.pdf', size: 156000, mimeType: 'application/pdf' }],
      },
    ],
  });

  // ── 6. Thread 3, Contract revision (1 msg, unread) ────────────────────────
  await createThread({
    projectId: project.id, accountId: mikeAccount.id,
    conversationId: 'conv-contract-001',
    tags: ['Contract'],
    messages: [
      {
        fromEmail: 'projects@lincolnavenue.com', fromName: 'Lincoln Avenue Communities',
        toEmails:  JSON.stringify([{ email: 'orders@ilcstudios.com', name: 'ILC Studios' }]),
        subject:   'Grove St: Contract revision request',
        bodyPreview: 'Our legal team has flagged two items in the supply contract…',
        bodyHtml:  '<p>Hello ILC team,</p><p>Our legal team has flagged two items in the supply contract that need revision before we can execute:</p><ol><li>Section 4.2: the indemnification language needs to be mutual rather than one-sided</li><li>Section 7.1: payment terms should be net-45 per our standard, not net-30</li></ol><p>Please update and reissue. We\'d like to execute by end of next week.</p><p>Best,<br>Lincoln Avenue Communities</p>',
        sentAt:    ago(4), receivedAt: ago(4), isRead: false,
      },
    ],
  });

  // ── 7. Thread 4, DD submittal (1 msg, read) ───────────────────────────────
  await createThread({
    projectId: project.id, accountId: mikeAccount.id,
    conversationId: 'conv-dd-submittal-001',
    tags: ['Design', 'Budget'],
    messages: [
      {
        fromEmail: 'mike@ilcstudios.com', fromName: 'Mike Kershner',
        toEmails:  JSON.stringify([
          { email: 't.romero@vca-arch.com', name: 'Travis Romero' },
          { email: 'pm@alliancecolorado.com', name: 'Alliance Colorado Builders' },
        ]),
        subject:   'Grove St: DD submittal package sent',
        bodyPreview: 'Please find attached the DD submittal package for review…',
        bodyHtml:  '<p>Travis, Team,</p><p>Please find attached the DD submittal package for review. This includes the fixture schedule, cutsheets for all specified types, and the preliminary controls narrative.</p><p>Review deadline is June 7. Please route to your consultants accordingly.</p><p>Best,<br>Mike Kershner<br>ILC Studios | Lighting Design + Procurement</p>',
        sentAt:    ago(9), receivedAt: ago(9), isRead: true,
      },
    ],
  });

  // ── 8. Thread 5, Schedule update (2 msgs, read) ───────────────────────────
  await createThread({
    projectId: project.id, accountId: mikeAccount.id,
    conversationId: 'conv-schedule-001',
    tags: ['Schedule'],
    messages: [
      {
        fromEmail: 'pm@alliancecolorado.com', fromName: 'Alliance Colorado Builders',
        toEmails:  JSON.stringify([{ email: 'mike@ilcstudios.com', name: 'Mike Kershner' }]),
        subject:   'RE: Schedule update: MEP rough-in push',
        bodyPreview: 'Due to permit delays MEP rough-in is now July 8…',
        bodyHtml:  '<p>Mike,</p><p>Due to permit delays, MEP rough-in is now scheduled for July 8 (was June 24). This pushes trim and fixture delivery by approximately 2 weeks. Please update your ship schedule accordingly and let us know if any lead times are at risk.</p><p>Thanks,<br>Alliance Colorado Builders</p>',
        sentAt:    ago(12), receivedAt: ago(12), isRead: true,
      },
      {
        fromEmail: 'mike@ilcstudios.com', fromName: 'Mike Kershner',
        toEmails:  JSON.stringify([{ email: 'pm@alliancecolorado.com', name: 'Alliance Colorado Builders' }]),
        subject:   'RE: Schedule update: MEP rough-in push',
        bodyPreview: 'Understood, we\'ve updated our ship schedule. Acuity has 14-week lead time so we\'re still on track…',
        bodyHtml:  '<p>Understood, we\'ve updated the ship schedule to reflect the July 8 rough-in date. Acuity (recessed downlights, 312 units) has a 14-week lead time from PO placed May 12, so delivery is projected for mid-August, still clear of the new rough-in date.</p><p>Will flag if anything changes on the manufacturing side.</p><p>Mike</p>',
        sentAt:    ago(12, -2), receivedAt: ago(12, -2), isRead: true,
      },
    ],
  });

  // ── 9. Thread 6, CO #3 (1 msg, read) ──────────────────────────────────────
  await createThread({
    projectId: project.id, accountId: mikeAccount.id,
    conversationId: 'conv-co3-001',
    tags: ['CO'],
    messages: [
      {
        fromEmail: 'mike@ilcstudios.com', fromName: 'Mike Kershner',
        toEmails:  JSON.stringify([
          { email: 'pm@alliancecolorado.com', name: 'Alliance Colorado Builders' },
          { email: 't.romero@vca-arch.com',   name: 'Travis Romero' },
        ]),
        subject:   'Grove St: Change order #3 submitted to GC',
        bodyPreview: 'Submitting CO #3 for the added circuit run in unit 204…',
        bodyHtml:  '<p>Team,</p><p>Submitting CO #3 for the added circuit run in unit 204 to support the upgraded under-cabinet lighting per ownership\'s direction. Net add: $4,150. Please find the CO PDF attached for signature.</p><p>Best,<br>Mike Kershner<br>ILC Studios</p>',
        sentAt:    ago(16), receivedAt: ago(16), isRead: true,
      },
    ],
  });

  console.log('\n✅ Correspondence seed complete, 6 threads created for', project.name);
}

// ── Helper: create a thread (messages + optional attachments) ────────────────
async function createThread({ projectId, accountId, conversationId, tags, messages }) {
  const created = [];
  for (const msg of messages) {
    const { attachments, ...msgData } = msg;
    const record = await prisma.emailMessage.create({
      data: {
        ...msgData,
        accountId,
        projectId,
        conversationId,
        externalId:  `mock-${conversationId}-${Date.now()}-${Math.random()}`,
        tags:        JSON.stringify(tags),
        matchMethod: 'SEEDED',
      },
    });
    if (attachments?.length) {
      await prisma.emailAttachment.createMany({
        data: attachments.map(a => ({ ...a, messageId: record.id })),
      });
    }
    created.push(record);
  }
  return created;
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
