# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev:3000      # Start dev server (kills port 3000 first, generates deploy-log.json)
npm run build         # Production build
npm run deploy -- "commit message"  # git add + commit + push to trigger Amplify build
npm run db:push       # Push Prisma schema to local SQLite (dev only)
npm run db:seed       # Seed admin users
npm run db:studio     # Open Prisma Studio UI
```

**Always use `npm run dev:3000`** — never `npm run dev` directly. The `dev:3000` script (via `start-dev.ps1`) kills any existing process on port 3000 first and also runs `node scripts/generate-deploy-log.js`.

**Deploy** is always: `npm run deploy -- "description"` which triggers Amplify to build and deploy automatically.

## Architecture

**Stack:** Next.js 14 App Router, Tailwind CSS, Prisma 5.22.0, JWT auth (`jose`), AWS Amplify SSR.

### Directory Layout

```
src/
  app/
    (app)/          # Authenticated routes (layout enforces auth)
      admin/        # User mgmt, changelog, pricing, knowledge base
      project/[id]/ # Project hub — all project-specific UI lives here
      dashboard/
      clients/
      manufacturers/
      crm/
    api/            # Route handlers — all data mutations happen here
  lib/
    auth.js         # JWT helpers + requireAuth/requireAdmin/requireSuperAdmin
    db.js           # PrismaClient singleton — passes DATABASE_URL explicitly
    pricingLoader.js # Loads pricing.json from filesystem
    activity.js     # logActivity() helper
  components/       # Shared UI (Badge, Button, Card, Input, Tooltip, etc.)
prisma/
  schema.prisma     # sqlite locally; sed-patched to postgresql in Amplify build
  seed.js           # Upserts admin@ilcstudios.com and mike@ilcstudios.com
scripts/
  generate-deploy-log.js  # git log → deploy-log.json (gitignored)
```

### Critical: SQLite Local / PostgreSQL Production

`schema.prisma` always has `provider = "sqlite"` — this lets local dev work without Docker. `amplify.yml` patches it to `postgresql` via `sed` before each build. **Never commit `provider = "postgresql"`** — it will break local dev.

Local: `DATABASE_URL=file:./dev.db` in `.env`
Production: PostgreSQL connection string set in Amplify environment variables.

### Critical: Amplify Lambda + DATABASE_URL

`@prisma/client` is in `serverComponentsExternalPackages` (not webpack-bundled). `db.js` IS bundled. Because of this, `DATABASE_URL` **must** be in `next.config.mjs`'s `env` block so webpack bakes the value into the bundle. Without it, every API route fails with "Network error" in production.

`ANTHROPIC_API_KEY` and `JWT_SECRET` are intentionally **not** in the `env` block — they stay server-only runtime secrets.

### Auth Pattern

Every API route calls `requireAuth(request)` (or `requireAdmin`/`requireSuperAdmin`) at the top:

```js
const { user, error } = await requireAuth(request);
if (error) return error;
```

Session = httpOnly cookie `ilc_session`, 7-day JWT, signed with `JWT_SECRET`.

Roles: `ILC_ADMIN` / `SUPER_ADMIN` (same), `ADMIN` / `COMPANY_ADMIN` (same), `USER`, `CLIENT_VIEWER`.

### Rule: Every new `(app)` page MUST have `force-dynamic`

```js
export const dynamic = 'force-dynamic'; // ← REQUIRED on every page under (app)/
```

Without it, Next.js 14 attempts static rendering at build time. `cookies()` (called inside `requireAuth`/`getSession`) throws "called outside a request scope", crashing the page in production with Application Error. The build script `scripts/check-dynamic-pages.js` runs in Amplify preBuild and **fails the entire build** if any page is missing this — so you'll catch it before it ever deploys.

### Page Pattern (App Router)

Server pages fetch data and pass it to `*Client.jsx` components:

```js
// page.jsx (server) — fetch data, no 'use client'
export const dynamic = 'force-dynamic'; // required on all authenticated pages
export default async function Page({ params }) { ... }

