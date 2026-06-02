-- Add totalInvoiced to Project
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "totalInvoiced" DOUBLE PRECISION;

-- CreateTable: ChangeOrder
CREATE TABLE "ChangeOrder" (
    "id"          TEXT NOT NULL,
    "projectId"   TEXT NOT NULL,
    "coNumber"    TEXT NOT NULL,
    "title"       TEXT NOT NULL,
    "date"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status"      TEXT NOT NULL DEFAULT 'DRAFT',
    "notes"       TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChangeOrder_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ChangeOrder_projectId_idx" ON "ChangeOrder"("projectId");

ALTER TABLE "ChangeOrder"
    ADD CONSTRAINT "ChangeOrder_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ChangeOrder"
    ADD CONSTRAINT "ChangeOrder_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable: ChangeOrderOptionGroup
CREATE TABLE "ChangeOrderOptionGroup" (
    "id"            TEXT NOT NULL,
    "changeOrderId" TEXT NOT NULL,
    "label"         TEXT NOT NULL DEFAULT 'Default',
    "sortOrder"     INTEGER NOT NULL DEFAULT 0,
    "isSelected"    BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ChangeOrderOptionGroup_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ChangeOrderOptionGroup_changeOrderId_idx" ON "ChangeOrderOptionGroup"("changeOrderId");

ALTER TABLE "ChangeOrderOptionGroup"
    ADD CONSTRAINT "ChangeOrderOptionGroup_changeOrderId_fkey"
    FOREIGN KEY ("changeOrderId") REFERENCES "ChangeOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: ChangeOrderLineItem
CREATE TABLE "ChangeOrderLineItem" (
    "id"            TEXT NOT NULL,
    "optionGroupId" TEXT NOT NULL,
    "sortOrder"     INTEGER NOT NULL DEFAULT 0,
    "fixtureType"   TEXT NOT NULL DEFAULT '',
    "qty"           DOUBLE PRECISION NOT NULL DEFAULT 0,
    "manufacturer"  TEXT,
    "partNumber"    TEXT,
    "description"   TEXT,
    "originalDN"    DOUBLE PRECISION,
    "cnUnitPrice"   DOUBLE PRECISION NOT NULL DEFAULT 0,
    "quoteReference"   TEXT,
    "leadTime"         TEXT,
    "notes"            TEXT,
    "parentLineItemId" TEXT,
    "isOptionRow"      BOOLEAN NOT NULL DEFAULT false,
    "optionLabel"      TEXT,
    "isGroupSelected"  BOOLEAN NOT NULL DEFAULT false,
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChangeOrderLineItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ChangeOrderLineItem_optionGroupId_idx" ON "ChangeOrderLineItem"("optionGroupId");

ALTER TABLE "ChangeOrderLineItem"
    ADD CONSTRAINT "ChangeOrderLineItem_optionGroupId_fkey"
    FOREIGN KEY ("optionGroupId") REFERENCES "ChangeOrderOptionGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: ChangeOrderSend
CREATE TABLE "ChangeOrderSend" (
    "id"            TEXT NOT NULL,
    "changeOrderId" TEXT NOT NULL,
    "sentById"      TEXT NOT NULL,
    "recipients"    TEXT NOT NULL,
    "notes"         TEXT,
    "sentAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChangeOrderSend_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ChangeOrderSend_changeOrderId_idx" ON "ChangeOrderSend"("changeOrderId");

ALTER TABLE "ChangeOrderSend"
    ADD CONSTRAINT "ChangeOrderSend_changeOrderId_fkey"
    FOREIGN KEY ("changeOrderId") REFERENCES "ChangeOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ChangeOrderSend"
    ADD CONSTRAINT "ChangeOrderSend_sentById_fkey"
    FOREIGN KEY ("sentById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable: ChangeOrderShare
CREATE TABLE "ChangeOrderShare" (
    "id"            TEXT NOT NULL,
    "changeOrderId" TEXT NOT NULL,
    "token"         TEXT NOT NULL,
    "createdById"   TEXT NOT NULL,
    "lastViewedAt"  TIMESTAMP(3),
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChangeOrderShare_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ChangeOrderShare_token_key" ON "ChangeOrderShare"("token");
CREATE INDEX "ChangeOrderShare_changeOrderId_idx" ON "ChangeOrderShare"("changeOrderId");

ALTER TABLE "ChangeOrderShare"
    ADD CONSTRAINT "ChangeOrderShare_changeOrderId_fkey"
    FOREIGN KEY ("changeOrderId") REFERENCES "ChangeOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ChangeOrderShare"
    ADD CONSTRAINT "ChangeOrderShare_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
