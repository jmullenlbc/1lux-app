-- 0089: sporadic exterior site features on a project.
--
-- Dog parks, courtyards, playgrounds, tennis courts, pickleball courts and turf
-- play areas (Mike, 2026-09-16). Each is priced as its own fixture package:
-- area lights ($1,400) or 12 ft pedestrian poles ($2,000) on the master pricing
-- sheet. One LIVE row per kind per project; a new drawing read or a typed value
-- archives the old row and writes a fresh one. Rows are never deleted
-- (src/lib/archive.js NEVER_DELETED).
--
-- Additive only: a new table, nothing existing is touched. Projects with no
-- rows price $0 for site features, exactly as before this shipped.
CREATE TABLE "SiteFeature" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "count" INTEGER,
    "lengthFt" DOUBLE PRECISION,
    "source" TEXT NOT NULL,
    "sheet" INTEGER,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "SiteFeature_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SiteFeature_projectId_archivedAt_idx" ON "SiteFeature"("projectId", "archivedAt");

ALTER TABLE "SiteFeature" ADD CONSTRAINT "SiteFeature_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
