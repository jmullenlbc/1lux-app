-- CreateTable
CREATE TABLE "NoteAction" (
    "id" TEXT NOT NULL,
    "noteId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'ACTION',
    "type" TEXT NOT NULL,
    "rawText" TEXT NOT NULL DEFAULT '',
    "detail" TEXT,
    "contactId" TEXT,
    "contactName" TEXT,
    "targetName" TEXT,
    "company" TEXT,
    "dueDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'SUGGESTED',
    "source" TEXT NOT NULL DEFAULT 'ai',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NoteAction_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "NoteAction" ADD CONSTRAINT "NoteAction_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "Note"("id") ON DELETE CASCADE ON UPDATE CASCADE;
