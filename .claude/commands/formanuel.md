---
description: Orient Manuel for a new session — loads full project context, current tasks, and confirms readiness
---

You are a fresh Claude Code instance. Manuel San Ramon ("Manny") has just opened a new session. Your job is to read this entire command, absorb the background context, read the two live files listed at the end, and then greet Manny with a confident, specific orientation — ending by confirming that you are fully educated and know exactly what he should do over the next two days.

---

## Background context (read and absorb this fully)

### What ILC is

ILC Lighting App is an internal tool for ILC Studios, a lighting consultancy. Designers and project managers use it to produce conceptual and design budgets, manage projects, track clients, and run a CRM pipeline. The goal is to free Mike Kershner's time from manual spreadsheet work so he can do more client meetings.

- **Live at:** https://app.ilcstudios.com — deploys automatically from `main` via AWS Amplify (~5 min build)
- **Repo:** github.com/OperationsILC/ilc-lighting-app
- **Stack:** Next.js 14 App Router · Tailwind CSS · Prisma 5.22 (SQLite locally, PostgreSQL in production) · JWT auth via `jose` · AWS Amplify SSR

### The team

| Person | Role | Notes |
|---|---|---|
| **Mike Kershner** | Founder, lead developer | High-velocity, pushes directly to `main`. Owns most features. |
| **Sean McCauley** | Math/QC lead, Manny's reviewer | Reviews and merges all of Manny's PRs. Runs local Claude Code. |
| **Manny (you're with him now)** | Part-time developer, ~10 hr/week | Always works on `manny/*` branches + PRs. Never pushes to `main` directly. |
| **Mason** | Project manager, end user | Started using the conceptual budget tool this week for real client work. |
| **Moram** | Sales lead, end user | Uses the CRM. |

### Manny's workflow — mandatory every time

1. `git pull` — grab latest main before starting anything
2. `git checkout -b manny/<short-description>` — always a new branch
3. Edit, test locally with `npm run dev:3000`, iterate
4. `git add . && git commit -m "..."`
5. `git push -u origin manny/<branch>` — pre-push hooks run (~25 sec, never bypass)
6. `gh pr create` — open a PR, ping Sean to review
7. Sean merges; Manny deletes the branch

**Never push to `main` directly. Never use `--no-verify`. If a hook fails, fix the issue.**

### Pre-push hooks (run on every `git push`, ~25 seconds)

Six checks gate every push. They exist because every one of these has broken production before:

1. **check-dynamic-pages.js** — every page under `src/app/(app)/` must export `export const dynamic = 'force-dynamic'`. Without it, Next.js caches the page and `cookies()` throws in production.
2. **check-migrations-postgres.js** — Prisma migrations must use Postgres-compatible SQL only (no `DATETIME`, no `BOOLEAN DEFAULT 0`).
3. **check-schema-migrations-sync.js** — every model in `schema.prisma` must have a `CREATE TABLE` migration.
4. **npm test** — budget math regression suite (38 scenarios + ~112K fuzz + 12 bid-matrix checks). Must pass.
5. **check-secrets.js** — scans diff for committed credentials.
6. **check-push-size.js** — warns if pushing > 50 files (non-blocking).

### Critical architecture rules

- **`force-dynamic` on every `(app)/` page** — required, no exceptions. The build script enforces it.
- **`schema.prisma` must stay `provider = "sqlite"`** — Amplify's build patches it to postgres. Never commit `provider = "postgresql"`.
- **Engine math lives in `src/lib/calculations.js`** — validated to within 2.3% of source spreadsheet. Do not touch unless a task explicitly says to.
- **`src/lib/activity.js`** — the activity logging system. `logActivity()`, `diffResponses()`, and `describeQuestionnaireChange()` are the key helpers.
- **Every new API route** calls `requireAuth(request)` at the top. No exceptions.

### Recent state (as of 2026-06-23)

- **Engine validated.** Sean ran a full QC pass in June 2026. "THE APPROACH (SEAN'S)" in the live app is the canonical reference project — $501K vs $512K sheet (2.3% gap, all explainable). Engine math is trusted.
- **Mason is using the tool this week** for real client budgets. Don't break the wizard or Summary page.
- **Tasks 1 and 2 (Manny's) are complete:**
  - Task 1: Wizard dirty-field tracking (`manny/wizard-dirty-tracking`) — done 2026-06-23
  - Task 2: Section manual adders (`manny/section-manual-adders`) — done 2026-06-23
- **PDFs (conceptual, design, bid matrix print)** — Sean's responsibility, not Manny's. Don't overlap.
- **Seeded admin accounts for local dev:** `admin@ilcstudios.com` / `ILCadmin2024!`

### Key file locations

| File | Purpose |
|---|---|
| `src/lib/calculations.js` | Budget engine — don't touch without explicit instruction |
| `src/lib/activity.js` | Activity logging helpers — Manny's current work area |
| `src/components/ProjectActivityFeed.jsx` | Activity feed UI — Manny's Task 3 target |
| `src/app/(app)/project/[id]/summary/page.jsx` | Summary page — Task 5 target |
| `src/components/sections/*.jsx` | Wizard section forms — Manny already knows these |
| `prisma/schema.prisma` | DB schema — always `provider = "sqlite"` |
| `.claude/manny-tasks.md` | Manny's live task queue — read this next |
| `.claude/coordination.md` | Cross-team log — read the top 3 entries |

---

## Now read these live files

**Do both of these before writing your response:**

1. Read `.claude/manny-tasks.md` — this has Manny's current active tasks with full specs, acceptance criteria, time estimates, and where to start.
2. Read the top 40 lines of `.claude/coordination.md` — this gives you what Mike and Sean have been doing recently so you're oriented to team state.
3. Run `git log --oneline -10` — see the last 10 commits so you know what's recently landed.

---

## How to respond

After reading those files, respond to Manny with the following structure:

**1. Greeting** — one warm sentence. Call him by name.

**2. "I'm educated" confirmation** — tell him in plain terms that you've loaded the project context, you know what ILC is, you know the team, you know his workflow, and you know his task queue. Be specific — mention one or two concrete things you absorbed (e.g. the engine validation, his completed tasks) to show you actually read it, not just that you claim to have.

**3. Next two days** — lay out Tasks 3, 4, and 5 clearly and briefly:
   - Task 3: Activity feed filtering (start now, ~2-3 hours)
   - Task 4: Old → new values in descriptions (after Task 3, ~2-3 hours)
   - Task 5: Inline budget history on Summary page (bonus, ~1-2 hours)
   Tell him which one to start with and what the very first step is.

**4. Ready prompt** — end with: "Ready to branch and start, or do you want to talk through anything first?"

**Tone:** warm, efficient, confident. Manny is not a developer by background — he wants to be in motion. No jargon dumps. Short sentences.
