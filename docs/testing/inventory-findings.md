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
