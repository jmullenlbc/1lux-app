# Smoke crawl results

_Run 2026-11-11 17:16 UTC against `http://localhost:3001` (local), 5623 s. Made by `npm run test:crawl`; re-running overwrites this file._

Roles: SUPER_ADMIN, COMPANY_ADMIN, SALES_ADMIN, SALES, USER, CLIENT_VIEWER.
Read-only: page loads and GET requests. No button was clicked and no form sent, so this proves pages open, not that features work.

**608 page visits, 6 with a problem.** 15 pages could not be opened (no record or no login), listed below. 5 broken links. 0 GET API calls failed with 5xx (of 684).

## Per module

| Module | Pages | Visits | Problem visits | Pages with a problem | Not opened | API 5xx |
|:-|-:|-:|-:|-:|-:|-:|
| Admin and platform | 15 | 90 | 1 | 1 | 0 | 0 |
| Automation and bot | 11 | 66 | 1 | 1 | 0 | 0 |
| CRM | 10 | 54 | 1 | 1 | 1 | 0 |
| Change orders | 2 | 6 | 0 | 0 | 1 | 0 |
| Company portal | 4 | 18 | 3 | 1 | 1 | 0 |
| Conferences and memberships | 6 | 30 | 0 | 0 | 1 | 0 |
| Dashboards | 4 | 42 | 0 | 0 | 0 | 0 |
| Drawings, fixture schedule, compliance | 3 | 18 | 0 | 0 | 0 | 0 |
| Email and calendar | 1 | 6 | 0 | 0 | 0 | 0 |
| Expenses | 2 | 12 | 0 | 0 | 0 | 0 |
| Market Intel | 4 | 24 | 0 | 0 | 0 | 0 |
| My Desk and tasks | 2 | 12 | 0 | 0 | 0 | 0 |
| Notes | 1 | 6 | 0 | 0 | 0 | 0 |
| Other | 2 | 12 | 0 | 0 | 0 | 0 |
| Pricing, QC, verification | 2 | 12 | 0 | 0 | 0 | 0 |
| Products and fixture library | 5 | 18 | 0 | 0 | 2 | 0 |
| Project hub, bid matrix, budgets | 8 | 44 | 0 | 0 | 4 | 0 |
| Proposals | 2 | 12 | 0 | 0 | 0 | 0 |
| Public conceptual budget and intake | 4 | 24 | 0 | 0 | 0 | 0 |
| RFQs and sales reps | 4 | 18 | 0 | 0 | 1 | 0 |
| Sales Docs and campaigns | 11 | 42 | 0 | 0 | 4 | 0 |
| Search, archive, knowledge base | 5 | 30 | 0 | 0 | 0 | 0 |
| Ship schedule | 1 | 6 | 0 | 0 | 0 | 0 |
| Unit selections | 1 | 6 | 0 | 0 | 0 | 0 |

## Per role

| Role | Visits | Problems | Sent elsewhere (redirect) | Slowest page |
|:-|-:|-:|-:|:-|
| SUPER_ADMIN | 102 | 1 | 13 | `/sales/automation/scheduling` 13.9 s |
| COMPANY_ADMIN | 102 | 1 | 24 | `/admin/qc` 13.7 s |
| SALES_ADMIN | 102 | 0 | 27 | `/sales/docs` 11.2 s |
| SALES | 102 | 1 | 30 | `/sales/automation/scheduling` 15.6 s |
| USER | 102 | 1 | 29 | `/sales/automation/scheduling` 28.6 s |
| CLIENT_VIEWER | 98 | 2 | 38 | `/sales/automation` 28.6 s |

## Problems

