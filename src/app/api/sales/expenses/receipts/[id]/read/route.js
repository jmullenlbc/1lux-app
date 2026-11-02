import { requireStaff } from '@/lib/auth';
import { readJobRequest, runParkedJob } from '@/lib/parkedJob';
import { readStoredReceipt } from '@/lib/sales/receiptRead';

// POST {}  read a stored receipt onto its own row. Parked: an AI read can pass
// the 30 s wall in production. No expense is created here.
export const maxDuration = 300;

export async function POST(request, { params }) {
  const { user, error } = await requireStaff(request);
  if (error) return error;
  const { body } = await readJobRequest(request);
  return runParkedJob({
    body, kind: 'expense.receiptRead', scope: params.id,
    args: body.jobKey ? null : { receiptId: params.id },
    run: (a) => readStoredReceipt({ receiptId: a.receiptId, user }),
  });
}
