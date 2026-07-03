-- CreateTable
CREATE TABLE "Note" (
    "id" TEXT NOT NULL,
    "noteNumber" INTEGER,
    "noteType" TEXT NOT NULL DEFAULT 'SALES',
    "title" TEXT NOT NULL DEFAULT '',
    "body" TEXT NOT NULL DEFAULT '',
    "meetingDate" TIMESTAMP(3),
    "attendees" TEXT NOT NULL DEFAULT '[]',
    "calendarRef" TEXT,
    "activityType" TEXT,
    "isInPerson" BOOLEAN NOT NULL DEFAULT false,
    "classificationSource" TEXT,
    "classificationConfidence" INTEGER,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),
    "meetingLink" TEXT,
    "isExternalVisible" BOOLEAN NOT NULL DEFAULT false,
    "projectId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Note_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NoteContact" (
    "id" TEXT NOT NULL,
    "noteId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NoteContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NoteClient" (
    "id" TEXT NOT NULL,
    "noteId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NoteClient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NoteDeal" (
    "id" TEXT NOT NULL,
    "noteId" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NoteDeal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Note_noteNumber_key" ON "Note"("noteNumber");
CREATE UNIQUE INDEX "NoteContact_noteId_contactId_key" ON "NoteContact"("noteId", "contactId");
CREATE UNIQUE INDEX "NoteClient_noteId_clientId_key" ON "NoteClient"("noteId", "clientId");
CREATE UNIQUE INDEX "NoteDeal_noteId_dealId_key" ON "NoteDeal"("noteId", "dealId");

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Note" ADD CONSTRAINT "Note_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "NoteContact" ADD CONSTRAINT "NoteContact_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "Note"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NoteContact" ADD CONSTRAINT "NoteContact_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NoteClient" ADD CONSTRAINT "NoteClient_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "Note"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NoteClient" ADD CONSTRAINT "NoteClient_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NoteDeal" ADD CONSTRAINT "NoteDeal_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "Note"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NoteDeal" ADD CONSTRAINT "NoteDeal_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
