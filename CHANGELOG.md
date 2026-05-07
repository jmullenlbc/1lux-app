# CHANGELOG — ILC Studios Lighting Budget Tool

All notable changes to this project are recorded here.
Format: each session is a dated entry with features added, bugs fixed, and files changed.

---

## [Session 1 — Foundations] · Pre-April 27, 2026

### Added
- **Next.js 14 App Router** project scaffolded with Tailwind CSS, Prisma/SQLite, and JWT-based auth
- **User roles:** `ILC_ADMIN` and `USER`; role-gated routes and API handlers
- **Conceptual Budget Wizard** — multi-section form wizard:
  - Project Data (building metrics, area breakdowns, parking/exterior)
  - Units section (fixture choices per space type)
  - Corridors, Amenities, Emergency, Controls sections
- **`calculations.js`** — core budget engine: reads project data + questionnaire responses → outputs line-item budget with totals
- **`pricing.js`** — centralized pricing constants for all fixture types and rates
- **Budget Summary page** — formatted output of all line items, subtotals, and grand total; print/PDF-ready
- **Shareable budget links** — token-based public share page (`/share/[token]`) with view count tracking
  - `ShareViewTracker.jsx`, `share/layout.jsx` (public/no-auth layout)
- **`SendBudgetModal.jsx`** — send budget to multiple recipients with custom message; past-sends list with view counts
- **`SendBudgetButton.jsx`** — added to summary page header
- **New project autocomplete** — `NewProjectForm.jsx` dropdown matches existing projects; keyboard navigation (arrows/Enter/Escape); auto-fills fields when selecting existing project
- **Excel bulk import** — `excelImportParser.js` (deterministic XLSX parser with dynamic ANSWER column detection), `/api/admin/import/route.js`, `/admin/import/page.jsx` — drag-drop UI with stages: upload → parsing → review → importing → done
- **Dashboard** — project list table with created/modified date columns, sortable headers, action buttons (pencil/copy/trash/Summary icons)
- **PDF summary** — divider between Project Data and Budget Breakdown sections; section headers bold/black for screen and print

### Fixed
- Excel parser: `xlsx` not in `serverComponentsExternalPackages` — added to external packages, switched to static import
- Excel parser: hardcoded `ANSWER_COL = 2` was fragile — fixed by dynamically scanning header row for ANSWER column
- Dashboard not auto-refreshing on back navigation — added `staleTimes: { dynamic: 0 }` in `next.config.mjs`, `router.refresh()` in `useEffect`, window focus listener
- Project/Type columns being cut off — switched from fixed `w-*` to `min-w-*` and `whitespace-nowrap`
- Action buttons (copy/trash/Summary) not visible — fixed with `w-px whitespace-nowrap` on actions column
- Prisma `skipDuplicates` not supported — removed option (each import creates a fresh project ID)

### Files Created
- `src/app/share/layout.jsx`
- `src/app/share/[token]/ShareViewTracker.jsx`
- `src/app/share/[token]/page.jsx`
- `src/components/ui/SendBudgetModal.jsx`
- `src/app/(app)/project/[id]/summary/SendBudgetButton.jsx`
- `src/app/(app)/project/new/NewProjectForm.jsx`
- `src/lib/excelImportParser.js`
- `src/app/api/admin/import/route.js`
- `src/app/(app)/admin/import/page.jsx`

### Files Modified
- `src/app/(app)/project/[id]/summary/page.jsx`
- `src/app/(app)/project/new/page.jsx` (converted to server component)
- `src/app/(app)/dashboard/DashboardClient.jsx`
- `next.config.mjs`

---

## [Session 2 — Sidebar + Clients Module] · April 27, 2026