// FooClient.jsx (client) — all interactivity, 'use client' at top
```

`force-dynamic` is required on every authenticated page — without it, Next.js caches the page and users see stale data after navigation.

### Project Hub

`src/app/(app)/project/[id]/` is the main project workspace. `page.jsx` fetches project data; `ProjectHubClient.jsx` renders a tab bar with all project sections:

- **Budget** (conceptual/design wizard)
- **Peer Review** (for peer_review service type)
- **Fixture Schedule** → `FixtureScheduleEditor.jsx` (fullDesign/designAssist only)
- **Design Bid Matrix** → `DesignBidMatrixEditor.jsx` (fullDesign/designAssist only)
- **Submittal Tracker**
- **Files**, **Meeting Notes**, **Activity**, **AI Chat**

Service type gating: `DESIGN_SERVICE_TYPES = new Set(['fullDesign', 'designAssist'])` — only these show Fixture Schedule and Design Bid Matrix tabs.

## Key Domain Logic

### Budget Lifecycle

Four valid paths:
1. Conceptual → Design → Full Design
2. Conceptual → Peer Review
3. Design → Full Design
4. Standalone Peer Review

`budgetType`: `conceptual` | `design` | `peer_review`
`budgetNumber` auto-assigned: `C00001` (conceptual), `D00001` (design), `B00001` (peer review)

### Fixture Schedule → Design Bid Matrix Flow

1. **One DRAFT FixtureSchedule always exists** per project (auto-created on first access via `getOrCreateDraft()`)
2. **Push to Bid** (`/fixture-schedule/publish`):
   - Marks current DRAFT as `PUBLISHED` (immutable)
   - Creates a fresh DRAFT copying all items
   - Creates a `DesignBidMatrix` from the published schedule
3. **`catalogNumber` splitting**: `' + '` in a catalog number splits into multiple bid line items. `"PARTNUM + ACCESSORY"` → two `DesignBidMatrixItem` rows.
4. **Pricing carry-forward**: keyed by `"type|partNumber"` (lowercase) from the most recent bid matrix.
5. **Change summary**: diff vs. previous source schedule by `type|location|catalogNumber` key; stored as JSON on the matrix record.

### Design Bid Matrix editing

Only the **latest version** is editable. `PATCH /design-bid-matrix/items/[itemId]` returns 403 for historical versions. `pricingLastUpdated` is set whenever `dnPerUnit` or `cnPerUnit` changes.

### Pricing

Pricing data lives in `public/pricing.json` (or loaded via `pricingLoader.js`). It's snapshotted onto `Project.pricingSnapshot` at project creation time — the snapshot is frozen forever.

### Deploy History

`scripts/generate-deploy-log.js` runs at every Amplify build and local dev start. It reads `git log -n 200` and writes `deploy-log.json` (gitignored). The admin changelog page at `/admin/changelog` reads this file and displays a timeline. `Co-Authored-By:` lines with `anthropic` in the email get an "AI-assisted" badge.

## Amplify Build Pipeline (`amplify.yml`)

```
npm ci
node scripts/generate-deploy-log.js
sed -i 's/provider = "sqlite"/provider = "postgresql"/' prisma/schema.prisma
npx prisma generate
npx prisma db push --accept-data-loss
node prisma/seed.js
npm run build
```

`prisma db push --accept-data-loss` is intentional — schema changes in production may drop columns. The seed runs every deploy (upsert — safe).

## Data Model Highlights

Key models and their purpose:

| Model | Purpose |
|---|---|
| `User` | Auth + roles + per-project access |
| `Project` | Core entity — all work hangs off this |
| `ProjectData` | Building metrics (SF, units, parking, etc.) for budget calc |
| `PeerReviewItem` | Peer review fixture rows with spec vs. proposed product |
| `FixtureSchedule` | Versioned fixture schedule (DRAFT/PUBLISHED) |
| `FixtureScheduleItem` | One row in a schedule; `catalogNumber` may contain `' + '` |
| `DesignBidMatrix` | Created when schedule is published; immutable after creation |
| `DesignBidMatrixItem` | One row; `partNumber` is already split (no `+`) |
| `SubmittalTracker` | Per-project submittal tracking with versioned items |
| `Client` | Developer/architect/GC orgs |
| `Deal` | CRM pipeline (PROCUREMENT or DESIGN); links to Client + Project |
| `DesignStandard` | Internal ILC knowledge base entries |
| `Manufacturer` / `ManufacturerProduct` | Product catalog |

JSON-as-string fields (SQLite limitation): `permissions`, `dashboardConfig`, `tags`, `markets`, `orgTypes`, `attendees`, `viewLog`, `changeSummary` — always parse/serialize manually.

## External Packages (Not Webpack-Bundled)

```js
serverComponentsExternalPackages: [
  '@prisma/client', 'bcryptjs', 'xlsx',
  '@napi-rs/canvas', 'tesseract.js',
  'pdfjs-dist', 'pdf-parse', '@anthropic-ai/sdk'
]
```

These are loaded via Node `require()` at runtime. If you add a new native or heavy package, add it here.

## Seeded Admin Accounts

```
admin@ilcstudios.com  / ILCadmin2024!    (ILC_ADMIN)
mike@ilcstudios.com   / ILCstudios2024!  (ILC_ADMIN)
```

These are upserted on every deploy — changing the password in-app won't be overwritten (seed uses `update: {}`).

## Cross-Session Claude Coordination

Two humans (Mike and Sean) work on this repo, each running their own Claude Code sessions. To keep Claude sessions roughly oriented across users and time, every Claude session in this repo should:

1. **At session start:** read `.claude/coordination.md` to see what the other user's Claude has been doing recently.
2. **After meaningful work:** append a brief entry at the top of the log section in `.claude/coordination.md`, tagged with date and user (Mike or Sean), summarizing what happened in 1–3 lines.

Update the "Current State" block at the top of `coordination.md` only when something materially changes (active work area, what's deployed, what's blocked). The log itself is append-only and newest-first, so concurrent edits produce trivial conflicts.

Append when something is worth the other Claude knowing: a feature landed, a decision was made, an open question surfaced, or a gotcha worth flagging. Skip routine micro-steps — this is a logbook, not a journal.
