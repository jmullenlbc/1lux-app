import { requireAuth } from '@/lib/auth';
import { refillTemplateSuggestions } from '@/lib/tone/library';
import { whoseLibrary } from '@/lib/tone/voiceApi';
import { runParkedJob, readJobRequest } from '@/lib/parkedJob';

// POST /api/sales/voice/templates/refill  { userId? }: after a template
// suggestion is saved or put away, write new ones for the kinds of email not
// yet covered, up to 8 on screen (Mike 10-1: "a new one should take its place").
// Park-and-poll (src/lib/parkedJob.js): one model call per new template can run
// past Amplify's ~30-second front door. Call it with postParked().
export const maxDuration = 300;

export async function POST(request) {
  const { user, error } = await requireAuth(request);
  if (error) return error;
  const { body } = await readJobRequest(request);
  if (body.jobKey) {
    return runParkedJob({ body, kind: 'voice.templates.refill', scope: user.id, run: refill });
  }
  const who = whoseLibrary(user, body.userId);
  if (who.error) return who.error;
  return runParkedJob({ body, kind: 'voice.templates.refill', scope: user.id, args: { userId: who.userId }, run: refill });
}

async function refill({ userId }) {
  try { return { templates: await refillTemplateSuggestions(userId) }; }
  catch (e) {
    console.error('[sales/voice] template refill failed:', e?.message ?? e);
    return { error: 'Could not write a new template. Press Relearn to try again.' };
  }
}
