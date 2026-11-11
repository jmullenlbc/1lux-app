import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function POST(req) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const existingCount = await prisma.messageTemplate.count();
  if (existingCount > 0) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const starterTemplates = [
    // EMAIL templates
    {
      channel: 'EMAIL',
      name: 'New Proposal',
      scenario: 'new_intro',
      subject: '1LUX: {projectName} Lighting Proposal',
      body: 'Hi {contactFirstName},\n\nThank you for the opportunity to submit a proposal for {projectName}. We\'ve put together our recommended scope and fee for your review.\n\nI\'m happy to walk you through the details at your convenience. Just let me know what works for your schedule.\n\nBest,\n{senderName}',
      variables: '["contactFirstName","projectName","senderName"]',
      isDefault: true,
      isActive: true,
    },
    {
      channel: 'EMAIL',
      name: 'Receiving Plans (Full Design)',
      scenario: 'proposal_sent',
      subject: 'Plans Received: {projectName}',
      body: 'Hi {contactFirstName},\n\nI wanted to confirm we\'ve received the drawings for {projectName} and have started our review. We\'ll have initial feedback and our recommended fixture schedule to you within [X] business days.\n\nLet me know if anything changes on your end in the meantime.\n\n{senderName}',
      variables: '["contactFirstName","projectName","senderName"]',
      isDefault: true,
      isActive: true,
    },
    {
      channel: 'EMAIL',
      name: 'Receiving Plans (Peer Review)',
      scenario: 'peer_review_sent',
      subject: 'Peer Review Initiated: {projectName}',
      body: 'Hi {contactFirstName},\n\nWe\'ve received the lighting plans for {projectName} and your peer review is underway. We\'ll have our full report back to you within [X] business days.\n\nFeel free to reach out with any questions.\n\n{senderName}',
      variables: '["contactFirstName","projectName","senderName"]',
      isDefault: true,
      isActive: true,
    },
    {
      channel: 'EMAIL',
      name: 'New Intro: Cold Outreach',
      scenario: 'new_intro',
      dealStage: 'QUALIFIED',
      subject: 'Lighting Design for {projectName}',
      body: 'Hi {contactFirstName},\n\nI wanted to introduce 1LUX. We\'re a lighting company that works exclusively with multifamily developers and general contractors across the country.\n\nI noticed {clientName} is working on {projectName} and thought it might be worth a quick conversation about how we can add value to the project.\n\nWould you have 20 minutes this week?\n\n{senderName}',
      variables: '["contactFirstName","clientName","projectName","senderName"]',
      isDefault: true,
      isActive: true,
    },
    {
      channel: 'EMAIL',
      name: 'LinkedIn → Email Move',
      scenario: 'linkedin_move_to_email',
      subject: 'Following up: {clientName}',
      body: 'Hi {contactFirstName},\n\nGreat connecting on LinkedIn. I wanted to follow up over email where it\'s a bit easier to share details.\n\n{senderName}',
      variables: '["contactFirstName","clientName","senderName"]',
      isDefault: true,
      isActive: true,
    },
    {
      channel: 'EMAIL',
      name: 'Peer Review Report Sent',
      scenario: 'peer_review_sent',
      subject: 'Peer Review Complete: {projectName}',
      body: 'Hi {contactFirstName},\n\nPlease find attached our completed peer review for {projectName}. The report includes our findings, flagged items, and recommended actions.\n\nHappy to schedule a call to walk through the results.\n\n{senderName}',
      variables: '["contactFirstName","projectName","senderName"]',
      isDefault: true,
      isActive: true,
    },
    {
      channel: 'EMAIL',
      name: 'Golf League Invite',
      scenario: 'golf_invite',
      subject: 'Golf League: Join Us This Season',
      body: 'Hi {contactFirstName},\n\nWe\'re putting together our golf league lineup for this season and wanted to extend an invite your way. It\'s a great group, good excuse to get outside and catch up.\n\nInterested? Happy to send over the details.\n\n{senderName}',
      variables: '["contactFirstName","senderName"]',
      isDefault: true,
      isActive: true,
    },
    // LINKEDIN stubs
    {
      channel: 'LINKEDIN',
      name: 'Connection Request',
      scenario: 'linkedin_connect',
      body: '[Content needed: fill in before use]',
      variables: '[]',
      isDefault: true,
      isActive: false,
    },
    {
      channel: 'LINKEDIN',
      name: 'Post-Connection → Move to Email',
      scenario: 'linkedin_move_to_email',
      body: '[Content needed: fill in before use]',
      variables: '["contactFirstName","senderName"]',
      isDefault: true,
      isActive: false,
    },
    {
      channel: 'LINKEDIN',
      name: 'Nurture: Check In',
      scenario: 'follow_up',
      body: '[Content needed: fill in before use]',
      variables: '["contactFirstName","senderName"]',
      isDefault: true,
      isActive: false,
    },
    {
      channel: 'LINKEDIN',
      name: 'Meeting Recap',
      scenario: 'meeting_recap',
      body: '[Content needed: fill in before use]',
      variables: '["contactFirstName","projectName","senderName"]',
      isDefault: true,
      isActive: false,
    },
  ];

  const templates = await prisma.$transaction(
    starterTemplates.map((t) =>
      prisma.messageTemplate.create({
        data: {
          ...t,
          createdById: user.id,
        },
      })
    )
  );

  return NextResponse.json({ ok: true, created: templates.length });
}
