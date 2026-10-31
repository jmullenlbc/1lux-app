import { requireStaff } from '@/lib/auth';
import { readJobRequest, runParkedJob } from '@/lib/parkedJob';
import { readStoredQuote } from '@/lib/rfq/intakeQuote';

// POST { fileId }  read a quote stored on this project into lines to check.
// Parked: an AI read can pass the 30 s wall in production. Nothing is saved here.
export const maxDuration = 300;

export async function POST(request, { params }) {
  const { user, error } = await requireStaff(request);
  if (error) return error;
  const { body } = await readJobRequest(request);
  return runParkedJob({
    body, kind: 'rfq.quoteRead', scope: params.id,
    args: body.jobKey ? null : { fileId: body.fileId },
    run: (a) => readStoredQuote({ fileId: a.fileId, projectId: params.id, user }),
  });
}
