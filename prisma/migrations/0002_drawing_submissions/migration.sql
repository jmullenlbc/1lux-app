-- CreateTable
CREATE TABLE "DrawingSubmission" (
    "id"           TEXT NOT NULL,
    "projectId"    TEXT NOT NULL,
    "phaseTag"     TEXT,
    "source"       TEXT NOT NULL DEFAULT 'EXTERNAL',
    "notes"        TEXT,
    "uploadedById" TEXT NOT NULL,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DrawingSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DrawingFile" (
    "id"           TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "fileName"     TEXT NOT NULL,
    "storedPath"   TEXT NOT NULL,
    "pageCount"    INTEGER,
    "size"         INTEGER NOT NULL,
    "mimeType"     TEXT NOT NULL DEFAULT 'application/pdf',
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DrawingFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DrawingSubmission_projectId_idx" ON "DrawingSubmission"("projectId");

-- AddForeignKey
ALTER TABLE "DrawingSubmission" ADD CONSTRAINT "DrawingSubmission_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DrawingSubmission" ADD CONSTRAINT "DrawingSubmission_uploadedById_fkey"
    FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DrawingFile" ADD CONSTRAINT "DrawingFile_submissionId_fkey"
    FOREIGN KEY ("submissionId") REFERENCES "DrawingSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
