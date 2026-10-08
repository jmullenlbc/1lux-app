-- 0122: Market Intel tags, unit counts and article assignment (Mike 10-7).
-- Additive only. Company, project, metro and state names pulled from articles
-- become rows; a salesperson can be assigned an article.
ALTER TABLE "MarketSignal" ADD COLUMN "unitCount" INTEGER;
ALTER TABLE "MarketSignal" ADD COLUMN "taggedAt" TIMESTAMP(3);
ALTER TABLE "MarketSignal" ADD COLUMN "assignedToId" TEXT;
ALTER TABLE "MarketSignal" ADD COLUMN "assignedById" TEXT;
ALTER TABLE "MarketSignal" ADD COLUMN "assignedAt" TIMESTAMP(3);
ALTER TABLE "MarketSignal" ADD CONSTRAINT "MarketSignal_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "MarketSignal_assignedToId_idx" ON "MarketSignal"("assignedToId");
CREATE INDEX "MarketSignal_taggedAt_idx" ON "MarketSignal"("taggedAt");

CREATE TABLE "MarketTag" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalized" TEXT NOT NULL,
    "clientId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MarketTag_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MarketTag_kind_normalized_key" ON "MarketTag"("kind", "normalized");
CREATE INDEX "MarketTag_clientId_idx" ON "MarketTag"("clientId");
ALTER TABLE "MarketTag" ADD CONSTRAINT "MarketTag_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "MarketSignalTag" (
    "id" TEXT NOT NULL,
    "signalId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "role" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MarketSignalTag_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MarketSignalTag_signalId_tagId_key" ON "MarketSignalTag"("signalId", "tagId");
CREATE INDEX "MarketSignalTag_tagId_idx" ON "MarketSignalTag"("tagId");
ALTER TABLE "MarketSignalTag" ADD CONSTRAINT "MarketSignalTag_signalId_fkey" FOREIGN KEY ("signalId") REFERENCES "MarketSignal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketSignalTag" ADD CONSTRAINT "MarketSignalTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "MarketTag"("id") ON DELETE CASCADE ON UPDATE CASCADE;
