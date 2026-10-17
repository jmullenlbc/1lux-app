/**
 * Seed real Candelas email threads from exported Gmail PDFs.
 * Run: node prisma/seed-candelas-emails.js
 *
 * Threads sourced from:
 *   - ILC Studios Mail - Candelas Updated Pricing.pdf        (4 messages)
 *   - ILC Studios Mail - RE_ Candelas - CSI _ ILC Intro.pdf  (10 messages)
 *   - ILC Studios Mail - Candelas - CSI _ ILC Intro.pdf      (100 messages)
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// ── Date helpers ──────────────────────────────────────────────────────────────
const d = (iso) => new Date(iso);

async function main() {
  const projectId = 'cmpx2u6yh0001b98qntz74l2e'; // Candelas

  // Verify project exists
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true, name: true } });
  if (!project) { console.error('Candelas project not found'); process.exit(1); }
  console.log(`Seeding: ${project.name} (${project.id})`);

  // ── ILC email account ──────────────────────────────────────────────────────
  await prisma.emailAccount.upsert({
    where:  { email: 'mike@ilcstudios.com' },
    update: {},
    create: { id: 'acc-mike-ilc', email: 'mike@ilcstudios.com', displayName: 'Mike Kershner', accountType: 'USER', inboxRole: 'PERSONAL', provider: 'MOCK' },
  });

  // Clear prior seeded messages for this project
  await prisma.emailMessage.deleteMany({ where: { projectId, matchMethod: 'SEEDED' } });
  console.log('Cleared prior seed messages');

  // ── THREAD 1: Candelas Updated Pricing ────────────────────────────────────
  const toCSI = JSON.stringify([
    { email: 'jordan.orr@rangewaterre.com', name: 'Jordan Orr' },
    { email: 'molly.lautares@liverangewater.com', name: 'Molly Lautares' },
    { email: 'kmurphree@liverangewater.com', name: 'Kellyn Murphree' },
  ]);

  const pricing1 = await prisma.emailMessage.create({ data: {
    accountId:      'acc-mike-ilc',
    projectId,
    externalId:     `candelas-pricing-msg1-${Date.now()}`,
    conversationId: 'conv-candelas-pricing-001',
    subject:        'Candelas Updated Pricing',
    fromEmail:      'mason@ilcstudios.com',
    fromName:       'Mason Bartlett',
    toEmails:       JSON.stringify([{ email: 'jordan.orr@liverangewater.com', name: 'Jordan Orr' }]),
    bodyPreview:    'Good afternoon Jordan, Mike mentioned that you wanted me to send you a copy of the updated budget before sending it out to everyone else.',
    bodyHtml:       `<p>Good afternoon Jordan</p>
<p>Mike mentioned that you wanted me to send you a copy of the updated budget before sending it out to everyone else.</p>
<p>Attached is the updated budget through ASI 3 and the handful of RFI's. Totaling <strong>$822,981.11</strong></p>
<p>This is a reduction of $97k from the last budget update in February and puts us pretty close to where we were at the end of 2025.</p>
<p>This update includes all of the updates, revisions, corrections, VE selections, and few additions that have been made throughout all the email discussions, drawing updates, and RFIs.</p>
<p>A few minor items of note:</p>
<ul>
<li>Type SS was added to the drawings and is listed as a decorative sconce to be selected by the owner. We included a budget placeholder price.</li>
<li>The Car Port lights RFI showed them as cylinders in the example photos instead of the strip fixtures shown on the drawings. The cost would be about the same regardless.</li>
<li>On the updated drawings luminaire schedule for types L-7 &amp; L-16 they included different VE selections than the ones you chose via our email conversations. I kept your selections in our budget.</li>
</ul>
<p>Also attached is a pricing for smoke detectors &amp; SD/CO combos, this is separate from the lighting package.</p>
<p>Let us know if you have any questions or need further info on anything.</p>
<p>Thanks as always and have a wonderful weekend!</p>
<p>--<br>Mason Bartlett<br>Project Manager, ILC Studios<br>(720) 248-8208 x 108 | mason@ilcstudios.com</p>`,
    sentAt:         d('2026-05-22T12:59:00-06:00'),
    receivedAt:     d('2026-05-22T12:59:00-06:00'),
    tags:           JSON.stringify(['Budget', 'CO']),
    matchMethod:    'SEEDED',
    isRead:         true,
    hasAttachments: true,
  }});

  await prisma.emailAttachment.createMany({ data: [
    { messageId: pricing1.id, filename: '26.05.22 ILC - CANDELAS BUDGET UPDATE.pdf',          size: 299008, mimeType: 'application/pdf' },
    { messageId: pricing1.id, filename: '26.05.22 ILC - CANDELAS SMOKE & COs BREAKOUT.pdf',   size: 266240, mimeType: 'application/pdf' },
  ]});

  const pricing2 = await prisma.emailMessage.create({ data: {
    accountId:      'acc-mike-ilc',
    projectId,
    externalId:     `candelas-pricing-msg2-${Date.now()}`,
    conversationId: 'conv-candelas-pricing-001',
    subject:        'Candelas Updated Pricing',
    fromEmail:      'mason@ilcstudios.com',
    fromName:       'Mason Bartlett',
    toEmails:       toCSI,
    bodyPreview:    'Attached is an updated version of that pricing with the addition that just came through on RFI 28. Budget now totals $827,825.31.',
    bodyHtml:       `<p>Hi Jordan,</p>
<p>Attached is an updated version of that pricing with the addition that just came through on RFI 28.</p>
<p>That RFI added about $5k to the budget, which now totals <strong>$827,825.31</strong>.</p>
<p>I noted the two items which had increased qtys due to that RFI on the budget.</p>
<p>Let me know if you have any questions on that.</p>
<p>Thanks again,<br>Mason</p>`,
    sentAt:         d('2026-05-22T14:22:00-06:00'),
    receivedAt:     d('2026-05-22T14:22:00-06:00'),
    tags:           JSON.stringify(['Budget', 'CO']),
    matchMethod:    'SEEDED',
    isRead:         true,
    hasAttachments: true,
  }});

  await prisma.emailAttachment.createMany({ data: [
    { messageId: pricing2.id, filename: '26.05.22 ILC - CANDELAS BUDGET UPDATE RFI 28.pdf',    size: 299008, mimeType: 'application/pdf' },
    { messageId: pricing2.id, filename: '26.05.22 ILC - CANDELAS SMOKE & COs BREAKOUT.pdf',    size: 266240, mimeType: 'application/pdf' },
  ]});

  await prisma.emailMessage.create({ data: {
    accountId:      'acc-mike-ilc',
    projectId,
    externalId:     `candelas-pricing-msg3-${Date.now()}`,
    conversationId: 'conv-candelas-pricing-001',
    subject:        'RE: Candelas Updated Pricing',
    fromEmail:      'jordan.orr@rangewaterre.com',
    fromName:       'Jordan Orr',
    toEmails:       JSON.stringify([{ email: 'mason@ilcstudios.com', name: 'Mason Bartlett' }]),
    bodyPreview:    'Thanks Mason. This looks fine to share with CSI on Tuesday morning.',
    bodyHtml:       `<p>Thanks Mason. This looks fine to share with CSI on Tuesday morning.</p>
<p>Jordan</p>`,
    sentAt:         d('2026-05-23T14:25:00-06:00'),
    receivedAt:     d('2026-05-23T14:25:00-06:00'),
    tags:           JSON.stringify(['Budget', 'CO']),
    matchMethod:    'SEEDED',
    isRead:         true,
  }});

  await prisma.emailMessage.create({ data: {
    accountId:      'acc-mike-ilc',
    projectId,
    externalId:     `candelas-pricing-msg4-${Date.now()}`,
    conversationId: 'conv-candelas-pricing-001',
    subject:        'RE: Candelas Updated Pricing',
    fromEmail:      'mason@ilcstudios.com',
    fromName:       'Mason Bartlett',
    toEmails:       toCSI,
    bodyPreview:    'Thanks Jordan',
    bodyHtml:       `<p>Thanks Jordan</p><p>Mason</p>`,
    sentAt:         d('2026-05-26T08:59:00-06:00'),
    receivedAt:     d('2026-05-26T08:59:00-06:00'),
    tags:           JSON.stringify(['Budget', 'CO']),
    matchMethod:    'SEEDED',
    isRead:         true,
  }});

  // ── THREAD 2: RE: Candelas - CSI / ILC Intro ──────────────────────────────
  const csiTeam = JSON.stringify([
    { email: 'rhuber@csigc.com',         name: 'Robbie Huber' },
    { email: 'jason@ilcstudios.com',     name: 'Jason Mullen' },
    { email: 'olivia@ilcstudios.com',    name: 'Olivia Murphy' },
    { email: 'mike@ilcstudios.com',      name: 'Michael Kershner' },
    { email: 'kmurphree@rangewaterre.com', name: 'Kellyn Murphree' },
    { email: 'lhasenack@csigc.com',      name: 'Lexi Hasenack' },
    { email: 'jordan.orr@rangewaterre.com', name: 'Jordan Orr' },
  ]);

  await prisma.emailMessage.create({ data: {
    accountId:      'acc-mike-ilc',
    projectId,
    externalId:     `candelas-csi-re-msg1-${Date.now()}`,
    conversationId: 'conv-candelas-csi-re-001',
    subject:        'RE: Candelas - CSI / ILC Intro',
    fromEmail:      'rhuber@csigc.com',
    fromName:       'Robbie Huber',
    toEmails:       csiTeam,
    bodyPreview:    'Hi ILC Team, I am following up on my previous email sent on May 27 regarding the information outlined below. Please provide CSI with a status update.',
    bodyHtml:       `<p>Hi ILC Team,</p>
<p>I am following up on my previous email sent on May 27, 2026, regarding the information outlined below.</p>
<p>Please provide CSI with a status update at your earliest convenience. If there are any remaining questions, clarifications needed, or final updates pending before completion, please let us know.</p>
<p>Thank you,</p>
<p>Robbie Huber<br>Project Engineer<br>Phone: 303-819-4605<br>Colorado Structures Inc. d.b.a. CSI Construction Company</p>`,
    sentAt:         d('2026-06-02T09:22:00-06:00'),
    receivedAt:     d('2026-06-02T09:22:00-06:00'),
    tags:           JSON.stringify(['RFI', 'Schedule']),
    matchMethod:    'SEEDED',
    isRead:         true,
  }});

  await prisma.emailMessage.create({ data: {
    accountId:      'acc-mike-ilc',
    projectId,
    externalId:     `candelas-csi-re-msg2-${Date.now()}`,
    conversationId: 'conv-candelas-csi-re-001',
    subject:        'RE: Candelas - CSI / ILC Intro',
    fromEmail:      'mason@ilcstudios.com',
    fromName:       'Mason Bartlett',
    toEmails:       csiTeam,
    bodyPreview:    'Hi Robbie, we will get started on a submittal package, but we also need to get a finalized PO for the package as well.',
    bodyHtml:       `<p>Hi Robbie,</p>
<p>Yeah we will get started on a submittal package, but we also need to get a finalized PO for the package as well. I have looped in Jason Mullen our CEO to help finalize that. We started those discussions at the beginning of the year but they were put on the backburner while we worked through all the recent coordination items.</p>
<p><strong>Type D1:</strong> I changed those to surface mounted disks and adjusted the description to make that a little more clear, as the Luminaire schedule on the drawings didn't update those descriptions. There are no more recessed fixtures in the package per previous conversations and clarifications from Lexi.</p>
<p><strong>L-17:</strong> That qty of 27 is linear feet with a per foot price accordingly for the tape light. Type PS1 on our budget is also the power supplies for that tape lighting.</p>
<p><strong>U11 &amp; X4:</strong> I will remove U11 from our package per your direction, and will also add in the X4's with an updated budget. We are just waiting on the pricing for that X4 fixture.</p>
<p><strong>Type SF</strong> is in linear feet as well. The scale listed on page XR-E101 is incorrect and we adjusted based on an average 3' door measurement for correct scale.</p>
<p><strong>Smoke Detectors:</strong> ILC will not be providing these and I won't include that breakout with the next update.</p>
<p>Let us know if you need anything else.</p>
<p>Thanks,<br>Mason Bartlett<br>Project Manager, ILC Studios</p>`,
    sentAt:         d('2026-06-02T13:24:00-06:00'),
    receivedAt:     d('2026-06-02T13:24:00-06:00'),
    tags:           JSON.stringify(['RFI', 'Schedule']),
    matchMethod:    'SEEDED',
    isRead:         false,
  }});

  // ── THREAD 3: Candelas - CSI / ILC Intro (original) ──────────────────────
  const fullCSITeam = JSON.stringify([
    { email: 'lhasenack@csigc.com',         name: 'Lexi Hasenack' },
    { email: 'jordan.orr@liverangewater.com', name: 'Jordan Orr' },
    { email: 'rhuber@csigc.com',             name: 'Robbie Huber' },
    { email: 'JFlores@jhparch.com',          name: 'Juan Flores' },
    { email: 'badams@vida-design.com',       name: 'Bridgette Adams' },
    { email: 'molly.lautares@liverangewater.com', name: 'Molly Lautares' },
    { email: 'mike@ilcstudios.com',          name: 'Michael Kershner' },
    { email: 'olivia@ilcstudios.com',        name: 'Olivia Murphy' },
  ]);

  await prisma.emailMessage.create({ data: {
    accountId:      'acc-mike-ilc',
    projectId,
    externalId:     `candelas-csi-intro-msg1-${Date.now()}`,
    conversationId: 'conv-candelas-csi-intro-001',
    subject:        'RE: Candelas - CSI / ILC Intro',
    fromEmail:      'lhasenack@csigc.com',
    fromName:       'Lexi Hasenack',
    toEmails:       fullCSITeam,
    bodyPreview:    'Mason, we just closed out the attached RFI, which added EM2 fixtures at all the riser rooms. Please be sure to account for these.',
    bodyHtml:       `<p>Mason,</p>
<p>We just closed out the attached RFI, which added EM2 fixtures at all the riser rooms. Please be sure to account for these. Thank you!</p>
<p>Lexi Hasenack<br>Project Manager<br>Colorado Structures Inc. d.b.a CSI Construction Company<br>Mobile: 303-518-8662 | Work: 719-522-0500</p>`,
    sentAt:         d('2026-05-12T16:13:00-06:00'),
    receivedAt:     d('2026-05-12T16:13:00-06:00'),
    tags:           JSON.stringify(['RFI', 'Design']),
    matchMethod:    'SEEDED',
    isRead:         true,
    hasAttachments: true,
  }});

  const introMsg2 = await prisma.emailMessage.create({ data: {
    accountId:      'acc-mike-ilc',
    projectId,
    externalId:     `candelas-csi-intro-msg2-${Date.now()}`,
    conversationId: 'conv-candelas-csi-intro-001',
    subject:        'RE: Candelas - CSI / ILC Intro',
    fromEmail:      'lhasenack@csigc.com',
    fromName:       'Lexi Hasenack',
    toEmails:       fullCSITeam,
    bodyPreview:    'Please see the attached RFI that we closed out, which changed the fixture type for the L-15 Light Fixture.',
    bodyHtml:       `<p>Mason,</p>
<p>Please see the attached RFI that we closed out, which changed the fixture type for the L-15 Light Fixture. Please be sure to include this correct fixture in your pricing. Thank you!</p>
<p>Lexi Hasenack<br>Project Manager<br>Colorado Structures Inc. d.b.a CSI Construction Company</p>`,
    sentAt:         d('2026-05-12T16:49:00-06:00'),
    receivedAt:     d('2026-05-12T16:49:00-06:00'),
    tags:           JSON.stringify(['RFI', 'Design']),
    matchMethod:    'SEEDED',
    isRead:         true,
    hasAttachments: true,
  }});

  await prisma.emailAttachment.create({ data: {
    messageId: introMsg2.id, filename: 'RFI - L-15 Fixture Change.pdf', size: 184320, mimeType: 'application/pdf',
  }});

  await prisma.emailMessage.create({ data: {
    accountId:      'acc-mike-ilc',
    projectId,
    externalId:     `candelas-csi-intro-msg3-${Date.now()}`,
    conversationId: 'conv-candelas-csi-intro-001',
    subject:        'RE: Candelas - CSI / ILC Intro',
    fromEmail:      'mason@ilcstudios.com',
    fromName:       'Mason Bartlett',
    toEmails:       fullCSITeam,
    bodyPreview:    'Thanks Lexi, I appreciate you doing all of that, we will make sure everything is updated accordingly with the updated pricing we are working on.',
    bodyHtml:       `<p>Thanks Lexi,</p>
<p>I appreciate you doing all of that, we will make sure everything is updated accordingly with the updated pricing we are working on.</p>
<p>Thanks,<br>Mason Bartlett<br>Project Manager, ILC Studios</p>`,
    sentAt:         d('2026-05-12T16:52:00-06:00'),
    receivedAt:     d('2026-05-12T16:52:00-06:00'),
    tags:           JSON.stringify(['RFI', 'Design']),
    matchMethod:    'SEEDED',
    isRead:         false,
  }});

  console.log('\n✅ Candelas email seed complete, 3 threads seeded:');
  console.log('   Thread 1: Candelas Updated Pricing       (4 msgs, Budget/CO)');
  console.log('   Thread 2: RE: Candelas - CSI / ILC Intro (2 msgs, RFI/Schedule, 1 unread)');
  console.log('   Thread 3: Candelas - CSI / ILC Intro     (3 msgs, RFI/Design, 1 unread)');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