### Added
- **Sidebar navigation** — replaced top `Navbar` with Vercel-style left sidebar (`Sidebar.jsx`) in navy (#0a1929) with ILC brand colors
  - Nav items: Projects, Clients, Budgets (disabled), Takeoffs (disabled)
  - Settings sub-nav: Pricing (ILC_ADMIN only), Users/Admin, Import Excel
  - User avatar with initials, role display, sign-out button at bottom
- **Clients module** — full CRUD:
  - `Client` Prisma model: name, type, locationType, email, phone, website, address, city, state, notes
  - `clientId` foreign key on `Project`
  - `/api/clients/route.js` — GET (list) + POST (create)
  - `/api/clients/[id]/route.js` — GET (with linked projects), PATCH, DELETE (unlinks projects first)
  - `/clients/page.jsx` — clients list
  - `/clients/[id]/page.jsx` — client detail with linked projects

### Files Created
- `src/components/layout/Sidebar.jsx`
- `src/app/api/clients/route.js`
- `src/app/api/clients/[id]/route.js`
- `src/app/(app)/clients/page.jsx`
- `src/app/(app)/clients/[id]/page.jsx`

### Files Modified
- `src/app/(app)/layout.jsx` (Navbar → Sidebar, side-by-side layout)
- `prisma/schema.prisma` (added `Client` model, `clientId` on `Project`)

---

## [Session 3 — Design Budget Wizard] · April 27–28, 2026

### Added
- **Design Budget** budget type (`budgetType` field: `conceptual` | `design` | `peer_review`)
- Expanded 50+ question wizard sections for design-stage budgets:
  - `DesignUnitsSection.jsx` — disk size (5"/7"), 12" entry disk upgrade, dimmers per unit (0–3), boiler room disk, undercabinet, kitchen pendants, living room fan, bedroom fans (master/secondary/all), fan size (48"/52"/60"), vanity, closet control (switch vs occupancy sensor), balcony fixture
  - Additional design sections for corridors, amenities, emergency, controls/energy
- Design wizard shares calculation engine with conceptual; routes to different section components based on `budgetType`

### Fixed
- Design Budget wizard not saving answers correctly — investigated and fixed section routing

### Files Created
- `src/components/sections/design/DesignUnitsSection.jsx`
- Additional design section components (`DesignCorridorsSection`, `DesignAmenitiesSection`, etc.)

### Files Modified
- `prisma/schema.prisma` (added `budgetType` field to `Project`)

---

## [Session 4 — Architecture Review + Project Schema Redesign] · April 28, 2026

### Decisions Made
- Reviewed Pipedrive exports (deals → projects, organizations → clients) to align data structures
- Budget tools live under projects (not standalone)
- Conceptual and design budgets unified: one tool, show/hide questions by detail level

### Added
- New `Project` model fields:
  - `phase` (`sd` | `dd` | `cd` | `ifc` | `construction` | `closeout`)
  - `serviceType` (`fullDesign` | `designAssist` | `peerReview` | `bidOnly` | `other`)
  - `city`, `state` (replacing generic `location` for filtering)
  - `flagged` (boolean — alert/issue flag)
- `ProjectAssignee` join model (many-to-many `Users` ↔ `Projects`)

### Files Modified
- `prisma/schema.prisma` (major expansion of `Project` model, added `ProjectAssignee`)

---

## [Session 5 — Dashboard Redesign + Project Hub (Tabbed)] · April 28, 2026

### Added
- **Dashboard rewrite** (`DashboardClient.jsx`):
  - Phase filter chips (SD/DD/CD/IFC/Construction/Closeout)
  - Service type filter chips (Full Design/Design Assist/Peer Review/Bid Only)
  - "My Projects" toggle, "Flagged" toggle
  - Search across name, client, city, state, location
  - Columns: Project (with assignee avatar bubbles), Client, Location, Service type badge, Building type, Phase badge, Budget ($/SF sub-line), Updated date, Actions (open/duplicate/delete on hover)
- **Project detail page** rebuilt as tabbed hub (`ProjectHubClient.jsx`):
  - Initial tabs: Budgets, Drawings, Correspondence, Submittals, CA, Contracts, Design Info, Meetings
  - Drag-and-drop PDF upload per tab
  - File metadata in new `ProjectFile` DB model
- `/api/projects/[id]/assignees/route.js` — GET/POST/DELETE for multi-user project assignment

### Fixed
- Adding a new client from new project form lost all entered project data — fixed flow
- Tabs not refreshing when returning — fixed with `router.refresh()`
- "Add Client" button navigating to wrong destination — fixed

### Files Created
- `src/app/api/projects/[id]/assignees/route.js`

### Files Modified
- `src/app/(app)/dashboard/DashboardClient.jsx` (full rewrite)
- `src/app/(app)/project/[id]/page.jsx` → `ProjectHubClient.jsx` (full rewrite as tabbed hub)
- `prisma/schema.prisma` (added `ProjectFile`, `ProjectAssignee` models)
- `src/lib/utils.js` (added `phaseLabel`, `serviceTypeLabel`, `PROJECT_PHASES`, `SERVICE_TYPES`)

---

## [Session 6 — File Upload Infrastructure + PDF Text Extraction] · April 28–29, 2026

### Added
- `ProjectFile` DB model: projectId, tab, fileType, originalName, storedPath, size, mimeType, tags (JSON), textContent (extracted for search), uploadedById, createdAt
- `/api/projects/[id]/files/route.js` — GET (list by tab) + POST (upload, extract PDF text via `pdf-parse`, store to `uploads/`)
- `/api/projects/[id]/files/[fileId]/route.js` — DELETE endpoint
- Multi-select in file lists (checkbox per file) with bulk-delete action
- Upload date displayed next to each file in all tabs
- Takeoffs tab accepts PDF, Excel, and CSV
- Meetings and Design Info tabs added

