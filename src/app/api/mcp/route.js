/**
 * The Librarian, a governed, read-only API over ILC's data.
 *
 * Slice 3 of the Governed AI Layer. The hard parts were built and unit-tested in
 * isolation; this file is the wiring, and it is deliberately thin so that every
 * security decision stays in the module that owns it:
 *
 *   src/lib/mcp/auth.js, WHO is asking (bearer service token or session cookie)
 *   src/lib/mcp/audit.js, WHETHER we may answer at all, and the record that we did
 *   src/lib/mcp/guards.js, WHAT they may ask for (model allowlist, field
 *                            validation, row cap, timeout)
 *   src/lib/mcp/tools.js, the read tools, each ending in a redaction
 *   src/lib/mcp/server.js, JSON-RPC 2.0 framing
 *   src/lib/ontology/redact.js, WHICH FIELDS come back (allowlist, fails closed)
 *
 * Every request runs the same steps in the same order, and the order is the design:
 *
 *   1. auditReady(), no audit sink, no service. Refuse before authenticating,
 *                       because a 503 that reveals nothing is the correct answer
 *                       even to a valid token.
 *   2. resolveCaller(), 401 if unauthenticated. No degrading to a public view;
 *                       a general read API refuses rather than guesses.
 *   2b. take(), a per-caller ceiling, charged once per HTTP request and
 *                       priced by the number of JSON-RPC messages so a batch
 *                       cannot buy extra calls. After auth, so an unauthenticated
 *                       stranger can never consume a real caller's allowance.
 *   3. checkModel(), default deny against the ontology allowlist.
 *   4. findForbiddenFields(), reject the QUERY, not just the response. Filtering
 *                       on a field you cannot see is an oracle for its value.
 *   5. redactObject(), allowlist the response by declared sensitivity.
 *
 * ── Why read-only ────────────────────────────────────────────────────────────
 * There are no write tools here and there is no `prisma.$queryRaw`. The whole
 * value of this endpoint is that its blast radius is provably bounded: the worst
 * a compromised token can do is read rows it was already cleared for, capped at
 * 100 at a time, and every attempt is in the audit log. Adding one write tool
 * forfeits that argument entirely, so writes go through the existing routes with
 * their own guards, and eventually through the Scribe (Slice 4).
 *
 * ── Two wire shapes, one implementation ──────────────────────────────────────
 * A real MCP client speaks JSON-RPC 2.0 over Streamable HTTP. The in-app Ask-AI
 * data branch is a Next.js route calling another Next.js route, and JSON-RPC
 * framing buys it nothing. So this endpoint accepts both:
 *
 *     {"jsonrpc":"2.0","id":1,"method":"tools/call",
 *      "params":{"name":"query_records","arguments":{...}}}     ← MCP clients
 *     {"tool":"query_records","params":{...}}                    ← in-app callers
 *
 * Both land in executeTool(). That is the point: the guards must have exactly one
 * implementation, or the second shape becomes the way around them.
 *
 * @see scripts/tests/mcp.test.mjs, live acceptance tests, incl. a CLIENT_VIEWER
 *      driving this endpoint over real HTTP to prove the boundary empirically.
 */
import { NextResponse } from 'next/server';
import { resolveCaller } from '@/lib/mcp/auth';
import { auditReady } from '@/lib/mcp/audit';
import { DEFAULT_LIMIT, MAX_LIMIT, QUERY_TIMEOUT_MS } from '@/lib/mcp/guards';
import { TOOLS, McpError } from '@/lib/mcp/tools';
import { TOOL_COUNT } from '@/lib/mcp/catalog';
import { handleMessage, executeTool, PROTOCOL_VERSION } from '@/lib/mcp/server';
import { take, callerKey, limitPerMinute } from '@/lib/mcp/rateLimit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * The server card, and, to anyone who proves who they are, its tool catalogue.
 *
 * The card itself is unauthenticated on purpose: an MCP client has to be able to
 * tell that this endpoint exists, what protocol it speaks and whether it is
 * currently answering, before it has a credential to offer. That much is
 * infrastructure and says nothing about ILC.
 *
 * The TOOL LIST is not on the card. It used to be, on the argument that tool
 * names and argument shapes disclose nothing a reader of the source could not
 * work out. That argument is true about the repository and false about the
 * internet: a stranger reading `get_calibration` and `get_commitments` on a
 * public URL learns that ILC keeps calibration data and an obligations ledger,
 * which is exactly the kind of thing we have said not to publish. A real MCP
 * client loses nothing, it authenticates and calls `tools/list`, or simply
 * calls this same GET with its credential attached.
 *
 * What an authenticated caller sees is filtered to their audience, so a client
 * viewer is not even told that the ILC-only tools exist.
 */
