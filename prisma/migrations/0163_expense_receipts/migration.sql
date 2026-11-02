-- Receipts snapped or dropped on Expenses, and the vendor on a confirmed
-- expense. Additive only.
ALTER TABLE "SalesExpense" ADD COLUMN "vendor" TEXT NOT NULL DEFAULT '';

CREATE TABLE "ExpenseReceipt" (
    "id" TEXT NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "archivedById" TEXT,
    "expenseId" TEXT,
    "userId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storedKey" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'DROP',
    "aiStatus" TEXT NOT NULL DEFAULT 'WAITING',
    "aiError" TEXT,
    "aiVendor" TEXT,
    "aiAmountCents" INTEGER,
    "aiSpentOn" TIMESTAMP(3),
    "aiCategory" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ExpenseReceipt_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ExpenseReceipt_userId_idx" ON "ExpenseReceipt"("userId");
CREATE INDEX "ExpenseReceipt_expenseId_idx" ON "ExpenseReceipt"("expenseId");
CREATE INDEX "ExpenseReceipt_userId_sha256_idx" ON "ExpenseReceipt"("userId", "sha256");

ALTER TABLE "ExpenseReceipt" ADD CONSTRAINT "ExpenseReceipt_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "SalesExpense"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ExpenseReceipt" ADD CONSTRAINT "ExpenseReceipt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
