-- AlterTable
ALTER TABLE "Client" ADD COLUMN "projectTypes" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "Client" ADD COLUMN "projectsPerYear" INTEGER;