### Fixed
- PDF text extraction returning empty — fixed `pdf-parse` import for Next.js App Router (requires dynamic import)

### Files Created
- `src/app/api/projects/[id]/files/route.js`
- `src/app/api/projects/[id]/files/[fileId]/route.js`

### Files Modified
- `prisma/schema.prisma` (added `ProjectFile` model)
- `src/app/(app)/project/[id]/ProjectHubClient.jsx`

---

## [Session 7 — Tag System for File Uploads] · April 29, 2026

### Added
- Per-tab tag taxonomy:
  - **Submittals:** New Submittal, Submittal with Comments
  - **CA:** RFI, Change Order, Construction Schedule, Ship Schedule
  - **Drawings:** SD, DD, CD, IFC, ASI, RFI
  - **Contracts:** Executed, SOV, Proposal (also accepts Excel/CSV)
  - **Correspondence:** General, Email, Meeting Notes
  - **Design Info:** Code Research, Product Research, Design Standards
  - **Meetings:** Meeting Notes, Action Items
  - **Budgets:** SD, DD, CD, Buyout
- Tags required on upload — modal popup forces selection when dragging files in
- Per-tab tag filter chips above each file list

### Files Modified
- `src/app/(app)/project/[id]/ProjectHubClient.jsx`

---

## [Session 8 — Claude AI Chat / RAG Integration] · April 29, 2026

### Added
- `/api/projects/[id]/chat/route.js` — streaming chat endpoint via `@anthropic-ai/sdk`
  - Pulls all files with extracted `textContent` from DB, grouped by tab
  - System prompt includes project name, client, location, and all document text
  - Streams responses using `ReadableStream` (SSE-style)
  - Model: `claude-sonnet-4-6`
- Chat UI panel added to project hub (available from every tab)
- `/api/anthropic-models` debug endpoint to verify API key and available models
- `.env.local` with `ANTHROPIC_API_KEY`

### Fixed
- Multiple API key configuration issues, model name errors, and network errors in chat endpoint
- PDF text extraction returning empty in chat context — required dynamic import of `pdf-parse`

### Files Created
- `src/app/api/projects/[id]/chat/route.js`
- `.env.local`

### Files Modified
- `src/app/(app)/project/[id]/ProjectHubClient.jsx` (chat UI added)

---

## [Session 9 — Takeoffs Comparison Dashboard] · April 29, 2026

### Added
- `src/lib/parseTakeoff.js` — Excel/CSV parser for Countfire takeoff format
  - Reads last sheet, finds header row where first cell = "Count", locates "Total" column dynamically
  - Returns `{ fixtureType: quantity }` dictionary
- Takeoff parsed JSON stored in `ProjectFile.parsedData` on upload
- Takeoffs tab comparison dashboard:
  - Vertical bar chart — quantities per fixture type across all uploaded versions
  - Table — fixture types as rows, each submission as a column, quantity at each stage
  - Filterable by tag (SD/DD/CD/IFC/ASI/RFI), sortable by upload date

### Fixed
- Comparison showing 0 for one submission's counts when actual was 188 — fixed column detection in parser (was reading wrong column)

### Files Created
- `src/lib/parseTakeoff.js`

### Files Modified
- `src/app/api/projects/[id]/files/route.js` (parse takeoff Excel on upload)
- `src/app/(app)/project/[id]/ProjectHubClient.jsx` (takeoffs comparison UI)

---

## [Session 10 — Contracts + CA Tab Widgets] · April 29–30, 2026

### Added
- **Contracts tab widgets:**
  - Supply Contract Value (parsed from Executed or SOV PDFs)
  - Supply Contract Signed Date
  - Design Contract Value and Design Contract Signed Date
- **CA tab widgets:**
  - Change Order Total (summed from all "Change Order" tagged files)
  - RFI Count (count of "RFI" tagged files)
  - Construction Start Date (earliest date in construction schedule PDFs)
  - MEP/Electrical Rough-In Date (keyword match in construction schedule)
  - Construction End Date (completion date from schedule)
- PDF parsing for dollar amounts: regex patterns to extract contract totals from Executed/SOV documents
- Multiple date format support in PDF date parser

### Files Modified
- `src/app/(app)/project/[id]/ProjectHubClient.jsx` (Contracts and CA widget rows)
- `src/app/api/projects/[id]/files/route.js` (PDF parsing logic)

---

