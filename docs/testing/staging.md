# Staging copy: proposal

_2026-11-11. A proposal only: nothing below has been created. Creating the database and web service costs money and is Jason's call._

## What already exists
- `render.yaml` (written 11-10): web service `onelux-app` (Docker, standard plan) + its own PostgreSQL 16 `onelux-app-db` (basic-256mb), `NEXT_PUBLIC_APP_ENV=staging` (the "not the live app" stripe), generated `JWT_SECRET`, `CRON_SECRET`, `MCP_API_TOKEN`.
- `scripts/docker-entrypoint.sh`: refuses to start without a 32+ character `JWT_SECRET`, runs **`prisma migrate deploy`** (never `db push`), then `prisma/seed.js`, then serves.
- The seed makes the 1LUX accounts only when `SEED_ADMIN_PASSWORD` is set, each with "must change password", and never resets an existing account.
- All 164 migration folders were applied to an empty PostgreSQL on 11-10 (coordination log). Not yet proved: a full start on Render.

**Status 2026-11-11 (Jason: already running).** `https://onelux-app.onrender.com` answers: `/login`, `/portal/login`, `/conceptual_budget` open (200) with the 1LUX title and the STAGING stripe; `/` and `/dashboard` send to `/login`; `/api/projects`, `/api/users`, `/api/cron/digest` answer 401 without a session. Checked without signing in; nothing was written. So steps 1–2 below are done, and migrations and seed ran (the app would not start otherwise). Still open: steps 3–7. Not checked: what data is in it, whether an AI key is set.

## Proposed steps
1. **Create** (Jason, in Render): New → Blueprint → `jmullenlbc/1lux-app` → Apply. Cost: about $25/month web (standard) + about $6/month database at Render's list prices; check the figures on the Apply screen.
2. **Fill the three blanks:** `SEED_ADMIN_PASSWORD` (12+ characters, typed in Render, not in chat or git), `NEXT_PUBLIC_APP_URL` (the onrender.com address, then redeploy: it is compiled in), `ANTHROPIC_API_KEY` (optional; AI readers answer 503 without it).
3. **Add to `render.yaml`** (a small change, not made yet):
   - `NOTIFY_DRY_RUN=true`, stated rather than left to the default. Today nothing sends either way (`src/lib/notify.js`), but the day a sender is wired in, staging must stay silent.
   - `CAMPAIGN_SENDER` left unset (campaign Send does a fake run outside production).
   - No `S3_*` and no `INTAKE_NOTIFY_*`: the one real sender (SES pre-con alert) stays off, and uploads go to the container disk.
4. **Data.** Two options:
   - **A. Load v7 through the app (recommended).** Sign in as super admin → Admin → CRM upload → `26.10.28 CRM Data Clean Up (final v7).xlsx` (354 projects, 278 companies, 1,206 people), then Admin → Sales reps import (`ILC Sales Reps Review 2026-10-29.xlsx`), Conference Load, and Job Loader with the Modera Marmalade load sheet. This is also the first real test of four loaders Mike has never run for real (watch list W1, W16). "Wipe and load" is safe here because the database starts empty.
   - **B. Copy of production.** Needs a `pg_dump` from the live database, which only Sean can reach today, and it carries real client contacts and password hashes into a test copy. Not recommended until there is a reason the v7 sheet cannot give.
5. **Files.** With no S3, uploads are lost on every deploy. Enough for a first pass. For drawing, receipt and Sales Docs testing add either a Render disk or a separate test bucket (never `ilc-qc-media`).
6. **Schedules.** None at first; run a job by hand when testing it (`x-cron-secret` header). Later: Render cron jobs calling `/api/cron/*`.
7. **Crawl it:** `SMOKE_ALLOW_REMOTE=1 SMOKE_BASE_URL=https://<staging address> npm run test:crawl`, with one login per role given as `SMOKE_<ROLE>_EMAIL` / `SMOKE_<ROLE>_PASSWORD` in the shell (the crawl makes no accounts on a remote copy). Jason creates those six logins in Admin → Users.

## Guard rails
- Production is not involved at any step: no Amplify, no production database URL, no production S3 bucket, no Mike's GitHub (push to `mike` is disabled in this clone).
- `npm run db:push` must not be run against staging or anything else on PostgreSQL. Proposed: remove the script (separate change).
- Add `prisma/migrations/migration_lock.toml` (`provider = "postgresql"`) before the first Render deploy if `migrate deploy` asks for it; the 11-10 check ran without one.
- The crawl refuses any `ilcstudios.com` address.

## Local alternative (no cloud, works today)
`npm run dev:3000` on the local sqlite file is what the first crawl ran against. It has 2 projects and no companies, so every record page is skipped. Loading v7 locally through Admin → CRM upload would fill it without creating anything in the cloud; it is the cheapest way to unblock manual testing this week.
