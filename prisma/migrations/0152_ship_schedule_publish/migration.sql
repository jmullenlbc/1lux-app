-- Published copies of the Ship Schedule for the client portal. Additive only.
ALTER TABLE "Project" ADD COLUMN "shipAutoPublishAt" TIMESTAMP(3);

CREATE TABLE "ShipSchedulePublish" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "how" TEXT NOT NULL,
    "publishedById" TEXT,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShipSchedulePublish_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ShipSchedulePublishLine" (
    "id" TEXT NOT NULL,
    "publishId" TEXT NOT NULL,
    "lineItemId" TEXT,
    "shipmentId" TEXT NOT NULL,
    "manufacturer" TEXT NOT NULL,
    "shipmentStatus" TEXT NOT NULL,
    "shipmentEsdDate" TIMESTAMP(3),
    "destinationType" TEXT NOT NULL,
    "fixtureType" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "catalogNo" TEXT,
    "qty" INTEGER NOT NULL,
    "qtyType" TEXT,
    "fixtureStatus" TEXT,
    "sourceBatchLabel" TEXT,
    "esdDate" TIMESTAMP(3),
    "leadTimeWeeks" TEXT,
    "trackingNumber" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "qtyAtWarehouse" INTEGER NOT NULL,
    "qtyOnSite" INTEGER NOT NULL,
    "qtyBackordered" INTEGER NOT NULL,

    CONSTRAINT "ShipSchedulePublishLine_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ShipSchedulePublish_projectId_publishedAt_idx" ON "ShipSchedulePublish"("projectId", "publishedAt");
CREATE INDEX "ShipSchedulePublishLine_publishId_idx" ON "ShipSchedulePublishLine"("publishId");
CREATE INDEX "ShipSchedulePublishLine_lineItemId_idx" ON "ShipSchedulePublishLine"("lineItemId");

ALTER TABLE "ShipSchedulePublish" ADD CONSTRAINT "ShipSchedulePublish_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ShipSchedulePublish" ADD CONSTRAINT "ShipSchedulePublish_publishedById_fkey" FOREIGN KEY ("publishedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ShipSchedulePublishLine" ADD CONSTRAINT "ShipSchedulePublishLine_publishId_fkey" FOREIGN KEY ("publishId") REFERENCES "ShipSchedulePublish"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ShipSchedulePublishLine" ADD CONSTRAINT "ShipSchedulePublishLine_lineItemId_fkey" FOREIGN KEY ("lineItemId") REFERENCES "ShipmentLineItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
