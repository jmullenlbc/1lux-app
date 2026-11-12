# Sync from Claude Code: testing pass 1 on the 1LUX app (Mike's base)

_2026-11-11. Repo `jmullenlbc/1lux-app` at `4513e87` + uncommitted `docs/testing/`, `scripts/testing/`, two npm scripts and `playwright-core` (dev dependency). Production (app.ilcstudios.com) was not opened or touched. Nothing was created in the cloud._

## What was done
- **Inventory** (`docs/testing/inventory.md`, remade by `npm run test:inventory`): 110 pages, 492 API route files (753 handlers), 0 server actions, 250 models; cross-checked against `MODULE_DOCS_INDEX.md`, `PLATFORM_MODULE_OVERVIEW.md`, 39 module docs and plans, `MIKE_TEST_UPLOAD_TODO.md` and the calculator move package.
- **Staging** (`docs/testing/staging.md`): proposal only. Waiting on Jason.
- **Smoke crawl** (`npm run test:crawl` → `docs/testing/smoke-results.md`): run once, locally, on the sqlite dev database (2 projects, no companies). 6 roles, 608 page visits, 684 GET API calls. Read-only: it opens pages, it does not click or submit.

## Counts per module
Routes from the code; visits and problems from the local crawl (6 roles).

| Module | Pages | API routes | Crawl visits | Problem visits |
|:-|-:|-:|-:|-:|
| Admin and platform | 15 | 36 | 90 | 1 |
| Automation and bot | 11 | 41 | 66 | 1 |
| Bid leveling and comparison | 0 | 12 | 0 | 0 |
| CRM | 10 | 40 | 54 | 1 |
| Change orders | 2 | 18 | 6 | 0 |
| Company portal | 4 | 12 | 18 | 3 |
| Conferences and memberships | 6 | 7 | 30 | 0 |
| Dashboards | 4 | 18 | 42 | 0 |
| Drawings, fixture schedule, compliance | 3 | 33 | 18 | 0 |
| Email and calendar | 1 | 8 | 6 | 0 |
| Expenses | 2 | 9 | 12 | 0 |
| Market Intel | 4 | 20 | 24 | 0 |
| My Desk and tasks | 2 | 18 | 12 | 0 |
| Notes | 1 | 13 | 6 | 0 |
| Notifications and scheduled jobs | 0 | 16 | 0 | 0 |
| Pricing, QC, verification | 2 | 17 | 12 | 0 |
| Products and fixture library | 5 | 14 | 18 | 0 |
| Project hub, bid matrix, budgets | 8 | 42 | 44 | 0 |
| Proposals | 2 | 11 | 12 | 0 |
| Public conceptual budget and intake | 4 | 26 | 24 | 0 |
| RFQs and sales reps | 4 | 14 | 18 | 0 |
| Sales Docs and campaigns | 11 | 34 | 42 | 0 |
| Search, archive, knowledge base | 5 | 11 | 30 | 0 |
| Ship schedule | 1 | 13 | 6 | 0 |
| Unit selections | 1 | 8 | 6 | 0 |
| Other (`/`, `/share/[token]`) | 2 | 1 | 12 | 0 |
| **Total** | **110** | **492** | **608** | **6** |

**Crawl result:** no page returned 5xx, no blank page, no crash screen, 0 of 684 GET API calls failed with 5xx. The 6 problem visits are minor: a missing `/favicon.ico` on `/change-password`, two dropped requests when the dev server hiccuped, and `/portal/login` logging a 404 for a made-up invite. One broken link: the export link on `/sales/events/budget` answers 404 (`/api/conferences/export`; may be "nothing to export" on an empty database).

**What the crawl does not prove:** 15 record pages were not opened because the local database has no records (client, manufacturer, product, sales rep, change order, Sales Docs doc / campaign / list / space, event) and portal pages need a portal login. The project hub was opened on one near-empty job. No button was pressed.

## Watch list
1. **Client Viewer reaches 46 staff pages** (200, not sent away): Market Intel, Knowledge Base, contacts, notes, check-ins, proposals, automation, dashboards, My Jobs, `/admin/import`, `/admin/intake`. On most the page's data calls are not refused. Mike's overview says a block was built but not deployed; in this code there is no single block. Needs a look with real data before any client gets a login.
2. **CRM Upload wipe** (hard delete of every project, company, person; never run for real).
3. **Change orders (0158)**: never tested on screen; a Sent CO can have no option.
4. **RFQs**: versions, RFQs for COs, Send revision possibly leaving out new fixtures.
5. **Email**: nothing is delivered anywhere (portal invites, CO Send, ship schedule, proposals, digest, resume link), yet callers report success. One SES sender (pre-con alert), not confirmed.
6. **Schedules**: 8 of 10 cron jobs have none; the 2 that do point at the old repo.
7. **AI key**: readers answer 503 without it; old key reported dead 10-26.
8. **Two conceptual budgets that disagree** (public tool vs in-project wizard); move-package Part B not done, no parity test.
9. **Access wider than intended**: `/admin/import` open to any login; Offices and Roadmap; "Operations acts as admin" differs between doc and code.
10. **Not tried for real**: Expenses, Events, Memberships, Tasks board, phone layouts, portal with a client, Job Loader upload.
11. **Dead ends**: `/register`, bot queue and bot send stubs, proposal Expired never set, Weekly Meeting link to `/admin/submissions` (no such page).
12. **71 route files hard-delete** (shipments, draft COs, Market Intel sources).
13. **Stale docs**: Email Campaigns and Dashboard plans say "nothing built" (both exist); Task Management, Email/Calendar v2, Compliance, Questionnaire Backfill and the consolidated Client Standard engine are not built; several plans still say deploys use `db push` (they use `migrate deploy`).

Full list with sources: `docs/testing/inventory.md` sections 2–5.

## Blocks manual testing
- **No data.** The local copy has 2 projects and nothing else; no staging copy exists yet. Until the v7 sheet, sales reps, conferences and one job (Modera) are loaded somewhere, most record screens cannot be tested. Loading them is itself the first test of four loaders.
- **Staging decision (Jason):** is the Render blueprint `onelux-app` already applied? If not, OK to create it (web + its own Postgres)? Then `SEED_ADMIN_PASSWORD` and the app URL typed in Render.
- **AI key** for any reader test (drawings, quotes, receipts, Market Intel).
- **File storage** for drawing / receipt / Sales Docs tests (uploads vanish on each container deploy without it).
- **Six test logins**, one per role, on staging for the crawl; plus one portal contact for portal testing.
- **21 open definitions** (`THINGS_TO_DEFINE_MIKE_MARAM.md`): pipeline, tasks, email, proposals. Testers cannot pass or fail those screens until answered.
- **Role decision** for item 1 and 9 above: what a Client Viewer and a plain User should reach.

## Next (proposed)
1. Jason answers the staging question; stand it up; load v7 + reps + conferences + Modera.
2. Re-run the crawl there (all record pages open), then add a portal login to the crawl.
3. Manual pass in watch-list order, starting with change orders and RFQs on the Modera job.
4. Fix list from this pass: Client Viewer block at the layout, `/admin/submissions` link, favicon, remove `db:push`.
