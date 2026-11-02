-- Sales tasks on My Desk (Mike 11-1). New tables only.
CREATE TABLE "SalesTask" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT,
    "status" TEXT NOT NULL DEFAULT 'TODO',
    "dueDate" TIMESTAMP(3),
    "assigneeId" TEXT,
    "createdById" TEXT,
    "noteActionId" TEXT,
    "doneAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "archivedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SalesTask_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SalesTask_noteActionId_key" ON "SalesTask"("noteActionId");
CREATE INDEX "SalesTask_assigneeId_status_idx" ON "SalesTask"("assigneeId", "status");
CREATE INDEX "SalesTask_createdById_idx" ON "SalesTask"("createdById");
CREATE INDEX "SalesTask_status_idx" ON "SalesTask"("status");

CREATE TABLE "SalesTaskTag" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdById" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SalesTaskTag_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SalesTaskTag_name_key" ON "SalesTaskTag"("name");

CREATE TABLE "SalesTaskClient" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SalesTaskClient_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SalesTaskClient_taskId_clientId_key" ON "SalesTaskClient"("taskId", "clientId");
CREATE INDEX "SalesTaskClient_clientId_idx" ON "SalesTaskClient"("clientId");

CREATE TABLE "SalesTaskContact" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SalesTaskContact_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SalesTaskContact_taskId_contactId_key" ON "SalesTaskContact"("taskId", "contactId");
CREATE INDEX "SalesTaskContact_contactId_idx" ON "SalesTaskContact"("contactId");

CREATE TABLE "SalesTaskProject" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SalesTaskProject_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SalesTaskProject_taskId_projectId_key" ON "SalesTaskProject"("taskId", "projectId");
CREATE INDEX "SalesTaskProject_projectId_idx" ON "SalesTaskProject"("projectId");

CREATE TABLE "SalesTaskTagLink" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SalesTaskTagLink_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SalesTaskTagLink_taskId_tagId_key" ON "SalesTaskTagLink"("taskId", "tagId");
CREATE INDEX "SalesTaskTagLink_tagId_idx" ON "SalesTaskTagLink"("tagId");

ALTER TABLE "SalesTask" ADD CONSTRAINT "SalesTask_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SalesTask" ADD CONSTRAINT "SalesTask_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SalesTask" ADD CONSTRAINT "SalesTask_noteActionId_fkey" FOREIGN KEY ("noteActionId") REFERENCES "NoteAction"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SalesTaskClient" ADD CONSTRAINT "SalesTaskClient_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "SalesTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SalesTaskClient" ADD CONSTRAINT "SalesTaskClient_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SalesTaskContact" ADD CONSTRAINT "SalesTaskContact_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "SalesTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SalesTaskContact" ADD CONSTRAINT "SalesTaskContact_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "ClientContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SalesTaskProject" ADD CONSTRAINT "SalesTaskProject_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "SalesTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SalesTaskProject" ADD CONSTRAINT "SalesTaskProject_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SalesTaskTagLink" ADD CONSTRAINT "SalesTaskTagLink_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "SalesTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SalesTaskTagLink" ADD CONSTRAINT "SalesTaskTagLink_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "SalesTaskTag"("id") ON DELETE CASCADE ON UPDATE CASCADE;