| Page | Module | Roles | What | Detail |
|:-|:-|:-|:-|:-|
| `/change-password` | Admin and platform | SUPER_ADMIN | 1 console error | 404 /favicon.ico |
| `/crm/contacts` | CRM | COMPANY_ADMIN | 1 console error | Failed to load resource: net::ERR_CONNECTION_REFUSED |
| `/portal/login` | Company portal | SALES, USER, CLIENT_VIEWER | 1 console error | 404 GET /api/portal/invite/smoke-crawl-no-such-token<br>404 /api/portal/invite/smoke-crawl-no-such-token |
| `/sales/automation/scheduling` | Automation and bot | CLIENT_VIEWER | 1 console error | Failed to load resource: net::ERR_CONNECTION_REFUSED |

## Broken links

| Link | Status | Seen on | Roles |
|:-|:-|:-|:-|
| `/api/conferences/export` | 404 | `/sales/events/budget` | SUPER_ADMIN, COMPANY_ADMIN, SALES_ADMIN, SALES, USER |

## GET API calls that failed (5xx)

None.

## Pages not opened

| Page | Module | Why | Roles |
|:-|:-|:-|:-|
| `/clients/[id]` | CRM | no record to open (/api/clients returned none) | all |
| `/manufacturers/[id]` | Products and fixture library | no record to open (/api/manufacturers returned none) | all |
| `/portal/projects/[id]` | Company portal | needs a portal login (not covered yet) | all |
| `/products/[id]` | Products and fixture library | no record to open (/api/products returned none) | all |
| `/project/[id]/change-orders/[coId]` | Change orders | no change order on the sample job | SUPER_ADMIN, COMPANY_ADMIN, SALES_ADMIN, SALES, USER |
| `/sales-reps/[id]` | RFQs and sales reps | no record to open (/api/sales-reps returned none) | all |
| `/sales/docs/[docId]` | Sales Docs and campaigns | no record to open (/api/sales-docs returned none) | all |
| `/sales/docs/campaigns/[id]` | Sales Docs and campaigns | no record to open (/api/campaigns returned none) | all |
| `/sales/docs/lists/[id]` | Sales Docs and campaigns | no record to open (/api/campaign-lists returned none) | all |
| `/sales/docs/spaces/[spaceId]` | Sales Docs and campaigns | no record to open (/api/sales-docs/spaces returned none) | all |
| `/sales/events/[id]` | Conferences and memberships | no record to open (/api/conferences returned none) | all |
| `/project/[id]` | Project hub, bid matrix, budgets | no record to open (/api/projects returned none) | CLIENT_VIEWER |
| `/project/[id]/change-orders/[coId]` | Change orders | no record to open (/api/projects returned none) | CLIENT_VIEWER |
| `/project/[id]/summary` | Project hub, bid matrix, budgets | no record to open (/api/projects returned none) | CLIENT_VIEWER |
| `/project/[id]/tracker` | Project hub, bid matrix, budgets | no record to open (/api/projects returned none) | CLIENT_VIEWER |
| `/project/[id]/wizard` | Project hub, bid matrix, budgets | no record to open (/api/projects returned none) | CLIENT_VIEWER |

## Staff pages a Client Viewer can open

_The page answered 200 and was not sent elsewhere. "Refused calls" are data requests the server turned down (401/403). A page with none may be showing staff data and needs a look by hand._

