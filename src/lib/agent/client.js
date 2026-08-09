/**
 * The one place a model call is made — Slice 4b of the Governed AI Layer.
 *
 * Slice 4a built the ledger (src/lib/agent/ledger.js). A ledger with nothing
 * feeding it is a table, so this is the feeder: a thin wrapper over the Anthropic
 * SDK that records every call without changing how anyone writes one.
 *
 * ── Why a wrapper and not a rule ─────────────────────────────────────────────
 * There are ~25 independent `new Anthropic({ apiKey: getAnthropicKey() })` calls
 * across ~30 files, plus four raw `fetch('https://api.anthropic.com/…')`. A
 * convention ("remember to log it") loses to 25 call sites every time, and the
 * loss is silent — the feature still works, it just stops being observable, and
 * nobody notices until someone asks what the month cost.
 *
 * So the wrapper has to be *cheaper to adopt than to skip*. It is a drop-in:
 *
 *     - const anthropic = new Anthropic({ apiKey: getAnthropicKey() });
 *     + const anthropic = agentClient('rfi.draft', { projectId, userId });
 *
 * Everything else about the call site is unchanged. `messages.create(...)` takes
 * the same arguments and returns the same object, because it IS the same object —
 * the wrapper returns a Proxy over the real client, so streaming, `models`,
 * `beta`, and every SDK surface this repo does not use yet keep working without
 * this file having to know about them.
 *
 * ── What `task` is for ───────────────────────────────────────────────────────
 * It is the dimension every operational question groups by: which task burned
 * the tokens, which task regressed, which task is quietly failing 20% of the time
 * and falling back to a default nobody notices. A model id cannot answer any of
 * those — six features share `claude-haiku-4-5`. Use a stable dotted name
 * (`rfi.draft`, `schedule.parse`, `contract.analyze`); it is a grouping key, so
 * renaming one splits its history.
 *
 * ── What this deliberately does NOT do ───────────────────────────────────────
 * It does not block, throttle, gate, or require approval. Those are 4b's trust
 * tiers, and they are unbuildable until this has run long enough to show which
 * calls actually warrant a reviewer. It also does not retry: a retry policy that
 * lives here would double-count runs and hide the error rate the ledger exists to
 * surface.
 *
 * It also stores no prompts and no completions — see the ledger's own note. What
 * is recorded is task, model, outcome, latency and token counts.
 *
 * @see src/lib/agent/ledger.js
 * @see scripts/tests/agentClient.test.mjs
 */
import { recordRun } from './ledger.js';
import { containsSealedDocument } from './untrusted.js';

/**
 * The injection boundary's enforceable half — Step 19.2, applied to every call.
 *
 * A request that carries stranger-authored text may not also carry tools. This
 * is the control that survives the model being talked into something: an
 * extraction call physically has no way to write, email, or approve anything,
 * so the worst case is a wrong answer that a human or an auto-check catches,
 * rather than an action nobody asked for.
 *
 * It throws rather than stripping `tools`. Silently removing them would leave a
 * feature half-working in a way that looks like a model failure, and whoever
 * debugged it would have no reason to suspect this file. The two capabilities
 * have to be split across two calls, and that is a design decision the caller
 * has to make deliberately.
 */
function assertNoToolsOverUntrustedInput(params, task) {
  const tools = params?.tools;
  if (!Array.isArray(tools) || tools.length === 0) return;
  if (!containsSealedDocument(params?.messages) && !containsSealedDocument(params?.system)) return;

  throw new Error(
    `agent client ("${task}"): a request carrying third-party document text may not also carry tools. ` +
    'Extraction returns JSON and a separate, non-model code path writes it — see src/lib/agent/untrusted.js. ' +
    'Split this into a parse call and a write step.'
  );
}

/**
 * Wrap an existing Anthropic client so its `messages.create` is recorded.
 *
 * Exported separately from `agentClient()` so it can be tested against a fake
 * client under plain `node --test` — building a real one would drag in the `@`
 * alias, which is a bundler feature the test runner cannot resolve.
 *
 * @param {object} client            an Anthropic SDK instance (or anything shaped like one)
 * @param {string} task              stable grouping key, e.g. 'rfi.draft'
 * @param {object} [context]
 * @param {string} [context.projectId]
 * @param {string} [context.userId]  null for scheduled jobs
 */
export function wrapClient(client, task, context = {}) {
  if (!task || typeof task !== 'string') {
    // Thrown, not defaulted. An un-named call is worse than an unrecorded one:
    // it lands in the ledger as 'unknown' and quietly poisons every per-task
    // rollup it is averaged into.
    throw new Error('agent client: a task name is required (e.g. "rfi.draft").');
  }

  return new Proxy(client, {
    get(target, prop, receiver) {
      if (prop !== 'messages') return Reflect.get(target, prop, receiver);

      const messages = Reflect.get(target, prop, receiver);
      return new Proxy(messages, {
        get(mTarget, mProp, mReceiver) {
          const value = Reflect.get(mTarget, mProp, mReceiver);
          if (typeof value !== 'function') return value;

          if (mProp === 'create') {
            return (...args) => recordedCreate(value.bind(mTarget), args, task, context);
          }
          if (mProp === 'stream') {
            return (...args) => recordedStream(value.bind(mTarget), args, task, context);
          }
          // `countTokens`, anything else — passed through untouched and
          // unrecorded. Wrapping something this file does not understand is how
          // a wrapper breaks a feature it was only meant to observe.
          return value.bind(mTarget);
        },
      });
    },
  });
}

/**
 * Run one `messages.create` and record the outcome either way.
 *
 * The ledger write is awaited rather than fired and forgotten: on Lambda the
 * process can be frozen the moment the response is returned, and a floating
 * promise is then simply lost. `recordRun` never throws and never rejects, so
 * awaiting it cannot fail the call it is observing.
 */
