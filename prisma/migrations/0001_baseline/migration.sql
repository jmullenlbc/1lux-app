-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "passwordHash" TEXT,
    "role" TEXT NOT NULL DEFAULT 'USER',
    "permissions" TEXT NOT NULL DEFAULT '{}',
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "inviteToken" TEXT,
    "inviteExpiry" TIMESTAMP(3),
    "dashboardConfig" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "invitedById" TEXT,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserAlert" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "link" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "dedupeKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'TODO',
    "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
    "assigneeId" TEXT,
    "createdById" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3),
    "tags" TEXT NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskAttachment" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "storedPath" TEXT NOT NULL,
    "mimeType" TEXT,
    "size" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KbCategory" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "desc" TEXT NOT NULL DEFAULT '',
    "color" TEXT NOT NULL DEFAULT 'slate',
    "icon" TEXT NOT NULL DEFAULT '📁',
    "position" INTEGER NOT NULL DEFAULT 0,
    "isBuiltIn" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KbCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DesignStandard" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'REQUIRED',
    "tags" TEXT NOT NULL DEFAULT '[]',
    "sourceUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DesignStandard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "clientNumber" INTEGER,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'developer',
    "locationType" TEXT NOT NULL DEFAULT 'standalone',
    "email" TEXT,
    "phone" TEXT,
    "website" TEXT,
    "address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "linkedIn" TEXT,
    "primaryContact" TEXT,
    "primaryContactTitle" TEXT,
    "primaryContactEmail" TEXT,
    "primaryContactPhone" TEXT,
    "notes" TEXT,
    "tier" TEXT,
    "markets" TEXT NOT NULL DEFAULT '[]',
    "developerType" TEXT,
    "orgTypes" TEXT NOT NULL DEFAULT '[]',
    "ownerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT NOT NULL,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientPlaybook" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "projectTypes" TEXT,
    "projectsPerYear" INTEGER,
    "primaryMarkets" TEXT,
    "costTierNotes" TEXT,
    "architectRel" TEXT,
    "eeRel" TEXT,
    "gcRel" TEXT,
    "primaryContactId" TEXT,
    "approverContactId" TEXT,
    "engagementTiming" TEXT,
    "submittalPlatform" TEXT,
    "coTolerance" TEXT,
    "mgmtStructure" TEXT,
    "hasDesignTeam" BOOLEAN NOT NULL DEFAULT false,
    "processNotes" TEXT,
    "engagementLeadTime" TEXT,
    "budgetCadence" TEXT,
    "submittalTurnaround" TEXT,
    "typicalSdToCd" TEXT,
    "rfiResponseExpectation" TEXT,
    "timeframeNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientPlaybook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientContact" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "title" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientKBSection" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'Untitled Section',
    "content" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientKBSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientKBAttachment" (
    "id" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "storedPath" TEXT NOT NULL,
    "mimeType" TEXT,
    "size" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientKBAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "projectNumber" INTEGER,
    "name" TEXT NOT NULL,
    "buildingType" TEXT,
    "location" TEXT,
    "contactEmail" TEXT,
    "address" TEXT,
    "date" TEXT,
    "budgetType" TEXT NOT NULL DEFAULT 'conceptual',
    "budgetNumber" TEXT,
    "budgetSentDate" TIMESTAMP(3),
    "phase" TEXT NOT NULL DEFAULT 'sd',
    "city" TEXT,
    "state" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "serviceType" TEXT,
    "peerReviewMatrixType" TEXT NOT NULL DEFAULT 'PEER_REVIEW',
    "flagged" BOOLEAN NOT NULL DEFAULT false,
    "flagNote" TEXT,
    "contractValue" DOUBLE PRECISION,
    "contractSignedDate" TEXT,
    "designContractValue" DOUBLE PRECISION,
    "designContractSignedDate" TEXT,
    "constructionStartDate" TEXT,
    "mepRoughInDate" TEXT,
    "constructionEndDate" TEXT,
    "currentStep" TEXT NOT NULL DEFAULT 'project-data',
    "completedSteps" TEXT NOT NULL DEFAULT '[]',
    "pricingSnapshot" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT NOT NULL,
    "clientId" TEXT,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectFile" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "tab" TEXT NOT NULL,
    "fileType" TEXT,
    "originalName" TEXT NOT NULL,
    "storedPath" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "mimeType" TEXT,
    "tags" TEXT,
    "textContent" TEXT,
    "takeoffData" TEXT,
    "parsedAmount" DOUBLE PRECISION,
    "analysisData" TEXT,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectAssignee" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectAssignee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectAccess" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectData" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "grossSf" DOUBLE PRECISION,
    "unitsSf" DOUBLE PRECISION,
    "numUnits" INTEGER,
    "numBedrooms" INTEGER,
    "numBalconies" INTEGER,
    "numBathrooms" INTEGER,
    "numVanities" INTEGER,
    "numEgressStairwells" INTEGER,
    "numFans" INTEGER,
    "numAccentDownlights" INTEGER,
    "numSurfaceParking" INTEGER,
    "numCarports" INTEGER,
    "numGarages" INTEGER,
    "numExteriorDoors" INTEGER,
    "exteriorAmenitySf" DOUBLE PRECISION,
    "lotSf" DOUBLE PRECISION,
    "buildingFootprintSf" DOUBLE PRECISION,
    "corridorSf" DOUBLE PRECISION,
    "interiorAmenitySf" DOUBLE PRECISION,
    "garageSf" DOUBLE PRECISION,
    "bohSf" DOUBLE PRECISION,
    "clientInitialBudget" DOUBLE PRECISION,
    "freightPct" DOUBLE PRECISION,
    "warehousingPct" DOUBLE PRECISION,
    "salesTaxPct" DOUBLE PRECISION,
    "marginPct" DOUBLE PRECISION,

    CONSTRAINT "ProjectData_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectShare" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "sentTo" TEXT NOT NULL DEFAULT '[]',
    "message" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentById" TEXT NOT NULL,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "lastViewedAt" TIMESTAMP(3),
    "viewLog" TEXT NOT NULL DEFAULT '[]',

    CONSTRAINT "ProjectShare_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemConfig" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "SystemConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PeerReviewItem" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "section" TEXT NOT NULL DEFAULT 'units',
    "typeCode" TEXT,
    "description" TEXT,
    "location" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "internalNotes" TEXT NOT NULL DEFAULT '',
    "qty" DOUBLE PRECISION,
    "specManufacturer" TEXT,
    "specModel" TEXT,
    "specDetails" TEXT,
    "prevQty" DOUBLE PRECISION,
    "qtyType" TEXT,
    "altChoices" TEXT,
    "propManufacturer" TEXT,
    "propManufacturerId" TEXT,
    "propModel" TEXT,
    "propProductId" TEXT,
    "propUnitDN" DOUBLE PRECISION,
    "propUnitPrice" DOUBLE PRECISION,
    "repName" TEXT,
    "repEmail" TEXT,
    "rfqStatus" TEXT,
    "unitSavings" DOUBLE PRECISION,
    "totalSavings" DOUBLE PRECISION,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PeerReviewItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionnaireResponse" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "questionKey" TEXT NOT NULL,
    "answerValue" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuestionnaireResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubmittalTracker" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "specSection" TEXT,
    "reviewerRoles" TEXT NOT NULL DEFAULT '["ILC","Developer","Architect","LA","ID","EE"]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubmittalTracker_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubmittalItem" (
    "id" TEXT NOT NULL,
    "trackerId" TEXT NOT NULL,
    "typeCode" TEXT NOT NULL,
    "description" TEXT,
    "location" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubmittalItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubmittalSubmission" (
    "id" TEXT NOT NULL,
    "trackerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "submittedDate" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubmittalSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubmittalItemVersion" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "manufacturer" TEXT,
    "modelNumber" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubmittalItemVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubmittalReview" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "reviewerRole" TEXT NOT NULL,
    "reviewerName" TEXT,
    "status" TEXT NOT NULL,
    "dateNoted" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,

    CONSTRAINT "SubmittalReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectActivity" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userName" TEXT,
    "userEmail" TEXT,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatConversation" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingNote" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "content" TEXT NOT NULL DEFAULT '',
    "meetingDate" TEXT,
    "meetingLink" TEXT,
    "attendees" TEXT,
    "isExternalVisible" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MeetingNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Manufacturer" (
    "id" TEXT NOT NULL,
    "numericId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "acctLastUpdated" TEXT,
    "setupToSell" BOOLEAN NOT NULL DEFAULT false,
    "terms" TEXT,
    "credit" DOUBLE PRECISION,
    "notes" TEXT,
    "accountingEmail" TEXT,
    "ffa" DOUBLE PRECISION,
    "paymentInfo" TEXT,
    "website" TEXT,
    "mainPhone" TEXT,
    "address" TEXT,
    "address2" TEXT,
    "city" TEXT,
    "state" TEXT,
    "zip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Manufacturer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManufacturerProduct" (
    "id" TEXT NOT NULL,
    "numericId" INTEGER NOT NULL,
    "manufacturerId" TEXT NOT NULL,
    "partNumber" TEXT NOT NULL,
    "description" TEXT,
    "finish" TEXT,
    "cct" TEXT,
    "wattage" DOUBLE PRECISION,
    "dimming" TEXT,
    "voltage" TEXT,
    "mounting" TEXT,
    "fixtureType" TEXT,
    "cost" DOUBLE PRECISION,
    "salePrice" DOUBLE PRECISION,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManufacturerProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Deal" (
    "id" TEXT NOT NULL,
    "dealNumber" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "pipeline" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "dealStatus" TEXT NOT NULL DEFAULT 'OPEN',
    "designStatus" TEXT NOT NULL DEFAULT 'OPEN',
    "projectStatus" TEXT NOT NULL DEFAULT 'ACTIVE',
    "city" TEXT,
    "state" TEXT,
    "buildingType" TEXT,
    "numberOfUnits" INTEGER,
    "projectType" TEXT,
    "serviceType" TEXT,
    "totalRevenue" DOUBLE PRECISION,
    "designFeeTotal" DOUBLE PRECISION,
    "probability" INTEGER NOT NULL DEFAULT 50,
    "expectedOrderDate" TIMESTAMP(3),
    "notes" TEXT,
    "nextActionText" TEXT,
    "nextActionDue" TIMESTAMP(3),
    "wonAt" TIMESTAMP(3),
    "lostAt" TIMESTAMP(3),
    "lostReason" TEXT,
    "linkedDealId" TEXT,
    "linkedProjectId" TEXT,
    "clientId" TEXT,
    "ownerId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Deal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DealContact" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DealContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "contactNumber" INTEGER NOT NULL,
    "clientId" TEXT,
    "name" TEXT NOT NULL,
    "title" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesNote" (
    "id" TEXT NOT NULL,
    "noteNumber" INTEGER NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "body" TEXT NOT NULL DEFAULT '',
    "meetingDate" TIMESTAMP(3),
    "attendees" TEXT NOT NULL DEFAULT '[]',
    "calendarRef" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesNoteClient" (
    "id" TEXT NOT NULL,
    "salesNoteId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalesNoteClient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesNoteDeal" (
    "id" TEXT NOT NULL,
    "salesNoteId" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalesNoteDeal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DealActivity" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userName" TEXT,
    "type" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DealActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FixtureSchedule" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 0,
    "publishedAt" TIMESTAMP(3),
    "publishedById" TEXT,
    "submissionTag" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FixtureSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FixtureScheduleItem" (
    "id" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT '',
    "location" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "manufacturer" TEXT,
    "catalogNumber" TEXT,
    "finish" TEXT,
    "cct" TEXT,
    "lumens" TEXT,
    "wattage" TEXT,
    "voltage" TEXT,
    "dimming" TEXT,
    "mounting" TEXT,
    "notes" TEXT,
    "internalNotes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FixtureScheduleItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DesignBidMatrix" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "sourceScheduleId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pushedById" TEXT NOT NULL,
    "submissionTag" TEXT,
    "matrixType" TEXT NOT NULL DEFAULT 'DESIGN_BID',
    "changeSummary" TEXT,

    CONSTRAINT "DesignBidMatrix_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Dashboard" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Dashboard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DashboardWidget" (
    "id" TEXT NOT NULL,
    "dashboardId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "viewBy" TEXT NOT NULL,
    "segmentBy" TEXT,
    "filters" TEXT NOT NULL DEFAULT '[]',
    "position" INTEGER NOT NULL,
    "width" TEXT NOT NULL DEFAULT 'HALF',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DashboardWidget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MasterType" (
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "fixture_family" TEXT NOT NULL,
    "symbol_svg" TEXT NOT NULL DEFAULT '',
    "is_unit_type" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "MasterType_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "FixtureType" (
    "code" TEXT NOT NULL,
    "master_type_id" TEXT NOT NULL,
    "family" TEXT NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "FixtureType_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "ILCSpec" (
    "id" TEXT NOT NULL,
    "master_type_id" TEXT NOT NULL,
    "family" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "manufacturer" TEXT NOT NULL,
    "base_catalog" TEXT NOT NULL,
    "full_catalog" TEXT,
    "variables" TEXT,
    "budget_cost" DOUBLE PRECISION,
    "design_notes" TEXT,
    "use_context" TEXT NOT NULL DEFAULT '[]',
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "tier" TEXT NOT NULL DEFAULT 'STANDARD',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ILCSpec_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientStandardsAnswer" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "subsection" TEXT NOT NULL,
    "question_key" TEXT NOT NULL,
    "input_type" TEXT NOT NULL,
    "fixture_family" TEXT,
    "answer_value" TEXT,
    "answer_note" TEXT,
    "type_code" TEXT,
    "resolved_sku" TEXT,
    "adder_flag" BOOLEAN NOT NULL DEFAULT false,
    "adder_prompt" TEXT,
    "reference_key" TEXT,
    "projectType" TEXT NOT NULL DEFAULT '',
    "region" TEXT NOT NULL DEFAULT '',
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "answeredById" TEXT,
    "answered_at" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientStandardsAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectStandardsOverride" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "question_key" TEXT NOT NULL,
    "override_value" TEXT NOT NULL,
    "activatedById" TEXT NOT NULL,
    "activated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,

    CONSTRAINT "ProjectStandardsOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlacedFixture" (
    "id" TEXT NOT NULL,
    "drawing_id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "page_number" INTEGER NOT NULL DEFAULT 1,
    "x" DOUBLE PRECISION NOT NULL,
    "y" DOUBLE PRECISION NOT NULL,
    "ai_suggested_x" DOUBLE PRECISION,
    "ai_suggested_y" DOUBLE PRECISION,
    "master_type_id" TEXT NOT NULL,
    "type_code" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SUGGESTED',
    "unit_type" TEXT,
    "room_type" TEXT,
    "confirmedById" TEXT,
    "confirmed_at" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlacedFixture_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DesignBidMatrixItem" (
    "id" TEXT NOT NULL,
    "matrixId" TEXT NOT NULL,
    "sourceItemId" TEXT,
    "type" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "locationTag" TEXT,
    "manufacturer" TEXT,
    "partNumber" TEXT,
    "salesRep" TEXT,
    "rfqStatus" TEXT,
    "qty" INTEGER,
    "qtyType" TEXT,
    "dnPerUnit" DOUBLE PRECISION,
    "cnPerUnit" DOUBLE PRECISION,
    "cnTotal" DOUBLE PRECISION,
    "pricingLastUpdated" TIMESTAMP(3),
    "notes" TEXT,
    "internalNotes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DesignBidMatrixItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shipment" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "manufacturer" TEXT NOT NULL,
    "poDate" TIMESTAMP(3),
    "leadTimeWeeks" TEXT,
    "esdDate" TIMESTAMP(3),
    "trackingNumber" TEXT,
    "deliveredDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'PO_PLACED',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShipmentLineItem" (
    "id" TEXT NOT NULL,
    "shipment_id" TEXT NOT NULL,
    "fixtureType" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "catalogNo" TEXT,
    "qty" INTEGER NOT NULL DEFAULT 1,
    "fixtureStatus" TEXT,
    "notes" TEXT,
    "submittalItemId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShipmentLineItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectNotificationConfig" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "notificationType" TEXT NOT NULL,
    "externalEmails" TEXT NOT NULL DEFAULT '',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectNotificationConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationLog" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "notificationType" TEXT NOT NULL,
    "audience" TEXT NOT NULL,
    "recipientEmail" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "openedAt" TIMESTAMP(3),
    "openToken" TEXT NOT NULL,
    "dedupeKey" TEXT,
    "payload" TEXT NOT NULL DEFAULT '{}',

    CONSTRAINT "NotificationLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationQueue" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "notificationType" TEXT NOT NULL,
    "audience" TEXT NOT NULL DEFAULT 'EXTERNAL',
    "recipientEmail" TEXT NOT NULL,
    "payload" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationQueue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortalUser" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'EXTERNAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PortalUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectExternalContact" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "portalUserId" TEXT,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "canViewShipSchedule" BOOLEAN NOT NULL DEFAULT false,
    "canViewSubmittals" BOOLEAN NOT NULL DEFAULT false,
    "canViewMeetings" BOOLEAN NOT NULL DEFAULT false,
    "canViewContracts" BOOLEAN NOT NULL DEFAULT false,
    "canViewConstructionSched" BOOLEAN NOT NULL DEFAULT false,
    "canViewChangeOrders" BOOLEAN NOT NULL DEFAULT false,
    "canViewBudgets" BOOLEAN NOT NULL DEFAULT false,
    "inviteToken" TEXT,
    "inviteTokenExpiresAt" TIMESTAMP(3),
    "invitedAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectExternalContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketSource" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "feedUrl" TEXT NOT NULL,
    "siteUrl" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL DEFAULT 'RSS',
    "projectTypes" TEXT NOT NULL DEFAULT '[]',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastPolledAt" TIMESTAMP(3),
    "pollingFrequency" TEXT NOT NULL DEFAULT 'DAILY',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketSignal" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "url" TEXT,
    "publishedAt" TIMESTAMP(3),
    "signalType" TEXT NOT NULL DEFAULT 'NEWS',
    "projectType" TEXT,
    "developerNames" TEXT,
    "linkedClientId" TEXT,
    "matchScore" DOUBLE PRECISION,
    "matchStatus" TEXT NOT NULL DEFAULT 'UNREVIEWED',
    "reviewStatus" TEXT NOT NULL DEFAULT 'UNREVIEWED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketSignal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketSignalDeal" (
    "id" TEXT NOT NULL,
    "signalId" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "taggedById" TEXT NOT NULL,
    "taggedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketSignalDeal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientAlias" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "aliasName" TEXT NOT NULL,
    "normalizedAlias" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientAlias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FuzzyMatchFeedback" (
    "id" TEXT NOT NULL,
    "candidateName" TEXT NOT NULL,
    "matchedClientId" TEXT,
    "score" DOUBLE PRECISION NOT NULL,
    "outcome" TEXT NOT NULL,
    "signalId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FuzzyMatchFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_inviteToken_key" ON "User"("inviteToken");

-- CreateIndex
CREATE UNIQUE INDEX "UserAlert_dedupeKey_key" ON "UserAlert"("dedupeKey");

-- CreateIndex
CREATE UNIQUE INDEX "KbCategory_key_key" ON "KbCategory"("key");

-- CreateIndex
CREATE UNIQUE INDEX "Client_clientNumber_key" ON "Client"("clientNumber");

-- CreateIndex
CREATE UNIQUE INDEX "ClientPlaybook_clientId_key" ON "ClientPlaybook"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "Project_projectNumber_key" ON "Project"("projectNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Project_budgetNumber_key" ON "Project"("budgetNumber");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectAssignee_projectId_userId_key" ON "ProjectAssignee"("projectId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectAccess_userId_projectId_key" ON "ProjectAccess"("userId", "projectId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectData_projectId_key" ON "ProjectData"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectShare_token_key" ON "ProjectShare"("token");

-- CreateIndex
CREATE UNIQUE INDEX "SystemConfig_key_key" ON "SystemConfig"("key");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionnaireResponse_projectId_section_questionKey_key" ON "QuestionnaireResponse"("projectId", "section", "questionKey");

-- CreateIndex
CREATE UNIQUE INDEX "SubmittalTracker_projectId_key" ON "SubmittalTracker"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "Manufacturer_numericId_key" ON "Manufacturer"("numericId");

-- CreateIndex
CREATE UNIQUE INDEX "ManufacturerProduct_numericId_key" ON "ManufacturerProduct"("numericId");

-- CreateIndex
CREATE UNIQUE INDEX "ManufacturerProduct_manufacturerId_partNumber_key" ON "ManufacturerProduct"("manufacturerId", "partNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Deal_dealNumber_key" ON "Deal"("dealNumber");

-- CreateIndex
CREATE UNIQUE INDEX "DealContact_dealId_contactId_key" ON "DealContact"("dealId", "contactId");

-- CreateIndex
CREATE UNIQUE INDEX "Contact_contactNumber_key" ON "Contact"("contactNumber");

-- CreateIndex
CREATE UNIQUE INDEX "SalesNote_noteNumber_key" ON "SalesNote"("noteNumber");

-- CreateIndex
CREATE UNIQUE INDEX "SalesNoteClient_salesNoteId_clientId_key" ON "SalesNoteClient"("salesNoteId", "clientId");

-- CreateIndex
CREATE UNIQUE INDEX "SalesNoteDeal_salesNoteId_dealId_key" ON "SalesNoteDeal"("salesNoteId", "dealId");

-- CreateIndex
CREATE UNIQUE INDEX "ClientStandardsAnswer_clientId_question_key_projectType_reg_key" ON "ClientStandardsAnswer"("clientId", "question_key", "projectType", "region");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectNotificationConfig_project_id_notificationType_key" ON "ProjectNotificationConfig"("project_id", "notificationType");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationLog_openToken_key" ON "NotificationLog"("openToken");

-- CreateIndex
CREATE INDEX "NotificationLog_project_id_idx" ON "NotificationLog"("project_id");

-- CreateIndex
CREATE INDEX "NotificationLog_dedupeKey_idx" ON "NotificationLog"("dedupeKey");

-- CreateIndex
CREATE UNIQUE INDEX "PortalUser_email_key" ON "PortalUser"("email");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectExternalContact_inviteToken_key" ON "ProjectExternalContact"("inviteToken");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectExternalContact_project_id_email_key" ON "ProjectExternalContact"("project_id", "email");

-- CreateIndex
CREATE UNIQUE INDEX "MarketSource_name_key" ON "MarketSource"("name");

-- CreateIndex
CREATE UNIQUE INDEX "MarketSignalDeal_signalId_dealId_key" ON "MarketSignalDeal"("signalId", "dealId");

-- AddForeignKey
ALTER TABLE "UserAlert" ADD CONSTRAINT "UserAlert_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskAttachment" ADD CONSTRAINT "TaskAttachment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DesignStandard" ADD CONSTRAINT "DesignStandard_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DesignStandard" ADD CONSTRAINT "DesignStandard_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientPlaybook" ADD CONSTRAINT "ClientPlaybook_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientContact" ADD CONSTRAINT "ClientContact_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientKBSection" ADD CONSTRAINT "ClientKBSection_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientKBAttachment" ADD CONSTRAINT "ClientKBAttachment_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "ClientKBSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectFile" ADD CONSTRAINT "ProjectFile_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectFile" ADD CONSTRAINT "ProjectFile_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectAssignee" ADD CONSTRAINT "ProjectAssignee_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectAssignee" ADD CONSTRAINT "ProjectAssignee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectAccess" ADD CONSTRAINT "ProjectAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectAccess" ADD CONSTRAINT "ProjectAccess_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectData" ADD CONSTRAINT "ProjectData_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectShare" ADD CONSTRAINT "ProjectShare_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PeerReviewItem" ADD CONSTRAINT "PeerReviewItem_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionnaireResponse" ADD CONSTRAINT "QuestionnaireResponse_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubmittalTracker" ADD CONSTRAINT "SubmittalTracker_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubmittalItem" ADD CONSTRAINT "SubmittalItem_trackerId_fkey" FOREIGN KEY ("trackerId") REFERENCES "SubmittalTracker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubmittalSubmission" ADD CONSTRAINT "SubmittalSubmission_trackerId_fkey" FOREIGN KEY ("trackerId") REFERENCES "SubmittalTracker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubmittalItemVersion" ADD CONSTRAINT "SubmittalItemVersion_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "SubmittalItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubmittalItemVersion" ADD CONSTRAINT "SubmittalItemVersion_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "SubmittalSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubmittalReview" ADD CONSTRAINT "SubmittalReview_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "SubmittalItemVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectActivity" ADD CONSTRAINT "ProjectActivity_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatConversation" ADD CONSTRAINT "ChatConversation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "ChatConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingNote" ADD CONSTRAINT "MeetingNote_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturerProduct" ADD CONSTRAINT "ManufacturerProduct_manufacturerId_fkey" FOREIGN KEY ("manufacturerId") REFERENCES "Manufacturer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_linkedDealId_fkey" FOREIGN KEY ("linkedDealId") REFERENCES "Deal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_linkedProjectId_fkey" FOREIGN KEY ("linkedProjectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealContact" ADD CONSTRAINT "DealContact_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealContact" ADD CONSTRAINT "DealContact_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesNote" ADD CONSTRAINT "SalesNote_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesNoteClient" ADD CONSTRAINT "SalesNoteClient_salesNoteId_fkey" FOREIGN KEY ("salesNoteId") REFERENCES "SalesNote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesNoteClient" ADD CONSTRAINT "SalesNoteClient_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesNoteDeal" ADD CONSTRAINT "SalesNoteDeal_salesNoteId_fkey" FOREIGN KEY ("salesNoteId") REFERENCES "SalesNote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesNoteDeal" ADD CONSTRAINT "SalesNoteDeal_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealActivity" ADD CONSTRAINT "DealActivity_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixtureSchedule" ADD CONSTRAINT "FixtureSchedule_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixtureSchedule" ADD CONSTRAINT "FixtureSchedule_publishedById_fkey" FOREIGN KEY ("publishedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixtureScheduleItem" ADD CONSTRAINT "FixtureScheduleItem_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "FixtureSchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DesignBidMatrix" ADD CONSTRAINT "DesignBidMatrix_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DesignBidMatrix" ADD CONSTRAINT "DesignBidMatrix_sourceScheduleId_fkey" FOREIGN KEY ("sourceScheduleId") REFERENCES "FixtureSchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DesignBidMatrix" ADD CONSTRAINT "DesignBidMatrix_pushedById_fkey" FOREIGN KEY ("pushedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dashboard" ADD CONSTRAINT "Dashboard_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DashboardWidget" ADD CONSTRAINT "DashboardWidget_dashboardId_fkey" FOREIGN KEY ("dashboardId") REFERENCES "Dashboard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixtureType" ADD CONSTRAINT "FixtureType_master_type_id_fkey" FOREIGN KEY ("master_type_id") REFERENCES "MasterType"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ILCSpec" ADD CONSTRAINT "ILCSpec_master_type_id_fkey" FOREIGN KEY ("master_type_id") REFERENCES "MasterType"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientStandardsAnswer" ADD CONSTRAINT "ClientStandardsAnswer_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientStandardsAnswer" ADD CONSTRAINT "ClientStandardsAnswer_type_code_fkey" FOREIGN KEY ("type_code") REFERENCES "FixtureType"("code") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientStandardsAnswer" ADD CONSTRAINT "ClientStandardsAnswer_answeredById_fkey" FOREIGN KEY ("answeredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectStandardsOverride" ADD CONSTRAINT "ProjectStandardsOverride_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectStandardsOverride" ADD CONSTRAINT "ProjectStandardsOverride_activatedById_fkey" FOREIGN KEY ("activatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlacedFixture" ADD CONSTRAINT "PlacedFixture_drawing_id_fkey" FOREIGN KEY ("drawing_id") REFERENCES "ProjectFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlacedFixture" ADD CONSTRAINT "PlacedFixture_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlacedFixture" ADD CONSTRAINT "PlacedFixture_master_type_id_fkey" FOREIGN KEY ("master_type_id") REFERENCES "MasterType"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlacedFixture" ADD CONSTRAINT "PlacedFixture_type_code_fkey" FOREIGN KEY ("type_code") REFERENCES "FixtureType"("code") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlacedFixture" ADD CONSTRAINT "PlacedFixture_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DesignBidMatrixItem" ADD CONSTRAINT "DesignBidMatrixItem_matrixId_fkey" FOREIGN KEY ("matrixId") REFERENCES "DesignBidMatrix"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DesignBidMatrixItem" ADD CONSTRAINT "DesignBidMatrixItem_sourceItemId_fkey" FOREIGN KEY ("sourceItemId") REFERENCES "FixtureScheduleItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentLineItem" ADD CONSTRAINT "ShipmentLineItem_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "Shipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentLineItem" ADD CONSTRAINT "ShipmentLineItem_submittalItemId_fkey" FOREIGN KEY ("submittalItemId") REFERENCES "SubmittalItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectNotificationConfig" ADD CONSTRAINT "ProjectNotificationConfig_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationLog" ADD CONSTRAINT "NotificationLog_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationQueue" ADD CONSTRAINT "NotificationQueue_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectExternalContact" ADD CONSTRAINT "ProjectExternalContact_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectExternalContact" ADD CONSTRAINT "ProjectExternalContact_portalUserId_fkey" FOREIGN KEY ("portalUserId") REFERENCES "PortalUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketSignal" ADD CONSTRAINT "MarketSignal_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "MarketSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketSignal" ADD CONSTRAINT "MarketSignal_linkedClientId_fkey" FOREIGN KEY ("linkedClientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketSignalDeal" ADD CONSTRAINT "MarketSignalDeal_signalId_fkey" FOREIGN KEY ("signalId") REFERENCES "MarketSignal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketSignalDeal" ADD CONSTRAINT "MarketSignalDeal_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientAlias" ADD CONSTRAINT "ClientAlias_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

