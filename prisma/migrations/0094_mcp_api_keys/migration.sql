-- Per-person MCP keys.
--
-- Replaces the single shared MCP_API_TOKEN as the preferred credential. The
-- shared token still works (it is the break-glass path and the one the machine
-- jobs use today), but a key issued here names a person in every audit line.
--
-- Only the SHA-256 of the key is stored. The unique index on tokenHash is what
-- makes lookup a single indexed read rather than a scan over every key.

CREATE TABLE "McpApiKey" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdById" TEXT,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "McpApiKey_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "McpApiKey_tokenHash_key" ON "McpApiKey"("tokenHash");
CREATE INDEX "McpApiKey_userId_idx" ON "McpApiKey"("userId");
CREATE INDEX "McpApiKey_revokedAt_idx" ON "McpApiKey"("revokedAt");

ALTER TABLE "McpApiKey" ADD CONSTRAINT "McpApiKey_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
