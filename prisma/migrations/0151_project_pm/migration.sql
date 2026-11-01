-- Marks which of a job's team members are its Project Managers. Additive only.
ALTER TABLE "ProjectAssignee" ADD COLUMN "isPm" BOOLEAN NOT NULL DEFAULT false;
