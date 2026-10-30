import { NextResponse } from 'next/server';
import { requireSalesDocsUser } from '@/lib/salesDocs/access';
import { ruleOptions } from '@/lib/campaigns/options';

// GET /api/campaign-lists/options  What a list rule can pick from.
export async function GET() {
  const { error } = await requireSalesDocsUser();
  if (error) return error;
  return NextResponse.json(await ruleOptions());
}
