-- Add new columns to ShipmentLineItem
ALTER TABLE "ShipmentLineItem" ADD COLUMN IF NOT EXISTS "qtyType"          TEXT;
ALTER TABLE "ShipmentLineItem" ADD COLUMN IF NOT EXISTS "sortOrder"        INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ShipmentLineItem" ADD COLUMN IF NOT EXISTS "sourceItemId"     TEXT;
ALTER TABLE "ShipmentLineItem" ADD COLUMN IF NOT EXISTS "sourceType"       TEXT;
ALTER TABLE "ShipmentLineItem" ADD COLUMN IF NOT EXISTS "sourceBatchLabel" TEXT;
ALTER TABLE "ShipmentLineItem" ADD COLUMN IF NOT EXISTS "propManufacturer" TEXT;
ALTER TABLE "ShipmentLineItem" ADD COLUMN IF NOT EXISTS "propModel"        TEXT;
ALTER TABLE "ShipmentLineItem" ADD COLUMN IF NOT EXISTS "isRemoved"        BOOLEAN NOT NULL DEFAULT false;

-- CreateTable: WarehouseRelease
CREATE TABLE "WarehouseRelease" (
    "id"           TEXT NOT NULL,
    "lineItemId"   TEXT NOT NULL,
    "qty"          INTEGER NOT NULL,
    "releasedById" TEXT NOT NULL,
    "notes"        TEXT,
    "releasedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WarehouseRelease_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "WarehouseRelease_lineItemId_idx" ON "WarehouseRelease"("lineItemId");

ALTER TABLE "WarehouseRelease"
    ADD CONSTRAINT "WarehouseRelease_lineItemId_fkey"
    FOREIGN KEY ("lineItemId") REFERENCES "ShipmentLineItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WarehouseRelease"
    ADD CONSTRAINT "WarehouseRelease_releasedById_fkey"
    FOREIGN KEY ("releasedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable: ShipSchedulePush
CREATE TABLE "ShipSchedulePush" (
    "id"            TEXT NOT NULL,
    "projectId"     TEXT NOT NULL,
    "sourceType"    TEXT NOT NULL,
    "sourceVersion" INTEGER,
    "sourceCoId"    TEXT,
    "pushedById"    TEXT NOT NULL,
    "pushedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "summary"       TEXT,

    CONSTRAINT "ShipSchedulePush_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ShipSchedulePush_projectId_idx" ON "ShipSchedulePush"("projectId");

ALTER TABLE "ShipSchedulePush"
    ADD CONSTRAINT "ShipSchedulePush_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ShipSchedulePush"
    ADD CONSTRAINT "ShipSchedulePush_pushedById_fkey"
    FOREIGN KEY ("pushedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
