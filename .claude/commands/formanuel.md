---
description: Orient Manuel for a new session -- loads full project context, current tasks, and confirms readiness
---

You are a fresh Claude Code instance. Read everything below, then read the two live files listed at the end. Then greet Manny with a warm, specific orientation that confirms you're fully educated and tells him exactly what to do.

## Project

ILC Lighting App -- internal tool for ILC Studios (lighting consultancy). Produces conceptual and design budgets, manages projects, runs CRM. Live at https://app.ilcstudios.com, auto-deploys from `main` via AWS Amplify. Stack: Next.js 14 App Router, Tailwind, Prisma 5.22 (SQLite locally / PostgreSQL in prod), JWT auth, Amplify SSR.

## Team

- **Mike Kershner** -- founder, lead dev, pushes directly to `main`
- **Manny (here now)** -- part-time dev ~10 hr/week, always uses `manny/*` branches + PRs

## Manny's mandatory workflow

1. `git pull --rebase origin main` -- always first, every session, no exceptions. This keeps the branch base current and prevents multi-week drift that makes PRs unreadable. If Manny says "I already pulled" or "let's just start" -- do it anyway.
2. `git checkout -b manny/<description>` -- always a new branch, branched from the just-updated main
3. Edit, test with `npm run dev:3000`, iterate
4. Commit, then `git push` -- pre-push hooks run (~25 sec, never bypass with `--no-verify`)
5. `gh pr create` -- open PR, ping Sean to review. Never push to `main` directly.

## Pre-push hooks (never bypass)

Six checks: dynamic-pages, postgres-migrations, schema-sync, npm test (38 scenarios + 112K fuzz), check-secrets, push-size. If one fails, fix the underlying issue.

## Critical rules

- Every `(app)/` page must export `export const dynamic = 'force-dynamic'`
- `schema.prisma` must stay `provider = "sqlite"` -- Amplify patches it at build time
- `src/lib/calculations.js` is the budget engine -- validated, do not touch unless explicitly asked
- Every API route calls `requireAuth(request)` at the top
- Local dev login: `admin@ilcstudios.com` / `ILCadmin2024!`

## Current state (as of 2026-08-26)

- Tasks 1–32 all merged to main. No active tasks queued.
- Last sprint (Tasks 28–32): agent-runs queue filters + CSV, morning brief check-off, CRM staleness badge, intake success copy fix.
- Sean will add new tasks to `.claude/manny-tasks.md` before next session. If the Active tasks section says "No tasks currently queued", ask Sean before starting anything.

## Key files

- `src/app/(app)/crm/CRMClient.jsx` -- CRM board
- `src/app/(app)/crm/brief/BriefClient.jsx` -- morning brief
- `src/app/(app)/admin/agent-runs/ReviewQueue.jsx` -- agent review queue
- `src/app/conceptual_budget/IntakeClient.jsx` -- public intake form
- `.claude/manny-tasks.md` -- Manny's live task queue (read this now)
- `.claude/coordination.md` -- cross-team log (read top 40 lines)

## Now read these files

1. `.claude/manny-tasks.md` -- full task specs, acceptance criteria, where to start
2. Top 40 lines of `.claude/coordination.md` -- recent team activity

## Your response

After reading both files:

1. **Greet Manny by name** -- one warm sentence
2. **Confirm you're educated** -- mention one or two specifics from the task specs so he knows you actually read them
3. **Current task plan** -- briefly cover Tasks 10 and 11 (the two small ones to start), what they are, and what the very first step is
4. **End with:** "Ready to branch and start, or do you want to talk through anything first?"

Tone: warm, efficient. Manny wants to be in motion. Short sentences.
