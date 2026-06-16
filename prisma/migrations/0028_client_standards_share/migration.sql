-- CreateTable
CREATE TABLE "ClientStandardsShare" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "lastViewedAt" TIMESTAMP(3),
    "viewLog" TEXT NOT NULL DEFAULT '[]',

    CONSTRAINT "ClientStandardsShare_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClientStandardsShare_clientId_key" ON "ClientStandardsShare"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "ClientStandardsShare_token_key" ON "ClientStandardsShare"("token");

-- AddForeignKey
ALTER TABLE "ClientStandardsShare" ADD CONSTRAINT "ClientStandardsShare_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
