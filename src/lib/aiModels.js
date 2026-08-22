/**
 * aiModels.js — one place that decides which Claude model does which job.
 *
 * Mike, 2026-08-19: "can we somehow do this more efficiently and use opus 5 when
 * it's not as complex and fable 5 for drawings or other complex things?"
 *
 * Before this file, the model name was typed by hand at nineteen different call
 * sites, and three of them disagreed about which model to use for the same kind
 * of work. Nobody could answer "what are we paying to read a drawing?" without
 * grepping. Now every AI call in the app names its JOB, and this table answers
 * with the model. Changing what reads a drawing is a one-line edit here.
 *
 * ── The three tiers ────────────────────────────────────────────────────────
 *
 * DEEP_READ (Fable 5) — the whole-document reads. A 300,000-character P6
 *   schedule, a drawing set, a fixture schedule. These are the jobs where being
 *   wrong is expensive: a missed fixture install date is a delivery that misses,
 *   and a miscounted unit matrix is a wrong budget. Fable takes a 1,000,000-token
 *   input window, so the document arrives whole rather than in a slice.
 *   Low volume — a handful of calls per project, not per click.
 *
 * READ (Opus 5) — reads a real document, but a bounded piece of one: a contract
 *   clause, an RFI, a code summary, a tracker page. Accuracy still matters, the
 *   input does not run to hundreds of thousands of characters. Runs at medium
 *   effort, which is the cost dial: raise it here, not at the call sites.
 *
 * QUICK (Haiku 4.5) — short text we already hold, turned into a label or a
 *   draft: classify this note, write this follow-up, pull the company names out
 *   of this paragraph. These are the HIGH-volume calls — the bot runs them all
 *   day — and they are also the ones where a bigger model changes nothing about
 *   the answer. Leaving them on Haiku is what pays for the tiers above.
 *
 * ── Why not put everything on Fable ────────────────────────────────────────
 *
 * Because most of these calls are not document reads. Handing a one-paragraph
 * activity note to a million-token reader costs more and returns the same label.
 * Fable earns its keep exactly where the document is big or the drawing is dense.
 */

export const TIERS = {
  DEEP_READ: { model: 'claude-fable-5',   effort: null,     thinks: true  },
  READ:      { model: 'claude-opus-5',    effort: 'medium', thinks: true  },
  CHAT:      { model: 'claude-sonnet-4-6', effort: null,    thinks: false },
  QUICK:     { model: 'claude-haiku-4-5', effort: null,     thinks: false }, // Haiku has no effort dial
};

/**
 * Every AI call in the app, by job name.
 *
 * Add a row here before adding a call site — a job with no row throws rather
 * than silently guessing, so a new feature cannot quietly land on the wrong
 * model the way the hand-typed names did.
 */
export const JOB_TIERS = {
  // ── Whole documents and drawings ─────────────────────────────────────────
  'schedule.construction':   'DEEP_READ', // 84-page P6 export, ~310k chars
  'schedule.design':         'DEEP_READ', // Mike, 2026-08-19: all schedules read by Fable
  'drawing.unitMatrix':      'DEEP_READ', // dense / "combined" sheets
  // Finding the four sheets that matter inside a 400-page set. Deep-read tier
  // because a wrong pick sends the vision read at the wrong page and the whole
  // parse comes back empty — with the file already deleted.
  'drawing.sheetPick':       'DEEP_READ',
  'drawing.siteData':        'DEEP_READ', // rendered images, often hand-lettered
  'fixtureSchedule.parse':   'DEEP_READ', // feeds the Bid Matrix — wrong here is wrong money
  'peerReview.parsePdf':     'DEEP_READ', // a full fixture schedule off someone else's set

  // ── Bounded document reads ───────────────────────────────────────────────
  'drawing.unitMatrix.clean': 'READ',     // clean table, small — no need for the big reader
  'contract.analyze':         'READ',
  'rfi.extract':              'READ',
  'tracker.extract':          'READ',
  'tracker.importToc':        'READ',
  'code.check':               'READ',
  'code.search':              'READ',
  'user.toneProfile':         'READ',     // reads a stack of the user's real emails

  // ── Live chat: someone is sitting there watching it type ─────────────────
  'chat.project':             'CHAT',
  'chat.knowledgeBase':       'QUICK',

  // ── Short text in, label or draft out ────────────────────────────────────
  'rfi.draft':                'QUICK',
  'tracker.review.respond':   'QUICK',
  'bot.activityClassify':     'QUICK',
  'bot.outreach.compose':     'QUICK',
  'bot.outreach.subject':     'QUICK',
  'bot.noteActions':          'QUICK',
  'bot.followUp':             'QUICK',
  'market.entityExtract':     'QUICK',
};

