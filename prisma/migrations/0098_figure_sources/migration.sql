-- Learn only from real numbers (Mike 2026-09-24).
--
-- ProjectFigureSource: where each ProjectData figure came from (drawing,
-- staff, fixtures, import, client, guess), plus "It's right" on an unusual-
-- number alert. ConfirmedGuess: a stand-in guess a person adopted from what
-- our real jobs say. Additive only — no existing column changes.

CREATE TABLE "ProjectFigureSource" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "setById" TEXT,
    "setAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),
    "confirmedById" TEXT,
    CONSTRAINT "ProjectFigureSource_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProjectFigureSource_projectId_field_key" ON "ProjectFigureSource"("projectId", "field");
CREATE INDEX "ProjectFigureSource_field_source_idx" ON "ProjectFigureSource"("field", "source");

ALTER TABLE "ProjectFigureSource" ADD CONSTRAINT "ProjectFigureSource_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ConfirmedGuess" (
    "id" TEXT NOT NULL,
    "guessKey" TEXT NOT NULL,
    "buildingType" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "previousValue" DOUBLE PRECISION,
    "jobs" INTEGER NOT NULL,
    "confirmedById" TEXT,
    "confirmedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archivedAt" TIMESTAMP(3),
    CONSTRAINT "ConfirmedGuess_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ConfirmedGuess_guessKey_buildingType_idx" ON "ConfirmedGuess"("guessKey", "buildingType");
