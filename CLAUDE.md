# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## You do not decide when a task is done

**`npm run verify` decides.** Never report a task complete without running it and pasting the output.

A model reporting work it did not do is a known failure mode, so the thing doing the work is never the thing that certifies it. Likewise, a rule no command can check is not a rule — it is a suggestion, and it will be treated as one.

```bash
npm run verify          # static gates (fast, no server needed)
npm run verify -- --full  # + production build + runtime-asset trace check
npm run verify:smoke    # role-aware smoke tests (needs `npm run dev:3000` running)
```

Each gate exists because something silently broke in production:

| Gate | The bug it prevents |
|---|---|
| `check-dynamic-pages` | pages statically rendered that must be dynamic |
| `check-schema-provider` | committing `postgresql` — Amplify's sed swap silently no-ops |
| `check-env-contract` | a server env var missing from `next.config.mjs` → feature returns null in prod (this is what broke **all AI parsing**) |
| `check-migrations-postgres` / `check-schema-migrations-sync` | migrations that won't apply to prod |
| `check-shared-metrics` | a component re-deriving win rate / probability → two numbers under one label |
| `check-runtime-assets` | runtime-resolved assets missing from the Lambda (prod returns 0 rows, local is fine) |
| `verify:smoke` | a role seeing zero projects; routes 500ing after a dropped column |

**When you fix a bug that a gate could have caught, add the gate.** That is how this list grew.

## Schema changes are additive-only, and never silent

Amplify runs `prisma db push --accept-data-loss` on deploy, so a removed or renamed field in `prisma/schema.prisma` is a **dropped production column with no rollback**.

- **Adding** a model or an optional field is safe — do it, with a migration, and say so in the session summary.
- **Removing or renaming** anything is destructive. Never do it as a side effect of another change; surface it to Mike and get an explicit yes first.
- Prefer a design that needs no schema change at all when one exists. `/admin/usage` is the worked example: a full operations dashboard built entirely on existing tables plus the `SystemConfig` k/v row.
- Never edit a migration file under `prisma/migrations/` once it has been applied — Prisma checksums them, and a changed file fails `migrate deploy` in production. That includes comment-only edits.

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

## Where development happens: laptop OR Codespace

Since 2026-07-22 this repo supports GitHub Codespaces (`.devcontainer/`, guide in `CODESPACES.md`). A codespace replaces the *laptop only* — Amplify, the deploy ritual, the sqlite-in-repo rule, and the schema rules are identical in both environments.

