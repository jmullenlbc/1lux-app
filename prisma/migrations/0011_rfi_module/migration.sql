-- AlterTable: Project — add rfiRoutingMode
ALTER TABLE "Project" ADD COLUMN "rfiRoutingMode" TEXT DEFAULT 'DIRECT';

-- AlterTable: ChangeOrder — add rfiId (nullable unique)
ALTER TABLE "ChangeOrder" ADD COLUMN "rfiId" TEXT;
CREATE UNIQUE INDEX "ChangeOrder_rfiId_key" ON "ChangeOrder"("rfiId");

-- AlterTable: FixtureScheduleItem — add drawingSheetReference
ALTER TABLE "FixtureScheduleItem" ADD COLUMN "drawingSheetReference" TEXT;

-- CreateTable: RFI
CREATE TABLE "RFI" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "rfiNumber" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "receivedFrom" TEXT NOT NULL,
    "rfiType" TEXT NOT NULL,
    "routingMode" TEXT NOT NULL DEFAULT 'DIRECT',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "assignedToId" TEXT,
    "procoreRfiId" TEXT,
    "procoreProjectId" TEXT,
    "dateReceived" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dateDue" TIMESTAMP(3),
    "shipFlag" BOOLEAN NOT NULL DEFAULT false,
    "shipFlagAcknowledged" BOOLEAN NOT NULL DEFAULT false,
    "draftText" TEXT,
    "draftStatus" TEXT NOT NULL DEFAULT 'NONE',
    "draftConfidence" TEXT,
    "draftGeneratedAt" TIMESTAMP(3),
    "draftReviewedBy" TEXT,
    "draftReviewedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "closedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RFI_pkey" PRIMARY KEY ("id")
);

-- CreateTable: RFIActivity
CREATE TABLE "RFIActivity" (
    "id" TEXT NOT NULL,
    "rfiId" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "authoredBy" TEXT NOT NULL,
    "bodyText" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RFIActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable: RFIAttachment
CREATE TABLE "RFIAttachment" (
    "id" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "attachmentType" TEXT NOT NULL,
    "drawingId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RFIAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable: RFIImpactItem
CREATE TABLE "RFIImpactItem" (
    "id" TEXT NOT NULL,
    "rfiId" TEXT NOT NULL,
    "fixtureTypeFrom" TEXT,
    "fixtureTypeTo" TEXT,
    "qtyDelta" INTEGER NOT NULL DEFAULT 0,
    "itemNumber" INTEGER,
    "itemConfidence" TEXT,
    "itemDraftText" TEXT,
    "impactStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RFIImpactItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable: DrawingRevisionFlag
CREATE TABLE "DrawingRevisionFlag" (
    "id" TEXT NOT NULL,
    "drawingId" TEXT NOT NULL,
    "rfiId" TEXT NOT NULL,
    "flaggedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,
    CONSTRAINT "DrawingRevisionFlag_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RFI_procoreRfiId_key" ON "RFI"("procoreRfiId");
CREATE INDEX "RFI_projectId_idx" ON "RFI"("projectId");
CREATE INDEX "RFIActivity_rfiId_idx" ON "RFIActivity"("rfiId");
CREATE INDEX "RFIAttachment_activityId_idx" ON "RFIAttachment"("activityId");
CREATE INDEX "RFIImpactItem_rfiId_idx" ON "RFIImpactItem"("rfiId");
CREATE INDEX "DrawingRevisionFlag_drawingId_idx" ON "DrawingRevisionFlag"("drawingId");
CREATE INDEX "DrawingRevisionFlag_rfiId_idx" ON "DrawingRevisionFlag"("rfiId");

-- AddForeignKey
ALTER TABLE "RFI" ADD CONSTRAINT "RFI_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RFI" ADD CONSTRAINT "RFI_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RFIActivity" ADD CONSTRAINT "RFIActivity_rfiId_fkey" FOREIGN KEY ("rfiId") REFERENCES "RFI"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RFIAttachment" ADD CONSTRAINT "RFIAttachment_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "RFIActivity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RFIAttachment" ADD CONSTRAINT "RFIAttachment_drawingId_fkey" FOREIGN KEY ("drawingId") REFERENCES "ProjectFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RFIImpactItem" ADD CONSTRAINT "RFIImpactItem_rfiId_fkey" FOREIGN KEY ("rfiId") REFERENCES "RFI"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DrawingRevisionFlag" ADD CONSTRAINT "DrawingRevisionFlag_drawingId_fkey" FOREIGN KEY ("drawingId") REFERENCES "ProjectFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DrawingRevisionFlag" ADD CONSTRAINT "DrawingRevisionFlag_rfiId_fkey" FOREIGN KEY ("rfiId") REFERENCES "RFI"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChangeOrder" ADD CONSTRAINT "ChangeOrder_rfiId_fkey" FOREIGN KEY ("rfiId") REFERENCES "RFI"("id") ON DELETE SET NULL ON UPDATE CASCADE;
