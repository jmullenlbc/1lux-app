-- 0129: SalesExpense, money a salesperson spent on sales activity (Mike 10-9).
-- One row per expense: most come off a sales note ("Amount spent", one row per
-- note), the rest are typed on Sales > Activity > Expenses. Feeds the Spent
-- figures on Sales Activity and "cost to first project" per client.
-- Additive only.
CREATE TABLE "SalesExpense" (
    "id"           TEXT NOT NULL,
    "archivedAt"   TIMESTAMP(3),
    "archivedById" TEXT,
    "noteId"       TEXT,
    "userId"       TEXT NOT NULL,
    "clientId"     TEXT,
    "projectId"    TEXT,
    "spentOn"      TIMESTAMP(3) NOT NULL,
    "amountCents"  INTEGER NOT NULL,
    "category"     TEXT NOT NULL DEFAULT 'OTHER',
    "description"  TEXT NOT NULL DEFAULT '',
    "createdById"  TEXT,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesExpense_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SalesExpense_noteId_key" ON "SalesExpense"("noteId");
CREATE INDEX "SalesExpense_userId_idx" ON "SalesExpense"("userId");
CREATE INDEX "SalesExpense_clientId_idx" ON "SalesExpense"("clientId");
CREATE INDEX "SalesExpense_spentOn_idx" ON "SalesExpense"("spentOn");

ALTER TABLE "SalesExpense" ADD CONSTRAINT "SalesExpense_noteId_fkey"
  FOREIGN KEY ("noteId") REFERENCES "Note"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SalesExpense" ADD CONSTRAINT "SalesExpense_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SalesExpense" ADD CONSTRAINT "SalesExpense_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SalesExpense" ADD CONSTRAINT "SalesExpense_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
