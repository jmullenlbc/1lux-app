import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { BUDGET_QC_ITEMS } from '@/lib/budgetQCItems';
import { runAutoChecks } from '@/lib/budgetQCAutoChecks';

// GET /api/projects/[id]/budget-qc
// Returns full checklist + auto-check results.
// Auto-creates the checklist if it doesn't exist yet (upsert pattern).
export async function GET(req, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  // Ensure checklist + all item rows exist (upsert pattern — safe to call multiple times)
  let checklist = await prisma.budgetQCChecklist.findUnique({
    where:   { projectId: params.id },
    include: {
      assignedTo: { select: { id: true, name: true, email: true } },
      items:      true,
    },
  });

  if (!checklist) {
    checklist = await prisma.budgetQCChecklist.create({
      data: {
        projectId: params.id,
        items: {
          create: BUDGET_QC_ITEMS.map(i => ({ itemKey: i.key })),
        },
      },
      include: {
        assignedTo: { select: { id: true, name: true, email: true } },
        items:      true,
      },
    });
  } else {
    // Ensure any new items added to BUDGET_QC_ITEMS are upserted (checklist already exists)
    const existingKeys = new Set(checklist.items.map(i => i.itemKey));
    const newKeys = BUDGET_QC_ITEMS.filter(i => !existingKeys.has(i.key));
    if (newKeys.length > 0) {
      await prisma.budgetQCItem.createMany({
        data: newKeys.map(i => ({ checklistId: checklist.id, itemKey: i.key })),
        skipDuplicates: true,
      });
      checklist = await prisma.budgetQCChecklist.findUnique({
        where:   { projectId: params.id },
        include: {
          assignedTo: { select: { id: true, name: true, email: true } },
          items:      true,
        },
      });
    }
  }

  // Enrich items with checker info
  const checkerIds = [...new Set(checklist.items.filter(i => i.checkedById).map(i => i.checkedById))];
  let checkerMap = {};
  if (checkerIds.length > 0) {
    const checkers = await prisma.user.findMany({
      where:  { id: { in: checkerIds } },
      select: { id: true, name: true },
    });
    checkers.forEach(c => { checkerMap[c.id] = c; });
  }

  // Run auto-checks (never cached)
  const autoChecks = await runAutoChecks(params.id, prisma);

  // Build summary — auto-pass items count toward total even before DB-checked
  let checkedCount = 0;
  const itemsOut = checklist.items.map(dbItem => {
    const def = BUDGET_QC_ITEMS.find(d => d.key === dbItem.itemKey);
    const autoResult = autoChecks[dbItem.itemKey];
    // Auto-pass items count as checked in summary even if DB has checked=false
    const effectivelyChecked = dbItem.checked || (def?.autoCheck && autoResult?.status === 'pass');
    if (effectivelyChecked) checkedCount++;
    return {
      itemKey:    dbItem.itemKey,
      checked:    dbItem.checked,
      checkedBy:  dbItem.checkedById ? checkerMap[dbItem.checkedById] ?? null : null,
      checkedAt:  dbItem.checkedAt,
      note:       dbItem.note,
    };
  });

  const total = BUDGET_QC_ITEMS.length;
  const pct   = total > 0 ? Math.round((checkedCount / total) * 100) : 0;

  return NextResponse.json({
    checklist: {
      id:         checklist.id,
      assignedTo: checklist.assignedTo ?? null,
      items:      itemsOut,
    },
    autoChecks,
    summary: {
      total,
      checked:    checkedCount,
      pct,
      isComplete: checkedCount === total,
    },
  });
}
