-- 0141: tags on people, extra emails, merge review answers. Additive only.

-- CreateTable
CREATE TABLE "ContactTag" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ContactTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactTagLink" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ContactTagLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactEmail" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ContactEmail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmMergeDecision" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "aId" TEXT NOT NULL,
    "bId" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "survivorId" TEXT,
    "decidedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CrmMergeDecision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ContactTag_name_key" ON "ContactTag"("name");
CREATE UNIQUE INDEX "ContactTagLink_contactId_tagId_key" ON "ContactTagLink"("contactId", "tagId");
CREATE INDEX "ContactTagLink_tagId_idx" ON "ContactTagLink"("tagId");
CREATE UNIQUE INDEX "ContactEmail_contactId_email_key" ON "ContactEmail"("contactId", "email");
CREATE INDEX "ContactEmail_email_idx" ON "ContactEmail"("email");
CREATE UNIQUE INDEX "CrmMergeDecision_kind_aId_bId_key" ON "CrmMergeDecision"("kind", "aId", "bId");

-- AddForeignKey
ALTER TABLE "ContactTagLink" ADD CONSTRAINT "ContactTagLink_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "ClientContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContactTagLink" ADD CONSTRAINT "ContactTagLink_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "ContactTag"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContactEmail" ADD CONSTRAINT "ContactEmail_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "ClientContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
