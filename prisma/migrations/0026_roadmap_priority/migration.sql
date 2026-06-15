-- Migration 0026: create RoadmapPriority table
-- Mike added the model to schema.prisma but never generated a migration for it,
-- so production deploy 143 (and several before it) crashed during seed when
-- prisma.roadmapPriority.upsert hit "table public.RoadmapPriority does not exist."
-- Seeded by prisma/seed.js with bid-matrix, concept-q, design-q, etc.

CREATE TABLE "RoadmapPriority" (
    "id"        TEXT         NOT NULL PRIMARY KEY,
    "name"      TEXT         NOT NULL,
    "status"    TEXT         NOT NULL DEFAULT 'todo',
    "sortOrder" INTEGER      NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL
);
