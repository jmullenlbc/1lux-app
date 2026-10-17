/**
 * JSON-RPC 2.0 dispatch for MCP Streamable HTTP.
 *
 * Hand-rolled rather than built on @modelcontextprotocol/sdk, for three reasons:
 * the SDK is not a dependency of this project and adding one to a Next.js SSR
 * bundle on Amplify has its own failure modes; the transport surface we actually
 * need is five methods of a well-specified wire protocol; and the SDK's
 * server-side adapters assume a Node HTTP server rather than a Web `Request`.
 * This matches how the rest of the repo is built, `node:test` with no test
 * framework, no ORM wrapper over Prisma.
 *
 * Stateless: no session ids, no SSE. Every POST is a complete request. That is a
 * legal Streamable HTTP implementation and it is the only shape that works on
 * Lambda, where there is no process to hold a session in between calls.
 *
 * Methods:
 *   initialize, handshake, returns capabilities
 *   notifications/initialized, client ack; no response body (it is a notification)
 *   ping, liveness
 *   tools/list, the tool catalogue
 *   tools/call, run one tool
 */
import { TOOLS, TOOLS_BY_NAME, McpError } from './tools.js';
import { logQuery } from './audit.js';

export const PROTOCOL_VERSION = '2025-06-18';

/** JSON-RPC 2.0 reserved codes. */
export const RPC = Object.freeze({
  PARSE_ERROR:      -32700,
  INVALID_REQUEST:  -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS:   -32602,
  INTERNAL_ERROR:   -32603,
});

const ok    = (id, result) => ({ jsonrpc: '2.0', id, result });
const error = (id, code, message, data) => ({
  jsonrpc: '2.0', id, error: { code, message, ...(data ? { data } : {}) },
});

/**
 * Handle one JSON-RPC message.
 *
 * @param {object} message  a parsed JSON-RPC request
 * @param {object} caller   from resolveCaller()
 * @returns {Promise<object|null>} the response, or null for a notification
 */
export async function handleMessage(message, caller) {
  if (!message || typeof message !== 'object' || Array.isArray(message)) {
    return error(null, RPC.INVALID_REQUEST, 'Request must be a JSON-RPC 2.0 object.');
  }

  const { id = null, method, params } = message;
  if (typeof method !== 'string') {
    return error(id, RPC.INVALID_REQUEST, 'Missing "method".');
  }

  switch (method) {
    case 'initialize':
      return ok(id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'ilc-librarian', version: '1.0.0' },
        instructions:
          'Read-only access to ILC Studios project data. Call list_models first; the names it ' +
          'returns are the only valid `model` arguments. Fields you are not cleared to read are ' +
          'absent from responses rather than nulled. Do not infer that a missing field is empty.',
      });

    // A notification has no id and takes no response. Returning a result here
    // would be a protocol violation that some clients treat as fatal.
    case 'notifications/initialized':
    case 'initialized':
      return null;

    case 'ping':
      return ok(id, {});

    case 'tools/list':
      // Filtered to the caller. A client viewer being handed the NAME
      // get_calibration would learn that ILC keeps a record of how far its own
      // pricing is off, which is a fact about the business, not about them.
      // The refusal in tools.js is still the boundary; this only stops the
      // catalogue advertising doors nobody is going to open.
      return ok(id, {
        tools: TOOLS
          .filter(t => t.audience !== 'ilc' || caller?.audience === 'ilc')
          .map(t => ({
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema,
          })),
      });

    case 'tools/call':
      return await callTool(id, params, caller);

    default:
      return error(id, RPC.METHOD_NOT_FOUND, `Unknown method "${method}".`);
  }
}

/**
 * Run one tool, audit it, and return its raw result.
 *
 * Extracted from the JSON-RPC wrapper because /api/mcp answers two wire shapes
 * JSON-RPC for real MCP clients, and a plain `{tool, params}` POST for the in-app
 * Ask-AI branch, and those two must not become two implementations of the
 * guards. Both go through this function; only the envelope differs.
 *
 * Throws McpError for anything the caller did wrong (safe to describe back) and
 * the original error for anything we did wrong (never described back). Either way
 * the attempt is already in the audit log by the time it throws.
 */
export async function executeTool({ name, args = {}, caller }) {
  const tool = TOOLS_BY_NAME[name];
  if (!tool) {
    await logQuery({ caller, tool: String(name), params: args, status: 'error', error: 'unknown tool' });
    // Only the tools this caller could actually have called. Naming the
    // ILC-only ones in a typo message would be a catalogue leak through the
    // error channel.
    const offered = TOOLS
      .filter(t => t.audience !== 'ilc' || caller?.audience === 'ilc')
      .map(t => t.name);
    throw new McpError(`Unknown tool "${name}". Available: ${offered.join(', ')}.`);
  }

  const started = Date.now();
  try {
    const result = await tool.run({ args, caller });
    await logQuery({
      caller,
      tool: name,
      params: args,
      model: args?.model || null,
      rowCount: countRows(result),
      durationMs: Date.now() - started,
      status: 'ok',
    });
    return result;
  } catch (err) {
    await logQuery({
      caller,
      tool: name,
      params: args,
      model: args?.model || null,
      durationMs: Date.now() - started,
      status: err instanceof McpError ? 'rejected' : 'error',
      error: err?.message,
    });

    // A guard rejection is the caller's problem and is safe to describe. Anything
    // else is ours: log it fully here, and let the caller-facing layer replace the
    // message. A Prisma error string can carry column names and fragments of the
    // query, which is precisely the schema disclosure the field guards prevent.
    if (!(err instanceof McpError)) console.error(`[mcp] ${name} failed:`, err);
    throw err;
  }
}

async function callTool(id, params, caller) {
  const name = params?.name;
  const args = params?.arguments ?? {};

  try {
    const result = await executeTool({ name, args, caller });
    // MCP returns tool output as content blocks. The JSON goes in a text block
    // as pretty-printed JSON, which is what every current client parses.
    return ok(id, {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      isError: false,
    });
  } catch (err) {
    // A tool that fails is a successful RPC carrying isError, not an RPC error
    // that is the MCP convention, and it is what lets a model see and react to
    // "you cannot read that field" instead of the client swallowing a transport
    // fault. The one exception is an unknown tool name, which is a protocol-level
    // mistake rather than a tool outcome.
    if (err instanceof McpError && /^Unknown tool /.test(err.message)) {
      return error(id, RPC.METHOD_NOT_FOUND, err.message);
    }
    return ok(id, {
      content: [{
        type: 'text',
        text: err instanceof McpError ? err.message : 'The request could not be completed.',
      }],
      isError: true,
    });
  }
}

/** Best-effort row count for the audit log. Never throws. */
function countRows(result) {
  if (!result || typeof result !== 'object') return null;
  if (Number.isFinite(result.count)) return result.count;
  for (const key of ['records', 'projects', 'models']) {
    if (Array.isArray(result[key])) return result[key].length;
  }
  if (result.record !== undefined) return result.record ? 1 : 0;
  if (result.project !== undefined) return result.project ? 1 : 0;
  if (result.client !== undefined) return result.client ? 1 : 0;
  return null;
}

export { ok as rpcOk, error as rpcError };
