/**
 * Work history, the one model call. Pasted LinkedIn text in, job rows out.
 *
 * The paste is sealed as untrusted text: it is whatever the person wrote on
 * their own profile, and any of it can read like an instruction. See
 * src/lib/agent/untrusted.js. The rows are checked by parseWorkHistory() before
 * anything is saved.
 */
import { agentClient } from '@/lib/agent/client';
import { modelParams, textFrom } from '@/lib/aiModels';
import { buildUntrustedPrompt, warnOnInjection } from '@/lib/agent/untrusted';
import { WORK_HISTORY_INSTRUCTIONS, MAX_PASTE_CHARS, parseWorkHistory } from './workHistory';

const JOB = 'bot.workHistory';

/**
 * @param {string} text  what the salesperson pasted
 * @param {object} ctx   { userId } for the run ledger
 * @returns {Promise<{ jobs: Array, model: string }>}
 */
export async function extractWorkHistory(text, ctx = {}) {
  const params = modelParams(JOB);
  const sealed = buildUntrustedPrompt({
    instructions: WORK_HISTORY_INSTRUCTIONS,
    documents: [{ text: String(text ?? ''), descriptor: 'LinkedIn paste', maxChars: MAX_PASTE_CHARS }],
  });
  warnOnInjection(JOB, null, sealed);

  const anthropic = await agentClient(JOB, ctx);
  const msg = await anthropic.messages.create({
    ...params,
    max_tokens: 2500,
    system:   sealed.system,
    messages: [{ role: 'user', content: sealed.content }],
  });
  return { jobs: parseWorkHistory(textFrom(msg)), model: params.model };
}
