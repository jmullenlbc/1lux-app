-- CreateTable
CREATE TABLE "BudgetQCChecklist" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "assignedToId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BudgetQCChecklist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BudgetQCItem" (
    "id" TEXT NOT NULL,
    "checklistId" TEXT NOT NULL,
    "itemKey" TEXT NOT NULL,
    "checked" BOOLEAN NOT NULL DEFAULT false,
    "checkedById" TEXT,
    "checkedAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BudgetQCItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BudgetQCChecklist_projectId_key" ON "BudgetQCChecklist"("projectId");
CREATE UNIQUE INDEX "BudgetQCItem_checklistId_itemKey_key" ON "BudgetQCItem"("checklistId", "itemKey");
CREATE INDEX "BudgetQCItem_checklistId_idx" ON "BudgetQCItem"("checklistId");

-- AddForeignKey
ALTER TABLE "BudgetQCChecklist" ADD CONSTRAINT "BudgetQCChecklist_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BudgetQCChecklist" ADD CONSTRAINT "BudgetQCChecklist_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BudgetQCItem" ADD CONSTRAINT "BudgetQCItem_checklistId_fkey" FOREIGN KEY ("checklistId") REFERENCES "BudgetQCChecklist"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BudgetQCItem" ADD CONSTRAINT "BudgetQCItem_checkedById_fkey" FOREIGN KEY ("checkedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
