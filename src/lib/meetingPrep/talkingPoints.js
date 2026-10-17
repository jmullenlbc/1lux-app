/**
 * Meeting Prep, the one model call. Facts in, 3 to 5 cited talking points out.
 *
 * The facts are sealed as untrusted text: they carry news headlines, calendar
 * titles and lines people typed, any of which can read like an instruction.
 * See src/lib/agent/untrusted.js.
 */
import { agentClient } from '@/lib/agent/client';
import { modelParams, textFrom } from '@/lib/aiModels';
import { buildUntrustedPrompt, warnOnInjection } from '@/lib/agent/untrusted';
import { buildPrepPrompt, parseTalkingPoints, parseJson } from './brief';
import { stripDashes } from '@/lib/bot/emailStyle';

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
  const reply = textFrom(msg);
  // A reply we cannot read is a failure, not "nothing to say", the panel says so.
  if (parseJson(reply) == null) throw new Error(`unreadable reply (stop: ${msg?.stop_reason || 'unknown'})`);
  return { points: parseTalkingPoints(reply, facts).map(p => ({ ...p, text: stripDashes(p.text) })), model: params.model };
}