## [Session 11 — Budgets Tab + Budget Progression Chart] · April 30, 2026

### Added
- Budgets tab drag-and-drop PDF upload (in addition to existing conceptual/design budget widgets)
- Vertical bar chart — total budget per uploaded submission (SD → DD → CD → Buyout progression)
- Tab order reordered: Dashboard → Budgets → Takeoffs → Drawings → Design Info → Meetings → Correspondence → Submittals → CA → Contracts

### Files Modified
- `src/app/(app)/project/[id]/ProjectHubClient.jsx`

---

## [Session 12 — Meetings Tab as Rich Note Editor] · May 1, 2026

### Added
- Meetings tab "Add New Note" button creates a new timestamped note entry per click
- Notes linked to project; date-stamped
- Rich text / paste-friendly note area
- Meetings tab retains drag-and-drop alongside note creation
- `MeetingNote` Prisma model (or stored as `ProjectFile` type `meeting_note`)

### Files Created
- New API route for meeting notes CRUD

### Files Modified
- `prisma/schema.prisma` (MeetingNote model)
- `src/app/(app)/project/[id]/ProjectHubClient.jsx`

---

## [Session 13 — Submittal Tracker] · May 1–2, 2026

### Added
- **Submittal Tracker** — separate full-screen page linked from Submittals tab via "Open Tracker" button
  - Import fixture schedule from CSV/Excel (Type/Manufacturer/Model columns)
  - Table: fixture types as rows, consultants as columns, latest review status as cells
  - Review statuses: Approved, Approved as Noted, Rejected, etc.
  - Expand row → full version history of review rounds
  - Add/edit review entries manually
  - Date-based versioning (flexible, not strict submission numbering)
  - Configurable consultant list per project (defaults: Developer, Architect, Landscape Architect, Interior Designer, EE)
- New Prisma models: `SubmittalTracker`, `SubmittalFixture`, `SubmittalReview`

### Files Created
- `src/app/(app)/project/[id]/tracker/page.jsx`
- `src/components/tracker/SubmittalTrackerClient.jsx`
- API routes for tracker CRUD

### Files Modified
- `prisma/schema.prisma` (submittal tracker models)

---

## [Session 14 — Project Dashboard Tab + Activity Feed] · May 2, 2026

### Added
- **Dashboard tab** — first/leftmost tab in project hub; project home screen with key widgets:
  - Initial Budget, Current Budget, Supply Contract Total, Change Order Total
  - Latest uploaded drawing set with link to PDF
- **`ProjectActivityFeed.jsx`** — activity log component wired into Dashboard tab below `ProjectDashboard`
- **`ProjectActivityFeed`** imported into `ProjectHubClient.jsx`, rendered below `ProjectDashboard` in the Dashboard tab

### Files Created
- `src/components/ProjectActivityFeed.jsx`

### Files Modified
- `src/app/(app)/project/[id]/ProjectHubClient.jsx` (Dashboard tab, activity feed)

---

## [Session 15 — Design Budget Math Fixes + Schema Additions] · May 2, 2026

### Fixed (9 calculation bugs — all found by reconciling against Link + Pin Excel ground-truth)

1. **Base SF rate applied to `grossSf` not `unitsSf`**
   - `baseProduct = grossSf * PRICING.base.perSf` (was `unitsSf * rate`)
   - Impact: ~$28,000 delta on a 129K SF building

2. **Sales tax from `projectData.salesTaxPct` (numeric), not response string**
   - Was reading `responses.salesTax` which stored 'exempt'/'yes'/'tbd' strings → always 0
   - Now reads `pd.salesTaxPct` (stored as decimal, e.g. 0.0915 for 9.15%)
   - Impact: ~$6,500 delta

3. **Fan count now respects `numFans` override field**
   - `fanCount = n(pd.numFans) > 0 ? n(pd.numFans) : Math.round(numUnits * fanMult)`
   - Excel showed 14 fans for 149 units (only 3BR units get fans); the unit-mix multiplier approach over-counted
   - Impact: ~$3,000 delta

4. **Landscape uses total `lotSf` (not net lot SF)**
   - `autoLandscape = lotSf > 0 ? lotSf * 0.02 : 0`
   - Impact: minor

5. **Exterior doors averaged per door (not ceil/floor split)**
   - `avgDoorCost = (primarySconce + secondarySconce) / 2`; `extDoorProduct = exteriorDoors * avgDoorCost`
   - Impact: minor

6. **Controls basis is `grossSf` (not corridor+amenity SF)**
   - `controlsProduct = Math.min(grossSf * ctrlRate.perSf, ctrlRate.cap)`
   - Impact: ~$2,000 delta

