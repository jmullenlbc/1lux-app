import { requireAuth } from '@/lib/auth';
import { rebuildToneProfile } from '@/lib/tone/library';
import { whoseLibrary, libraryState } from '@/lib/tone/voiceApi';
import { runParkedJob, readJobRequest } from '@/lib/parkedJob';

// POST /api/sales/voice/rebuild  { userId? } — relearn the voice from the whole library.
// Park-and-poll (src/lib/parkedJob.js): one model call over 60 emails can run
// past Amplify's ~30-second front door. Call it with postParked().
export const maxDuration = 300;

export async function POST(request) {
  const { user, error } = await requireAuth(request);
  if (error) return error;
  const { body } = await readJobRequest(request);
  if (body.jobKey) {
    return runParkedJob({ body, kind: 'voice.rebuild', scope: user.id, run: relearn });
  }
  const who = whoseLibrary(user, body.userId);
  if (who.error) return who.error;
  return runParkedJob({ body, kind: 'voice.rebuild', scope: user.id, args: { userId: who.userId }, run: relearn });
}

async function relearn({ userId }) {
  let rebuildError = null;
  try { rebuildError = (await rebuildToneProfile(userId))?.error || null; }
  catch (e) { console.error('[sales/voice] rebuild failed:', e?.message ?? e); rebuildError = 'Learning the voice failed. Try again in a minute.'; }
  return { rebuildError, ...(await libraryState(userId)) };
}
