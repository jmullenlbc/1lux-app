-- CreateTable
CREATE TABLE "ProjectUnitType" (
    "id"         TEXT    NOT NULL PRIMARY KEY,
    "projectId"  TEXT    NOT NULL,
    "code"       TEXT    NOT NULL,
    "label"      TEXT,
    "qty"        INTEGER NOT NULL,
    "unitSf"     REAL,
    "bedrooms"   INTEGER,
    "bathrooms"  INTEGER,
    "balconies"  INTEGER,
    "sortOrder"  INTEGER NOT NULL DEFAULT 0,
    "source"     TEXT    NOT NULL DEFAULT 'EXTRACTED',
    "confidence" REAL,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"  TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProjectUnitType_projectId_fkey"
        FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ProjectUnitType_projectId_idx" ON "ProjectUnitType"("projectId");
