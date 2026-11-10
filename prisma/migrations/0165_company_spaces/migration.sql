-- Company spaces (Jason, 2026-11-10): LOGIQ (distributor), SAGE and Shift (manufacturers), each one NetSuite
-- subsidiary. A project belongs to at most one space; people can sell for one or several. Additive only:
-- existing projects start with no space, existing people sell for none (= all).

-- CreateTable
CREATE TABLE "BusinessUnit" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "legalName" TEXT,
    "netsuiteSubsidiaryId" TEXT,
    "address" TEXT,
    "phone" TEXT,
    "ordersEmail" TEXT,
    "website" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessUnit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BusinessUnit_code_key" ON "BusinessUnit"("code");

-- The three spaces, with fixed ids so code and data can name them. NetSuite subsidiary ids read 2026-11-06.
INSERT INTO "BusinessUnit" ("id", "code", "name", "kind", "legalName", "netsuiteSubsidiaryId", "sortOrder", "updatedAt") VALUES
    ('bu_logiq', 'LOGIQ', 'LOGIQ', 'DISTRIBUTOR', 'LOGIQ', '3', 1, CURRENT_TIMESTAMP),
    ('bu_sage', 'SAGE', 'SAGE', 'MANUFACTURER', 'SAGE Brands', '13', 2, CURRENT_TIMESTAMP),
    ('bu_shift', 'SHIFT', 'Shift', 'MANUFACTURER', 'SHIFT Innovations', '11', 3, CURRENT_TIMESTAMP);

-- AlterTable
ALTER TABLE "Project" ADD COLUMN "businessUnitId" TEXT;

-- CreateIndex
CREATE INDEX "Project_businessUnitId_idx" ON "Project"("businessUnitId");

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_businessUnitId_fkey"
  FOREIGN KEY ("businessUnitId") REFERENCES "BusinessUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable: which spaces a person sells for (none = all), the same shape as UserDepartment.
CREATE TABLE "UserBusinessUnit" (
    "userId" TEXT NOT NULL,
    "space" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserBusinessUnit_pkey" PRIMARY KEY ("userId", "space")
);

-- CreateIndex
CREATE INDEX "UserBusinessUnit_space_idx" ON "UserBusinessUnit"("space");

-- AddForeignKey
ALTER TABLE "UserBusinessUnit" ADD CONSTRAINT "UserBusinessUnit_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
