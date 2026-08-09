/**
 * The Librarian — a governed, read-only API over ILC's data.
 *
 * Slice 3 of the Governed AI Layer. The hard parts were built and unit-tested in
 * isolation; this file is the wiring, and it is deliberately thin so that every
 * security decision stays in the module that owns it:
 *
 *   src/lib/mcp/auth.js    — WHO is asking (bearer service token or session cookie)
 *   src/lib/mcp/audit.js   — WHETHER we may answer at all, and the record that we did
 *   src/lib/mcp/guards.js  — WHAT they may ask for (model allowlist, field
 *                            validation, row cap, timeout)
 *   src/lib/mcp/tools.js   — the nine tools, each ending in a redaction
 *   src/lib/mcp/server.js  — JSON-RPC 2.0 framing
 *   src/lib/ontology/redact.js — WHICH FIELDS come back (allowlist, fails closed)
 *
 * Every request runs the same steps in the same order, and the order is the design:
 *
 *   1. auditReady()   — no audit sink, no service. Refuse before authenticating,
 *                       because a 503 that reveals nothing is the correct answer
 *                       even to a valid token.
 *   2. resolveCaller() — 401 if unauthenticated. No degrading to a public view;
 *                       a general read API refuses rather than guesses.
 *   3. checkModel()   — default deny against the ontology allowlist.
 *   4. findForbiddenFields() — reject the QUERY, not just the response. Filtering
 *                       on a field you cannot see is an oracle for its value.
 *   5. redactObject() — allowlist the response by declared sensitivity.
 *
 * ── Why read-only ────────────────────────────────────────────────────────────
 * There are no write tools here and there is no `prisma.$queryRaw`. The whole
 * value of this endpoint is that its blast radius is provably bounded: the worst
 * a compromised token can do is read rows it was already cleared for, capped at
 * 100 at a time, and every attempt is in the audit log. Adding one write tool
 * forfeits that argument entirely, so writes go through the existing routes with
 * their own guards — and eventually through the Scribe (Slice 4).
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
 * @see scripts/tests/mcp.test.mjs — live acceptance tests, incl. a CLIENT_VIEWER
 *      driving this endpoint over real HTTP to prove the boundary empirically.
 */
import { NextResponse } from 'next/server';
import { resolveCaller } from '@/lib/mcp/auth';
import { auditReady } from '@/lib/mcp/audit';
import { DEFAULT_LIMIT, MAX_LIMIT, QUERY_TIMEOUT_MS } from '@/lib/mcp/guards';
import { TOOLS, McpError } from '@/lib/mcp/tools';
import { handleMessage, executeTool, PROTOCOL_VERSION } from '@/lib/mcp/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Service description and tool catalogue.
 *
 * Unauthenticated on purpose, so an MCP client can discover the endpoint before
 * it has a token. It lists tool NAMES and argument shapes — no object names, no
 * field names, no data — so it discloses nothing the source repository does not.
 */
export async function GET() {
  const ready = auditReady();
  return NextResponse.json({
    service: 'ilc-librarian',
    protocolVersion: PROTOCOL_VERSION,
    readOnly: true,
    available: ready.ok,
    ...(ready.ok ? {} : { unavailableReason: ready.message }),
    limits: { defaultLimit: DEFAULT_LIMIT, maxLimit: MAX_LIMIT, queryTimeoutMs: QUERY_TIMEOUT_MS },
    tools: TOOLS.map(t => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })),
  });
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
    // A guard rejection is the caller's own doing and is safe — and useful — to
    // describe. Anything else may carry column names or query fragments, which is
    // the schema disclosure the field guards exist to prevent, so it is replaced.
    // executeTool has already written both outcomes to the audit log.
    const isCallerError = err instanceof McpError;
    return NextResponse.json(
      { error: isCallerError ? err.message : 'The request could not be completed.' },
      // 400 malformed / 403 refused — see the McpError doc comment in tools.js.
      { status: isCallerError ? (err.status || 400) : 500 },
    );
  }
}
