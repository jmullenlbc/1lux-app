-- AlterTable
ALTER TABLE "ClientContact" ADD COLUMN "department" TEXT;

-- AlterTable
ALTER TABLE "ClientPlaybook" ADD COLUMN "roleAssignments" TEXT DEFAULT '{}';
ALTER TABLE "ClientPlaybook" ADD COLUMN "paymentTerms" TEXT;
