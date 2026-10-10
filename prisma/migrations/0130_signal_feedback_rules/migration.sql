-- 0130: "Not relevant" with learning (Mike 10-9). SignalFeedback is one row
-- per press of Not relevant on an article, permit, concept case, council item
-- or land sale: who, why (one of seven reasons, text only for Other) and a
-- snapshot of the signal's features at the time. SuppressionRule is a rule the
-- system proposes from those rows (a source, case type, company, city or zone
-- that keeps getting dismissed and never acted on); an admin applies or
-- ignores it. Applied rules skip matching rows at pull time.
-- Additive only.
CREATE TABLE "SignalFeedback" (
    "id"          TEXT NOT NULL,
    "signalId"    TEXT NOT NULL,
    "userId"      TEXT NOT NULL,
    "reasonCode"  TEXT NOT NULL,
    "reasonText"  TEXT NOT NULL DEFAULT '',
    "kind"        TEXT NOT NULL DEFAULT 'ARTICLE',
    "sourceId"    TEXT,
    "city"        TEXT,
    "state"       TEXT,
    "permitClass" TEXT,
    "zone"        TEXT,
    "company"     TEXT,
    "unitCount"   INTEGER,
    "valuation"   DOUBLE PRECISION,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SignalFeedback_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SignalFeedback_signalId_idx" ON "SignalFeedback"("signalId");
CREATE INDEX "SignalFeedback_userId_idx" ON "SignalFeedback"("userId");
CREATE INDEX "SignalFeedback_reasonCode_idx" ON "SignalFeedback"("reasonCode");
CREATE INDEX "SignalFeedback_createdAt_idx" ON "SignalFeedback"("createdAt");

ALTER TABLE "SignalFeedback" ADD CONSTRAINT "SignalFeedback_signalId_fkey"
  FOREIGN KEY ("signalId") REFERENCES "MarketSignal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SignalFeedback" ADD CONSTRAINT "SignalFeedback_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "SuppressionRule" (
    "id"           TEXT NOT NULL,
    "kind"         TEXT NOT NULL,
    "field"        TEXT NOT NULL,
    "value"        TEXT NOT NULL,
    "reasonCode"   TEXT NOT NULL,
    "status"       TEXT NOT NULL DEFAULT 'PROPOSED',
    "dismissals"   INTEGER NOT NULL DEFAULT 0,
    "kept"         INTEGER NOT NULL DEFAULT 0,
    "hits"         INTEGER NOT NULL DEFAULT 0,
    "proposedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedById"  TEXT,
    "decidedAt"    TIMESTAMP(3),
    "archivedAt"   TIMESTAMP(3),
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SuppressionRule_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SuppressionRule_kind_field_value_key" ON "SuppressionRule"("kind", "field", "value");
CREATE INDEX "SuppressionRule_status_idx" ON "SuppressionRule"("status");

ALTER TABLE "SuppressionRule" ADD CONSTRAINT "SuppressionRule_decidedById_fkey"
  FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
