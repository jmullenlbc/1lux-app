/**
 * Meeting Prep — the one model call. Facts in, 3–5 cited talking points out.
 *
 * The facts are sealed as untrusted text: they carry news headlines, calendar
 * titles and lines people typed, any of which can read like an instruction.
 * See src/lib/agent/untrusted.js.
 */
import { agentClient } from '@/lib/agent/client';
import { modelParams, textFrom } from '@/lib/aiModels';
import { buildUntrustedPrompt, warnOnInjection } from '@/lib/agent/untrusted';
import { buildPrepPrompt, parseTalkingPoints } from './brief';

const JOB = 'bot.meetingPrep';

/**
 * @param {Array} facts  from buildFactBlocks()
 * @param {object} note  { title, meetingDate, activityType }
 * @param {object} ctx   { projectId, userId } for the run ledger
 * @returns {Promise<{ points: Array<{ text, refs }>, model: string }>}
 */
export async function draftTalkingPoints(facts, note, ctx = {}) {
  const params = modelParams(JOB);
  if (!facts.length) return { points: [], model: params.model };

  const { instructions, documents } = buildPrepPrompt(facts, note);
  const sealed = buildUntrustedPrompt({ instructions, documents });
  warnOnInjection(JOB, ctx.projectId || null, sealed);

  const anthropic = await agentClient(JOB, ctx);
  const msg = await anthropic.messages.create({
    ...params,
    max_tokens: 1200,
    system:   sealed.system,
    messages: [{ role: 'user', content: sealed.content }],
  });
  return { points: parseTalkingPoints(textFrom(msg), facts), model: params.model };
}
