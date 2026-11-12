# Testing inventory: 1LUX app (Mike's app as the base)

_Written 2026-11-11 from the code at `4513e87` (main, Jason's GitHub) and Mike's docs in `SOFTWARE\_MIKE's APP\Software engineering` (`MODULE_DOCS_INDEX.md` updated 11-10, `PLATFORM_MODULE_OVERVIEW.md` at d4c8513). This top part is written by hand (`inventory-findings.md`); the tables under "Generated code inventory" are remade by `npm run test:inventory`._

_How it was checked: code read and searched only. Nothing here comes from production; app.ilcstudios.com was not opened. What the browser crawl found is in `smoke-results.md`. "Not confirmed" means the doc says so or it needs a running copy with data._

## 1. Summary

- **Size:** 110 pages, 492 API route files, 250 models, 164 migration folders (0001–0166; 0138 and 0139 absent), no server actions (every write is an API route).
- **Mike's own status** (`PLATFORM_MODULE_OVERVIEW.md`): 17 areas Finished, 45 Mostly finished, 9 Partly built, 5 Placeholder, 6 Planned only. His caveat: "Finished" means built, and **no project data in the app is real**.
- **Three gaps run through everything:** no email is sent (one exception below), nothing runs on a schedule (two of ten jobs have a GitHub schedule, pointed at the old repo), and there is no Microsoft 365 link.
- **Docs vs code:** the 15 module docs marked "new" match the code (no missing page, route or model). The older build plans do not: two say "nothing built" for things that exist, three were built smaller than written, four are not built at all (section 3).
- **Mike's test list** (`MIKE_TEST_UPLOAD_TODO.md`, 11-1) has every box unticked, including "change orders were tested only through the API and the build, never on screen".

## 2. Watch list (test these first)

| # | Item | Why | Source |
|-|:-|:-|:-|
| W1 | **CRM Upload "wipe and load"** (`/admin/crm-import`) | Hard-deletes every project, company and person with no undo; the v7 load has never been run for real. Test on staging only, after a database copy. | ADMIN_AREA L43, L92; `src/lib/crmImportLoad.js` |
| W2 | **Change orders (11-1 design, migration 0158)** | "Not tried in production"; never tested on screen. A Sent CO can exist with no option (Job Loader, status box). Clients cannot pick an option. Tax-only CO needs a CPA check. | CHANGE_ORDERS L162–175 |
| W3 | **RFQs: versions, quote drop, Review prices** | RFQs for change orders not tried; Send revision may leave out fixtures added since (not confirmed); files over 5 MB need S3. | RFQS_AND_SALES_REPS L163–179 |
| W4 | **Email: nothing is delivered** | `sendEmail` only logs, and with `NOTIFY_DRY_RUN=false` still sends nothing (Microsoft Graph TODO). Portal invites, CO Send, ship-schedule email, proposal Send, digest, draft resume link all report success without sending. Only real sender: the pre-con alert on a public budget (SES, `src/lib/intake/notifyPrecon.js`), not confirmed working. | `src/lib/notify.js:51-61`; `src/lib/campaigns/sender.js` |
| W5 | **Scheduled jobs** | 10 cron routes; only digest and threshold have a schedule, in GitHub Actions on the old repo. Not scheduled: market-intel, market-owner-lookup, meeting-prep, note-reminders (check-in drafts depend on it), unfinished-drafts, weekly-roundup, usage-rollup, client-review-check. Six of them accept a signed-in session when the secret is missing. | `src/app/api/cron/*`; `.github/workflows` |
| W6 | **AI features need a key** | Without one, routes answer 503 or a plain error string. Mike's list says the old key stopped working 10-26; Market Intel AI "not confirmed in prod". 80+ routes touch the AI (see the Counts table). | `src/lib/anthropicKey.js:71-73`; MARKET_INTEL L112 |
| W7 | **A Client Viewer login opens 46 staff pages** (crawl, 11-11): Market Intel (4), Knowledge Base (4), CRM contacts, notes, check-ins, Sales Activity, proposals, automation (7), dashboards, My Jobs, Pre-Con, products, manufacturers, `/admin/import`, `/admin/intake`. On most, the only refused call is the My Desk counter, so the page's own data loads. Sales Docs, campaigns and expenses do refuse. There is no single block: `(app)/layout.jsx` checks only for a session. Super-Admin-only KB entries also leak on `/knowledge-base/[category]` and in chat. Local database is nearly empty, so what data shows needs a pass with real records. | `smoke-results.md` → "Staff pages a Client Viewer can open"; OVERVIEW L256, L894, L1205; SEARCH_ARCHIVE L114 |
| W8 | **`/admin/import` (budget import) open to any signed-in user**; Offices and Roadmap open wider than the menu shows | Access wider than intended. | ADMIN_AREA L44, L98–99 |
| W9 | **Two conceptual budgets that disagree** | The public tool is "the correct version"; the in-project wizard is the older one with staff-typed quantities, browser math and none of the public rules. Part B of the move package (rebuild the in-project one on the public parts, with a parity test) is not done. | CONCEPTUAL_BUDGET_MOVE_PACKAGE L53–89 |
| W10 | **Company portal** | Never tried with a real client; invite emails are only logged; auto-publish of the ship schedule fires only when someone opens it. The crawl does not cover portal logins yet. | COMPANY_PORTAL L78–84 |
| W11 | **Expenses, Events, Memberships, Tasks board** | Deployed 11-2 and "not tried on a real phone or in prod"; Tasks list, board drag and weekly meeting card not tried. | coordination.md 11-02; MY_DESK L148–152 |
| W12 | **MCP / AI Access Keys** | `/api/mcp` answers 503 until `MCP_API_TOKEN` (32+) is set and the `McpQueryLog` table exists. | ADMIN_AREA L46 |
| W13 | **Hard deletes** | 71 route files delete rows for good, including shipments, draft change orders and Market Intel sources. | generated table; OVERVIEW L255 |
| W14 | **Operations acts as admin: doc and code differ** | Doc: anyone in Operations. Code: only role USER in Operations (`permissions.js:47`); a SALES login in Operations does not. Decide which is right. | USERS_ROLES L60 |
| W15 | **Dead ends in the app** | `/register` reads an invite token nothing writes; `/api/bot/process-queue` and `/api/bot/drafts/[id]/send` are stubs ("Phase B"); proposals never become Expired; `BidLeveling.publicToken` unused; Weekly Meeting links to `/admin/submissions`, which does not exist (`MeetingDashboard.jsx:292,297`). | code |
| W16 | **Job Loader** | Real upload to S3 and folder picker not proved; skips existing CO numbers on reload. | ADMIN_AREA L45; CHANGE_ORDERS L170 |

## 3. Docs vs code

### In code but not in a module doc
| What | Where | Note |
|:-|:-|:-|
| Company spaces + company details (LOGIQ / SAGE / Shift) | migrations 0165, 0166; `/admin/companies`; `/api/business-units/[id]`; `src/lib/companySpaces.js`, `brand*.js` | Added 11-10 by us; after Mike's docs. |
| Email campaigns | `/sales/docs/campaigns`, `/sales/docs/lists`, `/api/campaigns/*`, `/api/campaign-lists/*`, `/api/e/*`, `/e/u/[token]`, 8 `Campaign*` models | `EMAIL_CAMPAIGNS_PLAN.md` says "Nothing built yet". Send refuses in production. |
| Dashboard engine | `/dashboards/[section]`, `/api/dashboards/[id]/{fork,share,hidden}`, `src/lib/dashboards/*` | The 07-03 plan says "nothing is being built yet". |
| Older screens off the menu | `/admin/tasks` (old `Task` model, beside `SalesTask`), `/sales/bot-queue`, `/crm/dashboards` (old editor: "do not build on it"), `/pre-con` (no menu link) | Overview mentions them; decide keep or remove. |
| Fixture schedule Excel import | `/api/projects/[id]/fixture-schedule/import` | DRAWINGS doc lists it as out of scope. |
| Site engine changes | `src/lib/pricing.js:155-173`, `calculations.js:408, 471` | `EXTERIOR_SITE_ENGINE_VS_GOOGLE_SHEET.md` (July) is stale on solar, footprint and pathway. |
| 21 models nothing in `src` reads | list in the generated checks | Some are join tables written through a parent; `BidLine`, `BidTypeAlias`, `BidPlaceholder`, `RfqQuoteTerm`, `UnitSelectionResult` look unused. |

### Documented but missing in code
| Doc | Missing | Reading |
|:-|:-|:-|
| `TASK_MANAGEMENT_BUILD_PLAN.md` | `Space`, `TaskList`, `TaskDependency`, `TaskComment`, `TaskTemplate` models; `/api/spaces/*`, `/api/task-lists/*`; task digest and alert crons | Not built as written. `SalesTask` (My Desk) was built instead. |
| `EMAIL_CALENDAR_BUILD_PLAN v2.md` | `CalendarAccount`, `CalendarEvent`; Graph client; webhook renewal | Not built. Only `.ics` upload and `/api/email/ingest`. |
| `COMPLIANCE_ENGINE_BUILD_PLAN.md` | `ComplianceRun`, `ComplianceResult`, `/api/projects/[id]/compliance`, panel and badge | Not built. `code-check`, `error-radar`, `budget-qc` exist. |
| `DESIGN_QUESTIONNAIRE_BACKFILL_BUILD_PLAN.md` | seed script and data file | Not built. |
| `CLIENT_STANDARD_ENGINE_CONSOLIDATED_BUILD_PLAN.md` | 13 models (`ClientStandard`, `SelectionOption`, `StandardsQuestion`…), `/api/clients/[id]/standard/*`, `/admin/standards-bank` | Plan only; the code has the earlier standards build (`ClientStandardFixture`, `ClientPlaybook`, `/api/clients/[id]/standards`). |
| `UNIT_SELECTIONS_BUILD_PLAN.md` | share link, respondents, reconcile, push to fixture schedule, close | Partly built: survey and pool only; "untestable until share exists". |
| `EXPENSES_BUILD_PLAN.md` | trips, splits, categories, card import, NetSuite export, `/finance/expenses`, `/m/expenses` | Built smaller: `SalesExpense` + `ExpenseReceipt`, snap, AI read, confirm. |
| `CONFERENCE_PLANNER_BUILD_PLAN.md` | attendees, targets, costs, deal links, refresh, ics, ROI | Phase 1 only (plan, budget, memberships). |
| `26.10.19 SALES_DOCS_BUILD_PLAN.md` | email-code check on share links (`/api/share/docs/[token]/verify`), per-visitor page, `DECISIONS.md` | Phase 1 built under `/sales/docs` (plan says `/crm/sales-docs`). |
| `SHIP_SCHEDULE_NOTIFICATIONS_PORTAL_v2.md` | `/portal/signup`, `/portal/dashboard`, one page per portal module | Built with different URLs: `/portal/invite/[token]`, `/portal/projects`, `/portal/projects/[id]`. |
| `BID_LEVELING_AND_BID_COMPARISON.md` | public Bid Comparison page; PDF read of competitor quotes | Doc says not built; code agrees. |
| `SANDBOX_PLAN.md` | reset endpoint, seed refresh, `APP_ENV=sandbox` | Only the staging stripe exists (`NEXT_PUBLIC_APP_ENV=staging`). |
| `ADMIN_AREA.md` L54 | `deploy-log.json` | Made at build by `scripts/generate-deploy-log.js`; Changelog and Tech Stack may be empty on a fresh copy. |
| `CRON_GITHUB_SETUP.md` | — | Points at `OperationsILC/ilc-lighting-app`; secrets would need adding again in the new repo. |
| Several plans | "deploys with `db push --accept-data-loss`" | Stale. Both `amplify.yml` and the container start use `prisma migrate deploy`. `npm run db:push` still exists; do not run it. |

### Calculator: done / not done (`CONCEPTUAL_BUDGET_MOVE_PACKAGE.md`)
The package has no checklist; this is its content.
- **Done (public tool):** 14 questions as data, quantities from drawings or stand-in figures, pre-pricing rules, math on the server, limited public view, branded PDF, drafts, submit, staff screen `/admin/intake`, My Budgets. All 25 routes and 3 pages it lists are in the code.
- **Not done (Part B):** in-project conceptual budget rebuilt on the public parts (one question list, `computeQuantities`, `computeIntakeEstimate`, one engine, server math) and a parity test ("same answers and drawings give the same total in both places"). `WizardClient.jsx` and `DesignWizardClient.jsx` do not use the public parts.
- **Check by hand:** interior and exterior amenity finish levels (exterior middle levels could not be confirmed).
- **Switched off:** resume link (`RESUME_LINK_ENABLED = false`); drafts sweep needs a schedule.
- **Still says ILC:** storage keys `ilc.conceptualBudget.*`, `ILC_GRAPH_MAILBOX`, parts of `aiFailure.js`, `uploadClient.js`, `uploadStorage.js`, `notifyPrecon.js`, `emailTemplates.js`.

## 4. Placeholders and "not tried"

**On screen, do nothing:** Construction, Design, Finance and Company menu rows; seven "Not built yet" Weekly Meeting cards; Full Line Item DD / CD / Buyout Budget cards (`ProjectHubClient.jsx:1390`); whole Correspondence tab (sync, reply, download); five "Coming soon" portal notice types; "Edit tags, coming soon" on drop boxes; Ask AI "coming to the entire platform"; playbook "Questions coming soon"; Florida office address (`555 Main St., Your Home, FL`, migration 0144); Usage & Health history (empty without a schedule).

**Built, not tried for real:** change orders 0158; RFQs for COs; CRM Upload; Job Loader upload; Expenses / Events / Memberships; Tasks board; phone layouts per department (four phone redesigns pending); portal with a real client; pre-con alert email; Sales Docs uploads; Market Intel AI; ship-schedule Email button.

**Not built (named in docs):** billing; printing or emailing a saved Budget version; catalog price into the Budget Matrix; rep bills; RFQ overdue reminders; client picks a CO option; share links for unit selections and bid leveling; expenses trips / splits / export; events steps 2–4; email and calendar sync; Hive import; narrower staff visibility; Archive page for expenses, tasks, conferences, receipts.

## 5. Features gated on email, AI key, storage or a schedule

| Gate | Switch | When it is off | What depends on it |
|:-|:-|:-|:-|
| **Email** | none works today; `NOTIFY_DRY_RUN` (anything but `false` = log only) | Callers get "ok", nothing leaves | All project notifications, digest, portal invites, CO Send (Gmail draft hand-off instead), ship-schedule email, proposal Send, draft resume link, campaign Send (`CAMPAIGN_SENDER`; refuses in production, fake run elsewhere) |
| Email (SES) | S3 keys + `INTAKE_NOTIFY_*` | failure swallowed, `{sent:false}` | Pre-con alert on a public budget only |
| **AI key** | Admin-saved key, else `ANTHROPIC_API_KEY` | 503 or an error string | Drawing / schedule / takeoff / contract / quote / receipt readers, Market Intel reading and Ask, meeting prep, My Desk briefing, note steps, bot writers, KB and project chat, code search |
| **File storage** | `S3_BUCKET` | Outside production: local folders, lost on each container deploy. In production: uploads fail | Drawings, project files, QC media, Sales Docs, receipts, bot knowledge, Job Loader |
| **Schedule** | `CRON_SECRET` + something calling the route | Nothing runs | See W5. Also portal auto-publish and usage history |
| **Microsoft 365** | not built | — | Email activity, correspondence, calendar triggers, two automation triggers |
| MCP | `MCP_API_TOKEN` (32+) | 503 | Bot / AI access keys |
| Retail lookup | `SERPAPI_KEY` | returns nothing | Pricing retail lookup |

## 6. Open definitions that change what "correct" means
`THINGS_TO_DEFINE_MIKE_MARAM.md` lists 21 rules built on an assumption (won vs ordered, which date is "next 12 months", which probability, what a stalled job is, "immediate" = 14 days, what counts as an introduction, proposal 60 days from sent…). Manual testers cannot pass or fail these screens until Jason / Maram answer.

---

# Generated code inventory

_Made by `npm run test:inventory` (scripts/testing/inventory.mjs) from the code on disk. Do not edit below this line; edit `inventory-findings.md` instead._

Totals: **110 pages**, **492 API route files** (740 handlers), **0 server actions**, **250 Prisma models**.

## Counts per module

| Module | Pages | API routes | Handlers | Models | AI | Email | S3 | Cron | Code markers |
|:-|-:|-:|-:|-:|-:|-:|-:|-:|-:|
| Admin and platform | 15 | 36 | 50 | 13 | 2 | 0 | 7 | 0 | 3 |
| Automation and bot | 11 | 41 | 61 | 16 | 10 | 2 | 3 | 3 | 1 |
| Bid leveling and comparison | 0 | 12 | 18 | 11 | 1 | 0 | 0 | 0 | 0 |
| CRM | 10 | 40 | 77 | 27 | 2 | 1 | 4 | 0 | 5 |
| Change orders | 2 | 18 | 26 | 6 | 0 | 0 | 0 | 0 | 1 |
| Client standards and playbook | 0 | 0 | 0 | 3 | 0 | 0 | 0 | 0 | 0 |
| Company portal | 4 | 12 | 13 | 1 | 0 | 0 | 1 | 0 | 1 |
| Conferences and memberships | 6 | 7 | 9 | 8 | 0 | 0 | 0 | 0 | 4 |
| Dashboards | 4 | 18 | 28 | 11 | 0 | 0 | 0 | 0 | 1 |
| Drawings, fixture schedule, compliance | 3 | 33 | 51 | 12 | 6 | 0 | 4 | 0 | 1 |
| Email and calendar | 1 | 8 | 9 | 7 | 0 | 1 | 0 | 0 | 5 |
| Expenses | 2 | 9 | 14 | 3 | 1 | 0 | 2 | 0 | 0 |
| Market Intel | 4 | 20 | 26 | 10 | 2 | 0 | 0 | 3 | 3 |
| My Desk and tasks | 2 | 18 | 22 | 8 | 3 | 0 | 0 | 0 | 9 |
| Notes | 1 | 13 | 27 | 8 | 2 | 2 | 0 | 0 | 1 |
| Notifications and scheduled jobs | 0 | 16 | 20 | 4 | 2 | 5 | 0 | 9 | 2 |
| Other | 2 | 1 | 1 | 2 | 0 | 0 | 0 | 0 | 13 |
| Pricing, QC, verification | 2 | 17 | 22 | 3 | 0 | 0 | 2 | 0 | 1 |
| Products and fixture library | 5 | 14 | 24 | 8 | 0 | 0 | 0 | 0 | 0 |
| Project hub, bid matrix, budgets | 8 | 42 | 73 | 25 | 6 | 5 | 6 | 0 | 6 |
| Proposals | 2 | 11 | 17 | 6 | 0 | 0 | 0 | 0 | 0 |
| Public conceptual budget and intake | 4 | 26 | 29 | 10 | 1 | 4 | 3 | 2 | 2 |
| RFQs and sales reps | 4 | 14 | 23 | 13 | 2 | 0 | 2 | 0 | 0 |
| Sales Docs and campaigns | 11 | 34 | 48 | 20 | 0 | 5 | 5 | 0 | 0 |
| Search, archive, knowledge base | 5 | 11 | 17 | 2 | 2 | 0 | 0 | 0 | 0 |
| Ship schedule | 1 | 13 | 20 | 7 | 0 | 2 | 0 | 0 | 1 |
| Unit selections | 1 | 8 | 15 | 6 | 0 | 0 | 2 | 0 | 0 |

_AI / Email / S3 / Cron = API routes whose file, or a `@/lib` file it imports directly, uses that service (one hop; deeper use is not counted)._

## Checks from the code

### API routes with no auth helper in the file (26)

Public by design or guarded another way (cron secret, token, bearer). Each needs a look.

| Route | Methods | Uses |
|:-|:-|:-|
| `/api/auth/login` | POST |  |
| `/api/auth/logout` | POST |  |
| `/api/auth/register` | POST |  |
| `/api/bot/process-queue` | POST | cron |
| `/api/cron/client-review-check` | GET | cron |
| `/api/cron/digest` | GET | email, cron |
| `/api/cron/threshold` | GET | email, cron |
| `/api/cron/usage-rollup` | GET | cron |
| `/api/e/c/[token]/[blockId]` | GET | email |
| `/api/e/o/[token]` | GET |  |
| `/api/e/u/[token]` | POST |  |
| `/api/intake/access` | POST |  |
| `/api/intake/bug-report` | POST | s3 |
| `/api/intake/visit` | POST |  |
| `/api/mcp` | GET POST |  |
| `/api/notifications/opened/[token]` | GET |  |
| `/api/portal/auth/login` | POST |  |
| `/api/portal/auth/logout` | POST |  |
| `/api/portal/invite/[token]` | GET POST |  |
| `/api/share/[token]` | POST |  |
| `/api/share/co/[token]` | GET |  |
| `/api/share/docs/[token]/gate` | POST |  |
| `/api/share/fixture/[token]` | GET PATCH |  |
| `/api/share/standards/[token]` | POST |  |
| `/api/uploads/complete` | POST | s3 |
| `/api/uploads/presign` | POST | s3 |

### Staff pages (server components) without `force-dynamic` (0)

None.

### Links in code that match no page (1)

| Link | Used in |
|:-|:-|
| `/admin/submissions` | src/app/(app)/dashboards/[section]/MeetingDashboard.jsx |

### Models never read or written from `src` (21)

`MeetingBriefFact`, `MeetingBriefCitation`, `NoteProject`, `ProjectStandardsOverride`, `ShipSchedulePublishLine`, `MarketAnswerYear`, `RFIAttachment`, `DrawingRevisionFlag`, `UserLocationState`, `ConceptualSubmissionAnswer`, `ConceptualDraftChange`, `UnitSelectionResult`, `BidLine`, `BidTypeAlias`, `BidPlaceholder`, `RfqQuoteTerm`, `SalesTaskClient`, `SalesTaskContact`, `SalesTaskProject`, `SalesTaskTagLink`, `ConferenceMembershipSeries`

### Hard deletes: 71 route files call `.delete(` / `.deleteMany(`

### JSON body read without a guard (rough check): 139 route files

## Admin and platform

**Pages**

| URL | Zone | Notes |
|:-|:-|:-|
| `/admin` | staff |  |
| `/admin/agent-runs` | staff |  |
| `/admin/changelog` | staff |  |
| `/admin/companies` | staff |  |
| `/admin/crm-import` | staff |  |
| `/admin/import` | staff | client page |
| `/admin/job-loader` | staff |  |
| `/admin/mcp-keys` | staff |  |
| `/admin/profile` | staff |  |
| `/admin/roadmap` | staff |  |
| `/admin/tech-stack` | staff |  |
| `/admin/usage` | staff |  |
| `/change-password` | auth | client page |
| `/login` | auth | client page |
| `/register` | auth | client page |

**API routes**

| Route | Methods | Guard | Uses | Flags |
|:-|:-|:-|:-|:-|
| `/api/admin/agent-runs` | GET | requireAuth |  |  |
| `/api/admin/agent-runs/[id]/verdict` | POST | requireAuth |  |  |
| `/api/admin/ai-key` | GET PUT | requireSuperAdmin | ai |  |
| `/api/admin/crm-import` | GET POST | requireSuperAdmin |  |  |
| `/api/admin/import` | POST | requireAuth |  | json unguarded |
| `/api/admin/invite` | GET POST | requireAdmin |  |  |
| `/api/admin/job-loader` | GET POST | requireSuperAdmin | s3 |  |
| `/api/admin/job-loader/complete` | POST | requireSuperAdmin | s3 |  |
| `/api/admin/job-loader/presign` | POST | requireSuperAdmin | s3 |  |
| `/api/admin/mcp-keys` | GET POST | requireSuperAdmin |  |  |
| `/api/admin/mcp-keys/[id]` | PATCH DELETE | requireSuperAdmin |  |  |
| `/api/admin/metrics` | GET | requireAuth |  |  |
| `/api/admin/projects/[id]/export` | GET | requireAuth |  |  |
| `/api/admin/sheets` | GET | requireAdmin | s3 |  |
| `/api/admin/users` | GET POST | requireAdmin |  | json unguarded |
| `/api/admin/users/[id]` | PATCH DELETE | requireAdmin |  | hard delete, json unguarded |
| `/api/admin/users/[id]/projects` | GET PUT | requireAdmin |  |  |
| `/api/anthropic-models` | GET | requireAuth | ai |  |
| `/api/auth/change-password` | POST | requireAuth |  | json unguarded |
| `/api/auth/login` | POST | **none** |  | json unguarded |
| `/api/auth/logout` | POST | **none** |  |  |
| `/api/auth/me` | GET | getSession |  |  |
| `/api/auth/register` | POST | **none** |  | json unguarded |
| `/api/business-units/[id]` | PATCH | requireAdmin |  |  |
| `/api/link-preview` | POST | requireAuth | s3 |  |
| `/api/mcp` | GET POST | **none** |  |  |
| `/api/roadmap-priorities` | GET POST | requireAdmin, requireAuth |  | json unguarded |
| `/api/roadmap-priorities/[id]` | PATCH DELETE | requireAdmin |  | hard delete, json unguarded |
| `/api/roadmap-priorities/reorder` | PATCH | requireAdmin |  | json unguarded |
| `/api/sales-tax` | GET | requirePublicBudgetAccess |  |  |
| `/api/system-config` | GET PATCH | requireAuth |  | json unguarded |
| `/api/uploads/complete` | POST | **none** | s3 |  |
| `/api/uploads/presign` | POST | **none** | s3 |  |
| `/api/user/preferences` | GET PATCH | requireAuth |  | json unguarded |
| `/api/users` | GET | requireAuth |  |  |
| `/api/users/tone-profile` | GET | requireAuth |  |  |

**Models** (13): `User`, `UserAlert`, `BugReport`, `UserBusinessUnit`, `UserDepartment`, `UserAccessEvent`, `SystemConfig`, `UserLocationState` (unused), `RoadmapPriority`, `McpQueryLog`, `McpApiKey`, `AppSetting`, `BusinessUnit`

**Code markers**

- `src/app/api/roadmap-priorities/route.js:20` data: { name: name.trim(), status: 'todo', sortOrder },
- `src/app/api/roadmap-priorities/[id]/route.js:12` if (!['todo', 'wip', 'done'].includes(body.status)) {
- `src/lib/mcp/commitments.js:63` const OPEN_TASK_STATUS = ['TODO', 'IN_PROGRESS', 'IN_REVIEW'];

## Automation and bot

**Pages**

| URL | Zone | Notes |
|:-|:-|:-|
| `/sales/automation` | staff |  |
| `/sales/automation/actions` | staff |  |
| `/sales/automation/knowledge` | staff | client page |
| `/sales/automation/rules` | staff | client page |
| `/sales/automation/scheduling` | staff |  |
| `/sales/automation/signature` | staff |  |
| `/sales/automation/templates` | staff | client page |
| `/sales/automation/timeline` | staff |  |
| `/sales/automation/triggers` | staff |  |
| `/sales/automation/voice` | staff |  |
| `/sales/bot-queue` | staff | client page |

**API routes**

| Route | Methods | Guard | Uses | Flags |
|:-|:-|:-|:-|:-|
| `/api/automation/activity` | GET | requireAuth |  |  |
| `/api/automation/bot-rules` | GET POST | requireAuth |  | json unguarded |
| `/api/automation/bot-rules/[id]` | PATCH DELETE | requireAuth |  | hard delete, json unguarded |
| `/api/automation/classification-rules` | GET POST | requireAuth | ai | json unguarded |
| `/api/automation/classification-rules/[id]` | PATCH DELETE | requireAuth | ai | hard delete, json unguarded |
| `/api/automation/exclusion-rules` | GET POST | requireAuth | email | json unguarded |
| `/api/automation/exclusion-rules/[id]` | PATCH DELETE | requireAuth | email | hard delete, json unguarded |
| `/api/automation/knowledge` | GET POST | requireAuth |  | json unguarded |
| `/api/automation/knowledge/[id]` | PATCH DELETE | requireAuth |  | json unguarded |
| `/api/automation/knowledge/docs` | GET POST | requireAuth | ai, s3 |  |
| `/api/automation/knowledge/docs/[id]` | GET PATCH DELETE | requireAuth |  | json unguarded |
| `/api/automation/knowledge/docs/[id]/file` | GET | requireAuth | s3 |  |
| `/api/automation/knowledge/docs/[id]/reread` | POST | requireAuth | s3 |  |
| `/api/automation/knowledge/import` | POST | requireAuth |  | json unguarded |
| `/api/automation/knowledge/reach` | GET | requireAuth |  |  |
| `/api/automation/rule-meta` | GET | requireAuth |  |  |
| `/api/automation/templates` | GET POST | requireAuth |  | json unguarded |
| `/api/automation/templates/[id]` | PATCH DELETE | requireAuth |  | json unguarded |
| `/api/automation/templates/options` | GET | requireAuth |  |  |
| `/api/automation/templates/seed` | POST | requireAuth |  |  |
| `/api/automation/test` | POST | requireSalesAdmin |  | json unguarded |
| `/api/bot/check-followup` | POST | requireAuth | ai, cron |  |
| `/api/bot/config` | GET PUT | requireAuth |  | json unguarded |
| `/api/bot/draft-follow-up` | POST | requireAuth | ai | json unguarded |
| `/api/bot/drafts/[id]` | GET PATCH | requireAuth |  | json unguarded |
| `/api/bot/drafts/[id]/cancel` | POST | requireAuth |  |  |
| `/api/bot/drafts/[id]/send` | POST | requireAuth |  |  |
| `/api/bot/drafts/[id]/sender` | POST | requireAuth |  |  |
| `/api/bot/process-note-actions` | POST | requireAuth | cron |  |
| `/api/bot/process-queue` | POST | **none** | cron |  |
| `/api/bot/queue` | GET | requireAuth |  |  |
| `/api/bot/rules/scheduling` | GET POST | requireAuth |  | json unguarded |
| `/api/bot/rules/scheduling/[id]` | PATCH DELETE | requireAuth |  | hard delete, json unguarded |
| `/api/sales/signature` | GET PUT | requireSalesAdmin, requireAuth |  |  |
| `/api/sales/voice` | GET POST | requireAuth | ai |  |
| `/api/sales/voice/batches/[id]` | PATCH | requireAuth |  |  |
| `/api/sales/voice/rebuild` | POST | requireAuth | ai |  |
| `/api/sales/voice/samples/[id]` | PATCH | requireAuth | ai |  |
| `/api/sales/voice/templates/[id]` | PATCH | requireAuth | ai |  |
| `/api/sales/voice/templates/refill` | POST | requireAuth | ai |  |
| `/api/users/signature` | GET PATCH | requireAuth |  |  |

**Models** (16): `SuppressionRule`, `BotConfig`, `SchedulingRule`, `VoiceBatch`, `VoiceSample`, `VoiceTemplateSuggestion`, `BotDraft`, `BotRule`, `AutomationLog`, `MessageTemplate`, `BotKnowledgeEntry`, `BotKnowledgeDoc`, `ActivityExclusionRule`, `ActivityClassificationRule`, `AgentRun`, `RuleProposal`

**Code markers**

- `src/lib/bot/ruleEngine.js:210` detail: `not run: contact lists are not built yet (would have added ${payload.contactName \|\| 'the contact'})`,

## Bid leveling and comparison

**API routes**

| Route | Methods | Guard | Uses | Flags |
|:-|:-|:-|:-|:-|
| `/api/admin/bid-comparison` | GET POST | requireStaff, requireAuth |  |  |
| `/api/admin/spec-swaps` | GET POST | requireAdmin |  |  |
| `/api/projects/[id]/bid-leveling` | GET POST | guardLeveling |  |  |
| `/api/projects/[id]/bid-leveling/[levelingId]` | GET PATCH | guardLeveling |  |  |
| `/api/projects/[id]/bid-leveling/[levelingId]/bids` | POST | guardLeveling |  |  |
| `/api/projects/[id]/bid-leveling/[levelingId]/bids/[bidId]` | PATCH | guardLeveling |  | hard delete |
| `/api/projects/[id]/bid-leveling/[levelingId]/export` | GET | guardLeveling |  |  |
| `/api/projects/[id]/peer-review` | GET POST | requireAuth |  | json unguarded |
| `/api/projects/[id]/peer-review/[itemId]` | PATCH DELETE | requireAuth |  | hard delete, json unguarded |
| `/api/projects/[id]/peer-review/import` | POST | requireAuth |  | json unguarded |
| `/api/projects/[id]/peer-review/parse-pdf` | POST | requireAuth | ai |  |
| `/api/projects/[id]/peer-review/pdf` | GET | requireAuth | pdf |  |

**Models** (11): `PeerReviewItem`, `BidLeveling`, `Bid`, `BidTotal`, `BidLine` (unused), `BidFlag`, `BidTypeAlias` (unused), `SpecSwap`, `BidPlaceholder` (unused), `BrandGrade`, `BidLineMark`

## CRM

**Pages**

| URL | Zone | Notes |
|:-|:-|:-|
| `/clients` | staff |  |
| `/clients/[id]` | staff |  |
| `/clients/new` | staff | client page |
| `/crm` | staff |  |
| `/crm/brief` | staff |  |
| `/crm/contacts` | staff |  |
| `/crm/intel` | staff |  |
| `/sales/activity` | staff | client page |
| `/sales/check-ins` | staff | client page |
| `/sales/visitors` | staff |  |

**API routes**

| Route | Methods | Guard | Uses | Flags |
|:-|:-|:-|:-|:-|
| `/api/clients` | GET POST | requireAuth |  | json unguarded |
| `/api/clients/[id]` | GET POST PATCH DELETE | requireAuth |  | json unguarded |
| `/api/clients/[id]/contacts` | GET POST | requireAuth |  | json unguarded |
| `/api/clients/[id]/contacts/[contactId]` | POST PATCH DELETE | requireAuth |  | hard delete, json unguarded |
| `/api/clients/[id]/contacts/[contactId]/work-history` | GET POST PATCH DELETE | requireAuth | ai |  |
| `/api/clients/[id]/export` | GET | requireAuth |  |  |
| `/api/clients/[id]/kb` | GET POST | requireAuth |  |  |
| `/api/clients/[id]/kb/[sectionId]` | PATCH DELETE | requireAuth |  | hard delete, json unguarded |
| `/api/clients/[id]/kb/[sectionId]/attachments` | POST | requireAuth |  |  |
| `/api/clients/[id]/kb/attachments/[attachmentId]` | DELETE | requireAuth |  | hard delete |
| `/api/clients/[id]/pipeline` | GET POST PATCH | requireAuth | s3 | hard delete, json unguarded |
| `/api/clients/[id]/playbook` | GET PUT | requireAuth |  | hard delete, json unguarded |
| `/api/clients/[id]/product-options` | GET POST PATCH DELETE | getSession | s3 | hard delete |
| `/api/clients/[id]/project-stats` | GET | requireAuth |  |  |
| `/api/clients/[id]/standard-fixtures` | GET POST PATCH DELETE | getSession | s3 | hard delete |
| `/api/clients/[id]/standards` | GET POST | requireAuth |  | json unguarded |
| `/api/clients/[id]/standards/concepts` | GET POST PATCH DELETE | getSession | s3 | hard delete, json unguarded |
| `/api/clients/[id]/standards/share` | GET POST DELETE | requireAuth |  | hard delete |
| `/api/clients/bulk` | POST | requireAuth |  |  |
| `/api/contact-tags` | GET POST | requireAuth |  | json unguarded |
| `/api/contact-tags/[id]` | PATCH DELETE | requireAuth |  | hard delete, json unguarded |
| `/api/contact-tags/[id]/links` | POST | requireAuth |  | hard delete |
| `/api/crm/cadence-rules` | GET POST | requireAuth |  | json unguarded |
| `/api/crm/cadence-rules/[id]` | PATCH DELETE | requireAuth |  | hard delete, json unguarded |
| `/api/crm/contacts` | GET POST | requireAuth |  | json unguarded |
| `/api/crm/contacts/[id]/cadence` | PATCH | requireAuth | ai | json unguarded |
| `/api/crm/contacts/[id]/personal` | GET POST PATCH | requireAuth |  |  |
| `/api/crm/contacts/bulk` | POST | requireAuth |  |  |
| `/api/crm/contacts/check-ins-due` | GET | requireAuth |  |  |
| `/api/crm/contacts/created-by-month` | GET | requireAuth |  |  |
| `/api/crm/contacts/quick` | POST | requireAuth |  |  |
| `/api/crm/duplicates` | GET POST | requireAuth |  |  |
| `/api/crm/intel` | GET | requireAuth |  |  |
| `/api/pipeline` | GET | requireAuth |  |  |
| `/api/sales/field-suggestions` | GET | requireAuth |  |  |
| `/api/sales/field-suggestions/[id]` | PATCH | requireAuth | email |  |
| `/api/sales/introductions` | GET | requireAuth |  |  |
| `/api/sales/introductions/[id]` | PATCH | requireAuth |  |  |
| `/api/tags` | GET POST | requireAuth |  | json unguarded |
| `/api/tags/[id]` | PATCH DELETE | requireAuth |  | hard delete, json unguarded |

**Models** (27): `Client`, `ClientPlaybook`, `PlaybookAssignment`, `PlaybookDistribution`, `PlaybookNote`, `PipelineUpload`, `PipelineProject`, `Contact`, `ContactEmployment`, `ClientKBSection`, `ClientKBAttachment`, `ClientStandardsShare`, `ClientStandardsAnswer`, `ClientProductOption`, `ClientStandardFixture`, `ClientAlias`, `RelationshipCadenceRule`, `DuplicateReview`, `ClientTag`, `ClientTagLink`, `ContactTag`, `ContactTagLink`, `ContactEmail`, `CrmMergeDecision`, `ContactPersonalFact`, `Introduction`, `ContactFieldSuggestion`

**Code markers**

- `src/app/(app)/clients/[id]/ClientDetailClient.jsx:2175` const isStub    = !sec.isCCT && total === 0;
- `src/app/(app)/clients/[id]/ClientDetailClient.jsx:2180` } ${isStub ? 'opacity-50' : ''}`}>
- `src/app/(app)/clients/[id]/ClientDetailClient.jsx:2183` {isStub ? (
- `src/app/(app)/clients/[id]/ClientDetailClient.jsx:2261` {/* Stub sections */}
- `src/app/(app)/clients/[id]/ClientDetailClient.jsx:2275` <WidgetEmpty>Questions coming soon</WidgetEmpty>

## Change orders

**Pages**

| URL | Zone | Notes |
|:-|:-|:-|
| `/project/[id]/change-orders/[coId]` | staff |  |
| `/share/co/[token]` | token |  |

**API routes**

| Route | Methods | Guard | Uses | Flags |
|:-|:-|:-|:-|:-|
| `/api/portal/projects/[id]/change-orders` | GET | requirePortalAuth |  |  |
| `/api/portal/projects/[id]/change-orders/[coId]/approve` | POST | requirePortalAuth |  |  |
| `/api/projects/[id]/change-orders` | GET POST | requirePermission, requireAuth |  |  |
| `/api/projects/[id]/change-orders/[coId]` | GET PATCH DELETE | requirePermission, requireAuth |  | hard delete |
| `/api/projects/[id]/change-orders/[coId]/approve` | POST | requirePermission |  |  |
| `/api/projects/[id]/change-orders/[coId]/option-groups` | POST | requirePermission |  |  |
| `/api/projects/[id]/change-orders/[coId]/option-groups/[groupId]` | PATCH DELETE | requirePermission |  | hard delete |
| `/api/projects/[id]/change-orders/[coId]/option-groups/[groupId]/line-items` | POST | requirePermission |  |  |
| `/api/projects/[id]/change-orders/[coId]/option-groups/[groupId]/line-items/[itemId]` | PATCH DELETE | requirePermission |  | hard delete |
| `/api/projects/[id]/change-orders/[coId]/option-groups/[groupId]/line-items/[itemId]/select` | POST | requirePermission |  |  |
| `/api/projects/[id]/change-orders/[coId]/option-groups/[groupId]/line-items/reorder` | PATCH | requirePermission |  |  |
| `/api/projects/[id]/change-orders/[coId]/pdf` | GET | requireAuth, requirePortalAuth |  |  |
| `/api/projects/[id]/change-orders/[coId]/push-to-budget` | POST | requirePermission |  |  |
| `/api/projects/[id]/change-orders/[coId]/send` | POST | requirePermission |  |  |
| `/api/projects/[id]/change-orders/[coId]/share` | GET POST DELETE | requirePermission, requireAuth |  | hard delete |
| `/api/projects/[id]/change-orders/products` | GET | requireAuth |  |  |
| `/api/projects/[id]/change-orders/tax-change` | GET POST | requirePermission, requireAuth |  |  |
| `/api/share/co/[token]` | GET | **none** |  |  |

**Models** (6): `ChangeOrder`, `ChangeOrderOptionGroup`, `ChangeOrderLineItem`, `ChangeOrderSend`, `ChangeOrderApproval`, `ChangeOrderShare`

**Code markers**

- `src/app/api/projects/[id]/change-orders/[coId]/push-to-budget/route.js:71` // We need a fixtureSchedule as sourceScheduleId, use or create a stub

## Client standards and playbook

**Models** (3): `DesignStandard`, `ILCSpec`, `StandardsAnswerConcept`

## Company portal

**Pages**

| URL | Zone | Notes |
|:-|:-|:-|
| `/portal/invite/[token]` | portal | client page |
| `/portal/login` | portal | client page |
| `/portal/projects` | portal | client page |
| `/portal/projects/[id]` | portal | client page |

**API routes**

| Route | Methods | Guard | Uses | Flags |
|:-|:-|:-|:-|:-|
| `/api/portal/auth/login` | POST | **none** |  | json unguarded |
| `/api/portal/auth/logout` | POST | **none** |  |  |
| `/api/portal/auth/me` | GET | requirePortalAuth |  |  |
| `/api/portal/invite/[token]` | GET POST | **none** |  | json unguarded |
| `/api/portal/projects/[id]` | GET | requirePortalAuth |  |  |
| `/api/portal/projects/[id]/budget` | GET | requirePortalAuth |  |  |
| `/api/portal/projects/[id]/conceptual-budget` | GET | requirePortalAuth |  |  |
| `/api/portal/projects/[id]/construction` | GET | requirePortalAuth |  |  |
| `/api/portal/projects/[id]/files` | GET | requirePortalAuth |  |  |
| `/api/portal/projects/[id]/files/[fileId]` | GET | requirePortalAuth | s3 |  |
| `/api/portal/projects/[id]/meeting-notes` | GET | requirePortalAuth |  |  |
| `/api/portal/projects/[id]/release-requests` | POST | requirePortalAuth |  | json unguarded |

**Models** (1): `PortalUser`

**Code markers**

- `src/app/api/portal/projects/[id]/release-requests/route.js:75` // TODO: send confirmation email to contractor (Step 5)

## Conferences and memberships

**Pages**

| URL | Zone | Notes |
|:-|:-|:-|
| `/admin/conference-load` | staff |  |
| `/sales/events` | staff |  |
| `/sales/events/[id]` | staff |  |
| `/sales/events/budget` | staff |  |
| `/sales/events/memberships` | staff |  |
| `/sales/events/plan` | staff |  |

**API routes**

| Route | Methods | Guard | Uses | Flags |
|:-|:-|:-|:-|:-|
| `/api/admin/conferences/load` | GET POST | requireAuth |  |  |
| `/api/conferences` | GET | requireAuth |  |  |
| `/api/conferences/editions/[id]` | GET PATCH | requireAuth |  | hard delete |
| `/api/conferences/export` | GET | requireAuth |  |  |
| `/api/conferences/memberships` | POST | requireAuth |  |  |
| `/api/conferences/memberships/[id]` | PATCH | requireAuth |  |  |
| `/api/conferences/plan` | PATCH | requireAuth |  | hard delete |

**Models** (8): `ConferenceSeries`, `ConferenceSeriesTag`, `ConferenceEdition`, `ConferenceEditionSource`, `ConferencePlan`, `ConferencePlanSetting`, `ConferenceMembership`, `ConferenceMembershipSeries` (unused)

**Code markers**

- `src/lib/conferences/seedData.js:72` {"series":{"slug":"hd-expo-conference","name":"HD Expo + Conference","organizer":"Hospitality Design (Emerald)","vertical":"Lighting/Design","focusTags":["DESIG
- `src/lib/conferences/seedData.js:78` {"series":{"slug":"leadingage-colorado-annual-conference-exhibition","name":"LeadingAge Colorado Annual Conference & Exhibition","organizer":"LeadingAge Colorad
- `src/lib/conferences/seedData.js:88` {"series":{"slug":"senior-living-executive-conference","name":"Senior Living Executive Conference (SLEC)","organizer":"Argentum / HMP Global","vertical":"Senior
- `src/lib/conferences/seedData.js:109` {"series":{"slug":"imn-build-to-rent-forum-fall","name":"IMN Build-to-Rent Forum (Fall)","organizer":"IMN (Informa Connect)","vertical":"BTR","focusTags":["CAPI

## Dashboards

**Pages**

| URL | Zone | Notes |
|:-|:-|:-|
| `/crm/dashboards` | staff |  |
| `/dashboard` | staff |  |
| `/dashboards/[section]` | staff |  |
| `/home` | staff |  |

**API routes**

| Route | Methods | Guard | Uses | Flags |
|:-|:-|:-|:-|:-|
| `/api/clients/[id]/first-project-cost` | GET | requireAuth |  |  |
| `/api/crm/dashboards` | GET POST | requireAuth |  | json unguarded |
| `/api/crm/dashboards/[id]` | PATCH DELETE | requireAuth |  | hard delete, json unguarded |
| `/api/crm/dashboards/[id]/run` | POST | requireAuth |  |  |
| `/api/crm/dashboards/[id]/widgets` | POST | requireAuth |  |  |
| `/api/crm/dashboards/[id]/widgets/[widgetId]` | POST PATCH DELETE | requireAuth |  | hard delete |
| `/api/dashboards` | GET POST | requireAuth |  |  |
| `/api/dashboards/[id]` | PATCH DELETE | requireAuth |  | hard delete |
| `/api/dashboards/[id]/fork` | POST | requireAuth |  |  |
| `/api/dashboards/[id]/hidden` | POST | requireAuth |  | hard delete |
| `/api/dashboards/[id]/share` | POST | requireAuth |  |  |
| `/api/dashboards/[id]/widgets` | POST | requireAuth |  |  |
| `/api/dashboards/[id]/widgets/[widgetId]` | PATCH DELETE | requireAuth |  | hard delete |
| `/api/dashboards/render` | POST | requireAuth |  |  |
| `/api/projects/[id]/figures` | GET POST | requireAuth |  |  |
| `/api/sales/first-project-cost` | GET | requireAuth |  |  |
| `/api/sales/meeting` | GET | requireAuth |  |  |
| `/api/sales/meeting/layout` | GET PUT DELETE | requireAuth |  | hard delete |

**Models** (11): `ChatConversation`, `ChatMessage`, `MeetingBrief`, `MeetingBriefFact` (unused), `MeetingBriefPoint`, `MeetingBriefCitation` (unused), `Dashboard`, `DashboardWidget`, `DashboardHiddenWidget`, `VerificationAction`, `DashboardShare`

**Code markers**

- `src/app/(app)/dashboards/[section]/MeetingDashboard.jsx:518` <h3 className="text-sm font-bold text-slate-500">Not built yet</h3>

## Drawings, fixture schedule, compliance

**Pages**

| URL | Zone | Notes |
|:-|:-|:-|
| `/knowledge-base/lpd-check` | staff |  |
| `/share/fixture/[token]` | token |  |
| `/share/standards/[token]` | token |  |

**API routes**

| Route | Methods | Guard | Uses | Flags |
|:-|:-|:-|:-|:-|
| `/api/annotations/[id]` | PATCH DELETE | requireAuth |  | hard delete |
| `/api/drawing-files/[id]` | PATCH | requireAuth |  |  |
| `/api/lpd-check` | POST | requireAuth |  |  |
| `/api/placed-fixtures/[id]` | PATCH DELETE | requireAuth |  | hard delete, json unguarded |
| `/api/projects/[id]/annotations` | GET POST | requireAuth |  |  |
| `/api/projects/[id]/areas` | GET POST | requireAuth |  |  |
| `/api/projects/[id]/code-check` | GET POST | requireAuth | ai |  |
| `/api/projects/[id]/drawing-submissions` | GET POST | requireAuth | s3 |  |
| `/api/projects/[id]/drawing-submissions/[submissionId]` | POST PATCH DELETE | requireAuth |  | json unguarded |
| `/api/projects/[id]/drawing-submissions/[submissionId]/files/[fileId]` | GET | requireAuth | s3 |  |
| `/api/projects/[id]/fixture-schedule` | GET POST PATCH | requireAuth |  | json unguarded |
| `/api/projects/[id]/fixture-schedule/export` | GET | requireAuth |  |  |
| `/api/projects/[id]/fixture-schedule/import` | POST | requireAuth |  | hard delete, json unguarded |
| `/api/projects/[id]/fixture-schedule/items/[itemId]` | PATCH DELETE | requireAuth |  | hard delete, json unguarded |
| `/api/projects/[id]/fixture-schedule/parse` | POST | requireAuth | ai | hard delete |
| `/api/projects/[id]/fixture-schedule/publish` | POST | requireAuth |  | hard delete |
| `/api/projects/[id]/fixture-schedule/share` | GET POST DELETE | requireAuth |  | hard delete |
| `/api/projects/[id]/fixture-schedule/versions/[versionId]` | PATCH DELETE | requireAuth |  | hard delete, json unguarded |
| `/api/projects/[id]/lpd-summary` | GET | requireAuth |  |  |
| `/api/projects/[id]/placed-fixtures` | GET POST | requireAuth |  |  |
| `/api/projects/[id]/rfi-extract` | POST | requireAuth | ai |  |
| `/api/projects/[id]/rfis` | GET POST | requireAuth |  | json unguarded |
| `/api/projects/[id]/rfis/[rfiId]` | GET PATCH | requireAuth |  | json unguarded |
| `/api/projects/[id]/rfis/[rfiId]/approve-draft` | POST | requireAuth |  | json unguarded |
| `/api/projects/[id]/rfis/[rfiId]/generate-draft` | POST | requireAuth | ai |  |
| `/api/projects/[id]/rfis/summary` | GET | requireAuth |  |  |
| `/api/projects/[id]/site/commit` | POST | requireAuth |  | json unguarded |
| `/api/projects/[id]/site/parse` | POST | requireAuth | ai, s3 |  |
| `/api/projects/[id]/unit-matrix` | GET | requireAuth |  |  |
| `/api/projects/[id]/unit-matrix/commit` | POST | requireAuth |  | hard delete, json unguarded |
| `/api/projects/[id]/unit-matrix/parse` | POST | requireAuth | ai, s3 |  |
| `/api/share/fixture/[token]` | GET PATCH | **none** |  |  |
| `/api/share/standards/[token]` | POST | **none** |  |  |

**Models** (12): `SiteFeature`, `FixtureSchedule`, `FixtureScheduleItem`, `PlacedFixture`, `FixtureScheduleShare`, `DrawingSubmission`, `DrawingFile`, `RFI`, `RFIActivity`, `RFIAttachment` (unused), `RFIImpactItem`, `DrawingRevisionFlag` (unused)

**Code markers**

- `src/lib/drawingExtract.js:632` // "BUILDING n: xx,xxx SF" totals and no grand total anywhere in 294 pages.

## Email and calendar

**Pages**

| URL | Zone | Notes |
|:-|:-|:-|
| `/admin/calendar-import` | staff |  |

**API routes**

| Route | Methods | Guard | Uses | Flags |
|:-|:-|:-|:-|:-|
| `/api/admin/calendar-import` | GET POST | requireAuth |  |  |
| `/api/email/ingest` | POST | requireAdmin | email |  |
| `/api/email/messages/[id]/tags` | POST | requireAuth |  |  |
| `/api/email/messages/[id]/tags/[tagKey]` | DELETE | requireAuth |  | hard delete |
| `/api/email/tags` | GET | requireAuth |  |  |
| `/api/projects/[id]/correspondence/threads` | GET | requireAuth |  |  |
| `/api/projects/[id]/correspondence/threads/[conversationId]` | GET | requireAuth |  |  |
| `/api/projects/[id]/correspondence/threads/[conversationId]/read` | PATCH | requireAuth |  |  |

**Models** (7): `EmailAccount`, `EmailMessage`, `EmailContactLink`, `EmailAttachment`, `EmailSignatureTemplate`, `EmailTag`, `EmailMessageTag`

**Code markers**

- `src/components/correspondence/CorrespondenceTab.jsx:297` <span className="text-[11px] text-[#b8b2a8] italic">Download coming soon</span>
- `src/components/correspondence/CorrespondenceTab.jsx:544` {/* Edit tags, disabled stub */}
- `src/components/correspondence/CorrespondenceTab.jsx:595` Replying from the platform is coming soon, use Outlook to respond for now
- `src/lib/calendar/personal.js:189` const todo = isNotAMeeting(event);
- `src/lib/calendar/personal.js:190` if (todo.notAMeeting) return { excluded: true, kind: 'not-a-meeting', reason: todo.reason };

## Expenses

**Pages**

| URL | Zone | Notes |
|:-|:-|:-|
| `/sales/activity/expenses` | staff | client page |
| `/sales/activity/expenses/snap` | staff | client page |

**API routes**

| Route | Methods | Guard | Uses | Flags |
|:-|:-|:-|:-|:-|
| `/api/sales/annual-budgets` | PATCH | requireAuth |  |  |
| `/api/sales/expenses` | GET POST | requireAuth |  |  |
| `/api/sales/expenses/[id]` | POST PATCH DELETE | requireAuth |  |  |
| `/api/sales/expenses/receipts` | GET POST | requireStaff | s3 |  |
| `/api/sales/expenses/receipts/[id]` | POST DELETE | requireStaff |  |  |
| `/api/sales/expenses/receipts/[id]/confirm` | POST | requireStaff |  |  |
| `/api/sales/expenses/receipts/[id]/file` | GET | requireStaff | s3 |  |
| `/api/sales/expenses/receipts/[id]/read` | POST | requireStaff | ai |  |
| `/api/sales/expenses/summary` | GET | requireAuth |  |  |

**Models** (3): `SalesAnnualBudget`, `SalesExpense`, `ExpenseReceipt`

## Market Intel

**Pages**

| URL | Zone | Notes |
|:-|:-|:-|
| `/market-intel` | staff | client page |
| `/market-intel/forecast` | staff | client page |
| `/market-intel/permits` | staff | client page |
| `/market-intel/sources` | staff | client page |

**API routes**

| Route | Methods | Guard | Uses | Flags |
|:-|:-|:-|:-|:-|
| `/api/cron/market-intel` | GET | requireAuth | cron |  |
| `/api/market-intel/ask` | GET POST | requireAuth | ai |  |
| `/api/market-intel/ask/[id]` | PATCH | requireAuth |  |  |
| `/api/market-intel/ask/rows/[id]` | PATCH | requireAuth |  |  |
| `/api/market-intel/clients` | GET | requireAuth |  |  |
| `/api/market-intel/forecast` | GET | requireAuth |  |  |
| `/api/market-intel/macro` | GET POST | requireAuth |  |  |
| `/api/market-intel/owner-lookup` | POST | requireAuth | ai |  |
| `/api/market-intel/permits/poll` | POST | getSession | cron |  |
| `/api/market-intel/poll` | POST | getSession | cron |  |
| `/api/market-intel/retag` | GET POST | requireAuth |  |  |
| `/api/market-intel/rules` | GET PATCH | requireAuth |  |  |
| `/api/market-intel/signals` | GET | requireAuth |  |  |
| `/api/market-intel/signals/[id]` | PATCH | requireAuth |  | json unguarded |
| `/api/market-intel/signals/[id]/add-to-crm` | POST | requireAuth |  |  |
| `/api/market-intel/signals/[id]/feedback` | POST | requireAuth |  |  |
| `/api/market-intel/sources` | GET POST | requireAuth, getSession |  | json unguarded |
| `/api/market-intel/sources/[id]` | PATCH DELETE | requireSourceAdmin, requireAuth, getSession |  | hard delete, json unguarded |
| `/api/market-intel/sources/seed` | POST | requireAuth |  |  |
| `/api/market-intel/tags` | GET | requireAuth |  |  |

**Models** (10): `MarketSource`, `MarketSignal`, `SignalFeedback`, `MarketTag`, `MarketSignalTag`, `MarketQuestion`, `MarketAnswerRow`, `MarketAnswerYear` (unused), `MarketAnswerSource`, `MacroStat`

**Code markers**

- `src/lib/market-intel/permits.js:124` const todo = want.filter(r => !known.has(keyOf(r)));
- `src/lib/market-intel/permits.js:126` for (let i = 0; i < todo.length; i += 4) {
- `src/lib/market-intel/permits.js:128` const batch = await Promise.all(todo.slice(i, i + 4).map(async (r) => {

## My Desk and tasks

**Pages**

| URL | Zone | Notes |
|:-|:-|:-|
| `/admin/tasks` | staff |  |
| `/sales/desk` | staff | client page |

**API routes**

| Route | Methods | Guard | Uses | Flags |
|:-|:-|:-|:-|:-|
| `/api/sales/desk` | GET | requireAuth |  |  |
| `/api/sales/desk/[id]` | PATCH | requireAuth |  |  |
| `/api/sales/desk/briefing` | GET | requireAuth | ai |  |
| `/api/sales/desk/check-in/[contactId]` | POST | requireAuth | ai |  |
| `/api/sales/desk/meeting/[noteId]` | POST | requireAuth |  |  |
| `/api/sales/desk/pool/[projectId]` | POST | requireAuth |  |  |
| `/api/sales/desk/pool/compare` | POST | requireAuth |  |  |
| `/api/sales/desk/review` | GET | requireAuth |  |  |
| `/api/sales/desk/review/[id]` | POST | requireAuth |  |  |
| `/api/sales/desk/take/[contactId]` | POST | requireAuth | ai |  |
| `/api/sales/task-tags` | GET POST | requireAuth |  |  |
| `/api/sales/tasks` | GET POST | requireAuth |  |  |
| `/api/sales/tasks/[id]` | PATCH | requireAuth |  |  |
| `/api/sales/tasks/lookup` | GET | requireAuth |  |  |
| `/api/tasks` | GET POST | requireAuth |  |  |
| `/api/tasks/[id]` | PATCH DELETE | requireAuth |  | hard delete |
| `/api/tasks/[id]/attachments` | POST | requireAuth |  |  |
| `/api/tasks/attachments/[attachmentId]` | DELETE | requireAuth |  | hard delete |

**Models** (8): `Task`, `TaskAttachment`, `SalesTask`, `SalesTaskClient` (unused), `SalesTaskContact` (unused), `SalesTaskProject` (unused), `SalesTaskTag`, `SalesTaskTagLink` (unused)

**Code markers**

- `src/app/(app)/admin/tasks/TasksClient.jsx:33` { id: 'TODO',        label: 'To Do',       color: '#64748b', bg: '#f1f5f9', border: '#e2e8f0' },
- `src/app/(app)/admin/tasks/TasksClient.jsx:164` status:      task?.status      \|\| 'TODO',
- `src/app/(app)/admin/tasks/TasksClient.jsx:548` <button onClick={() => setModal({ task: null, defaultStatus: 'TODO' })}
- `src/app/(app)/admin/tasks/TasksClient.jsx:598` onSave={modal.task ? handleUpdate : data => handleCreate({ ...data, status: data.status \|\| modal.defaultStatus \|\| 'TODO' })}
- `src/app/api/tasks/route.js:46` status: status \|\| 'TODO',
- `src/lib/desk/tasks.js:13` { key: 'TODO',    label: 'To do' },
- `src/lib/desk/tasks.js:108` return row.status === 'DONE' ? 'TODO' : row.status;
- `src/lib/desk/tasksServer.js:96` status: isWaitExecutor(typeBy.get(s.type)?.executor) ? 'WAITING' : 'TODO',
- `src/lib/desk/tasksServer.js:228` const status = data.status \|\| 'TODO';

## Notes

**Pages**

| URL | Zone | Notes |
|:-|:-|:-|
| `/crm/notes` | staff |  |

**API routes**

| Route | Methods | Guard | Uses | Flags |
|:-|:-|:-|:-|:-|
| `/api/crm/note-action-types` | GET POST PATCH DELETE | requireSalesAdmin, requireAuth |  | hard delete, json unguarded |
| `/api/crm/notes` | GET POST | requireAuth |  | json unguarded |
| `/api/crm/notes/[id]` | GET POST PATCH DELETE | requireAuth |  | hard delete, json unguarded |
| `/api/crm/notes/[id]/actions` | GET POST PATCH | requireAuth | ai | hard delete, json unguarded |
| `/api/crm/notes/[id]/draft-outreach` | GET POST | requireAuth | ai | json unguarded |
| `/api/crm/notes/[id]/history` | GET | requireAuth |  |  |
| `/api/crm/notes/[id]/meeting-prep` | GET POST | requireAuth |  |  |
| `/api/crm/notes/bulk` | POST | requireAuth |  |  |
| `/api/crm/notes/drafts-reminder` | GET | requireAuth |  |  |
| `/api/crm/notes/upcoming` | GET | requireAuth |  |  |
| `/api/notes/search` | GET | requireAuth |  |  |
| `/api/projects/[id]/meeting-notes` | GET POST | requireAuth | email | json unguarded |
| `/api/projects/[id]/meeting-notes/[noteId]` | POST PATCH DELETE | requireAuth | email | json unguarded |

**Models** (8): `Note`, `NoteAction`, `NoteOwner`, `NoteChange`, `NoteActionType`, `NoteContact`, `NoteClient`, `NoteProject` (unused)

**Code markers**

- `src/app/api/crm/note-action-types/route.js:93` // DELETE, remove a type (admin). ?key=XXX

## Notifications and scheduled jobs

**API routes**

| Route | Methods | Guard | Uses | Flags |
|:-|:-|:-|:-|:-|
| `/api/admin/alert-feedback` | GET | requireAdmin | email |  |
| `/api/alerts` | GET PATCH DELETE | requireAuth |  | hard delete, json unguarded |
| `/api/alerts/feedback` | POST | requireAuth | email |  |
| `/api/alerts/mute` | GET POST | requireAuth |  | hard delete |
| `/api/cron/client-review-check` | GET | **none** | cron |  |
| `/api/cron/digest` | GET | **none** | email, cron | hard delete |
| `/api/cron/market-owner-lookup` | GET | requireAuth | ai, cron |  |
| `/api/cron/meeting-prep` | GET | requireAuth | cron |  |
| `/api/cron/note-reminders` | GET | requireAuth | ai, email, cron |  |
| `/api/cron/threshold` | GET | **none** | email, cron |  |
| `/api/cron/unfinished-drafts` | GET | requireAuth | cron |  |
| `/api/cron/usage-rollup` | GET | **none** | cron |  |
| `/api/cron/weekly-roundup` | GET | requireAuth | cron |  |
| `/api/notifications/opened/[token]` | GET | **none** |  |  |
| `/api/projects/[id]/notification-logs` | GET | requireAuth |  |  |
| `/api/projects/[id]/notifications` | GET PATCH | requireAuth |  | json unguarded |

**Models** (4): `NotificationLog`, `NotificationQueue`, `AlertFeedback`, `AlertMute`

**Code markers**

- `src/app/api/cron/digest/route.js:21` // TODO: Microsoft Graph API
- `src/components/notifications/NotificationSettingsTab.jsx:153` <span className="text-[11px] text-slate-500 font-semibold px-2 py-0.5 rounded border border-slate-200">Coming soon</span>

## Other

**Pages**

| URL | Zone | Notes |
|:-|:-|:-|
| `/` | root |  |
| `/share/[token]` | token |  |

**API routes**

| Route | Methods | Guard | Uses | Flags |
|:-|:-|:-|:-|:-|
| `/api/share/[token]` | POST | **none** |  |  |

**Models** (2): `ConfirmedGuess`, `FuzzyMatchFeedback`

**Code markers**

- `src/components/files/FileDropZone.jsx:447` title="Edit tags, coming soon"
- `src/components/GlobalAIButton.jsx:33` {/* Coming soon body */}
- `src/components/PriorityStack.jsx:7` todo: { label: 'Not Started', dot: 'bg-slate-300',  text: 'text-slate-500',  pill: 'bg-slate-50 border-slate-200' },
- `src/components/PriorityStack.jsx:9` const CYCLE = { todo: 'wip', wip: 'done', done: 'todo' };
- `src/components/PriorityStack.jsx:69` const optimistic = { id: tempId, name: newName.trim(), status: 'todo', sortOrder: items.length };
- `src/components/PriorityStack.jsx:137` const cfg = STATUS[it.status] ?? STATUS.todo;
- `src/lib/notify.js:7` * EXTERNAL means email to the client. That is STUBBED until Microsoft Outlook
- `src/lib/notify.js:18` * TODO (Outlook integration):
- `src/lib/notify.js:19` *   Replace the stub in sendEmail() with Microsoft Graph API:
- `src/lib/notify.js:39` // ── Email stub ────────────────────────────────────────────────────────────────
- `src/lib/notify.js:56` // TODO: Microsoft Graph API implementation
- `src/lib/ontology/objects/crm.js:43` 'An internal ILC to-do with an owner and a due date. status is TODO \| IN_PROGRESS \| IN_REVIEW \| DONE ' +
- `src/lib/ontology/objects/crm.js:51` status:      { type: 'string',   sensitivity: 'ilc_only', desc: 'TODO \| IN_PROGRESS \| IN_REVIEW \| DONE' },

## Pricing, QC, verification

**Pages**

| URL | Zone | Notes |
|:-|:-|:-|
| `/admin/pricing` | staff |  |
| `/admin/qc` | staff |  |

**API routes**

| Route | Methods | Guard | Uses | Flags |
|:-|:-|:-|:-|:-|
| `/api/admin/pricing` | GET PUT | requirePermission |  | json unguarded |
| `/api/calibration/actuals` | POST | requireAuth |  | hard delete |
| `/api/calibration/apply-rate` | POST | requireAuth |  |  |
| `/api/calibration/backfill` | POST | requireAuth |  |  |
| `/api/calibration/confirm-guess` | POST | requireAuth |  |  |
| `/api/pricing/price-check` | GET | requireAuth |  |  |
| `/api/pricing/price-history` | POST | requireAuth |  | json unguarded |
| `/api/pricing/retail-cache` | GET | requireAuth |  |  |
| `/api/pricing/retail-lookup` | POST | requireAuth |  | json unguarded |
| `/api/projects/[id]/budget-qc` | GET | requireAuth |  |  |
| `/api/projects/[id]/budget-qc/assign` | PATCH | requireAuth |  | json unguarded |
| `/api/projects/[id]/budget-qc/items/[itemKey]` | PATCH | requireAuth |  | json unguarded |
| `/api/qc/media` | GET | requireAuth |  |  |
| `/api/qc/reports` | GET POST | requireAuth | s3 |  |
| `/api/qc/reports/[id]` | GET POST PATCH DELETE | requireAuth | s3 | json unguarded |
| `/api/verification` | GET | requireAuth |  |  |
| `/api/verification/dismiss` | POST | requireAuth |  |  |

**Models** (3): `BudgetQCChecklist`, `BudgetQCItem`, `CalibrationSample`

**Code markers**

- `src/components/qc/QcCapture.jsx:144` <div className="text-[11px] text-slate-400">Coming soon</div>

## Products and fixture library

**Pages**

| URL | Zone | Notes |
|:-|:-|:-|
| `/fixture-library` | staff |  |
| `/manufacturers` | staff |  |
| `/manufacturers/[id]` | staff |  |
| `/products` | staff |  |
| `/products/[id]` | staff |  |

**API routes**

| Route | Methods | Guard | Uses | Flags |
|:-|:-|:-|:-|:-|
| `/api/fixture-library/fixture-types` | GET | requireAuth |  |  |
| `/api/fixture-library/fixture-types/[code]` | PATCH | requirePermission |  | json unguarded |
| `/api/fixture-library/fixture-types/import` | POST | requirePermission |  |  |
| `/api/fixture-library/master-types/[code]` | PATCH | requirePermission |  | json unguarded |
| `/api/fixture-library/specs/[id]` | PATCH | requirePermission |  | json unguarded |
| `/api/manufacturers` | GET POST | requirePermission, requireAuth |  | json unguarded |
| `/api/manufacturers/[id]` | GET PATCH DELETE | requireStaff, requirePermission, requireAuth |  | hard delete, json unguarded |
| `/api/manufacturers/[id]/products` | GET POST | requirePermission, requireAuth |  | json unguarded |
| `/api/manufacturers/[id]/products/[productId]` | GET POST PATCH DELETE | requirePermission, requireAuth |  | json unguarded |
| `/api/manufacturers/bulk` | POST | requireStaff, requirePermission |  |  |
| `/api/master-types` | GET | requireAuth |  |  |
| `/api/products` | GET | requireAuth |  |  |
| `/api/products/[id]` | GET POST PATCH DELETE | requirePermission, requireAuth |  | json unguarded |
| `/api/products/bulk` | POST | requirePermission |  |  |

**Models** (8): `Manufacturer`, `ManufacturerProduct`, `MasterType`, `FixtureType`, `ProductPriceHistory`, `ProductPriceCache`, `FixtureKind`, `FixtureKindWord`

## Project hub, bid matrix, budgets

**Pages**

| URL | Zone | Notes |
|:-|:-|:-|
| `/my-jobs` | staff |  |
| `/open` | staff |  |
| `/pre-con` | staff |  |
| `/project/[id]` | staff |  |
| `/project/[id]/summary` | staff |  |
| `/project/[id]/tracker` | staff |  |
| `/project/[id]/wizard` | staff |  |
| `/project/new` | staff |  |

**API routes**

| Route | Methods | Guard | Uses | Flags |
|:-|:-|:-|:-|:-|
| `/api/projects` | GET POST | requireAuth |  | json unguarded |
| `/api/projects/[id]` | GET POST PATCH DELETE | requireAuth | email | json unguarded |
| `/api/projects/[id]/activity` | GET | requireAuth |  |  |
| `/api/projects/[id]/analyze-contract` | POST | requireAuth | ai, s3 |  |
| `/api/projects/[id]/assignees` | GET POST DELETE | requireAuth |  | hard delete, json unguarded |
| `/api/projects/[id]/budget` | GET | requireAuth |  |  |
| `/api/projects/[id]/budget-amounts` | GET POST | requireAuth |  |  |
| `/api/projects/[id]/budget/pdf` | GET | requireAuth | pdf |  |
| `/api/projects/[id]/chat` | POST | requireAuth | ai | json unguarded |
| `/api/projects/[id]/chat/conversations` | GET DELETE | requireAuth |  | hard delete |
| `/api/projects/[id]/chat/conversations/[convId]` | GET DELETE | requireAuth |  | hard delete |
| `/api/projects/[id]/contacts` | GET POST | requireAuth | email | json unguarded |
| `/api/projects/[id]/contacts/[contactId]` | PATCH DELETE | requireAuth |  | hard delete, json unguarded |
| `/api/projects/[id]/contacts/[contactId]/invite` | POST | requireAuth | email |  |
| `/api/projects/[id]/data` | PUT PATCH | requireAuth |  | json unguarded |
| `/api/projects/[id]/design-bid-matrix` | GET | requireAuth |  |  |
| `/api/projects/[id]/design-bid-matrix/[matrixId]` | POST PATCH DELETE | requireAuth |  | json unguarded |
| `/api/projects/[id]/design-bid-matrix/duplicate` | POST | requireAuth |  |  |
| `/api/projects/[id]/design-bid-matrix/export` | GET | requireAuth |  |  |
| `/api/projects/[id]/design-bid-matrix/items/[itemId]` | PATCH | requireAuth |  | json unguarded |
| `/api/projects/[id]/design-bid-matrix/pdf` | GET | requireAuth | pdf |  |
| `/api/projects/[id]/duplicate` | POST | requireAuth |  |  |
| `/api/projects/[id]/error-radar` | GET | requireAuth |  |  |
| `/api/projects/[id]/estimate` | GET POST | requireAuth |  | json unguarded |
| `/api/projects/[id]/files` | GET POST | requireAuth | email, s3 |  |
| `/api/projects/[id]/files/[fileId]` | GET POST PATCH DELETE | requireAuth | s3 | json unguarded |
| `/api/projects/[id]/files/[fileId]/reparse` | POST | requireAuth | ai, s3 |  |
| `/api/projects/[id]/people` | GET POST DELETE | requireAuth |  | hard delete, json unguarded |
| `/api/projects/[id]/responses` | GET PUT | requireAuth |  | json unguarded |
| `/api/projects/[id]/share` | GET POST | requireAuth |  | json unguarded |
| `/api/projects/[id]/tracker` | GET POST PATCH | requireAuth |  | json unguarded |
| `/api/projects/[id]/tracker/export` | GET | requireAuth |  |  |
| `/api/projects/[id]/tracker/extract` | POST | requireAuth | ai, s3 |  |
| `/api/projects/[id]/tracker/import-toc` | GET POST | requireAuth | ai, s3 |  |
| `/api/projects/[id]/tracker/items` | POST DELETE | requireAuth |  | json unguarded |
| `/api/projects/[id]/tracker/items/[itemId]` | PATCH DELETE | requireAuth |  | json unguarded |
| `/api/projects/[id]/tracker/open-items` | GET | requireAuth |  |  |
| `/api/projects/[id]/tracker/reviews` | POST | requireAuth |  | json unguarded |
| `/api/projects/[id]/tracker/reviews/[reviewId]` | PATCH DELETE | requireAuth |  | json unguarded |
| `/api/projects/[id]/tracker/reviews/[reviewId]/respond` | POST PATCH | requireAuth | ai | json unguarded |
| `/api/projects/[id]/tracker/submissions` | POST | requireAuth | email | json unguarded |
| `/api/projects/[id]/tracker/submissions/[submissionId]` | PATCH DELETE | requireAuth |  | json unguarded |

**Models** (25): `ProjectContact`, `Project`, `ProjectBudgetAmount`, `ProjectStatusEvent`, `ProjectFile`, `ProjectAssignee`, `ProjectAccess`, `ProjectData`, `ProjectFigureSource`, `ProjectAreaCheck`, `ProjectShare`, `SubmittalTracker`, `SubmittalItem`, `SubmittalSubmission`, `SubmittalItemVersion`, `SubmittalReview`, `SubmittalResponse`, `SubmittalOpenItem`, `ProjectActivity`, `DesignBidMatrix`, `ProjectStandardsOverride` (unused), `DesignBidMatrixItem`, `ProjectNotificationConfig`, `ProjectExternalContact`, `ProjectUnitType`

**Code markers**

- `src/app/(app)/project/[id]/ProjectHubClient.jsx:40` // import ParametricEstimatePanel from './ParametricEstimatePanel'; // TODO: restore when Estimate absorbs into Drawings (Feature 1)
- `src/app/(app)/project/[id]/ProjectHubClient.jsx:1782` {/* TODO: estimate tab removed per nav refactor, content to be absorbed into Drawings tab (Feature 1) */}
- `src/app/api/projects/[id]/contacts/route.js:23` // TODO: Microsoft Graph API sendMail
- `src/app/api/projects/[id]/contacts/[contactId]/invite/route.js:46` // TODO: Microsoft Graph API sendMail
- `src/app/api/projects/[id]/share/route.js:33` // TODO: wire up an email provider (Resend / SendGrid / Postmark) here.
- `src/app/api/projects/[id]/tracker/import-toc/route.js:195` // GET /api/projects/[id]/tracker/import-toc?fileId=xxx, preview without creating

## Proposals

**Pages**

| URL | Zone | Notes |
|:-|:-|:-|
| `/sales/proposals` | staff |  |
| `/sales/proposals/templates` | staff |  |

**API routes**

| Route | Methods | Guard | Uses | Flags |
|:-|:-|:-|:-|:-|
| `/api/proposal-rates` | GET PUT | requireAdmin |  | json unguarded |
| `/api/proposal-templates` | GET POST | requireAuth |  | json unguarded |
| `/api/proposal-templates/[id]` | GET PUT DELETE | requireAuth |  | hard delete, json unguarded |
| `/api/proposal-templates/[id]/duplicate` | POST | requireAuth |  |  |
| `/api/proposals` | GET POST | requireAuth |  | json unguarded |
| `/api/proposals/[id]` | GET PUT | requireAuth |  | json unguarded |
| `/api/proposals/[id]/accept` | POST | requireAdmin |  |  |
| `/api/proposals/[id]/decline` | POST | requireAuth |  |  |
| `/api/proposals/[id]/line-items` | POST | requireAuth |  | hard delete, json unguarded |
| `/api/proposals/[id]/pdf` | GET | requireAuth |  |  |
| `/api/proposals/[id]/send` | POST | requireAuth |  | json unguarded |

**Models** (6): `Proposal`, `ProposalLineItem`, `ProposalTemplate`, `ProposalTemplateTask`, `ProposalRate`, `ProposalSend`

## Public conceptual budget and intake

**Pages**

| URL | Zone | Notes |
|:-|:-|:-|
| `/admin/intake` | staff |  |
| `/conceptual_budget` | public |  |
| `/conceptual_budget/my-budgets` | public |  |
| `/e/u/[token]` | token |  |

**API routes**

| Route | Methods | Guard | Uses | Flags |
|:-|:-|:-|:-|:-|
| `/api/admin/intake/[id]` | PATCH | requireIntakeReviewer |  | json unguarded |
| `/api/admin/intake/[id]/create-project` | POST | requireIntakeReviewer |  |  |
| `/api/admin/intake/[id]/invite` | POST | requireAdmin | email |  |
| `/api/admin/intake/[id]/link` | GET POST | requireIntakeReviewer |  |  |
| `/api/admin/intake/access` | GET PUT | requireAdmin |  |  |
| `/api/admin/intake/drafts/[id]` | PATCH | requireIntakeReviewer |  |  |
| `/api/automation/intake/calendar` | POST | requireSalesAdmin | cron |  |
| `/api/automation/intake/email` | POST | requireSalesAdmin | cron |  |
| `/api/e/c/[token]/[blockId]` | GET | **none** | email |  |
| `/api/e/o/[token]` | GET | **none** |  |  |
| `/api/e/u/[token]` | POST | **none** |  |  |
| `/api/intake/access` | POST | **none** |  |  |
| `/api/intake/bug-report` | POST | **none** | s3 | json unguarded |
| `/api/intake/draft` | GET POST | requirePublicBudgetAccess |  |  |
| `/api/intake/draft/email` | POST | requirePublicBudgetAccess | email |  |
| `/api/intake/estimate` | POST | requirePublicBudgetAccess |  |  |
| `/api/intake/parse` | POST | requirePublicBudgetAccess | ai, s3 |  |
| `/api/intake/pdf` | POST | requirePublicBudgetAccess | pdf |  |
| `/api/intake/portal/compare` | POST | requirePublicBudgetAccess |  |  |
| `/api/intake/portal/copy` | POST | requirePublicBudgetAccess |  |  |
| `/api/intake/portal/history` | POST | requirePublicBudgetAccess |  |  |
| `/api/intake/portal/list` | POST | requirePublicBudgetAccess |  |  |
| `/api/intake/portal/match` | POST | requirePublicBudgetAccess |  |  |
| `/api/intake/portal/names` | POST | requirePublicBudgetAccess |  |  |
| `/api/intake/submit` | POST | requirePublicBudgetAccess | email, s3 |  |
| `/api/intake/visit` | POST | **none** |  |  |

**Models** (10): `QuestionnaireResponse`, `ConceptualSubmission`, `ConceptualSubmissionAnswer` (unused), `ConceptualDraft`, `ConceptualDraftSave`, `ConceptualDraftChange` (unused), `ConceptualDraftMatch`, `ConceptualDraftField`, `ConceptualVisit`, `ConceptualSignIn`

**Code markers**

- `src/app/api/admin/intake/[id]/invite/route.js:78` // TODO: Microsoft Graph API sendMail
- `src/app/conceptual_budget/IntakeClient.jsx:1881` <button type="button" disabled aria-disabled="true" title="Coming soon, email isn't connected yet."

## RFQs and sales reps

**Pages**

| URL | Zone | Notes |
|:-|:-|:-|
| `/admin/offices` | staff |  |
| `/admin/sales-reps-import` | staff |  |
| `/sales-reps` | staff |  |
| `/sales-reps/[id]` | staff |  |

**API routes**

| Route | Methods | Guard | Uses | Flags |
|:-|:-|:-|:-|:-|
| `/api/admin/rfq-freight` | GET PUT | requireAdmin |  |  |
| `/api/admin/sales-reps-import` | GET POST | requireAdmin |  | hard delete |
| `/api/manufacturer-reps` | POST | requireStaff |  | json unguarded |
| `/api/manufacturer-reps/[id]` | PATCH DELETE | requireStaff |  | hard delete, json unguarded |
| `/api/offices` | GET | requireStaff |  |  |
| `/api/offices/[id]` | PATCH | requireStaff |  | json unguarded |
| `/api/projects/[id]/rfqs` | GET POST | requireStaff |  | hard delete, json unguarded |
| `/api/projects/[id]/rfqs/[rfqId]` | GET PATCH | requireStaff |  | json unguarded |
| `/api/projects/[id]/rfqs/[rfqId]/pdf` | GET | requireStaff | pdf |  |
| `/api/projects/[id]/rfqs/quotes` | GET POST PATCH | requireStaff | ai, s3 | json unguarded |
| `/api/projects/[id]/rfqs/quotes/read` | POST | requireStaff | ai, s3 |  |
| `/api/sales-reps` | GET POST | requireStaff |  | json unguarded |
| `/api/sales-reps/[id]` | GET PATCH | requireStaff |  | json unguarded |
| `/api/sales-reps/bulk` | POST | requireStaff |  |  |

**Models** (13): `OurOffice`, `SalesRep`, `RepEmail`, `ManufacturerRep`, `ProjectRepPick`, `RfqRound`, `Rfq`, `RfqLine`, `RfqQuote`, `RfqQuoteLine`, `RfqQuoteLink`, `RfqQuoteFreight`, `RfqQuoteTerm` (unused)

## Sales Docs and campaigns

**Pages**

| URL | Zone | Notes |
|:-|:-|:-|
| `/sales/docs` | staff | client page |
| `/sales/docs/[docId]` | staff | client page |
| `/sales/docs/campaigns` | staff | client page |
| `/sales/docs/campaigns/[id]` | staff | client page |
| `/sales/docs/engagement` | staff |  |
| `/sales/docs/links` | staff | client page |
| `/sales/docs/lists` | staff | client page |
| `/sales/docs/lists/[id]` | staff | client page |
| `/sales/docs/spaces` | staff | client page |
| `/sales/docs/spaces/[spaceId]` | staff | client page |
| `/share/docs/[token]` | token |  |

**API routes**

| Route | Methods | Guard | Uses | Flags |
|:-|:-|:-|:-|:-|
| `/api/campaign-lists` | GET POST | requireSalesDocsUser |  |  |
| `/api/campaign-lists/[id]` | GET PATCH | requireSalesDocsUser |  |  |
| `/api/campaign-lists/[id]/members` | POST | requireSalesDocsUser |  |  |
| `/api/campaign-lists/options` | GET | requireSalesDocsUser |  |  |
| `/api/campaign-suppressions` | GET POST PATCH | requireSalesDocsUser |  |  |
| `/api/campaigns` | GET POST | requireSalesDocsUser |  |  |
| `/api/campaigns/[id]` | GET PATCH | requireSalesDocsUser | email |  |
| `/api/campaigns/[id]/blocks` | PUT | requireSalesDocsUser | email |  |
| `/api/campaigns/[id]/preview` | GET | requireSalesDocsUser | email |  |
| `/api/campaigns/[id]/results` | GET | requireSalesDocsUser |  |  |
| `/api/campaigns/[id]/send` | POST | requireSalesDocsUser | email |  |
| `/api/campaigns/settings` | GET PATCH | requireSalesDocsUser | email |  |
| `/api/sales-docs` | GET POST | requireSalesDocsUser |  | hard delete |
| `/api/sales-docs/[docId]` | GET PATCH | requireSalesDocsUser |  |  |
| `/api/sales-docs/[docId]/versions` | POST | requireSalesDocsUser |  | hard delete |
| `/api/sales-docs/engagement` | GET | requireSalesDocsUser |  |  |
| `/api/sales-docs/folders` | GET POST | requireSalesDocsUser |  |  |
| `/api/sales-docs/folders/[folderId]` | PATCH | requireSalesDocsUser |  |  |
| `/api/sales-docs/links` | GET POST | requireSalesDocsUser |  |  |
| `/api/sales-docs/links/[linkId]` | PATCH | requireSalesDocsUser |  |  |
| `/api/sales-docs/spaces` | GET POST | requireSalesDocsUser |  |  |
| `/api/sales-docs/spaces/[spaceId]` | GET PATCH | requireSalesDocsUser |  | hard delete |
| `/api/sales-docs/versions/[versionId]/file` | GET | requireSalesDocsUser | s3 |  |
| `/api/sales-docs/versions/[versionId]/override` | POST | requireSalesDocsUser |  |  |
| `/api/sales-docs/versions/[versionId]/process` | GET POST | requireSalesDocsUser |  |  |
| `/api/sales-docs/versions/[versionId]/sheets/[index]` | GET | requireSalesDocsUser | s3 |  |
| `/api/sales-docs/views/[viewId]` | GET | requireSalesDocsUser |  |  |
| `/api/share/docs/[token]` | GET | requirePass |  |  |
| `/api/share/docs/[token]/download` | GET | requirePass | s3 |  |
| `/api/share/docs/[token]/file` | GET | requirePass | s3 |  |
| `/api/share/docs/[token]/gate` | POST | **none** |  |  |
| `/api/share/docs/[token]/ping` | POST | requirePass |  |  |
| `/api/share/docs/[token]/rendered` | GET | requirePass | s3 |  |
| `/api/share/docs/[token]/views` | POST | requirePass |  |  |

**Models** (20): `SalesDocFolder`, `SalesDoc`, `SalesDocVersion`, `SalesDocSheet`, `SalesDocScanHit`, `SalesDocSpace`, `SalesDocSpaceItem`, `SalesDocLink`, `SalesDocVisitor`, `SalesDocView`, `SalesDocUnitStat`, `SalesDocEvent`, `CampaignList`, `CampaignListRule`, `CampaignListMember`, `CampaignSuppression`, `Campaign`, `CampaignBlock`, `CampaignSend`, `CampaignClick`

## Search, archive, knowledge base

**Pages**

| URL | Zone | Notes |
|:-|:-|:-|
| `/archive` | staff |  |
| `/knowledge-base` | staff |  |
| `/knowledge-base/[category]` | staff |  |
| `/knowledge-base/code-search` | staff |  |
| `/search` | staff | client page |

**API routes**

| Route | Methods | Guard | Uses | Flags |
|:-|:-|:-|:-|:-|
| `/api/admin/users/[id]/history` | GET | requireAdmin |  |  |
| `/api/history` | GET | requireStaff |  |  |
| `/api/knowledge-base` | GET POST | requireAuth |  | json unguarded |
| `/api/knowledge-base/[id]` | PATCH DELETE | requireAuth |  | json unguarded |
| `/api/knowledge-base/categories` | GET POST | requireAuth |  | json unguarded |
| `/api/knowledge-base/categories/[id]` | PATCH DELETE | requireAuth |  | hard delete |
| `/api/knowledge-base/chat` | POST | requireAuth | ai |  |
| `/api/knowledge/code-search` | GET POST | requireAuth | ai |  |
| `/api/projects/[id]/search` | GET | requireAuth |  |  |
| `/api/search` | GET | requireAuth |  |  |
| `/api/verification/archive` | GET POST | requireAuth |  |  |

**Models** (2): `KbCategory`, `RecordHistory`

## Ship schedule

**Pages**

| URL | Zone | Notes |
|:-|:-|:-|
| `/ship-schedules` | staff |  |

**API routes**

| Route | Methods | Guard | Uses | Flags |
|:-|:-|:-|:-|:-|
| `/api/portal/projects/[id]/shipments` | GET | requirePortalAuth |  |  |
| `/api/projects/[id]/ship-schedule/email` | POST | requireAuth | email |  |
| `/api/projects/[id]/ship-schedule/items/[itemId]/release` | GET POST | requireAuth |  |  |
| `/api/projects/[id]/ship-schedule/pdf` | GET | requireAuth |  |  |
| `/api/projects/[id]/ship-schedule/publish` | GET POST PATCH | requireAuth |  |  |
| `/api/projects/[id]/ship-schedule/push` | POST | requireAuth |  |  |
| `/api/projects/[id]/shipments` | GET POST | requireAuth |  | json unguarded |
| `/api/projects/[id]/shipments/[shipmentId]` | GET PATCH DELETE | requireAuth | email | hard delete, json unguarded |
| `/api/projects/[id]/shipments/[shipmentId]/line-items` | POST | requireAuth |  | json unguarded |
| `/api/projects/[id]/shipments/import` | POST | requireAuth |  |  |
| `/api/projects/[id]/shipments/line-items/[itemId]` | PATCH DELETE | requireAuth |  | hard delete, json unguarded |
| `/api/projects/[id]/shipments/line-items/[itemId]/deliveries` | POST | requireAuth |  | json unguarded |
| `/api/projects/[id]/shipments/release-requests/[releaseId]` | POST | requireAuth |  | json unguarded |

**Models** (7): `Shipment`, `ShipmentLineItem`, `WarehouseRelease`, `ManufacturerDeliveryEvent`, `ShipSchedulePush`, `ShipSchedulePublish`, `ShipSchedulePublishLine` (unused)

**Code markers**

- `src/app/api/projects/[id]/shipments/release-requests/[releaseId]/route.js:43` // TODO: send approval/decline email to contractor (Step 5)

## Unit selections

**Pages**

| URL | Zone | Notes |
|:-|:-|:-|
| `/products/decorative-options` | staff |  |

**API routes**

| Route | Methods | Guard | Uses | Flags |
|:-|:-|:-|:-|:-|
| `/api/admin/decorative-options` | GET POST | requirePermission, requireAuth |  |  |
| `/api/admin/decorative-options/[id]` | GET PATCH DELETE | requirePermission, requireAuth |  |  |
| `/api/admin/decorative-options/image` | POST | requirePermission | s3 |  |
| `/api/decorative-images/[name]` | GET | requireAuth | s3 |  |
| `/api/projects/[id]/unit-selections` | GET POST PATCH | requireAuth |  |  |
| `/api/unit-selections/responses/[responseId]` | GET PATCH DELETE | requireAuth |  |  |
| `/api/unit-selections/responses/[responseId]/choices` | POST | requireAuth |  | hard delete |
| `/api/unit-selections/surveys/[surveyId]/responses` | POST | requireAuth |  |  |

**Models** (6): `DecorativeOption`, `DecorativeOptionFinish`, `UnitSelectionSurvey`, `UnitSelectionResponse`, `UnitSelectionChoice`, `UnitSelectionResult` (unused)

## Server actions

None. No file in `src` has a `"use server"` directive; every write goes through `src/app/api/**/route.js`.

