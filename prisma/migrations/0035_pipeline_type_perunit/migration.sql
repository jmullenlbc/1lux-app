-- AlterTable
ALTER TABLE "PipelineProject" ADD COLUMN "projectType" TEXT;

-- AlterTable
ALTER TABLE "Client" ADD COLUMN "pipelinePerUnit" DOUBLE PRECISION;
