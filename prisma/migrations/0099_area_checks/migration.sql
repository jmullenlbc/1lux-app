-- Per-area budget alerts (Mike 2026-09-24).
--
-- ProjectAreaCheck: one row per building area of a budget. baseAmount is the
-- area's dollars when the questionnaire was first finished (or when a web
-- request became the project), so a later budget can be compared with the
-- original answers. okAmount is what a person marked "It's right".
-- Additive only — no existing column changes.

CREATE TABLE "ProjectAreaCheck" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "area" TEXT NOT NULL,
    "baseAmount" DOUBLE PRECISION,
    "baseUnits" INTEGER,
    "baseFrom" TEXT,
    "baseTakenAt" TIMESTAMP(3),
    "okAmount" DOUBLE PRECISION,
    "okAt" TIMESTAMP(3),
    "okById" TEXT,
    CONSTRAINT "ProjectAreaCheck_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProjectAreaCheck_projectId_area_key" ON "ProjectAreaCheck"("projectId", "area");

ALTER TABLE "ProjectAreaCheck" ADD CONSTRAINT "ProjectAreaCheck_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