async function recordedCreate(create, args, task, context) {
  const params  = args[0] || {};

  // Before the call, and deliberately NOT recorded: this never reached the model,
  // so it is not a model call, and folding it into the ledger would inflate the
  // task's error rate with a developer mistake that the first test run catches
  // anyway. The ledger records what the model did.
  assertNoToolsOverUntrustedInput(params, task);

  const started = Date.now();

  try {
    const result = await create(...args);
    await recordRun({
      task,
      model:        result?.model || params.model || null,
      status:       'ok',
      durationMs:   Date.now() - started,
      inputTokens:  result?.usage?.input_tokens ?? null,
      outputTokens: result?.usage?.output_tokens ?? null,
      // 'max_tokens' here means the answer was truncated. It is not an error and
      // will not show up in the error rate, but it is the usual explanation for
      // "the parser started failing" — so it is worth a column.
      stopReason:   result?.stop_reason || null,
      projectId:    context.projectId || null,
      userId:       context.userId || null,
    });
    return result;
  } catch (err) {
    await recordRun({
      task,
      model:      params.model || null,
      status:     'error',
      durationMs: Date.now() - started,
      projectId:  context.projectId || null,
      userId:     context.userId || null,
      error:      err?.message || String(err),
    });
    // Rethrown unchanged. This layer observes; it does not decide what a failed
    // model call means to the feature that made it.
    throw err;
  }
}

/**
 * Run one `messages.stream` and record the outcome once the stream finishes.
 *
 * Streaming cannot be recorded the way `create` is. `stream()` returns
 * synchronously and the caller iterates it — there is no promise for this
 * wrapper to sit in front of, and putting one there would mean owning the
 * iteration, which is exactly the kind of "wrap what you don't understand" that
 * breaks a streaming route. So the streamer is returned untouched and the record
 * is attached through the SDK's own event API instead. The caller's iteration is
 * unaffected whether or not the listeners fire.
 *
 * Two honest limitations:
 *   - The record is a floating promise. Unlike `create`, there is nothing left
 *     to await it into. If the process is frozen the moment the last chunk is
 *     flushed, the entry is lost. In practice a streaming response is not done
 *     until it has been consumed, so it normally lands — but a stream the caller
 *     abandons half-way records nothing at all.
 *   - `finalMessage` is the only place usage totals exist, so a stream that
 *     errors mid-flight records the failure with no token counts.
 *
 * Both are acceptable here for the same reason the ledger fails open: this is
 * observability, and it must never be load-bearing for what it observes.
 */
function recordedStream(stream, args, task, context) {
  const params  = args[0] || {};
  assertNoToolsOverUntrustedInput(params, task);   // same rule; streaming is not an exemption
  const started = Date.now();
  const streamer = stream(...args);

  // A fake client, or a future SDK that drops the emitter, simply goes
  // unrecorded rather than throwing inside someone's response body.
  if (!streamer || typeof streamer.on !== 'function') return streamer;

  let recorded = false;
  const once = (entry) => {
    if (recorded) return;
    recorded = true;
    recordRun({
      task,
      durationMs: Date.now() - started,
      projectId:  context.projectId || null,
      userId:     context.userId || null,
      ...entry,
    });
  };

  streamer.on('finalMessage', (msg) => once({
    model:        msg?.model || params.model || null,
    status:       'ok',
    inputTokens:  msg?.usage?.input_tokens ?? null,
    outputTokens: msg?.usage?.output_tokens ?? null,
    stopReason:   msg?.stop_reason || null,
  }));

  // Attaching this listener also means the stream always has an 'error' handler,
  // so a mid-flight failure can never surface as an unhandled emitter error in a
  // process the wrapper was only meant to observe.
  streamer.on('error', (err) => once({
    model:  params.model || null,
    status: 'error',
    error:  err?.message || String(err),
  }));

  return streamer;
}

/**
 * Build a recorded Anthropic client. The drop-in replacement for
 * `new Anthropic({ apiKey: getAnthropicKey() })`.
 *
 * The SDK and the key helper are imported lazily so that importing this module
 * costs nothing in a context that never calls a model, and so the wrapper itself
 * stays testable without them.
 */
export async function agentClient(task, context = {}) {
  const [{ default: Anthropic }, { getAnthropicKey }] = await Promise.all([
    import('@anthropic-ai/sdk'),
    import('@/lib/anthropicKey'),
  ]);
  return wrapClient(new Anthropic({ apiKey: getAnthropicKey() }), task, context);
}

/**
 * For the four call sites that POST to the REST endpoint directly rather than
 * through the SDK. Same ledger, same task names — otherwise those four calls are
 * invisible and every cost total is quietly wrong.
 *
 * @param {Function} doFetch  a zero-arg function performing the fetch and
 *                            returning the parsed JSON body
 */
export async function recordRawCall(task, params, context, doFetch) {
  const started = Date.now();
  try {
    const body = await doFetch();
    await recordRun({
      task,
      model:        body?.model || params?.model || null,
      status:       'ok',
      durationMs:   Date.now() - started,
      inputTokens:  body?.usage?.input_tokens ?? null,
      outputTokens: body?.usage?.output_tokens ?? null,
      stopReason:   body?.stop_reason || null,
      projectId:    context?.projectId || null,
      userId:       context?.userId || null,
    });
    return body;
  } catch (err) {
    await recordRun({
      task,
      model:      params?.model || null,
      status:     'error',
      durationMs: Date.now() - started,
      projectId:  context?.projectId || null,
      userId:     context?.userId || null,
      error:      err?.message || String(err),
    });
    throw err;
  }
}
