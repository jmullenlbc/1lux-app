# Moving the 1LUX app from Render to Replit

_2026-11-12. Jason: "we'll push [to Render now]. Just make sure it's going to be an easy transition to Replit when we're ready." Nothing here has been done; it is the checklist for the move and the rules that keep it short._

## Where it runs today (Render)
- `render.yaml`: one web service built from `Dockerfile`, plus its own PostgreSQL 16. Auto-deploys `main`.
- `Dockerfile`: flips the Prisma provider to `postgresql`, builds Next as a standalone server (`DEPLOY_MODE=container`), installs Chromium for PDFs.
- `scripts/docker-entrypoint.sh`: refuses to start without `JWT_SECRET`, runs `prisma migrate deploy`, runs the seed, starts `node server.js`.
- Everything secret is a run-time environment variable. Nothing is baked into the bundle in container mode.

## What already carries over unchanged
- **The code.** Next 14 + Prisma + PostgreSQL. Nothing in `src/` knows it is on Render.
- **Configuration by environment variable.** Same names on Replit (Secrets): `DATABASE_URL`, `JWT_SECRET`, `CRON_SECRET`, `MCP_API_TOKEN`, `SEED_ADMIN_PASSWORD`, `ANTHROPIC_API_KEY`, `S3_*`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_APP_ENV`, `CHROME_PATH`.
- **The database.** Any PostgreSQL works. Move = `pg_dump` from Render → `pg_restore` into Replit's PostgreSQL, then `prisma migrate deploy` (a no-op if it is current).
- **Scheduled jobs.** All are plain HTTP routes guarded by the `x-cron-secret` header: the 10 under `/api/cron/*`, plus polling routes under `/api/bot`, `/api/market-intel` and `/api/automation/intake`. Any scheduler that can call a URL works: Render cron jobs now, a Replit Scheduled Deployment (a `curl` with the header) later.
- **The Layout Lab** (`tools/cliq-layout-lab/`) already has its own `.replit` and runs with `npm start`, no dependencies.

## What has to be redone for Replit
| Today (Render) | On Replit | Notes |
|-|-|-|
| `Dockerfile` builds and runs the image | A `.replit` file with a build command and a run command; system packages through `replit.nix` | Replit Deployments do not run a Dockerfile (check this when we start). The Dockerfile's steps become the build command. |
| Chromium from `apt` | `chromium` (and fonts) from Nix; set `CHROME_PATH` to its path | Without fonts, PDF text comes out as boxes. |
| Entrypoint uses fixed paths (`/app`, `/opt/prisma-cli`) | Run command: `node node_modules/prisma/build/index.js migrate deploy`, then `node prisma/seed.js`, then the standalone server | Small change: make the entrypoint use paths relative to the repo, so one script serves both hosts. |
| Build sets `DEPLOY_MODE=container` | **Must also be set for the Replit build** | Without it `next.config.mjs` falls back to the Amplify path and bakes `DATABASE_URL`, the S3 keys, the Anthropic key and `CRON_SECRET` into the server bundle. |
| Provider flip (`sed` on `schema.prisma`) in the Dockerfile | Same `sed` in the build command | Never commit `provider = "postgresql"`. |
| Build memory: `NODE_OPTIONS=--max-old-space-size=4096` | Check the Replit build and deployment sizes | Runtime needs about 2 GB (Chromium PDFs, AI readers). A Reserved VM is the closer match to Render's always-on service than Autoscale (check pricing). |
| `NEXT_PUBLIC_APP_URL` set in Render, compiled in | Set before the first Replit build; rebuild if the address changes | |
| Uploaded files: the shared bucket once `S3_*` is set (container disk until then) | Same bucket, same settings | See "Files" below and `storage.md`. |

## Files: the one real decision
Uploads (drawings, receipts, Sales Docs, bot knowledge, QC media, project files) go to an S3 bucket when `S3_*` is set, otherwise to the local disk, which both hosts wipe on deploy. Four local folders (`.intake-dev`, `.salesdocs-dev`, `.agent-runs`, `.mcp-audit`) are also disk-only.

- **Done in code (2026-11-12):** every storage module now connects through `src/lib/objectStore.js`, which takes any S3-compatible bucket (AWS S3, Cloudflare R2, Backblaze B2) through `S3_ENDPOINT`. Setup steps for the bucket (Cloudflare R2 recommended) are in `docs/hosting/storage.md`. Once the bucket's five settings are in Render, the move copies them to Replit Secrets and adds the Replit address to the bucket's CORS list; no files are copied.
- Replit's own storage (App Storage / Object Storage) uses its own client, not the S3 calls (check this when we start). We don't need it: the shared bucket works from any host.

## Rules until the move (also in `CLAUDE.md` → "Hosting")
1. No Render-only features in the app: no reliance on Render disks, Render-specific environment variables (`RENDER_*`), private networking or Render's job runner for anything a URL call can do.
2. New settings are environment variables read at run time, listed in the Dockerfile header and `render.yaml`, and added to the table above.
3. New scheduled work is an `/api/cron/*` route with the `x-cron-secret` check, not a host feature.
4. Files go through the storage modules, which connect through `src/lib/objectStore.js`; never a new direct disk path or a second S3 client.
5. New system packages (like Chromium) are noted here with their Nix name.

## Move day, in order
1. Freeze deploys on Render (turn off auto-deploy).
2. Create the Replit app from `jmullenlbc/1lux-app`; add `.replit` + `replit.nix`; copy the Secrets (new `JWT_SECRET` signs everyone out, the same one keeps sessions).
3. Create Replit's PostgreSQL; `pg_dump` Render → restore; run `migrate deploy`.
4. Copy the five bucket settings into Replit Secrets and add the Replit address to the bucket's CORS list (no file copy).
5. Build with `DEPLOY_MODE=container`; check `/login`, sign in, open a job, make a PDF, run one cron route by hand.
6. Recreate the schedules; update `NEXT_PUBLIC_APP_URL` and rebuild if the address changed; point any domain.
7. Run the smoke crawl against the Replit address (`SMOKE_ALLOW_REMOTE=1`, one login per role).
8. Keep Render stopped (not deleted) for a week, then delete it.