| Page | Module | Refused calls |
|:-|:-|:-|
| `/admin/import` | Admin and platform | `403 /api/sales/desk` |
| `/admin/intake` | Public conceptual budget and intake | `403 /api/sales/desk` |
| `/admin/profile` | Admin and platform | `403 /api/sales/desk` |
| `/admin/roadmap` | Admin and platform | `403 /api/sales/desk` |
| `/clients` | CRM | **none** |
| `/clients/new` | CRM | `403 /api/sales/desk` |
| `/crm` | CRM | **none** |
| `/crm/contacts` | CRM | `403 /api/sales/desk` |
| `/crm/dashboards` | Dashboards | `403 /api/sales/desk` `403 /api/sales/desk/review` |
| `/crm/notes` | Notes | `403 /api/sales/desk` |
| `/dashboard` | Dashboards | `403 /api/sales/desk` |
| `/dashboards/main` | Dashboards | `403 /api/sales/desk` |
| `/dashboards/sales` | Dashboards | `403 /api/sales/desk` |
| `/dashboards/budget` | Dashboards | `403 /api/sales/desk` |
| `/knowledge-base` | Search, archive, knowledge base | `403 /api/sales/desk` |
| `/knowledge-base/unit` | Search, archive, knowledge base | `403 /api/sales/desk` |
| `/knowledge-base/code-search` | Search, archive, knowledge base | `403 /api/sales/desk` |
| `/knowledge-base/lpd-check` | Drawings, fixture schedule, compliance | `403 /api/sales/desk` |
| `/manufacturers` | Products and fixture library | **none** |
| `/market-intel` | Market Intel | `403 /api/sales/desk` |
| `/market-intel/forecast` | Market Intel | `403 /api/sales/desk` `403 /api/market-intel/ask` |
| `/market-intel/permits` | Market Intel | `403 /api/sales/desk` |
| `/market-intel/sources` | Market Intel | `403 /api/sales/desk` |
| `/my-jobs` | Project hub, bid matrix, budgets | `403 /api/sales/desk` |
| `/pre-con` | Project hub, bid matrix, budgets | `401 /api/portal/auth/me` |
| `/products` | Products and fixture library | `403 /api/sales/desk` |
| `/project/new` | Project hub, bid matrix, budgets | `403 /api/sales/desk` |
| `/sales/activity` | CRM | `403 /api/sales/desk` |
| `/sales/activity/expenses` | Expenses | `403 /api/sales/desk` |
| `/sales/activity/expenses/snap` | Expenses | `403 /api/sales/desk` `403 /api/sales/expenses/receipts` `403 /api/sales/expenses/summary` |
| `/sales/automation/knowledge` | Automation and bot | **none** |
| `/sales/automation/rules` | Automation and bot | `403 /api/sales/desk` |
| `/sales/automation/signature` | Automation and bot | `403 /api/sales/desk` |
| `/sales/automation/templates` | Automation and bot | `403 /api/sales/desk` |
| `/sales/automation/timeline` | Automation and bot | `403 /api/sales/desk` |
| `/sales/automation/voice` | Automation and bot | `403 /api/sales/desk` |
| `/sales/bot-queue` | Automation and bot | `403 /api/sales/desk` |
| `/sales/check-ins` | CRM | `403 /api/sales/desk` |
| `/sales/desk` | My Desk and tasks | `403 /api/sales/desk` |
| `/sales/docs` | Sales Docs and campaigns | `403 /api/sales/desk` `403 /api/sales-docs` |
| `/sales/docs/campaigns` | Sales Docs and campaigns | `403 /api/sales/desk` `403 /api/campaigns/settings` `403 /api/campaigns` |
| `/sales/docs/links` | Sales Docs and campaigns | `403 /api/sales/desk` `403 /api/sales-docs/links` |
| `/sales/docs/lists` | Sales Docs and campaigns | `403 /api/sales/desk` `403 /api/campaign-lists` `403 /api/campaign-suppressions` |
| `/sales/docs/spaces` | Sales Docs and campaigns | `403 /api/sales/desk` `403 /api/sales-docs/spaces` |
| `/sales/proposals` | Proposals | `403 /api/sales/desk` |
| `/search` | Search, archive, knowledge base | `403 /api/sales/desk` |

## Where each role was sent elsewhere

_A redirect is the app saying "not for you" or forwarding to the right page. Listed so the access rules can be checked against Mike's USERS_ROLES_AND_PRIVILEGES.md._

