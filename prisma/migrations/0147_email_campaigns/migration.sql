-- 0147 Email campaigns (Mike 10-29). Additive only.
-- Lists (picked people or saved rules), one do-not-email list, campaigns made
-- of blocks, one send row per person, clicks, and SalesDocLink.campaignSendId so
-- each person gets their own tracked document link. No sender is connected yet.

-- AlterTable
ALTER TABLE "SalesDocLink" ADD COLUMN     "campaignSendId" TEXT;

-- CreateTable
CREATE TABLE "CampaignList" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'FIXED',
    "notes" TEXT,
    "createdById" TEXT,
    "archivedAt" TIMESTAMP(3),
    "archivedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignListRule" (
    "id" TEXT NOT NULL,
    "listId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampaignListRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignListMember" (
    "id" TEXT NOT NULL,
    "listId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "addedById" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampaignListMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignSuppression" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "contactId" TEXT,
    "campaignId" TEXT,
    "note" TEXT,
    "createdById" TEXT,
    "liftedAt" TIMESTAMP(3),
    "liftedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignSuppression_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subject" TEXT,
    "previewText" TEXT,
    "listId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT,
    "sentById" TEXT,
    "sendStartedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "archivedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignBlock" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "kind" TEXT NOT NULL,
    "text" TEXT,
    "url" TEXT,
    "salesDocId" TEXT,
    "spaceId" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampaignBlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignSend" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "contactId" TEXT,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "token" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "skipReason" TEXT,
    "error" TEXT,
    "providerMessageId" TEXT,
    "sentAt" TIMESTAMP(3),
    "openedAt" TIMESTAMP(3),
    "openCount" INTEGER NOT NULL DEFAULT 0,
    "firstClickAt" TIMESTAMP(3),
    "clickCount" INTEGER NOT NULL DEFAULT 0,
    "unsubscribedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignSend_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignClick" (
    "id" TEXT NOT NULL,
    "sendId" TEXT NOT NULL,
    "blockId" TEXT,
    "ipHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampaignClick_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CampaignListRule_listId_idx" ON "CampaignListRule"("listId");

-- CreateIndex
CREATE INDEX "CampaignListMember_contactId_idx" ON "CampaignListMember"("contactId");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignListMember_listId_contactId_key" ON "CampaignListMember"("listId", "contactId");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignSuppression_email_key" ON "CampaignSuppression"("email");

-- CreateIndex
CREATE INDEX "CampaignSuppression_contactId_idx" ON "CampaignSuppression"("contactId");

-- CreateIndex
CREATE INDEX "CampaignSuppression_campaignId_idx" ON "CampaignSuppression"("campaignId");

-- CreateIndex
CREATE INDEX "Campaign_listId_idx" ON "Campaign"("listId");

-- CreateIndex
CREATE INDEX "CampaignBlock_campaignId_idx" ON "CampaignBlock"("campaignId");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignSend_token_key" ON "CampaignSend"("token");

-- CreateIndex
CREATE INDEX "CampaignSend_contactId_idx" ON "CampaignSend"("contactId");

-- CreateIndex
CREATE INDEX "CampaignSend_campaignId_status_idx" ON "CampaignSend"("campaignId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignSend_campaignId_email_key" ON "CampaignSend"("campaignId", "email");

-- CreateIndex
CREATE INDEX "CampaignClick_sendId_idx" ON "CampaignClick"("sendId");

-- CreateIndex
CREATE INDEX "CampaignClick_blockId_idx" ON "CampaignClick"("blockId");

-- CreateIndex
CREATE INDEX "SalesDocLink_campaignSendId_idx" ON "SalesDocLink"("campaignSendId");

-- AddForeignKey
ALTER TABLE "SalesDocLink" ADD CONSTRAINT "SalesDocLink_campaignSendId_fkey" FOREIGN KEY ("campaignSendId") REFERENCES "CampaignSend"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignList" ADD CONSTRAINT "CampaignList_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignListRule" ADD CONSTRAINT "CampaignListRule_listId_fkey" FOREIGN KEY ("listId") REFERENCES "CampaignList"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignListMember" ADD CONSTRAINT "CampaignListMember_listId_fkey" FOREIGN KEY ("listId") REFERENCES "CampaignList"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignListMember" ADD CONSTRAINT "CampaignListMember_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "ClientContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignSuppression" ADD CONSTRAINT "CampaignSuppression_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "ClientContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignSuppression" ADD CONSTRAINT "CampaignSuppression_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignSuppression" ADD CONSTRAINT "CampaignSuppression_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_listId_fkey" FOREIGN KEY ("listId") REFERENCES "CampaignList"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_sentById_fkey" FOREIGN KEY ("sentById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignBlock" ADD CONSTRAINT "CampaignBlock_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignBlock" ADD CONSTRAINT "CampaignBlock_salesDocId_fkey" FOREIGN KEY ("salesDocId") REFERENCES "SalesDoc"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignBlock" ADD CONSTRAINT "CampaignBlock_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "SalesDocSpace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignSend" ADD CONSTRAINT "CampaignSend_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignSend" ADD CONSTRAINT "CampaignSend_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "ClientContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignClick" ADD CONSTRAINT "CampaignClick_sendId_fkey" FOREIGN KEY ("sendId") REFERENCES "CampaignSend"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignClick" ADD CONSTRAINT "CampaignClick_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "CampaignBlock"("id") ON DELETE SET NULL ON UPDATE CASCADE;

