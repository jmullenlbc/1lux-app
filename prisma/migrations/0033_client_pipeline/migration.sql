-- CreateTable
CREATE TABLE "PipelineUpload" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileKey" TEXT NOT NULL,
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PipelineUpload_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PipelineProject" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "units" INTEGER,
    "startDate" TEXT,
    "buildingType" TEXT,
    "phase" TEXT,
    "ilcRevenue" DOUBLE PRECISION,
    "architect" TEXT,
    "gc" TEXT,
    "gcContact" TEXT,
    "gcEmail" TEXT,
    "address" TEXT,
    "preconManager" TEXT,
    "raw" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PipelineProject_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PipelineProject_clientId_name_key" ON "PipelineProject"("clientId", "name");

-- AddForeignKey
ALTER TABLE "PipelineUpload" ADD CONSTRAINT "PipelineUpload_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PipelineProject" ADD CONSTRAINT "PipelineProject_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