Differences that matter to a session:
- **Dev server:** `npm run dev:3000` on Windows laptops, `npm run dev:codespace` in a codespace (the .ps1 can't run on Linux). Same never-plain-`dev` rule in both.
- **Secrets:** laptops use `.env`; codespaces have NO `.env` — secrets arrive as env vars from GitHub Codespaces secrets, non-secrets from `devcontainer.json` `containerEnv`. If an AI feature returns nothing in a codespace, check the `ANTHROPIC_API_KEY` Codespaces secret before debugging code.
- **Notifications are hard-off in codespaces** (`NOTIFY_DRY_RUN=true` in containerEnv). Do not "fix" that.
- **Each environment owns its own `prisma/dev.db` and `uploads/`.** They never sync. Work needing specific drawing files on disk lives where those files are.

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

**Bigger trap (learned the hard way on 2026-06-15):** Amplify Hosting Gen 1 does **not** propagate console-set environment variables to the SSR Lambda runtime. They're available during the build, and nowhere else. Any env var your server code needs at runtime — DB URLs, AWS credentials, third-party API keys you read inside `src/lib/*` modules — must be listed in `next.config.mjs`'s `env` block so webpack DefinePlugin bakes the value into the bundle. The S3 access key + secret for the QC bug tracker (commit `d0c8d8c`) are there for this reason. Empirically confirmed: with `S3_ACCESS_KEY_ID` set in the Amplify console but not in this env block, the running Lambda saw `process.env.S3_ACCESS_KEY_ID` as undefined.

The trade-off is that the bundle carries the value; it's never sent to the browser, but it does live in the Amplify build artifact and in CloudWatch logs if errors leak it. For high-risk secrets, swap to a proper IAM role on the SSR compute (handled in the security pass) and the env-block lines can come out.

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

Without it, Next.js 14 attempts static rendering at build time. `cookies()` (called inside `requireAuth`/`getSession`) throws "called outside a request scope", crashing the page in production with Application Error. The build script `scripts/check-dynamic-pages.js` runs in Amplify preBuild and **fails the entire build** if any page is missing this — so you'll catch it before it ever deploys. It also runs in the local pre-push hook (see below) so you catch it before it ever leaves your machine.

### Rule: New Prisma migrations must be PostgreSQL-compatible

`schema.prisma` is committed with `provider = "sqlite"` so local dev works without Docker. Running `npx prisma migrate dev` against that schema emits **SQLite-flavored SQL** (e.g. `DATETIME`, `BOOLEAN NOT NULL DEFAULT 0`, forward foreign-key references) — which Postgres rejects when Amplify runs `prisma migrate deploy` against the real production database.

**To generate a new migration safely:**

```bash
# Option A — temporarily flip the schema to postgres, generate, flip back:
sed -i 's/provider = "sqlite"/provider = "postgresql"/' prisma/schema.prisma
npx prisma migrate dev --name your_migration_name
sed -i 's/provider = "postgresql"/provider = "sqlite"/' prisma/schema.prisma
git diff prisma/schema.prisma   # should be empty — confirm provider is back to sqlite

# Option B — use the npm hint script that documents the same idea:
npm run db:migrate:new
```

`scripts/check-migrations-postgres.js` runs in both Amplify preBuild and the local pre-push hook and **blocks the build/push** if any migration uses SQLite-only patterns (`DATETIME`, `BOOLEAN DEFAULT 0/1`, `AUTOINCREMENT`, `PRAGMA`) or contains a forward FK reference within the same file. Clear `file:line:fix` output when it fires.

### Rule: Pre-push hook (Husky) enforces local sanity checks

A Husky pre-push hook (`.husky/pre-push`) runs on every `git push`. It executes:

1. `check-dynamic-pages.js` — every `(app)/` page has `force-dynamic`
2. `check-migrations-postgres.js` — every migration is Postgres-compatible (including forward-FK ordering)
3. `check-schema-migrations-sync.js` — every `model X` in `schema.prisma` has a matching `CREATE TABLE "X"` in some migration (catches the "ran prisma db push locally and forgot to generate a migration" pattern)
4. `npm test` — math regression suite (38 scenario + ~112K fuzz + 12 bid-matrix checks)
5. `check-secrets.js` — scans the diff for accidentally committed API keys / tokens
6. `check-push-size.js` — non-blocking heads-up if pushing > 50 files

Total wall-clock: ~20-30 seconds. Catches almost every class of bug that's bitten this project's deploys.

**Setup is automatic on `npm install`** — Husky's `prepare` script wires the hook into `.git/hooks/` for your local repo. After pulling a change that touches `package.json` or `.husky/`, run `npm install` once to ensure the hook is current.

**Emergency bypass:** `git push --no-verify` skips the hook. Use only for true emergencies — the checks fire for a reason.

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

Mike may have more than one Claude Code session open on this repo at once. To keep sessions roughly oriented across time and windows, every Claude session in this repo should:

1. **At session start:** read `.claude/coordination.md` to see what other sessions have been doing recently.
2. **After meaningful work:** append a brief entry at the top of the log section in `.claude/coordination.md`, tagged with the date, summarizing what happened in 1–3 lines.

Update the "Current State" block at the top of `coordination.md` only when something materially changes (active work area, what's deployed, what's blocked). The log itself is append-only and newest-first, so concurrent edits produce trivial conflicts.

Append when something is worth a later session knowing: a feature landed, a decision was made, an open question surfaced, or a gotcha worth flagging. Skip routine micro-steps — this is a logbook, not a journal.