export async function GET(request) {
  const ready = auditReady();
  const card = {
    service: 'ilc-librarian',
    protocolVersion: PROTOCOL_VERSION,
    readOnly: true,
    available: ready.ok,
    ...(ready.ok ? {} : { unavailableReason: ready.message }),
    limits: {
      defaultLimit: DEFAULT_LIMIT,
      maxLimit: MAX_LIMIT,
      queryTimeoutMs: QUERY_TIMEOUT_MS,
      // Per caller, per minute. Enforced per server instance rather than
      // globally, see lib/mcp/rateLimit.js for why that is the honest claim.
      requestsPerMinute: limitPerMinute(),
    },
    // Said out loud so a client can see the catalogue is being withheld rather
    // than that the server has no tools at all.
    toolCount: TOOL_COUNT,
  };

  // No credential is not an error here, it is the ordinary case for discovery.
  // Nothing about the attempt is disclosed either way.
  const resolved = await resolveCaller(request);
  if (!resolved.ok) return NextResponse.json(card);

  return NextResponse.json({
    ...card,
    tools: toolsForAudience(resolved.caller.audience),
  });
}

/** The tools this audience may call, in catalogue order, as MCP describes them. */
function toolsForAudience(audience) {
  return TOOLS
    .filter(t => t.audience !== 'ilc' || audience === 'ilc')
    .map(t => ({ name: t.name, description: t.description, inputSchema: t.inputSchema }));
}
export async function POST(request) {
  // 1. No audit sink, no service. Checked before auth so that an unloggable
  //    server refuses uniformly rather than only refusing strangers.
  const ready = auditReady();
  if (!ready.ok) {
    return NextResponse.json({ error: ready.message }, { status: ready.status });
  }

  // 2. Who is asking. 401 rather than a degraded public view.
  const resolved = await resolveCaller(request);
  if (!resolved.ok) {
    return NextResponse.json({ error: resolved.message }, { status: resolved.status });
  }
  const { caller } = resolved;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Request body must be JSON.' }, { status: 400 });
  }

  // 2b. Rate limit. Charged after parsing because a batch of N messages costs N,
  //     and before any tool runs so a refusal costs the database nothing. This is
  //     a per-container counter, not a global quota, see lib/mcp/rateLimit.js.
  const cost = Array.isArray(body) ? Math.max(1, body.length) : 1;
  const budget = take(callerKey(caller), cost);
  if (!budget.ok) {
    return NextResponse.json(
      {
        error:
          `Rate limit reached: ${budget.limit} requests per minute for this caller. ` +
          `Retry in ${budget.retryAfterSeconds}s. A JSON-RPC batch counts as one request per message.`,
      },
      {
        status: 429,
        headers: {
          'Retry-After': String(budget.retryAfterSeconds),
          'RateLimit-Limit': String(budget.limit),
          'RateLimit-Remaining': '0',
        },
      },
    );
  }

  // ── JSON-RPC batch ────────────────────────────────────────────────────────
  if (Array.isArray(body)) {
    if (!body.length) {
      return NextResponse.json(
        { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Empty batch.' } },
        { status: 400 },
      );
    }
    const responses = (await Promise.all(body.map(m => handleMessage(m, caller)))).filter(Boolean);
    // An all-notification batch has nothing to answer with. 202 with no body is
    // what the spec asks for; returning `[]` makes some clients throw.
    if (!responses.length) return new NextResponse(null, { status: 202 });
    return NextResponse.json(responses);
  }

  // ── JSON-RPC single ───────────────────────────────────────────────────────
  if (body?.jsonrpc === '2.0') {
    const response = await handleMessage(body, caller);
    if (response === null) return new NextResponse(null, { status: 202 });
    return NextResponse.json(response);
  }

  // ── Plain shape, for in-app callers ───────────────────────────────────────
  // Accept both `{tool, params}` and `{name, arguments}`; clients differ.
  const name = body?.tool ?? body?.name ?? null;
  const args = body?.params ?? body?.arguments ?? {};

  if (!name) {
    return NextResponse.json({
      error:
        'Send either a JSON-RPC 2.0 message or {"tool": "<name>", "params": {...}}. ' +
        `Available tools: ${TOOLS.map(t => t.name).join(', ')}.`,
    }, { status: 400 });
  }

  try {
    const result = await executeTool({ name, args, caller });
    return NextResponse.json(result);
  } catch (err) {
    // A guard rejection is the caller's own doing and is safe, and useful, to
    // describe. Anything else may carry column names or query fragments, which is
    // the schema disclosure the field guards exist to prevent, so it is replaced.
    // executeTool has already written both outcomes to the audit log.
    const isCallerError = err instanceof McpError;
    return NextResponse.json(
      { error: isCallerError ? err.message : 'The request could not be completed.' },
      // 400 malformed / 403 refused, see the McpError doc comment in tools.js.
      { status: isCallerError ? (err.status || 400) : 500 },
    );
  }
}