| Page | Ended at | Roles |
|:-|:-|:-|
| `/` | `/dashboards/main` | all |
| `/admin` | `/dashboard` | SALES_ADMIN, SALES, USER, CLIENT_VIEWER |
| `/admin/agent-runs` | `/dashboard` | COMPANY_ADMIN, SALES_ADMIN, SALES, USER, CLIENT_VIEWER |
| `/admin/calendar-import` | `/dashboard` | SALES, USER, CLIENT_VIEWER |
| `/admin/changelog` | `/dashboard` | COMPANY_ADMIN, SALES_ADMIN, SALES, USER, CLIENT_VIEWER |
| `/admin/companies` | `/dashboard` | SALES_ADMIN, SALES, USER, CLIENT_VIEWER |
| `/admin/conference-load` | `/dashboard` | COMPANY_ADMIN, SALES_ADMIN, SALES, USER, CLIENT_VIEWER |
| `/admin/crm-import` | `/dashboard` | COMPANY_ADMIN, SALES_ADMIN, SALES, USER, CLIENT_VIEWER |
| `/admin/job-loader` | `/dashboard` | COMPANY_ADMIN, SALES_ADMIN, SALES, USER, CLIENT_VIEWER |
| `/admin/mcp-keys` | `/dashboard` | COMPANY_ADMIN, SALES_ADMIN, SALES, USER, CLIENT_VIEWER |
| `/admin/offices` | `/dashboard` | CLIENT_VIEWER |
| `/admin/pricing` | `/dashboard` | SALES_ADMIN, SALES, USER, CLIENT_VIEWER |
| `/admin/qc` | `/admin/tasks` | SUPER_ADMIN |
| `/admin/qc` | `/dashboard` | COMPANY_ADMIN, SALES_ADMIN, SALES, USER, CLIENT_VIEWER |
| `/admin/sales-reps-import` | `/dashboard` | SALES_ADMIN, SALES, USER, CLIENT_VIEWER |
| `/admin/tasks` | `/dashboard` | COMPANY_ADMIN, SALES_ADMIN, SALES, USER, CLIENT_VIEWER |
| `/admin/tech-stack` | `/dashboard` | COMPANY_ADMIN, SALES_ADMIN, SALES, USER, CLIENT_VIEWER |
| `/admin/usage` | `/dashboard` | COMPANY_ADMIN, SALES_ADMIN, SALES, USER, CLIENT_VIEWER |
| `/archive` | `/dashboard` | CLIENT_VIEWER |
| `/crm/brief` | `/dashboards/sales` | all |
| `/crm/intel` | `/sales/desk` | all |
| `/dashboards/meeting` | `/dashboards/sales` | all |
| `/fixture-library` | `/dashboard` | SALES_ADMIN, SALES, USER, CLIENT_VIEWER |
| `/home` | `/dashboards/main` | all |
| `/open` | `/dashboards/main` | SUPER_ADMIN, COMPANY_ADMIN |
| `/open` | `/sales/desk` | SALES_ADMIN, SALES, USER |
| `/open` | `/dashboard` | CLIENT_VIEWER |
| `/portal/projects` | `/portal/login` | SUPER_ADMIN, COMPANY_ADMIN, SALES_ADMIN, SALES |
| `/products/decorative-options` | `/dashboard` | CLIENT_VIEWER |
| `/sales-reps` | `/dashboard` | CLIENT_VIEWER |
| `/sales/automation` | `/sales/automation/rules` | all |
| `/sales/automation/actions` | `/sales/automation/rules` | COMPANY_ADMIN, SALES, USER, CLIENT_VIEWER |
| `/sales/automation/scheduling` | `/sales/automation/rules` | all |
| `/sales/automation/triggers` | `/sales/automation/rules` | COMPANY_ADMIN, SALES, USER, CLIENT_VIEWER |
| `/sales/docs/engagement` | `/sales/docs` | all |
| `/sales/events` | `/dashboard` | CLIENT_VIEWER |
| `/sales/events/budget` | `/dashboard` | CLIENT_VIEWER |
| `/sales/events/memberships` | `/dashboard` | CLIENT_VIEWER |
| `/sales/events/plan` | `/dashboard` | CLIENT_VIEWER |
| `/sales/proposals/templates` | `/sales/proposals` | all |
| `/sales/visitors` | `/dashboards/sales` | all |
| `/ship-schedules` | `/dashboard` | CLIENT_VIEWER |

