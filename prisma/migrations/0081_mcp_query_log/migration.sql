-- 0081: MCP audit log.
--
-- One row per MCP tool call (src/lib/mcp/audit.js): who asked, which tool,
-- the question asked, and how many rows came back — never the rows themselves.
-- Until this table exists the production MCP server answers every request with
-- a 503 on purpose: a read API over the whole database does not run unlogged.
--
-- Additive only: a new table, nothing existing is touched.
CREATE TABLE "McpQueryLog" (
    "id" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "callerKind" TEXT,
    "callerId" TEXT,
    "callerEmail" TEXT,
    "callerRole" TEXT,
    "audience" TEXT,
    "tool" TEXT NOT NULL,
    "model" TEXT,
    "params" TEXT,
    "rowCount" INTEGER,
    "durationMs" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'ok',
    "error" TEXT,

    CONSTRAINT "McpQueryLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "McpQueryLog_at_idx" ON "McpQueryLog"("at");
CREATE INDEX "McpQueryLog_tool_idx" ON "McpQueryLog"("tool");
CREATE INDEX "McpQueryLog_callerEmail_idx" ON "McpQueryLog"("callerEmail");
