import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';

// ── Simple CSV parser (handles quoted fields) ─────────────────────────────────
function parseCSVLine(line) {
  const result = [];
  let current = '', inQuotes = false;
  for (const ch of line) {
    if (ch === '"')              { inQuotes = !inQuotes; }
    else if (ch === ',' && !inQuotes) { result.push(current.trim()); current = ''; }
    else                         { current += ch; }
  }
  result.push(current.trim());
  return result;
}
function normaliseHeader(h) {
  return h.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

export async function POST(req) {
  const { user, error } = await requireAuth(request);
  if (error) return error;
  if (user.role !== 'ILC_ADMIN' && user.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const csvText = await req.text();
  const lines   = csvText.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return NextResponse.json({ error: 'CSV has no data rows.' }, { status: 400 });

  const headers = parseCSVLine(lines[0]).map(normaliseHeader);
  const col     = key => headers.indexOf(key);
  const iCode   = col('type_code') !== -1 ? col('type_code') : col('code');
  const iMaster = col('master_type') !== -1 ? col('master_type') : col('master_type_id');
  const iFamily = col('family');
  const iDesc   = col('description');
  const iActive = col('active') !== -1 ? col('active') : col('is_active');

  if (iCode === -1 || iMaster === -1) {
    return NextResponse.json({
      error: `Required columns not found. Expected "Type Code" and "Master Type". Found: ${headers.join(', ')}`
    }, { status: 400 });
  }

  // Load valid master type codes
  const masterTypes = await prisma.masterType.findMany({ select: { code: true } });
  const validCodes  = new Set(masterTypes.map(m => m.code));

  let upserted = 0, skipped = 0;
  const skippedReasons = [];

  for (let i = 1; i < lines.length; i++) {
    const row = parseCSVLine(lines[i]);
    if (row.every(c => c === '')) continue;

    const code           = row[iCode]?.trim().toUpperCase();
    const master_type_id = row[iMaster]?.trim().toUpperCase();
    const family         = iFamily !== -1 ? (row[iFamily]?.trim() || '') : '';
    const description    = iDesc   !== -1 ? (row[iDesc]?.trim()   || null) : null;
    const activeRaw      = iActive !== -1 ? row[iActive]?.trim().toLowerCase() : 'yes';
    const is_active      = !['no', 'false', '0', 'inactive', ''].includes(activeRaw);

    if (!code) { skipped++; skippedReasons.push(`Row ${i+1}: missing code`); continue; }
    if (!master_type_id) { skipped++; skippedReasons.push(`Row ${i+1}: missing master type for "${code}"`); continue; }
    if (!validCodes.has(master_type_id)) {
      skipped++;
      skippedReasons.push(`Row ${i+1}: unknown master type "${master_type_id}" for "${code}"`);
      continue;
    }

    await prisma.fixtureType.upsert({
      where:  { code },
      update: { master_type_id, family, description, is_active },
      create: { code, master_type_id, family, description, is_active },
    });
    upserted++;
  }

  return NextResponse.json({ upserted, skipped, skippedReasons });
}
