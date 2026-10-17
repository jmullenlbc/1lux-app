import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { TRIGGERS, ACTIONS } from '@/lib/bot/ruleEngine';

export const dynamic = 'force-dynamic';

// Serializable metadata that drives the if-then builder UI.
export async function GET() {
  const { error } = await requireAuth();
  if (error) return error;

  const triggers = Object.entries(TRIGGERS).map(([key, t]) => ({
    key, label: t.label, source: t.source, live: !!t.live, fields: t.fields || [],
  }));
  // `available` travels to the builder so an action that cannot do anything is
  // greyed out rather than offered. An action defaults to available, only one
  // that opts out has to say so.
  const actions = Object.entries(ACTIONS).map(([key, a]) => ({
    key,
    label: a.label,
    available: a.available !== false,
    unavailableReason: a.available === false ? (a.unavailableReason || 'Not available yet') : null,
  }));

  const operators = [
    { key: 'eq', label: 'is' },
    { key: 'neq', label: 'is not' },
    { key: 'contains', label: 'contains' },
    { key: 'gt', label: '>' },
    { key: 'gte', label: '≥' },
    { key: 'lt', label: '<' },
    { key: 'lte', label: '≤' },
    { key: 'is_true', label: 'is yes' },
    { key: 'is_false', label: 'is no' },
    { key: 'exists', label: 'is set' },
  ];

  return NextResponse.json({ triggers, actions, operators });
}