/**
 * The model id for a job. Use this when you only need the name (logging, tests).
 * @param {string} job
 * @returns {string}
 */
export function modelFor(job) {
  return tierFor(job).model;
}

function tierFor(job) {
  const name = JOB_TIERS[job];
  if (!name) throw new Error(`aiModels: unknown job "${job}" — add it to JOB_TIERS`);
  return TIERS[name];
}

/**
 * The parameters to spread into anthropic.messages.create() for a job.
 *
 * Returns `{ model }`, plus `{ output_config: { effort } }` on the tiers whose
 * model actually supports the effort dial. Haiku 4.5 rejects it outright, which
 * is why this is computed rather than written at each call site.
 *
 *   const msg = await anthropic.messages.create({
 *     ...modelParams('contract.analyze'),
 *     max_tokens: 2000,
 *     messages: [...],
 *   });
 *
 * @param {string} job
 * @returns {{ model: string, output_config?: { effort: string } }}
 */
export function modelParams(job) {
  const tier = tierFor(job);
  return tier.effort
    ? { model: tier.model, output_config: { effort: tier.effort } }
    : { model: tier.model };
}

/**
 * The text of a model reply, with every non-text block ignored.
 *
 * Read `msg.content[0].text` and you are betting that the first block in the
 * reply is the answer. On the older models it always was. On Fable 5 and Opus 5
 * it often is not — those models think first, so block 0 can be a `thinking`
 * block with no `.text` at all, and the code quietly reads an empty string and
 * reports "could not read the extraction result" on a reply that was perfectly
 * good. That is exactly what broke the site-plan read the first time these jobs
 * moved up a tier, so this is the only way the app should pull text out.
 *
 * @param {{ content?: Array<{ type?: string, text?: string }> }} msg
 * @returns {string}
 */
export function textFrom(msg) {
  return (msg?.content ?? [])
    .filter(b => b?.type === 'text' || typeof b?.text === 'string')
    .map(b => b.text || '')
    .join('')
    .trim();
}

/**
 * How big to make `max_tokens` for a job, given how long the ANSWER can be.
 *
 * A model that thinks spends output tokens on the thinking before it writes a
 * word of the answer, and `max_tokens` is the ceiling on BOTH together. That is
 * not a theory: the first Marmalade schedule read on the new tiers spent 3,417
 * of its 4,000 tokens thinking, ran out mid-sentence, and the app reported "no
 * milestones found" on a read that was going perfectly. Nothing errored — the
 * JSON was simply cut in half.
 *
 * So: call sites say how long the answer needs to be, and this adds the room to
 * think on the tiers whose models do. On the non-thinking tiers the number is
 * passed straight through, because there is nothing to make room for.
 *
 * `max_tokens` is a ceiling, not a purchase — raising it costs nothing unless
 * the model actually uses it.
 *
 *   max_tokens: answerBudget('schedule.construction', 4000),
 *
 * @param {string} job
 * @param {number} answerTokens  how long the answer itself may run
 * @returns {number}
 */
export const THINKING_HEADROOM = 12000;

export function answerBudget(job, answerTokens) {
  return tierFor(job).thinks ? answerTokens + THINKING_HEADROOM : answerTokens;
}

/**
 * Log loudly when a reply was cut off at max_tokens.
 *
 * Truncation is the one failure that looks like success: the call returns 200,
 * the text parses as far as it goes, and the app reports "nothing found". This
 * puts a line in the server log naming the job, so the next time it happens the
 * answer is in the log rather than in a debugging session.
 *
 * @param {{ stop_reason?: string }} msg
 * @param {string} job
 * @returns {boolean} true if the reply was truncated
 */
export function warnIfTruncated(msg, job) {
  if (msg?.stop_reason !== 'max_tokens') return false;
  console.warn(`[aiModels] ${job}: reply hit max_tokens and was cut off — raise its answerBudget()`);
  return true;
}
