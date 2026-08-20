-- Governed AI Layer, Slice 4b — the AgentRun accuracy record.
-- One row per reviewable AI run: what the model said, what the auto-checks
-- found, and what a person decided. Purely additive; no existing table changes.
-- Column contract is src/lib/agent/reviewStore.js (buildRow).
CREATE TABLE "AgentRun" (
  "id"            TEXT NOT NULL,
  "taskType"      TEXT NOT NULL,
  "feature"       TEXT,
  "model"         TEXT,
  "promptVersion" TEXT,
  "via"           TEXT NOT NULL DEFAULT 'app',

  "projectId"    TEXT,
  "clientId"     TEXT,
  "userId"       TEXT,
  "sourceFileId" TEXT,

  "inputTokens"  INTEGER,
  "outputTokens" INTEGER,
  "cachedTokens" INTEGER,
  "costUsd"      DOUBLE PRECISION,
  "latencyMs"    INTEGER,

  "inputSummary" TEXT,
  "outputJson"   TEXT,
  "confidence"   DOUBLE PRECISION,
  "citations"    TEXT,

  "reviewable"    BOOLEAN NOT NULL DEFAULT true,
  "autoChecks"    TEXT,
  "autoCheckPass" BOOLEAN,

  "verdict"     TEXT,
  "verdictById" TEXT,
  "verdictAt"   TIMESTAMP(3),
  "correction"  TEXT,
  "note"        TEXT,

  "status"       TEXT NOT NULL DEFAULT 'PENDING',
  "errorMessage" TEXT,

  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AgentRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AgentRun_taskType_promptVersion_idx" ON "AgentRun"("taskType", "promptVersion");
CREATE INDEX "AgentRun_status_idx" ON "AgentRun"("status");
CREATE INDEX "AgentRun_projectId_idx" ON "AgentRun"("projectId");
