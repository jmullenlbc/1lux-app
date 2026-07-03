-- AlterTable
ALTER TABLE "NoteAction" ADD COLUMN "reminderDays" INTEGER;

-- CreateTable
CREATE TABLE "NoteActionType" (
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "executor" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'ACTION',
    "description" TEXT,
    "emailTemplate" TEXT,
    "instructions" TEXT,
    "reminderDays" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NoteActionType_pkey" PRIMARY KEY ("key")
);
