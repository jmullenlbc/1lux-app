-- 0137: Sales Docs, Phase 1 (Mike 10-19). Additive only.
--   SalesDocFolder     folders for the library
--   SalesDoc           one shared document (PDF or workbook)
--   SalesDocVersion    each uploaded file; pricing guard result and processing state
--   SalesDocSheet      one row per workbook sheet (hidden sheets kept as rows, never shown)
--   SalesDocScanHit    why the pricing guard blocked or warned
--   SalesDocSpace      a group of documents shared with one link
--   SalesDocSpaceItem  a document in a space, with section and order
--   SalesDocLink       a share link (token, email gate, password, expiry, download)
--   SalesDocVisitor    who opened a link, matched to a CRM person or company
--   SalesDocView       one visit to one document
--   SalesDocUnitStat   time on each page or sheet in a view
--   SalesDocEvent      opens, gate passes, wrong passwords, downloads, dead link hits

CREATE TABLE "SalesDocFolder" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalesDocFolder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SalesDoc" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "folderId" TEXT,
    "ownerId" TEXT,
    "currentVersionId" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesDoc_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SalesDocVersion" (
    "id" TEXT NOT NULL,
    "docId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "pageCount" INTEGER,
    "truncated" BOOLEAN NOT NULL DEFAULT false,
    "scanStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "scanOverrideById" TEXT,
    "scanOverrideReason" TEXT,
    "scanOverriddenAt" TIMESTAMP(3),
    "processStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "processError" TEXT,
    "processStartedAt" TIMESTAMP(3),
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalesDocVersion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SalesDocSheet" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "colCount" INTEGER NOT NULL DEFAULT 0,
    "truncated" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "SalesDocSheet_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SalesDocScanHit" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "sheetName" TEXT,
    "cell" TEXT,
    "page" INTEGER,
    "text" TEXT NOT NULL,

    CONSTRAINT "SalesDocScanHit_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SalesDocSpace" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "ownerId" TEXT,
    "clientId" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesDocSpace_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SalesDocSpaceItem" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "docId" TEXT NOT NULL,
    "section" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SalesDocSpaceItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SalesDocLink" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "docId" TEXT,
    "spaceId" TEXT,
    "createdById" TEXT,
    "clientId" TEXT,
    "recipientEmail" TEXT,
    "requireEmail" BOOLEAN NOT NULL DEFAULT true,
    "verifyEmail" BOOLEAN NOT NULL DEFAULT false,
    "passwordHash" TEXT,
    "expiresAt" TIMESTAMP(3),
    "allowDownload" BOOLEAN NOT NULL DEFAULT false,
    "notifyOnFirstOpen" BOOLEAN NOT NULL DEFAULT true,
    "revokedAt" TIMESTAMP(3),
    "revokedById" TEXT,
    "firstOpenedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalesDocLink_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SalesDocVisitor" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "name" TEXT,
    "domain" TEXT,
    "clientId" TEXT,
    "contactId" TEXT,
    "matchType" TEXT NOT NULL DEFAULT 'NONE',
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalesDocVisitor_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SalesDocView" (
    "id" TEXT NOT NULL,
    "linkId" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "docId" TEXT NOT NULL,
    "versionId" TEXT,
    "isForwarded" BOOLEAN NOT NULL DEFAULT false,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastPingAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "device" TEXT,
    "browser" TEXT,
    "ipHash" TEXT,

    CONSTRAINT "SalesDocView_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SalesDocUnitStat" (
    "id" TEXT NOT NULL,
    "viewId" TEXT NOT NULL,
    "unitIndex" INTEGER NOT NULL,
    "label" TEXT,
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "visits" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SalesDocUnitStat_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SalesDocEvent" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "linkId" TEXT,
    "viewId" TEXT,
    "visitorId" TEXT,
    "docId" TEXT,
    "email" TEXT,
    "ipHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalesDocEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SalesDocFolder_parentId_idx" ON "SalesDocFolder"("parentId");
CREATE UNIQUE INDEX "SalesDoc_currentVersionId_key" ON "SalesDoc"("currentVersionId");
CREATE INDEX "SalesDoc_folderId_idx" ON "SalesDoc"("folderId");
CREATE INDEX "SalesDoc_ownerId_idx" ON "SalesDoc"("ownerId");
CREATE UNIQUE INDEX "SalesDocVersion_docId_version_key" ON "SalesDocVersion"("docId", "version");
CREATE UNIQUE INDEX "SalesDocSheet_versionId_index_key" ON "SalesDocSheet"("versionId", "index");
CREATE INDEX "SalesDocScanHit_versionId_idx" ON "SalesDocScanHit"("versionId");
CREATE INDEX "SalesDocSpace_clientId_idx" ON "SalesDocSpace"("clientId");
CREATE UNIQUE INDEX "SalesDocSpaceItem_spaceId_docId_key" ON "SalesDocSpaceItem"("spaceId", "docId");
CREATE INDEX "SalesDocSpaceItem_docId_idx" ON "SalesDocSpaceItem"("docId");
CREATE UNIQUE INDEX "SalesDocLink_token_key" ON "SalesDocLink"("token");
CREATE INDEX "SalesDocLink_docId_idx" ON "SalesDocLink"("docId");
CREATE INDEX "SalesDocLink_spaceId_idx" ON "SalesDocLink"("spaceId");
CREATE INDEX "SalesDocLink_createdById_idx" ON "SalesDocLink"("createdById");
CREATE INDEX "SalesDocLink_clientId_idx" ON "SalesDocLink"("clientId");
CREATE UNIQUE INDEX "SalesDocVisitor_email_key" ON "SalesDocVisitor"("email");
CREATE INDEX "SalesDocVisitor_clientId_idx" ON "SalesDocVisitor"("clientId");
CREATE INDEX "SalesDocVisitor_contactId_idx" ON "SalesDocVisitor"("contactId");
CREATE INDEX "SalesDocView_linkId_idx" ON "SalesDocView"("linkId");
CREATE INDEX "SalesDocView_visitorId_idx" ON "SalesDocView"("visitorId");
CREATE INDEX "SalesDocView_docId_startedAt_idx" ON "SalesDocView"("docId", "startedAt");
CREATE UNIQUE INDEX "SalesDocUnitStat_viewId_unitIndex_key" ON "SalesDocUnitStat"("viewId", "unitIndex");
CREATE INDEX "SalesDocEvent_linkId_type_createdAt_idx" ON "SalesDocEvent"("linkId", "type", "createdAt");
CREATE INDEX "SalesDocEvent_docId_createdAt_idx" ON "SalesDocEvent"("docId", "createdAt");

ALTER TABLE "SalesDocFolder" ADD CONSTRAINT "SalesDocFolder_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "SalesDocFolder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SalesDoc" ADD CONSTRAINT "SalesDoc_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "SalesDocFolder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SalesDoc" ADD CONSTRAINT "SalesDoc_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SalesDoc" ADD CONSTRAINT "SalesDoc_currentVersionId_fkey" FOREIGN KEY ("currentVersionId") REFERENCES "SalesDocVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SalesDocVersion" ADD CONSTRAINT "SalesDocVersion_docId_fkey" FOREIGN KEY ("docId") REFERENCES "SalesDoc"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SalesDocVersion" ADD CONSTRAINT "SalesDocVersion_scanOverrideById_fkey" FOREIGN KEY ("scanOverrideById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SalesDocVersion" ADD CONSTRAINT "SalesDocVersion_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SalesDocSheet" ADD CONSTRAINT "SalesDocSheet_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "SalesDocVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SalesDocScanHit" ADD CONSTRAINT "SalesDocScanHit_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "SalesDocVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SalesDocSpace" ADD CONSTRAINT "SalesDocSpace_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SalesDocSpace" ADD CONSTRAINT "SalesDocSpace_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SalesDocSpaceItem" ADD CONSTRAINT "SalesDocSpaceItem_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "SalesDocSpace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SalesDocSpaceItem" ADD CONSTRAINT "SalesDocSpaceItem_docId_fkey" FOREIGN KEY ("docId") REFERENCES "SalesDoc"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SalesDocLink" ADD CONSTRAINT "SalesDocLink_docId_fkey" FOREIGN KEY ("docId") REFERENCES "SalesDoc"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SalesDocLink" ADD CONSTRAINT "SalesDocLink_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "SalesDocSpace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SalesDocLink" ADD CONSTRAINT "SalesDocLink_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SalesDocLink" ADD CONSTRAINT "SalesDocLink_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SalesDocLink" ADD CONSTRAINT "SalesDocLink_revokedById_fkey" FOREIGN KEY ("revokedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SalesDocVisitor" ADD CONSTRAINT "SalesDocVisitor_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SalesDocVisitor" ADD CONSTRAINT "SalesDocVisitor_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "ClientContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SalesDocView" ADD CONSTRAINT "SalesDocView_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "SalesDocLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SalesDocView" ADD CONSTRAINT "SalesDocView_visitorId_fkey" FOREIGN KEY ("visitorId") REFERENCES "SalesDocVisitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SalesDocView" ADD CONSTRAINT "SalesDocView_docId_fkey" FOREIGN KEY ("docId") REFERENCES "SalesDoc"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SalesDocView" ADD CONSTRAINT "SalesDocView_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "SalesDocVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SalesDocUnitStat" ADD CONSTRAINT "SalesDocUnitStat_viewId_fkey" FOREIGN KEY ("viewId") REFERENCES "SalesDocView"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SalesDocEvent" ADD CONSTRAINT "SalesDocEvent_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "SalesDocLink"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SalesDocEvent" ADD CONSTRAINT "SalesDocEvent_viewId_fkey" FOREIGN KEY ("viewId") REFERENCES "SalesDocView"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SalesDocEvent" ADD CONSTRAINT "SalesDocEvent_visitorId_fkey" FOREIGN KEY ("visitorId") REFERENCES "SalesDocVisitor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SalesDocEvent" ADD CONSTRAINT "SalesDocEvent_docId_fkey" FOREIGN KEY ("docId") REFERENCES "SalesDoc"("id") ON DELETE SET NULL ON UPDATE CASCADE;