7. **Sales tax applied to product subtotals only (not freight or warehousing)**
   - `lightingTaxAmount = lightingProductSubtotal * salesTaxPct`
   - `controlsTaxAmount = controlsProduct * salesTaxPct`
   - Freight and warehousing are now tax-exempt
   - Impact: ~$1,500 delta

8. **Garage key alignment** — CorridorsSection sends `'standard'`/`'enhanced'` and `'occupancy'`/`'daylighting'`; calculations.js was checking legacy keys `'high'`/`'medium'` and `'batteryAndSensor'`
   - Fixed key matching; updated pricing: standard = $0.30/SF, enhanced = $0.45/SF, daylighting adds $0.10/SF

9. **Removed double-counted design adders** — `diskSevenInch`, `entryDecorative`, `entryway12inch`, `fanSize52Adder` were already baked into the grossSf × $0.38 base rate after fixing bug #1; removing them eliminated ~$4,000 double-count

### Added
- **`numFans` field** — explicit fan count in ProjectData; overrides unit-mix multiplier when set
- **`numAccentDownlights` field** — recessed accent count in ProjectData (was in schema/labels but not saved)
- **`salesTaxPct` field** — jurisdiction sales tax rate in ProjectData (decimal, e.g. 0.0915); displayed as % in UI
- **`salesTaxPct` in ProjectDataSection** — new "Freight, Warehousing & Tax" group with freight %, warehousing %, and sales tax % fields; all use `PCT_FIELDS` conversion (display % ↔ stored decimal)
- **Stairwell elevated adder** — `stairwells × $50` when `corridors.stairwellDesign === 'elevated'`
- `calculateBudget()` return value extended with `salesTaxPct`, `lightingTaxAmount`, `controlsTaxAmount`, `fanCount`

### Updated Pricing
- `designGarage.baseMediumPerSf`: 0.20 → 0.30 (now called 'standard')
- `designGarage.baseHighPerSf`: 0.25 → 0.45 (now called 'enhanced')
- `designGarage.daylightingAdderPerSf`: 0.10 (new)

### Files Modified
- `src/lib/calculations.js` (complete rewrite with 9 bug fixes)
- `src/lib/pricing.js` (garage rates updated)
- `src/app/api/projects/[id]/data/route.js` (added `numFans`, `numAccentDownlights`, `salesTaxPct` to numeric fields)
- `src/components/sections/ProjectDataSection.jsx` (added `numFans`, `numAccentDownlights`, `salesTaxPct` fields; removed broken salesTax QuestionCard)
- `prisma/schema.prisma` (added `numFans Int?`, `salesTaxPct Float?` to `ProjectData`)

---

## [Session 15 cont. — Budget Type Conversion] · May 2, 2026

### Added
- **In-place budget type conversion** — clicking "Upgrade to Design Budget" from within an existing project now converts the current project (PATCHes `budgetType`) instead of navigating to `/project/new?type=design`
  - All existing project data and questionnaire answers carry over (same DB records)
  - Design wizard shows additional questions on top; existing answers are not deleted
  - Downgrade (design → conceptual) hides design answers but does not delete them
- **Amber confirmation banner** — shown inline when conversion is requested; explains what carries over; requires "Yes, convert" click
- **`budgetType` in PATCH API** — `/api/projects/[id]/route.js` now accepts and validates `budgetType` in PATCH body
- **Activity logging** for budget type conversion — logged to project activity feed with label (e.g., "Converted to **Design Budget**")
- **Budget tab cards redesign:**
  - Active type → `<Link>` to wizard (opens immediately)
  - Inactive type → `<button>` that triggers confirmation banner
  - "Upgrade to Design Budget" label (was "Create Design Budget")
  - Peer Review remains a disabled placeholder

### Files Modified
- `src/app/(app)/project/[id]/ProjectHubClient.jsx` (conversion state, confirmation banner, card redesign)
- `src/app/api/projects/[id]/route.js` (budgetType in PATCH + activity log)

---

## Known Gaps / Future Work

- **Garage "Other" custom override** — Excel projects can use a custom flat dollar amount for garage. The app has no "Other" option or manual dollar input. Discrepancy noted but not yet resolved (project-specific workaround needed).
- **AmenitiesSection.jsx** — not yet upgraded with `isDesign` prop for design-wizard-only questions
- **EmergencySection.jsx** — not yet upgraded to full design wizard quality
- **BudgetSnapshot** — architecture designed but not built
- **Changelog admin UI** — planned for super-admin; this file is the interim solution
- **Chrome extension pairing** — intermittent failures connecting the browser extension for in-app testing; all math verification was done by hand calculation
