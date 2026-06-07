-- Activity classification intelligence
-- Adds: ActivityClassificationRule model, classificationSource + confidence on SalesNote

ALTER TABLE "SalesNote" ADD COLUMN "classificationSource"    TEXT;
ALTER TABLE "SalesNote" ADD COLUMN "classificationConfidence" INTEGER;

CREATE TABLE "ActivityClassificationRule" (
  "id"             TEXT NOT NULL PRIMARY KEY,
  "name"           TEXT NOT NULL,
  "conditionType"  TEXT NOT NULL,
  "conditionValue" TEXT NOT NULL,
  "resultType"     TEXT NOT NULL,
  "priority"       INTEGER NOT NULL DEFAULT 0,
  "isActive"       BOOLEAN NOT NULL DEFAULT true,
  "createdById"    TEXT NOT NULL REFERENCES "User"("id"),
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL
);
CREATE INDEX "ActivityClassificationRule_priority_idx" ON "ActivityClassificationRule"("priority");
