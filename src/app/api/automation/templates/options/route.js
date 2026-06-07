import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';

// GET /api/automation/templates/options
// Returns unique values for Channel, Scenario, and Client Type
// across all existing templates, merged with hardcoded defaults.
// Used to populate the creatable dropdowns in the template form.

const DEFAULT_CHANNELS   = ['EMAIL', 'LINKEDIN', 'MEETING_AGENDA'];
const DEFAULT_SCENARIOS  = [
  'new_intro', 'proposal_sent', 'follow_up', 'peer_review_sent',
  'golf_invite', 'linkedin_connect', 'linkedin_move_to_email',
  'meeting_recap', 'kick_off_agenda', 'custom',
];
const DEFAULT_CLIENT_TYPES = ['Any', 'Developer', 'Architect', 'GC', 'EC'];

export async function GET() {
  const { error } = await requireAuth();
  if (error) return error;

  const templates = await prisma.messageTemplate.findMany({
    select: { channel: true, scenario: true, clientType: true },
  });

  const merge = (defaults, dbValues) => {
    const set = new Set([...defaults, ...dbValues.filter(Boolean)]);
    return Array.from(set).sort();
  };

  return NextResponse.json({
    channels:    merge(DEFAULT_CHANNELS,    templates.map(t => t.channel)),
    scenarios:   merge(DEFAULT_SCENARIOS,   templates.map(t => t.scenario)),
    clientTypes: merge(DEFAULT_CLIENT_TYPES,templates.map(t => t.clientType)),
  });
}
