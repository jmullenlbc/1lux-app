# Claude Coordination Log

Cross-session memory for the ILC platform. Read this at session start to see what the other user's Claude has been up to. Append (newest at top) after meaningful work. See project-root `CLAUDE.md` (section: Cross-Session Claude Coordination) for the rules.

## Sean's Claude — 2026-08-19: Project file storage moved to S3

- **Commit `6ac9bfb`**: new `src/lib/projectFileStorage.js` — `putProjectFile`, `getProjectFileBuffer`, `deleteProjectFile`. In prod (S3_BUCKET set), reads/writes `project-files/{projectId}/{tab}/…` on the existing `ilc-qc-media` bucket. In dev, falls back to local `uploads/` (no dev config change needed). The `project-files/` prefix deliberately avoids the 1-day lifecycle rule targeting `uploads/`.
- Updated 9 routes: `POST /api/projects/[id]/files` (write), `GET+DELETE /api/projects/[id]/files/[fileId]`, `/reparse`, `/portal/…/files/[fileId]`, `analyze-contract`, `unit-matrix/parse`, `tracker/extract`, `tracker/import-toc`. Old `storedPath` rows (no `project-files/` prefix) fall back to local disk read — graceful degradation for pre-migration records.
- **S3 console steps**: Already completed 2026-08-18 — CORS, lifecycle rule (`uploads/` prefix, 1-day expiry), IAM policy confirmed. Mike's email references these as "still blocking" but they are done; the S3 work above was the remaining code item.
- Manny PDF also delivered this session: `manny_ilc_guide.pdf` — Task 27 (portal invite bridge) + bonus tasks 17 & 18.

## 🚨 FOR SEAN — 2026-08-19 (from Mike, via Mike's Claude): move project file storage to S3 — plus a prod-wide PDF outage just found and fixed

**Context: Mike uploaded a construction schedule to Zenith on 25th (PRJ-0002) in production and no dates came out.** Diagnosing that turned up three separate production defects. Two are already fixed on Mike's side (local, undeployed). The third is yours, and it is the big one.

### 🔴 YOUR ITEM — move project file storage off the Lambda disk and onto S3

`POST /api/projects/[id]/files` writes uploads with `writeFile(path.join(process.cwd(), 'uploads', projectId, tab, stored))`, and every later read (`/files/[fileId]/reparse`, downloads, re-analysis) reads back from that same path. **In Amplify each Lambda instance has its own ephemeral filesystem**, so the database row survives and the bytes do not. Verified live today: a file uploaded the same morning already returned `{"error":"File not found on disk"}`.

Consequences: no uploaded file is reliably re-openable or re-parsable in production, on ANY tab — not just construction schedules. The app effectively gets exactly one chance to read a document, at upload time.

**The fix:** store to the permanent `ilc-qc-media` bucket instead of local disk, and read from S3 (presigned GET) everywhere `storedPath` is read today. Most of the plumbing already exists — the direct-to-S3 upload work is built and verified locally (`/api/intake/parse` + `DrawingDropzone`); this extends the same pattern to the general project-files path and adds the read side.

**Blocked on:** the 3 S3 console steps below (2026-08-18 entry) — same bucket, same three settings. Those gate this too, so closing them out unblocks both.

**Scope note:** these files are permanent records, not scratch — do NOT put them under the `uploads/` prefix that the 1-day expiry lifecycle rule targets. Use a separate prefix (e.g. `project-files/`) that the lifecycle rule does not match.

### ✅ ALREADY FIXED on Mike's side (local only, NOT deployed) — for your awareness

1. **pdfjs worker missing from every Lambda — this was the actual cause, and it broke far more than schedules.** `pdf.mjs` has a static block that does `GlobalWorkerOptions.workerSrc ||= "./pdf.worker.mjs"` on Node and then `await import(this.workerSrc)`. That dynamic import is invisible to Next's file tracer, so `pdf.worker.mjs` was never copied into any Lambda and `getDocument()` threw `Setting up fake worker failed` **before page 1** — the tell is `pages=0 read=0`. Audited against real build output: **all 11 PDF-reading API routes were affected** (intake parse, fixture schedule, contract analysis, tracker extract + import-toc, unit matrix, site parse, drawing submissions, peer review, files, reparse). Every server-side PDF read in production has been dead.
   Fixed by force-including the worker (and `standard_fonts/`, which two routes were also missing) on all 11 routes in `next.config.mjs`, pinning `workerSrc` to an absolute `file://` path in a new `src/lib/pdfjsNode.js` that is now the only sanctioned way to load pdfjs server-side, and extending `scripts/check-runtime-assets.mjs` so a missing worker **blocks the build**. Verified end-to-end: the exact production error was reproduced locally in the dev server, and after the fix the real `/reparse` route pulled **13 milestones off a 96-page schedule PDF** and wrote all three project date columns. Build green, 26/26 runtime assets present in the traces, 321 unit tests + smoke + DN-leak all passing.
   Two extra traps worth knowing if you touch this: `createRequire(import.meta.url)` resolves to a phantom `(rsc)` path inside a webpack server bundle (the finder now checks the file actually exists on disk), and pdfjs **memoizes the worker-load failure on the class** — once it fails, every later PDF in that process returns the same stale error until the process restarts.
   *This is the same trap that previously bit the Chromium binary and then `standard_fonts/` — third instance. The build gate now covers all three.*

2. **Project-level date columns could never save on Postgres.** Four call sites used `prisma.$executeRawUnsafe(... WHERE "id" = ?)`. `?` placeholders are SQLite-only — valid locally, invalid on prod Postgres — and all four were inside silent `catch {}`. Replaced with the typed Prisma client (the columns exist in `schema.prisma`), and the catches now log.

3. **Reparse now falls back to stored text.** When the PDF is gone from disk, `/reparse` re-runs milestone extraction from `ProjectFile.textContent` saved at upload time instead of 404ing. This is a stopgap that makes the button work today; it is *not* a substitute for item 1 above.

**Nothing here is deployed.** It ships on Mike's next explicit "Deploy," after the full pre-deploy debug pass.

---

## ⏰ FOR SEAN — 2026-08-18 (from Mike, via Mike's Claude): the 3 S3 steps are DUE TODAY — please close them out

**Mike asked again today, directly: "Can you have Sean finish those 3 things for the S3 steps."** This is the same ask as the 2026-08-17 entry below — target date was today, and nothing has been noted back yet, so treating it as still open.

All three are on bucket **`ilc-qc-media`** (us-east-2), all console-only, ~10 minutes total. Full click-by-click walkthrough: `G:\Shared drives\SOFTWARE\_MIKE's APP\Software engineering\2026.08.17 Direct-to-S3 Uploads — S3 Console Checklist.md`.

1. **CORS** — S3 → `ilc-qc-media` → Permissions → CORS → Edit → paste:
   ```json
   [{"AllowedOrigins": ["https://app.ilcstudios.com"], "AllowedMethods": ["PUT"], "AllowedHeaders": ["Content-Type"], "MaxAgeSeconds": 3600}]
   ```
2. **Lifecycle** — Management tab → Create rule `expire-direct-uploads-1-day`, scoped to prefix `uploads/` (**trailing slash matters** — it protects the QC screenshots under `qc/`) → Expire current versions after 1 day → also enable "Delete incomplete multipart uploads" at 1 day.
3. **IAM check** — IAM → Users → whichever user backs the app's `S3_ACCESS_KEY_ID` (likely `ilc-amplify-s3`) → check the policy Resource. If it's `arn:aws:s3:::ilc-qc-media/*`, nothing to do. If it's scoped to `.../qc/*`, add:
   ```json
   {"Effect": "Allow", "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"], "Resource": "arn:aws:s3:::ilc-qc-media/uploads/*"}
   ```

**Why it matters / what it's blocking:** Amplify's front door 413s any upload over ~4.4 MB on every production upload path, so real drawing sets cannot be parsed in prod at all today. The direct-to-S3 fix is **built and verified locally** and is sitting undeployed waiting on these three settings. Once you note them done here, Mike's Claude runs the full pre-deploy debug pass and it ships on Mike's next explicit "Deploy."

**When done:** one line in this log is all we need. If any of the three is blocked (permissions, wrong account, can't find the IAM user), say which one and we'll unblock it rather than let the whole thing sit.

---

## 📋 FOR SEAN — 2026-08-17 (from Mike, via Mike's Claude): your consolidated backend to-do list

**Mike asked for one master list of everything on your plate, backend-wise.** This gathers every open FOR-SEAN item scattered through this log into one place, newest asks first. Also emailed to operations@ilcstudios.com. When an item is done, a one-line note here is all we need.

### A. Dated / quick
1. **The 3 S3 console steps — tomorrow, 2026-08-18.** Full details in the next entry below (and in today's email + the checklist doc on the G drive). This is the gate on shipping direct-to-S3 uploads, which unblocks >4.4 MB drawing sets in production.
2. **Codespaces `ANTHROPIC_API_KEY` secret** — ~2 minutes, asked 2026-08-13, still unconfirmed. GitHub → repo → Settings → Secrets and variables → Codespaces → new secret `ANTHROPIC_API_KEY` (same value as in Amplify env vars).

### B. Schema (your lane)
3. **`McpQueryLog` table** — additive, no drops. Until it exists, `/api/mcp` returns **503 in production by design** (it refuses to answer what it can't audit-log). Full field table is in the 2026-08-08 "MCP row-scope fix" entry further down.
4. *(Optional)* **Real `reviewedAt` column on `ConceptualSubmission`** — nothing depends on it (`updatedAt` records review time today); only add it if you want it.

### C. Feature work
5. **Finish admin + user privileges** — Mike's standing #1 for your queue since 2026-07-18. Unchanged. (And the companion rule stands: **CRM/pipeline build-out stays paused until you and Mike talk.**)

### D. AWS infra
6. **EventBridge schedule rule for the nightly usage rollup** — the `/admin/usage` Usage & Health dashboard (built on Mike's side, local) has a nightly rollup job that needs an EventBridge rule to actually fire on a schedule in AWS. The console step is the missing piece; ping Mike's Claude here if you want the exact route/target when you pick it up.
7. **Security-pass item you noted yourself (2026-06-15):** replace the `ilc-amplify-s3` IAM user + env-var access keys with a proper SSR compute role, then delete the `S3_*KEY*` lines from `next.config.mjs` and the console env vars. No date on this — your call when the security pass happens.

### E. Answers Mike's Claude is waiting on
8. **`ProjectAccess` / `ProjectAssignee`:** are those unused join tables the intended long-term client-access model? If yes, the MCP scope predicate moves off `createdById` — one file, one map. If no, we'll keep `createdById` and can drop the dead tables in some future cleanup you author.

### F. Smaller backend follow-ups (flagged in recent reviews, not yet assigned — Mike is routing backend to you)
These are headline-level; ask Mike's Claude here for file-and-line detail on any of them before starting:
- **Possible DN/buy-price exposure via `ManufacturerProduct.cost`** in an API reachable by non-ILC users — verify and close. (Buy-price leakage is our worst leak class; see the 2026-08-08 `.catch()` entry.)
- **Share-link / fixture-schedule tokens** possibly exposing more than intended to unauthenticated holders — verify and close.
- **Build-time guard for `ANTHROPIC_API_KEY`** — fail the build loudly if the key is absent, so AI parsing can never again be silently dead in prod.
- **Dashboard null-session crash** — `dashboard/page.jsx` can throw a TypeError when there's no session; needs a guard.
- **Doc rot:** one false statement in `CLAUDE.md` (~line 106) and a stale comment block at the top of `IntakeClient.jsx` — both describe behavior that no longer exists.

---

## 🔑 FOR SEAN — 2026-08-17 (from Mike, via Mike's Claude): please do the 3 S3 console steps TOMORROW (2026-08-18)

**Mike asked for you to own this — target: tomorrow, 2026-08-18.** (This supersedes the earlier plan of Mike doing it himself this afternoon.) An email notification was also sent to operations@ilcstudios.com.

**Why:** Amplify's front door rejects any upload over ~4.4 MB (empty 413) on every prod upload path, so real drawing sets can't be parsed in production. The fix — browsers uploading straight to S3, bypassing Amplify — is **built and verified locally**, but it needs three one-time AWS console settings before it can be deployed. All three are on bucket **`ilc-qc-media`** (us-east-2). Full click-by-click walkthrough: `G:\Shared drives\SOFTWARE\_MIKE's APP\Software engineering\2026.08.17 Direct-to-S3 Uploads — S3 Console Checklist.md`.

1. **CORS** — S3 → `ilc-qc-media` → Permissions → CORS → Edit → paste:
   ```json
   [{"AllowedOrigins": ["https://app.ilcstudios.com"], "AllowedMethods": ["PUT"], "AllowedHeaders": ["Content-Type"], "MaxAgeSeconds": 3600}]
   ```
2. **Lifecycle** — Management tab → Create rule `expire-direct-uploads-1-day`, scoped to prefix `uploads/` (**with the trailing slash** — protects the QC screenshots under `qc/`) → Expire current versions after 1 day → also enable Delete incomplete multipart uploads at 1 day.
3. **IAM check** — IAM → Users → the user backing the app's `S3_ACCESS_KEY_ID` (likely `ilc-amplify-s3`, see your 2026-06-15 entry) → look at its policy Resource. If it's `arn:aws:s3:::ilc-qc-media/*`, do nothing. If it's scoped to `.../qc/*`, add:
   ```json
   {"Effect": "Allow", "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"], "Resource": "arn:aws:s3:::ilc-qc-media/uploads/*"}
   ```

**When done:** note it here (one line is fine). Mike's Claude will then run the full pre-deploy debug pass; the code ships on Mike's next explicit "Deploy". Proof after deploy: drop a >4 MB drawing set on app.ilcstudios.com/conceptual_budget and watch it parse instead of 413ing.

---

## 🔑 FOR SEAN — 2026-08-13 (from Mike, via Mike's Claude): please add the `ANTHROPIC_API_KEY` Codespaces secret

**Mike asked for you to own this one.** The repo now supports GitHub Codespaces (`.devcontainer/` + `CODESPACES.md`, merged 2026-08-08), but a Codespace has no `.env` — AI features (drawing parsing, fixture-schedule parsing, Ask-AI) need the Anthropic key to come from a **GitHub Codespaces secret** instead.

**What to do (one-time, ~2 minutes):**
1. GitHub → the repo → **Settings → Secrets and variables → Codespaces → New repository secret**
2. Name: `ANTHROPIC_API_KEY`
3. Value: the same key that's in Amplify → Hosting → Environment variables (or the local `.env` / password manager)
4. Save. Any new Codespace picks it up automatically as an env var; existing Codespaces need a rebuild.

**When done:** note it here (one line is fine) so Mike's Claude can stop reminding Mike about it every session.

---

## 🔑 FOR SEAN — 2026-08-09: the `admin@ilcstudios.com` password was exposed and has been rotated

**Action for you: none required, but your saved copy of that password is now wrong.** If you have it in a password manager, a note, or a script, delete it — don't try it. Ask Mike directly for the new one.

**What happened.** A Claude Code permission file (`.claude/settings.local.json`) under Mike's `G:\My Drive\BUDGETING TOOL SOFTWARE` folder had the `admin@ilcstudios.com` password sitting in it in plain text as part of a pre-approved command. That folder is Google Drive, so the file had been syncing to the cloud — and every prior version of it was retained in Drive's version history, which meant deleting the line alone would not have removed the password.

**What was done (2026-08-09, by Mike):**
1. The credential line was stripped from the file.
2. Drive version history for that file was purged back to same-day versions only.
3. **The `admin@ilcstudios.com` password was rotated.** Treat the old one as burned.

**Why you're being told.** Mike confirmed you have access to that Drive location, so the old password was readable by you and by anyone else on that share. Nothing suggests it was used — this is precautionary. Worth a look at your own side: if you keep any ILC credential inside a file under a synced Drive or Dropbox folder, the same version-history problem applies to it.

**Related, same day:** the pre-approved-command lists in that file were tightened — blanket `git push` / `git add` / `git commit` / `deploy.ps1` approvals and a stored destructive-database consent were all removed, and the filesystem read scope was narrowed from the whole `C:\` drive to ILC paths only. Deploys now require Mike to say so explicitly, every time. If you maintain an equivalent file on your machine, the same three categories are worth auditing: standing deploy rights, standing destructive-DB consent, and drive-wide read scope.

---

## Sean's Claude — 2026-08-18: AWS infra + CRON_SECRET fix

- **Commit `922a614`**: added `CRON_SECRET` to `next.config.mjs` env block — same Amplify Gen 1 trap as DATABASE_URL/S3 keys; without this the Lambda compared the EventBridge header against `undefined` and returned 401 on every cron call.
- **EventBridge rule created**: `ilc-usage-rollup-nightly` (Scheduled rules, classic EventBridge) — cron `0 12 * * ? *` UTC, targeting the `ilc-app-cron` API destination → `https://app.ilcstudios.com/api/cron/usage-rollup` with `x-cron-secret` auth. Enabled and live.
- **S3 ilc-qc-media bucket**: CORS updated (PUT from app.ilcstudios.com), lifecycle rule added (uploads/ prefix expires after 1 day), IAM policy `ilc-qc-media-rw` confirmed correct (PutObject/GetObject/DeleteObject).
- **GitHub Codespaces secret**: `ANTHROPIC_API_KEY` added to repo Codespaces secrets — Mike can now use AI parsing in a Codespace.
- **Pre-existing `verify` failure** (not introduced here): `sensitivity coverage` gate fails because Mike's ontology system references fields not yet in the local SQLite schema. Pre-push hooks all pass — this only affects `npm run verify`, not deploys.

## ⚠️ Mike's Claude — 2026-08-08 (latest): a bug pattern to never write again — `.catch()` on `requireAuth()`

**Nothing for you to fix. This is a "don't reintroduce it" note.** The tree is clean as of this entry: all 215 API route files that call `requireAuth()` / `requireRole()` check the returned `error`, and zero call sites still use the broken form.

**The pattern:**

```js
// ❌ BROKEN — this route is public
const { error } = await requireAuth().catch(() => ({}));
// `error` is never checked, and the catch never fires
```

**Why it's invisible.** `requireAuth()` **returns** its 401 as a value; it does not throw. So the `.catch()` is dead code — it can never run — and because the destructured `error` is then never inspected, execution falls straight through into the handler body. It reads like a guard. It lints clean. It builds clean. It has no guard in it at all.

**What it actually cost us.** This exact line was on `GET /api/projects/[id]/change-orders/[coId]/pdf` (fixed; see the comment at the top of that file, which is deliberately left in place as a tombstone). The route served the change-order PDF to anyone holding the URL, and combined with `?hideInternalDN=false` it published **ILC's buy price**. That is the single worst leak class in this codebase.

**The rule.** Two lines, always, nothing between them:

```js
const { user, error } = await requireAuth();
if (error) return error;
```

Never `.catch()` an auth guard. If you ever find yourself wanting to, the thing you actually want is `if (error) return error;`. A `.catch()` on `req.json()` is fine and common (`await req.json().catch(() => ({}))`) — that one is parsing, not authorization. The distinction is the whole point.

**Cheap way to check yourself** — should print nothing:

```bash
for f in $(grep -rl "await requireAuth()\|await requireRole(" src/app/api --include=*.js); do grep -q "if (error)" "$f" || echo "$f"; done
```

---

## Mike's Claude — 2026-08-08: MCP row-scope fix + ONE SCHEMA ASK (`McpQueryLog`)

**Status: ON `main`** as of this commit. The `McpQueryLog` ask below is still open — until that table exists, `/api/mcp` returns **503 in production by design** (it refuses to answer anything it can't log). Nothing else depends on it; the rest of the release is live.

**Schema ask (additive, no drops) — `McpQueryLog`.** The Librarian (`/api/mcp`, Slice 3 of the Governed AI Layer) refuses to serve at all unless it has somewhere to write an audit row: sink order is `prisma.mcpQueryLog` → a local JSONL file → **nothing, which means a 503 in production**. So today the endpoint would be dead on Amplify. Locally it falls back to `.mcp-audit/mcp-queries.jsonl` (gitignored). Fields it writes:

| field | type | note |
|---|---|---|
| `id` | String @id @default(cuid()) | |
| `createdAt` | DateTime @default(now()) | index this |
| `tool` | String | e.g. `query_records` |
| `params` | String | the QUESTION, never the answer — see below |
| `status` | String | `ok` \| `rejected` \| `error` |
| `rowCount` | Int? | scale of access, not contents |
| `callerType` | String | `session` \| `service` |
| `callerId` | String? | User id when a session |
| `callerRole` | String? | |
| `audience` | String | `ilc` \| `client` |
| `errorMessage` | String? | |
| `durationMs` | Int? | |

**Deliberately no row contents.** A log that copied the rows would be a second, unredacted store of the same buy prices — and one nothing redacts on the way out. There's a test asserting the DN never appears in the log.

**The bug I found and fixed (no schema involved).** `/api/mcp` was doing field-level redaction with **no row-level scoping**. A logged-in `CLIENT_VIEWER` could send `{"tool":"query_records","params":{"model":"Project"}}` and get **all 25 projects and all 12 clients by name** — every field correctly redacted, the whole book of business enumerated. It also defeated an intent already in the code twice over: `search` deliberately returns `clients: []` to a client audience, but `query_records model:'Client'` handed over all 12 one tool over; and `src/app/api/projects/route.js` carries the comment *"External Client Viewers stay scoped to their own — never widen this to CLIENT_VIEWER"*, which `/api/mcp` widened.

Fixed in a new `src/lib/mcp/scope.js` that **mirrors the existing rule rather than inventing a second access model** — `{ createdById: user.id }`, reached from each registered object by its relation path. It **fails closed**: an object with no declared scope path is unreachable to a non-ILC caller, so a model you add later is invisible to clients until someone writes down how it relates to a project. Probe before: 25 projects / 12 clients. After: 0 / 0 / 403. 48/48 acceptance tests over real HTTP as a real logged-in CLIENT_VIEWER.

**Question for you (not blocking):** the schema has unused `ProjectAccess` and `ProjectAssignee` join tables. I used `createdById` because that's what the live app uses today, but if those tables are the intended long-term client-access model, say so and I'll move the scope predicate over — it's one file and one map.

Also: `scripts/check-shared-metrics.mjs` was blocking `npm run verify` because it greps for the bare identifier `pipelineProbability`, and `src/lib/ontology/objects/project.js` *declares* that column to classify it `ilc_only`. Added to the checker's existing ALLOW list — the ontology has no arithmetic in it, and the rule was blocking us from marking the field sensitive.

---

## ✅ Mike's Claude — 2026-08-08 (later): the prod bug fix is ON MAIN — no action needed from you

**`5c241a1` is pushed to `main` and Amplify is building it.** The `/admin/intake` approve/reject 500 described in the entry below is fixed in that commit — you do **not** need to cherry-pick anything, and no schema work is required (I dropped the phantom `reviewedAt` write rather than ask you for a column; `updatedAt` already records review time). If you'd still prefer a real `reviewedAt` column later, that's yours to add — nothing depends on it.

Also in this deploy: garageSf/corridorSf wired through the questionnaire → engine, landscape lighting $3,000 cap, `$300` battery wallpack + `egressUpliftPct` added to pricing but **deliberately unwired**, the `PricingEditor` `perStall`→`perFixture` fix, `.devcontainer/` + `CODESPACES.md`, and a `scripts/prototypes/pagefinder.mts` prototype (prototype only, nothing imports it). Pathway-lighting rates are in pricing as **provisional and unwired** — Mike is still collecting wrap-surface-parking and garden actuals, so don't wire them.

**Debug pass before the push, all green:** 10 verify gates incl. a real production build + runtime-asset trace · 38/38 budget assertions · 8,000-scenario fuzz (111,997 invariant checks, 0 failures) · 12/12 bid matrix · the budget engine run against **all 25 real projects** (no throws, no NaN/Infinity/negatives, `total = lighting + controls` within $0.02 on every one) · 5/5 role-aware smoke · 6/6 intake edge cases · 6/6 review-queue gate. **No `prisma/` diff in the release**, so `db push --accept-data-loss` had nothing to drop.

**Two standing asks from Mike, unchanged:** pause CRM/pipeline build-out until he talks to you; finish admin + user privileges.

---

## Mike's Claude — 2026-08-08: intake review — PROD BUG found + fixed on branch (now shipped, see above)

**Mike answered your Task 27 question: YES, build the portal invite bridge.** Guard check done: `api/portal/projects/[id]/conceptual-budget` returns client-facing totals only (total/per-SF/per-unit, no line items, no DN) behind portal auth + `canViewBudgets` — clean. Proceed.

**Security/correctness review of the 08-04 intake deploy** (Mike requested). Findings, all fixed and live-tested on branch `wip-pathway-rates-and-pagefinder`:

1. **PROD-BROKEN: `/admin/intake` approve/reject 500s on every click.** `admin/intake/[id]/route.js` writes `reviewedAt`, which **does not exist on the ConceptualSubmission model** → PrismaClientValidationError on every update since the 08-04 deploy. Fixed by dropping the field (`updatedAt` records the time). If you'd rather have a real `reviewedAt` column, that's schema = yours. **Until this reaches main, the review queue cannot approve anything.** Either Mike deploys the branch, or you cherry-pick this one-line fix sooner — your call, flag to Mike.
2. Same route: `clientId: clientId || null` **wiped the client link on any PATCH that omitted clientId** — approving after linking silently unlinked, which would break your Task 27 bridge (`duplicateMatchId` flow likewise worth checking). Now only touched when the request sends it.
3. `api/intake/submit`: the work-email gate was **client-side only** — a direct POST accepted gmail/disposable addresses. `classifyIntakeEmail` now enforced server-side (422 + message).
4. Same route: **no rate limit** (the parse route had one from day one). Added per-IP 5/min, 429 + Retry-After.
5. Same route: **unbounded `rawPayload`** — added 200KB cap (413).
6. Same route bug: `proposedName: companyName || projectName` stored the **company name as the project name** whenever a company was entered. Now always projectName; company rides in rawPayload.
7. Same route: now **auto-links `clientId` on an explicit `Client.emailDomains` match** (the field's whole purpose) — domain matches only, website matches stay reviewer suggestions.

All verified against the running app (gmail 422 ✅ · valid 200 ✅ · 250KB 413 ✅ · flood 429 ✅ · link→approve preserves client ✅ · reviewer recorded ✅). 8 verify gates pass.

---

## the collaborator's Claude — 2026-08-04

**Intake pipeline is now end-to-end deployed.** Mike's `/start` page (commit `981ac0b`) + drawing parse are untouched. We added: (1) `api/intake/submit/route.js` — public POST endpoint that writes to `ConceptualSubmission`; (2) wired Mike's `IntakeClient.jsx` submit button (was deliberately disabled pending schema) — success/error states, amber active button (commit `ef64284`); (3) admin review queue at `/admin/intake` (Manny Task 24, `5a3314c`); (4) portal UX cleanup — back link + project name in portal header (Manny Task 25, `ee4c2a4`); (5) cadence health badge on Client → Contacts tab (Manny Task 26, `a3ff283`). All 6 pre-push hooks passed. Amplify deployed.

**Building as Task 27 (Manny):** submission → portal invite bridge. After admin approves a submission and links it to a project (`duplicateMatchId`), the detail panel shows a "Send Portal Invite" button. Clicking it creates a `ProjectExternalContact` for the submitter with `canViewBudgets: true`, generates an `inviteToken`, and calls the existing `portalInvite()` email template. The invite URL is also displayed in the panel for manual copy/paste while Graph API email is not yet wired. The submitter follows the link to `/portal/invite/[token]`, sets a password, and can view their conceptual budget in the portal. Spec in `.claude/manny-tasks.md`.

---

## the collaborator's Claude — 2026-07-27

Completed Mike's blocking schema request (August 1 deadline). Merged PRs #16/#17/#18 (Manny's Tasks 1, 2, 22) to main, deployed. Migration 0053 (`ConceptualSubmission`, `Client.emailDomains`, `Project.preconManagerId`) is now live in production. All 6 pre-push hooks passed. New Manny queue (Tasks 23–26) written to manny-tasks.md and PDF on the collaborator's Desktop. Admin+user privileges work was confirmed already done (Mike's commits 9097ba0, e3a3aa2, ad13051). CRM pause per Mike's July 18 directive remains in effect — Manny's new tasks are all non-CRM.

---

## 🖥️ CODESPACES SUPPORT — from Mike's Claude, 2026-07-22 (merged 2026-08-08)

The repo now has `.devcontainer/` + `CODESPACES.md` (on branch `wip-pathway-rates-and-pagefinder`, merges to main at Mike's next Deploy). You can develop in a GitHub Codespace instead of a local machine — same rules, different dev command (`npm run dev:codespace`), no `.env` (GitHub Codespaces secrets instead). `CLAUDE.md` has a new "laptop OR Codespace" section. Nothing about Amplify/deploys/schema changes.

---

## 👋 COLLABORATOR — START HERE NEXT SESSION (2026-07-18)

Three things, in priority order. **#1 is blocking Mike's 2-week deadline.**

**1. Add the intake schema (blocking).** Full spec in the "SCHEMA REQUEST" section directly below — `Client.emailDomains`, `Project.preconManagerId`, and a `ConceptualSubmission` model. All additive, nothing dropped. Mike is building the public conceptual-budget intake tool against these; the pure logic is already written and unit-tested in `src/lib/intake.js` (22 tests, `npm run verify`), so the moment the fields exist it wires straight up. **Please add the Postgres migration too** — local `db push` alone doesn't reach prod.

**2. Finish admin + user privileges** — Mike's standing ask from earlier today, still the priority for Manny's queue. CRM/pipeline UI stays paused until Mike says otherwise.

**3. Don't re-add `perStall`.** I removed `exterior.surfaceParking.perStall` from the pricing admin — see the note below for why it was dead. There's still an orphaned `perStall: 1325` key sitting in the saved SystemConfig pricing blob; it's inert (the engine prefers `perFixture`) so I left it rather than write to prod config. Bin it if you're touching that blob anyway.

**Heads up on the run command:** `npm run verify` is now **8 gates** (added a `unit tests` gate). It's fast and static — no server, no DB. Run it before you push.

---

## 🔧 SCHEMA REQUEST — from Mike's Claude, 2026-07-18

Mike is building a **public conceptual-budget intake tool** (external, non-ILC users, target live in 2 weeks). It needs schema I won't add unilaterally — schema is yours, and `amplify.yml` runs `prisma db push --accept-data-loss` on every deploy. **All of the below is additive** (new optional fields + one new model); nothing is removed, renamed, or retyped, so no existing production data is at risk.

**1. `Client.emailDomains String @default("[]")`** — JSON string array, matching the existing `markets`/`geographies` convention. This is the blocker: there is currently **no way to resolve `bob@acme.com` to a Client**. The only `domain` anywhere in the schema is inside a free-text automation-rule config blob. Public intake maps submitter → client by domain, so this field is load-bearing.

**2. `Project.preconManagerId String?` + relation to `User`** (suggest `@relation("ProjectPreconManager")`, mirroring `ProjectSalesOwner`). Today "pre-construction" exists **only** as a suggested free-text value for `ClientContact.department` — i.e. a label on an *external* contact, not an internal ILC assignee. Mike wants a real per-project ILC pre-con manager.

**3. A submission/queue model** (working name `ConceptualSubmission`). Public submissions must **not** create live `Project` rows — an ILC reviewer accepts them and checks the math first. `Project.createdById` is required, so there's no anonymous-draft path today. Fields roughly: submitter name/email/domain, resolved `clientId?`, proposed project name, duplicate-match info, uploaded file refs, the raw answer payload, `status`, `reviewedById?`, timestamps.

Happy to write the migration if you'd rather review than author — just say which way you want it.

---

## ⚠️ HEADS UP — pricing/calc edits in your area, 2026-07-18

Per the boundary below you own budget/pricing math. Mike directed these three changes today, so flagging rather than surprising you:

1. **Landscape lighting was uncapped and ignored master pricing.** `calculations.js` hardcoded `lotSf * 0.02` and never read `PRICING.exterior.landscape.pctOfNetLotSf` — so editing that rate in `/admin/pricing` did nothing. The source questionnaire says *"for most projects do not exceed $3,000"*; a 400k SF lot returned **$8,000** and a 1M SF lot **$20,000**. Now `Math.min(lotSf × pct, PRICING.exterior.landscape.maxTotal)` with `maxTotal: 3000`. **No-op below 150,000 SF**, so typical projects are unchanged.
2. **Same formula was hardcoded a second time** in `ExteriorSection.jsx` — the UI preview and the engine could drift independently. Both now read master pricing.
3. **Added `exteriorDoor.wallpackWithBattery: 300` + `egressUpliftPct: 0.10`** to pricing, exposed in the pricing admin, but **deliberately NOT wired to the formula**. The target model (floor-1 egress door count +10%, battery wallpack each) is blocked on drawing parsing. Switching it would move that line from $212.50/door to $300/door on every existing project — a live-data change that shouldn't happen silently.

4. **Fixed a dead admin control.** `PricingEditor.jsx` edited `exterior.surfaceParking.perStall`, but **nothing reads that key** — `pricing.js` defines `perFixture: 1325`, and both `calculations.js` (`perFixture ?? perStall ?? 1325`) and `ExteriorSection.jsx` (`perFixture ?? 1325`) read `perFixture`. Since `perFixture` always exists, **every edit made through that admin field was silently discarded.** Confirmed in the DB: the saved pricing blob contains both `perFixture: 1325` and an orphaned `perStall: 1325`. They happen to be equal, so no budget was ever wrong — but any edit would have vanished. Editor now points at `perFixture`, and the label is corrected (it's $1,325 per *fixture* covering ~9 stalls, not per stall). Also exposed `stallsPerFixture`. Mike called this one directly: *"Fix it, I know more about this than the collaborator."*

**Still open, needs a decision (not touched):** `buildingFootprintSf` is read into `calculations.js` and never used — the "lot minus footprint" the UI hint promises isn't implemented, landscape uses raw lot SF. Implementing it would *reduce* existing budgets, so it's a pricing decision rather than a cleanup.

**Also deferred by Mike:** surface parking and pathway lighting both need real formulas ("needs a deeper discussion"). Pathway is 100% manual today despite `PRICING.exterior.bollard.perUnit = 800` existing and being wired to nothing; `surfaceParking.solarUpgrade = 3000` is likewise unwired. Mike owns this design call.

`npm run verify` passes (**8 gates**) after all of the above.

---

## ⚠️ FOR COLLABORATOR — from Mike, 2026-07-18

> **"Pause on building out the CRM until we talk. Finish the admin and user privileges."**

**Action needed in `.claude/manny-tasks.md`:** please pull the remaining CRM/pipeline UI tasks out of Manny's queue and repoint him at **admin + user privileges** instead. That's the work Mike wants finished next. Manny's execution has been fine — this is about *what's in the queue*, not how it's built. Let's talk before any further CRM/pipeline UI work.

**Why the privileges work matters right now:** a related bug was live in production until today — projects were gated to *creator-or-super-admin* in 7 places, so `COMPANY_ADMIN` and regular `USER` accounts saw **zero projects** and 404'd opening any (fixed in `9097ba0`). Roles/permissions are clearly under-specified, which makes this the right next thing to nail down properly.

---

**Also — hold off on any more CRM/pipeline UI tasks until we've drawn an ownership line.** Nothing wrong with the code quality — the security hygiene commit (`206f1fb`) was genuinely good and I've kept all of it. The problem is that we were both building sales/pipeline views in parallel with no boundary, and it produced **two different answers to the same question**, which is the one outcome we can't ship.

**What collided, and how it's now resolved** (all reconciled in `9097ba0`+, please pull before touching this area):

1. **Win rate was computed two different ways.** The CRM stats bar used `won ÷ (won + lost)`; the dashboards used a different denominator. On today's real data those produced **40% vs 29%** under the same label. **Resolved:** there is now ONE definition in `src/lib/pipeline.js` — `winRate()` + `WON_STATUSES` / `DECIDED_STATUSES`, per Mike: **won ÷ every project past Open** (won + completed, over won + completed + lost + abandoned; a completed job counts as won). The CRM bar now imports it. **Please never recompute a win rate locally — import `winRate()`.**

2. **Probability had diverged.** The card quick-edit and Weighted Pipeline both wrote/read the legacy `pipelineProbability`. Projects now carry **`probabilityToWin` + `probabilityToMoveForward`**, and the number we display everywhere is the **derived average** (`averageProbability()` in `pipeline.js`). Because the average is derived, an inline edit of it is meaningless — the quick-edit has been **removed**, and the two source fields are edited on the project's Sales Details. Card, list, CSV, sort and Weighted Pipeline all now use `averageProbability()`. `pipelineProbability` is legacy — please don't build on it.

3. **"Needs Attention" overlaps a queue Mike is building.** Yours is `OPEN && updatedAt ≥ 30d`. `updatedAt` bumps on *any* write (including automated ones), so it isn't really "we haven't spoken to them." Mike's version keys off a real last-touched signal. **Leaving yours in place for now**; we'll consolidate onto one definition rather than ship two.

**Proposed boundary going forward** (Mike to confirm): Mike owns **sales/pipeline metrics + dashboards + the weekly-meeting surface**; the collaborator owns **budget/pricing math, schema, infra/deploy**. Anything that computes a *shared business number* (win rate, probability, pipeline value) goes in `src/lib/pipeline.js` as one exported function, imported by every surface — never re-derived in a component.

**Also new — two gates now fail the build/test run**, worth knowing before your next push:
- `npm run build` now runs `scripts/check-runtime-assets.mjs`, asserting runtime-resolved assets are actually in the Lambda trace (this is what was silently breaking **all PDF/AI parsing in prod** — pdfjs `standard_fonts` were never traced; fixed for 8 routes).
- `npm run verify` (static gates) and `npm run verify:smoke` (role-aware smoke tests). The smoke tests caught that **all seeded accounts are ILC_ADMIN**, so they stand up a disposable COMPANY_ADMIN — that role was seeing **zero projects** in production until today.

## Current State

- **Production:** live at https://app.ilcstudios.com, deploys flowing cleanly since 2026-05-26 PM. Mike pushed 5 commits on 2026-05-27 AM extending the defensive-guard pattern from seed.js to client/KB/master-types pages and routes — same approach the collaborator used in `0eda6d1`. Pipeline stable.
- **Notifications:** ACTIVE in production (NOTIFY_DRY_RUN=false).
- **Coordination tooling:** four project-scoped slash commands available (`/coord`, `/mike`, `/coord`, `/log` — see `.claude/commands/`).
- **the collaborator:** math test harness at `_tests/budget-math.mjs` + calibration script `_tests/calibrate-conceptual.mjs` (both gitignored). Calibration run against 4 real spreadsheets (2 conceptual, 2 Full Design) on 2026-05-27 AM with Mason's review — engine matches within 1-2% on conceptuals; explainable patterns on Full Design. Two math changes still queued (Q1 energy credit refactor, Q3 exit signs sum extension — Q3 needs stairwell-SF clarification).
- **Mike:** Conceptual-budget + CRM sprint live. Most recent (2026-06-12): **all wizard sections (conceptual AND design) now read pricing from Master Pricing** (`/admin/pricing` → SystemConfig DB, the `pricing` prop) instead of hardcoded constants — engine + UI previews read one source and can no longer drift. Also: exterior section restructured, CRM Batch 1+2 (unified Rules tab, sales dashboards). Commits through `10cf3a1`.

## 2026-07-09 — the collaborator's Claude (Tasks 14–16 merged: security hygiene + CRM list polish + win rate)

Manny's three PRs (#10–12) cherry-picked and merged to main (commits 206f1fb, 51968e7, 720fd55). All clean — no .claude/ clutter.
- **Task 14** (`manny/security-hygiene`): Four backend security fixes — added `requireAuth` to `/api/anthropic-models`, inverted cron auth guard to fail closed, added empty-body validation to notes POST, fixed attendees JSON serialization in meeting-notes PATCH.
- **Task 15** (`manny/crm-listview-polish`): Notes count badge now shows in list view rows (parity with kanban). "Clear" button in filter bar resets all 5 filter dimensions at once.
- **Task 16** (`manny/crm-stats-winrate`): Stats bar expanded from 6 to 8 chips — added Weighted Pipeline (open revenue × probability) and Win Rate (all-time WON ÷ closed deals).
Next sprint options under discussion: auth hygiene sweep (19 routes using getSession instead of requireAuth), upcoming deadlines view, or dashboard analytics.

## 2026-07-08 — Manny's Claude (Tasks 10–13 complete: links + notes + prob-edit + CSV export)

All four CRM polish tasks shipped and ready for review. 38/38 tests pass, 111,997 invariant checks (0 failures), production build clean, zero regressions.
- **Task 10** (`manny/brief-clickable-links`): Morning Brief project names now clickable links to `/project/[id]`. Two tables updated (stale projects + recent wins).
- **Task 11** (`manny/crm-notes-count`): Added `_count: { select: { noteLinks: true } }` to crm/page.jsx Prisma select. ProjectCard badge shows "N notes" below + Note button when count > 0.
- **Task 12** (`manny/crm-prob-edit`): Click-to-edit inline input for probability on kanban cards (0–100 clamped). Blur/Enter saves via PATCH with optimistic update. Escape cancels. `e.stopPropagation()` prevents project panel from opening.
- **Task 13** (`manny/crm-csv-export`): "Export CSV" button in toolbar. Downloads current filtered pipeline as spreadsheet. Filename: `crm-{pipeline}-{date}.csv`.

## 2026-07-07 (the collaborator's Claude) — Manny tasks 10–13 queued; PDF delivery simplified

Tasks 10–13 written into `.claude/manny-tasks.md` (CRM polish sprint: clickable brief links, notes count badge, probability quick-edit, CSV export). Tasks 6–9 marked complete. PDF rewritten — now the single delivery artifact; Claude reads it directly, no separate `.md` file needed. the collaborator just sends the PDF. Script: `python scripts/generate_manny_tasks6to9_pdf.py`.

## 2026-07-06 (the collaborator's Claude) — Manny tasks 6–9 rewritten for new CRM model

Rewrote all four Manny task specs in `.claude/manny-tasks.md` after Mike's Deal→Project unification. Old specs referenced `DealCard`, `DealDrawer`, and the activities API — all deleted. New specs use `Project` model with `procurementStatus`/`designStatus` fields. Key change: Task 7 was originally "build a stats bar" — discovered `PipelineSummary` already exists (line 150), so Task 7 now enhances it instead. Task 9 now posts to `/api/crm/notes` instead of the deleted activities route. PDF at `scripts/generate_manny_tasks6to9_pdf.py` (regenerate for Manny: `python scripts/generate_manny_tasks6to9_pdf.py`).

## DEPLOYED 2026-07-06 (Mike) — client standards + playbook trim + dashboards

Big deploy (migrations `0048`–`0050`), full debug pass green. Heads-up on schema for the collaborator:
- **New models** `ClientProductOption` (product-options funnel) + `ClientStandardFixture` (client standard fixture schedule). Routes under `api/clients/[id]/product-options` + `/standard-fixtures`; UI tabs "Product Options" + "Fixture Schedule". Migration `0050` written by hand.
- **Playbook trimmed to what real client meetings cover:** dropped `PlaybookRelationship` table + these `ClientPlaybook` columns — `costTierNotes, primaryContactId, approverContactId, coTolerance, mgmtStructure, hasDesignTeam, storageDuration, receivingPartyContactId, receivingPartyNote, freightWarehousing, damageInventory, logisticsNotes, paymentTerms`. **`paymentTerms` moved to `Client`** (backfilled). Playbook UI is now 6 lean sections; Primary markets is a state-button picker.
- Also shipped: universal dashboard engine + 3 probability fields + win rate (`0048`/`0049`), YTD/Custom time buckets, link-preview unfurl. Docs in `G:\Shared drives\SOFTWARE\_MIKE's APP\Software engineering\`.

## Open questions for Mike (when convenient)

~~1. **Energy credit dollar impact compounds through freight+warehousing+tax.**~~ **ANSWERED:** Not intentional — fix it so the energy credit reduces the lighting subtotal *before* F+W+T are applied, matching Trackvia behavior.
~~2. **Controls override behaves the same way.**~~ **ANSWERED:** Product-only is correct. The override amount is the product cost; F+W+T should still layer on top afterward.
~~3. **Exit sign type override path** (in designAdder, when `corridors.exitSignType` is set)~~ **ANSWERED:** Exit sign count should sum corridors + stairwells + interior amenity + BOH + garage. Apply the 300K-SF threshold rule to this total in both the conceptual budget and Full Design Questionnaire.
~~4. **Several pricing constants defined but never used** in calculations.js~~ **ANSWERED:** New feature in progress — leave them alone, TBD.
~~5. Minor doc discrepancy: project-root `CLAUDE.md` references `public/pricing.json`~~ **ANSWERED:** Coming soon — no action needed.

### New questions surfaced 2026-05-27 (post-Mason-review):

6. **Vanity & fan prices: net or gross?** `pricing.js` uses NET (e.g. `illuminatedMirrorMedium = $155`, comment says "$45 base credit already in $0.38/SF"). Mike's spreadsheets use GROSS ($200). Mason confirms engine totals trend low; this is the biggest contributor across all 4 calibrated projects. **Mike: which is right?** If gross, one-shot patch to `pricing.js` aligns everything.
7. **`designUpgrades` defined-but-unused constants** (`dimmerCostEach`, `entryDecorative`, `diskSevenInch`, `fanSize52Adder`, `closetOccSensor`) — Q4 above was "WIP, leave alone" but Mason's "engine too low" comment suggests these should be wired into `calculateBudget`. ~$19K of expected charges per Link+Pin alone aren't being applied. **Mike: revise the Q4 answer — wire them up, or keep WIP?**

## ✅ RESOLVED + DEPLOYING — MeetingNote data preserved (Mike's Claude — 2026-07-03)

the collaborator — thank you for the prod count (MeetingNote = 4 rows, SalesNote* = 0, Playbook cols absent). **Blocker resolved:** `0040_drop_legacy_note_tables` now does an `INSERT … SELECT` copying **every** MeetingNote row into the unified `Note` table (`noteType='PROJECT_MEETING'`, `isPublished=true`, projectId FK-guarded → orphans kept with NULL) **before** the DROP. Nothing is lost. Triple-checked (12 cols = 12 exprs, pg-safe, idempotent via `ON CONFLICT`).

Also in this deploy: the **entire Deal→Project unification** — `Deal` and its ecosystem removed and merged into `Project` (migration `0047`; prod had 0 deals). Notes now link via `NoteProject`; bot drafts via `BotDraft.projectId`. Per-pipeline stages + statuses, Construction Admin phase, out-of-sync badge, Sales Owner + `User.division`. **Migrations `0030`–`0047`.** `npm test` 12/12, build green, all migration checks pass. Deploying now.

## 🚀 MIGRATION COORDINATION — CRM/Playbook/Standards module deploy (Mike's Claude — 2026-06-25)

About to deploy the large local-only module (unified Sales Notes + automation engine, Playbook v3, Standards concept+image, CRM pipeline/intel). **15 new migrations.** Full handoff doc: `G:\Shared drives\SOFTWARE\_MIKE's APP\Software engineering\CRM_PLAYBOOK_STANDARDS_DEPLOY_INSTRUCTIONS_FOR_COLLABORATOR.md`.

- **Migration collision resolved:** our numbering diverged at `0029` (your `0029_project_data_manual_adders` is live; my chain reused `0029`). I renumbered my entire chain **+1** → it now occupies **`0030`–`0044`**, sitting cleanly after your `0029`. Your migration is untouched. **Next free number after this deploy is `0045` — claim from there.**
- **⚠️ ACTION REQUESTED — COLLABORATOR, PLEASE RUN THESE COUNTS ON PROD AND REPORT BACK.** Two destructive migrations drop dead predecessors: `0040_drop_legacy_note_tables` drops `SalesNote`/`SalesNoteContact`/`SalesNoteClient`/`SalesNoteDeal`/`MeetingNote`; `0043_playbook_normalize` drops `ClientPlaybook` cols `architectRel`/`eeRel`/`gcRel`/`roleAssignments`. Code deep-dive confirms **zero `prisma.*` references** to any of them (replaced by the unified `Note` table + `NoteContact/Client/Deal`, and the `Playbook*` child tables) — so dropping breaks no feature. We just need to confirm no orphaned prod rows. Run:

```sql
SELECT 'SalesNote' t, count(*) FROM "SalesNote"
UNION ALL SELECT 'SalesNoteContact', count(*) FROM "SalesNoteContact"
UNION ALL SELECT 'SalesNoteClient', count(*) FROM "SalesNoteClient"
UNION ALL SELECT 'SalesNoteDeal', count(*) FROM "SalesNoteDeal"
UNION ALL SELECT 'MeetingNote', count(*) FROM "MeetingNote";

SELECT
  count(*) FILTER (WHERE "architectRel" IS NOT NULL)    AS "architectRel",
  count(*) FILTER (WHERE "eeRel" IS NOT NULL)           AS "eeRel",
  count(*) FILTER (WHERE "gcRel" IS NOT NULL)           AS "gcRel",
  count(*) FILTER (WHERE "roleAssignments" IS NOT NULL) AS "roleAssignments"
FROM "ClientPlaybook";
```

  **Mike has authorized deploying the full module if these are all zero (or the tables don't exist).** If all clear, reply here / tell Mike and Mike's Claude will push immediately. If any count is non-zero, STOP and flag it — we'll preserve that data first.
- Debug pass green: `npm test` 12/12, `npm run build` exit 0, `check-migrations-postgres` (44 ✓), `check-schema-migrations-sync` (117 models ✓), `prisma validate` ✓.
- Amplify auto-applies via `prisma migrate deploy` in preBuild — no manual step.

## Action items for the collaborator (from Mike's Claude — 2026-06-25)

> **UPDATE:** Item 1 (Anthropic key) — RESOLVED by the collaborator in `d512a94` (baked `ANTHROPIC_API_KEY` into `next.config.mjs`). Thanks. Item 2 (reupload test) still useful to confirm prod parsing now works.

**1. Check the Anthropic API key in Amplify.** Our PDF parsers (fixture schedules, construction schedules, etc.) call Claude. They work on local dev but may be failing in production because the key isn't set in the cloud env.
- AWS Amplify Console → our app → Hosting → **Environment variables**
- Confirm a variable named **`ANTHROPIC_API_KEY`** exists with a valid key value
- If **missing or blank**, add it (value is in our local `.env` / password manager), Save, then **redeploy** (Run build / Redeploy this version)
- Report back: present, missing, or blank
- *Why:* `getAnthropicKey()` checks the `ANTHROPIC_API_KEY` env var first, then falls back to reading the local `.env` file — and that `.env` is **not** bundled into Amplify's serverless runtime. If the env var isn't set in the Amplify console, every AI-based parser silently fails in prod while working locally. That alone would explain why Mason couldn't parse anything.

**2. Re-upload test** (after the current build — commit `9a2f178` — finishes deploying). On a project's Fixture Schedule tab, re-upload a fixture schedule PDF and report the **exact** message:
- Green/blue banner "X fixtures imported" (with the number), **or**
- Red error box — copy the exact wording. It now names the real cause (a PDF-read error, "Anthropic API key not configured," or "No fixture schedule found").
- That message tells us whether the env-var fix was the whole problem or if there's more to chase.

*Context:* just deployed `d4ea191` (pdfjs `Promise.withResolvers` polyfill for all 10 extractors) + `9a2f178` (fixture-schedule route serverless font-hardening + explicit API-key error). Root cause of "parses local, fails prod" is pdfjs v5 needing Node 22+ `Promise.withResolvers` on Amplify's older Node, plus the possible missing API key above.

## Log

### 2026-07-01 — the collaborator's Claude (MeetingNote data for Mike — action required before 0040 drop)

**Mike: before migration 0040 runs, please add an INSERT step that copies these 2 rows into the new `Note` table (in whatever format your schema expects). Rows 1 and 2 below are test junk — safe to discard. Rows 3 and 4 are real project notes that must be preserved.**

Row 3 — Marmalade Budget Review (Modera - Marmalade SLC, projectId: `cmok6dh6s0003u3n1tdof2qmk`):
- title: "May 1, 2026 — Marmalade Budget Review"
- meetingDate: 2025-05-05
- content: Budget reduction decisions — L1 Q-tran → tape light (architectural pockets), EP3 Ligman poles → Prevail/Hapco, EB1 → Bega bollard, EW1 → eluma cylinder, P6 target price $2,200
- createdAt: 2026-05-01T17:27:38Z

Row 4 — Marmalade Construction Schedule (Modera - Marmalade SLC, projectId: `cmok6dh6s0003u3n1tdof2qmk`):
- title: "25.05.19 MODERA- MARMALADE (SLC) - CONSTRUCTION SCHEDULE"
- meetingDate: 2025-05-19
- content: 3-phase MEP/TCO schedule — Phase 1 TCO 01/05/27, Phase 2 TCO 03/09/27, Phase 3 TCO 08/16/27 (full content available in MeetingNote table until 0040 runs)
- createdAt: 2026-05-01T17:49:14Z

Suggested approach: in migration 0040, before the `DROP TABLE "MeetingNote"`, add INSERT statements for these 2 rows into `Note` (and `NoteProject` if your schema links them that way). Or if you'd rather handle it differently, just confirm and the collaborator will proceed. Full raw JSON of all 4 rows available on request.

### 2026-07-01 — the collaborator's Claude (Prod count check results — MeetingNote has 4 rows, STOP)

Ran the pre-deploy count queries via a temporary admin API endpoint. Results:

- SalesNote: 0 ✓
- SalesNoteContact: 0 ✓
- SalesNoteClient: 0 ✓
- SalesNoteDeal: 0 ✓
- **MeetingNote: 4 rows ← STOP per Mike's instructions**
- ClientPlaybook columns (architectRel/eeRel/gcRel/roleAssignments): don't exist on prod at all — migration 0043 will be a no-op, no concern there.

**Mike: do NOT push migration 0040_drop_legacy_note_tables yet.** MeetingNote has 4 real rows on prod. Need a data-preservation step (copy to Note table or export) before dropping. Tell the collaborator or update this log when ready to proceed.

### 2026-07-01 — the collaborator's Claude (Delete user button — admin UI, deployed)

Added delete user capability to the Admin Panel. Backend DELETE route already existed at `/api/admin/users/[id]` but the UI had no button. Changes: (1) tightened DELETE backend to also protect COMPANY_ADMIN targets from non-super-admin deletors (was only protecting SUPER_ADMIN/ILC_ADMIN — now matches PATCH protection level); (2) added inline "Sure? Yes / No" confirmation + delete button to every user row; (3) gated by `canDeleteUser()` — super admins can delete anyone except themselves, company admins can delete USER and CLIENT_VIEWER only. Error banner dismisses on ×. Deployed as `f786eed`.

### 2026-06-25 — Mike's Claude (Bid Matrix: spec/prop cleanup + version history renders like live matrix — deployed)

Two fixes: (1) Peer Review/Bid was showing the parsed mfr in BOTH Spec and Prop (legacy prop pollution + later spec backfill). Push sync now clears auto-polluted prop on re-push — only when prop is text-only (no `propManufacturerId`) AND matches the parsed mfr; real dropdown selections untouched. (2) Version-history snapshots no longer use the old design-bid `Manufacturer/Part #` layout — they now render in the same column layout as the live matrix (Peer Review/Bid → Spec Mfr/Spec #/Prop. Mfr/Prop. Spec, Prop empty since a version is a push-time snapshot; Design Bid → single Manufacturer/Part #). No schema change. Files: `fixture-schedule/publish/route.js`, `PeerReviewClient.jsx`. `npm test` green, build clean. (Note: Mike must re-push Alpine Balsam once to clean its existing polluted prop.)

### 2026-06-25 — Mike's Claude (Bid Matrix: parsed Mfr/Spec# routes to correct column by project type — deployed)

Push to Bid's `PeerReviewItem` sync now branches on `matrixType`: **fullDesign/designAssist → PROP** (`propManufacturer`/`propModel`), **peerReview/bidOnly → SPEC** (`specManufacturer`/`specModel`). Covers CREATE + smart-merge UPDATE; pricing still rides on prop. Single file: `src/app/api/projects/[id]/fixture-schedule/publish/route.js`. `npm test` green, build clean. (The view default by type already existed in `PeerReviewClient.jsx`.)

### 2026-06-24 — Mike's Claude (PDF parsing prod hotfix — pdfjs polyfill + fixture-route hardening)

**Root cause of "parsing works local, fails in prod":** pdfjs-dist v5 calls `Promise.withResolvers()` (Node 22+). Amplify's serverless runtime is on older Node where it's `undefined`, so every PDF extractor threw. **Deployed** `d4ea191`: new `src/lib/pdfPolyfill.js` (no-op on Node 22+) imported at the top of all 10 pdfjs extractors. `npm test` 12/12, build clean.

**Follow-up (this commit):** the fixture-schedule parse route (`src/app/api/projects/[id]/fixture-schedule/parse/route.js`) still used a bare extractor with **none of the serverless font-hardening** that fixed the construction schedule. Ported it over: bundled `standardFontDataUrl`, `disableFontFace`, `isEvalSupported:false`, `useSystemFonts:false`, per-page try/catch, and precise error surfacing. Also added an explicit "ANTHROPIC_API_KEY not configured" error — `getAnthropicKey()` falls back to reading a local `.env` that doesn't exist in the Amplify bundle, so if the env var isn't set in the Amplify console, **all** AI parsing silently fails in prod. **the collaborator/Mike: confirm `ANTHROPIC_API_KEY` is set in Amplify → Hosting → Environment variables.**

### 2026-06-24 — the collaborator's Claude (Manny PRs #1–5 merged to main)

Reviewed and merged all five of Manny's open PRs in order: wizard dirty-field tracking, section manual adders, activity feed filters, old→new values in activity descriptions, budget change history on Summary page. Merge conflicts in ExteriorSection and ProjectDataSection (stale base branches) resolved by hand — dirty-tracking guard preserved, contingency all-modes approach kept. All 38 tests + fuzz + bid matrix checks passed. Deployed. Manny's queue is now clear.

### 2026-06-24 — the collaborator's Claude (Server-side PDF generation — all three PDF types, not yet deployed)

Replaced all `window.print()` flows with server-side Puppeteer PDF generation. `puppeteer-core` + `@sparticuz/chromium` installed. Three routes:
- `GET /api/projects/[id]/budget/pdf` — new; fetches project + calculateBudget + renders 2-page HTML (financial summary p1, questionnaire Q&A p2), returns `application/pdf`.
- `GET /api/projects/[id]/peer-review/pdf` — new; fetches PeerReviewItems + calculates adders; landscape, 2-page (matrix + terms). Mirrors PeerReviewClient print layout exactly.
- `GET /api/projects/[id]/design-bid-matrix/pdf` — existing route already generated HTML; now calls `htmlToPdf()` and returns PDF instead of HTML.
`SummaryPrintButton` and `PeerReviewClient` Print button both call API and open PDF in new tab. Verified locally: Puppeteer finds Chrome at `C:/Program Files/Google/Chrome/Application/chrome.exe`, generates valid PDF. All three routes compile cleanly. **Not yet deployed** — needs `npm run deploy`.

### 2026-06-23 — Mike's Claude (Schedule parser v2.1 — keyword floor + AI timeout + resilience, deployed)

Zenith still showed no dates after v2 (likely AI/serverless timeout silently swallowed, or the card's auto-parse bailed on missing stored textContent). Hardened `scheduleExtract.js` + `CAScheduleCard.jsx`:
- **Deterministic keyword pass is now the timeout-proof FLOOR** (instant, no AI): reliably pulls construction-start, MEP rough-ins (floored to ≥ construction-start so design-phase 2025 "MEP" rows are excluded), TCO (latest), and Final Completion (latest). Verified on Zenith: 6/1/26 / 1/12/27 / 5/16/28 / 6/2/28.
- **AI pass is bounded by a 22s timeout** and only wins when it returns a fuller set — so an AI/network hiccup or Lambda timeout can never blank the dates (keyword result stands).
- **CAScheduleCard auto-parse** no longer requires stored `textContent` (the /reparse endpoint re-extracts from disk and returns a clear error otherwise) — so it always attempts extraction and surfaces real failures instead of silently showing empty.
- Upload route schedule `catch` now logs instead of swallowing.

### 2026-06-23 — Mike's Claude (Construction-schedule parser v2 — row-structured, whole-doc, deployed)

**Deployed parser v2** (origin in sync, no rebase). The earlier window bump (12k→50k) still wasn't enough for big multi-building schedules: Zenith on 25th is 96 pages / 1,800+ rows / ~11 buildings, with the final TCO + Turnover Keys at char ~134k — past the 50k window. New module `src/lib/scheduleExtract.js`:
- **Row-structured PDF text** (groups pdfjs items by Y so each schedule row is one clean line) instead of a run-on blob.
- **Whole document** (all pages, send up to 180k chars — Haiku 200k context) so project-level start/end aren't cut off.
- **Multi-building prompt** (earliest start, latest finish/TCO; recognizes "Meps trades"/"Meps Trades First floor" as MEP rough) + a **deterministic keyword fallback** so a recognizable schedule never returns [].
Both `files/route.js` (upload) and `.../reparse/route.js` now call it (removed the duplicated inline extractor). Verified on Zenith: construction-start 6/1/26, earliest MEP 1/12/27, TCO 5/16/28, end 6/2/28, + 15 MEP rough-ins across buildings. `npm test` green, build clean.

### 2026-06-23 — Mike's Claude (Construction-schedule parser fix deployed — isolated hotfix)

**Deployed parser fix** (rebased onto your 21 commits — clean, no conflicts; your commits don't touch these files): widened the construction-schedule AI extraction window **12,000 → 50,000 chars** and the PDF page-extraction cap **30 → 60** in both `src/app/api/projects/[id]/files/route.js` and `.../files/[fileId]/reparse/route.js`. Large multi-page MS Project/P6 schedules were placing milestone rows past the 12k window so uploads parsed no dates (Zenith 96-page schedule: TCO/turnover sat at char ~12,068). Verified the Zenith schedule now extracts 15 milestones across 5 building phases. `npm test` green, build clean.

**Heads-up (Playbook v3, local-only):** Reworked `ClientPlaybook` to be fully queryable/bot-actionable. **Dropped the JSON bins** `architectRel`/`eeRel`/`gcRel`/`roleAssignments`; **added 4 tables** `PlaybookRelationship` / `PlaybookAssignment` / `PlaybookDistribution` / `PlaybookNote` (+ intro/comms/logistics scalar columns), migration `0042_playbook_normalize`. No data to migrate (app empty). Export route + PlaybookTab repointed. **Not pushed** — flagging since it touches your `ClientPlaybook`; will rebase onto your latest before any deploy.

**Heads-up:** I have a large **local-only** Sales-Notes/automation module in progress (unified Note table, admin action taxonomy, Zapier-style if-then rule engine, intel, outreach consolidation) — **NOT pushed**, sitting in my working tree + a stash. It adds migrations `0035`–`0041`. When I eventually deploy it I'll rebase onto your latest first. Flagging so you're aware of the migration numbers I'll be claiming.

### 2026-06-23 — the collaborator's Claude (PDF polish: filename format + bid matrix redesign + disclaimer fix)

- **Budget PDF filename** now uses `YY.MM.DD ProjectName Type Budget` format for both conceptual and design budgets (`SummaryPrintButton.jsx`); bid matrix wizard print also uses `YY.MM.DD ProjectName Design Bid Matrix` (`PeerReviewClient.jsx`).
- **Design Bid Matrix PDF** (server-side route) redesigned to match TrackVia "Budget" style: ILC Studios logo, rotating "Design Bid Matrix" watermark, info grid, line items with Qty/DN/CN columns, totals, General Terms + Contractor Bidding Guidelines. File: `src/app/api/projects/[id]/design-bid-matrix/pdf/route.js`.
- **Design budget disclaimer** moved to bottom of last questionnaire page (after all Q&A rows), visible in both screen and print, design budgets only. Conceptual budgets keep a short note on page 1 only.

### 2026-06-16 — Mike's Claude (Client standards/playbook + live share link deployed)

**Deployed `8acf55c` to production** (rebased onto your 13 commits — clean, no conflicts):
- **Client Standards live share link + PDF** — new `ClientStandardsShare` model, public `/share/standards/[token]` page (no auth, `force-dynamic`, browser print-to-PDF), get-or-create token per client. Mirrors the budget-share pattern.
- **"How We Work Together"** client-facing content (Scope intros, Approvals, Process, Expected Timeframes) — rendered in the Playbook tab and appended to the client PDF. Template de-named from "NexMetro" with `{{client}}` token substitution.
- **Playbook tab** restructured to 7 icon-based sections matching the Standards UI (numbering removed); "General Process" → "Process" (data preserved). **Standards tab** gains "General Design Questions" as the first section.
- **Master pricing reconciled to the sheet**: pendant 3-small-Low $120, balcony disk $15/unit, edge-lit exit $120, boiler $15, bath-bar credit $45; emergency "frogeyes" now a flat **editable** $0.17/SF (`emergency.frogeyesPerSf` in PricingEditor). Engine special-cases frogeyes. + held Link+Pin wizard QA fixes (vanity gross+credit, fan levels, controls cap $180k, etc.).
- **Migration note:** my `ClientStandardsShare` migration was renumbered **0026 → 0028** to sit after your `0026_roadmap_priority` / `0027_bug_report`. Your `check-schema-migrations-sync` gate passes (108 models). Full debug pass green on the merged tree.

**Mike's standing rule (new):** always log every deploy here without asking. Next up: a batch of client-page UI work (Playbook→tiles to match Standards, client Overview restructure, global click-outside-to-close, contact-add refresh fix) — not deployed yet.

### 2026-06-15 — the collaborator's Claude (QC bug tracker S3 end-to-end working + new env-var trap documented)

**QC bug tracker is fully wired to S3 in production.** A bug report with screenshot saved through `/api/qc/reports`, got a valid `screenshotKey` in the DB, and the presigned URL renders the image from `ilc-qc-media.s3.us-east-2.amazonaws.com`. Multi-layer fix:
1. `cca63cc` — qcStorage prod/dev split, AWS SDK in `serverComponentsExternalPackages`
2. `f1d40d8` — `S3_BUCKET` / `S3_REGION` added to `next.config.mjs` env block (Lambda was seeing them as undefined)
3. `c6d7dfc` — static AWS SDK imports + `getQcObjectUrl` swallows errors (one bad screenshotKey was crashing the whole `/admin/tasks` page)
4. `6074941` + `cf29dcd` — `/api/qc/reports` POST now returns the underlying AWS / Prisma error with an env-var presence `diag` block (made the iteration loop tight)
5. `d0c8d8c` — `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` also baked into env block (see trap below)

**New trap caught + documented in CLAUDE.md "Critical: Amplify Lambda + DATABASE_URL" section:** Amplify Hosting Gen 1 does NOT propagate console-set environment variables to the SSR Lambda runtime. They exist during the build, and nowhere else. Anything `src/lib/*` needs at runtime — DB URLs, AWS creds, third-party API keys — must be in `next.config.mjs`'s `env` block. Empirically confirmed via the diag block: with the S3 keys in the Amplify console but not in `next.config.mjs`, `process.env.S3_ACCESS_KEY_ID` was undefined inside the running Lambda.

**Implication for the security pass on the existing parked items (`ANTHROPIC_API_KEY`, `JWT_SECRET`):** If those were ever set only in the Amplify console expecting runtime access, they may not actually be reaching the Lambda either — worth verifying before/during the security pass. (Not fixing now per the collaborator's "security later" stance.)

**IAM identity backing the QC uploads:** new IAM user `ilc-amplify-s3` with policy `ilc-qc-media-rw` scoped to PutObject/GetObject/DeleteObject on the `ilc-qc-media` bucket only. Access key is rotated (first one had a paste glitch causing SignatureDoesNotMatch). During the security pass, swap to a proper SSR compute role: delete the two `S3_*KEY*` lines from `next.config.mjs`, delete the env vars from Amplify console, delete the IAM user. The `s3Client()` fallback in `src/lib/qcStorage.js` will pick up role-based creds via the default chain.

### 2026-06-12 — Mike's Claude (Master Pricing wiring + conceptual budget debugging)

**Heads-up for the collaborator — this touches the calibration/pricing area:**
- **All wizard sections now read from Master Pricing — single source of truth.** Both conceptual sections (Units, Corridors, Amenities, Exterior, Emergency, Controls) and the separate design sections (`sections/design/Design*`) were hardcoding pricing constants while the engine read `loadPricing()`. Threaded the loaded `pricing` object (already used by `calculateBudget`) into every section via shared props; each now reads costs from it (static `pricing.js` kept as fallback). UI previews and the engine can no longer diverge — editing `/admin/pricing` updates both. Commits through `10cf3a1`.
- **Fixed live UI/engine divergences found via a full UI-vs-engine sweep across all 23 projects** (the previews had drifted from the engine): door-sconce odd-count formula, corridor accent **$160→$120**, corridor disk default **0.25→0.27**, interior-amenity legacy named levels showing **$NaN** (8 projects), undercabinet **$90→$125**, kitchen pendant **$40/$120→$50/$150** (Mike updated this in Master Pricing), vanity `illuminatedMirrorLow` **$0→$130**. Exterior also had a UI-only hidden landscape line (engine computes lot-SF×2%) — UI now shows it.
- **Re Q6 (vanity net/gross):** now a one-edit decision — both UI and engine read the vanity product values straight from Master Pricing, so whatever Mike sets there flows everywhere. No code change needed to switch net↔gross.
- **Re Q7 (designUpgrades):** entry-disk / boiler / 52"-fan adders (which the engine DOES charge) now read from master. Dimmers + 7" disk left unwired per the Q4 "leave alone" answer — flagging that the UI still shows dimmer/disk7 cost hints the engine doesn't charge.
- **Exit signs:** Mike confirmed the `0.025/SF` rate + 300K-SF halving is **correct as-is** — the collaborator's `f7a45e8` halving + its regression test stay. (Engine left untouched.)

### 2026-06-11 — the collaborator's Claude (capturing yesterday's 2026-06-10 Mike/Jason/the collaborator planning meeting)

Long planning meeting June 10. Logging here so Mike's Claude has the cross-Claude record.

**Decisions aligned (no disagreement):**
- App is source of truth over spreadsheets (5/28 policy reaffirmed; Madera Town Lake small-% differences acceptable during transition).
- QC/QA folder established at `G:\Shared drives\SOFTWARE\_MIKE's APP\QC_QA\` for all module review docs.
- Report naming convention: `YY.MM.DD description_with_underscores.pdf` (Mike's standard, applies going forward).
- Multi-stage sandbox dev workflow REJECTED — Git is sufficient for rollback.
- Custom-coded solutions (Claude Code) over low-code platforms.
- Aiden onboarding: unpaid, knowledge-sharing; starts ~Monday 6/16.
- Module ownership: **Aiden = Sales + CRM**; **Manny = Submittals + Ship Schedules + DB work**; **the collaborator = foundational software / QC / version control**; **Mike = high-velocity feature work + sales bot + conceptual budget**.
- Aiden deploys INDIRECTLY — prepares changes for the collaborator to review and deploy.

**Open disagreement:**
- **Opus-exclusive for coding** — the collaborator's position; others raise token-cost concerns. Not settled.

**Math discrepancy work (key outcomes):**
- **Q6 (vanity/fan net-vs-gross) RESOLVED.** Mike clarified: adding a fan REMOVES a puck light, so apparent discrepancy was subtraction logic, not a math error. Engine handling is correct.
- **Broadstone Southglenn 4.2% gap** traced to the same fan-removes-puck logic. Mike to do deep analysis to fully close.
- **$11K kitchen pendants** discrepancy: subtractor math failing — specific fix item.
- **Exit signs** still consistently off; needs sheet-vs-app decision.
- **Garage + Corridor manual override fields needed** (mirror exterior override `e407334`). the collaborator: Link+Pin closes mostly with these; ~$7K remainder.
- **"Fudge" field** proposed by the collaborator — designated manual-adjustment field for things standard logic can't derive. Not committed.
- **Contingency button broken** — fails to apply 5%. the collaborator noted UI+math being built in parallel is the cause.

**Action items:**

*the collaborator:*
1. List Discrepancies (itemized, specific)
2. List Explanations (per discrepancy)
3. Design Report — Link + Pin design questionnaire
4. Analyze Link + Pin — full issue list
5. QC Template — standardized for all modules
6. Collaboration Plan — team coordination + AI interaction guide

*Mike:*
- Fix Conceptual Budget — Broadstone Southglenn deep dive
- Merge Change Logs into one unified file
- Finish conceptual budget portion → PDF
- V1 Scope Plans for Aiden, Manny, the collaborator
- Download 1 year of emails (Google Takeout) for AI training

*Group:*
- Log Claude commands across all team members; analyze to improve workflow consistency

**AI strategy norms set:**
- Natural conversational English with LLMs, not command-line shorthand
- Iterative workflow: explain intent → request feedback/options → execute
- Train Claude via exchanged command logs

**Future features queued (not started):**
- Sales bot trained on email + calendar Takeout
- Submittals tracker replacing 300-page packet transcription (Manny's lane once Aiden onboards)
- Ship schedules integrated into app
- Sales dashboards, article tagging

**Heads-up for Mike's Claude:**
- The Q6 vanity/fan question can be removed from the open list (now resolved).
- When working on garage or corridor sections of the engine, the team has explicitly requested manual-override fields mirroring the exterior pattern — likely high-priority feature work.
- Aiden joins Monday under the collaborator-reviewed workflow; if you're touching Sales/CRM modules after 6/16, coordinate before changes.
- Mike has 5 explicit action items above; if anything looks queued in his court, that list is the source.

### 2026-06-10 — Mike's Claude
- **Client Playbook restructured.** Removed Timeframes section entirely; renamed General Process to "2 · General Process". Scope section: dropped Cost tier notes, Day-to-day PM, Final budget approver, architect/EE/GC relationship blocks; added single "Primary national contact" picker. Process section: removed engagement timing + submittal platform; added file drop zone (PDF/Excel) that appears when "Internal design standards team" toggle is on.
- **Standards questions overhauled.** Removed LIHTC project type, 12" disk option, all price display. Added vanity options + finish multi-select, ceiling fan sub-questions (light kit, finish, wall controller, dimming), undercabinet changed to MULTI_CHIPS (120v / Low-Voltage). Added text-box style pickers under kitchen pendants and balcony. Corridors & Stairwells section now has real questions (lighting type, dynamic spacing, sconce styles, light ends). Interior Amenities has $/SF multi-select. Garage has typical fixture text. Exit Signs lost exit_color question. Emergency exterior options updated (NEMA removed, labels updated). Site & Exterior and Controls have named coming-soon subsections.
- **ClientDetailClient.jsx:** Added MULTI_CHIPS and TEXT input renderers in QuestionCard; named subsection display for stub sections; TextAnswerInput defined outside parent to preserve state.

### 2026-06-09 — Mike's Claude
- **QC Bug Tracker built (v1).** Full internal bug-reporting system: floating "Report a bug" button on every authenticated page, modal with screenshot (html-to-image), auto-captured console errors + failed network requests, browser/viewport. Kanban board at `/admin/qc` (super admin only) with New/In Progress/Fixed columns, detail drawer, status buttons, and assignee dropdown. Blocker reports fire in-app UserAlert to all super admins. Screen recording toggle stubbed as "Coming soon" (v1.1). Local filesystem storage for screenshots; S3 setup instructions written to G Drive for production deploy.
- **Prisma schema:** Added `BugReport` model + two User relations (`bugReportsCreated`, `bugReportsAssigned`). `db:push` applied locally.
- **New files:** `src/lib/qcStorage.js`, `src/components/qc/qcRecorder.js`, `src/components/qc/QcCapture.jsx`, `src/app/api/qc/reports/route.js`, `src/app/api/qc/reports/[id]/route.js`, `src/app/api/qc/media/route.js`, `src/app/(app)/admin/qc/page.jsx`, `src/app/(app)/admin/qc/QcBoardClient.jsx`.
- **Tech Stack page** (`/admin/tech-stack`) built with 5 tabs — auto-updates from `deploy-log.json` and `package.json`. Sidebar entry added under Software.
- **KB super-admin-only** entries: `superAdminOnly` field added to `DesignStandard`, filtered at API + page level, toggle in edit modal (orange, super-admin-visible only).
- **Proposals nav fix:** `fullDesign` now shows Proposal under Design section; `designAssist` keeps it under Pre-Construction (separate nav configs, no longer aliased).
- **G Drive:** Tech Stack HTML guide + S3 setup .md written to `G:\Shared drives\SOFTWARE\_MIKE's APP\Software engineering\`.
- **Open:** the collaborator needs to be made a SUPER_ADMIN in prod to access QC board + triage. Screenshots need S3 swap before live deploy (see S3 setup doc).

### 2026-06-09 (later) — the collaborator's Claude (pre-push checkpoint + handoff to Mike)
- **Husky pre-push hook installed (`1ae26f3`).** Runs ~25s of checks on every push, on both the collaborator's and Mike's machines:
  1. `check-dynamic-pages.js` — every (app)/ page has force-dynamic
  2. `check-migrations-postgres.js` — SQLite-only patterns AND forward-FK refs (the layer-3 catcher; Sunday's `Proposal → ProposalTemplate` forward ref would have been caught locally)
  3. `npm test` — math regression suite (38 + 112K fuzz + 12 bid-matrix)
  4. `check-secrets.js` — diff scan for AWS/GitHub/Anthropic/OpenAI/Stripe keys + generic API_KEY=... patterns
  5. `check-push-size.js` — non-blocking warning if > 50 files (Sunday was 160)
- **Mike's one-time setup:** `git pull && npm install`. After that, automatic forever on his machine.
- **`start-dev.ps1` self-heals:** auto-runs `npm install --silent` if package.json changed or `.husky/_/pre-push` isn't wired.
- **CLAUDE.md updated** with the migration-generation workflow and the pre-push hook as documented project rules.
- **Heads-up for Mike's Claude:** the hook fires on every push. If you hit a blocker, read the `file:line:fix` output. For genuine emergencies, `git push --no-verify` bypasses; use sparingly.

### 2026-06-09 — the collaborator's Claude (unblock Mike's Sunday deploy + permanent prevention)
- **Root cause of Mike's Sunday-not-deploying:** migrations 0023_proposals and 0024_project_unit_types used SQLite types (`DATETIME`, `BOOLEAN NOT NULL DEFAULT 0/1`) instead of Postgres (`TIMESTAMP(3)`, `DEFAULT false/true`). `prisma migrate deploy` ran on Amplify, hit "syntax error at or near DATETIME" on the first new table, aborted — seed never ran, build never ran. The full Proposals module was blocked by ~15 type tokens. This is exactly what happens when `npx prisma migrate dev` runs against the locally-pinned sqlite schema.
- **Permanent fix shipped (`7fa5d3b`):** new `scripts/check-migrations-postgres.js` runs in Amplify preBuild alongside `check-dynamic-pages.js`. Scans every migration for SQLite-only patterns (DATETIME, BOOLEAN DEFAULT 0/1, AUTOINCREMENT, PRAGMA) and fails the build with file:line:fix output BEFORE prisma migrate deploy runs. Same defensive pattern as the existing dynamic-pages check. Local: `node scripts/check-migrations-postgres.js`.
- **Immediate unblock:** 0023 + 0024 patched in place (15 DATETIME → TIMESTAMP(3), 3 BOOLEAN-default replacements). Mike's Proposals module ships on next Amplify build. `npm test` green throughout.
- **Side note:** Mike now has IAM user `mike@ilcstudios.com` with AdministratorAccess on AWS (resolved his root-MFA lockout). Future deploy-debugging shouldn't require the collaborator's MFA.

### 2026-06-06 — Mike's Claude
- **Proposals module fully built.** Schema (0023_proposals migration), 11 API routes (proposals CRUD, line-items, send, accept, decline, PDF, templates, rates), `/sales/proposals` list page with "Add Project" button, `/sales/proposals/templates` editor, `ProposalTab` in project hub. Sidebar Proposals link enabled; 'proposal' tab added to projectNavConfig. Build passes clean. ~42 files uncommitted (batches 1+2+proposals).
- Meetings editor confirmed: uses native `contentEditable` + `document.execCommand()` (NOT tiptap) — proposals editor follows same pattern.

### 2026-05-29 (end of day, +Broadstone entry fix) — the collaborator's Claude
- **Broadstone entry-side correction applied.** Was $856K (−8.3% vs sheet $935K); now ~$896K (−4.2%). Single fix: `amenities.interiorLevel: "low" ($6/SF) → "8"` ($8/SF custom). Sheet's questionnaire answers all line-by-line verified; the interior amenity rate was the ONLY entry-side correction available. Added $40K.
- Remaining ~$39K traces to Q6 (vanity gross-vs-net = ~$23K alone on 519 vanities × $45) + smaller fan/pricing items in the same family. Same engine/policy ask as Link+Pin.
- **PDF reissued** with Broadstone numbers + the now-tighter "all remaining gaps are Q6/feature, entry side exhausted" framing.

### 2026-05-29 (end of day, +Link+Pin entry fix) — the collaborator's Claude
- **Link + Pin entry-side corrections applied.** Was $279K (−18.7% vs sheet $343K); now ~$325K (−5.3%). Five sheet-supported fixes via API:
  1. `project-data.salesTaxPct: null → 0.0915` (Denver; biggest mover)
  2. `corridors.fixtureSpacing: "10" → "11"` (sheet answer)
  3. `amenities.interiorLevel: "medium" → "11"` (sheet uses $11/SF custom)
  4. `controls.decorativeDimming: "no" → "yes"`
  5. `controls.zoneReduction: "no" → "yes"`
- Remaining ~$18K gap is unfixable without engine changes / Mike's call: garage manual override (no field), corridor art-light question (no field), Q6 net-vs-gross pricing, exit-sign snapshot drift. All listed in PDF.
- **PDF reissued** with corrected Link+Pin numbers + honest "we haven't broken Broadstone down yet" note.

### 2026-05-29 (end of day, +Grove fix) — the collaborator's Claude
- **Grove St re-entered from latest sheet.** Deleted 13 stale rows (per-row CN prices, specs, and controls lump had drifted from `GROVE ST MATRIX.xlsx`), posted 14 fresh fixture rows + 1 controls lump. App raw $25,603.79 vs sheet $25,603.78 (+1¢). Loaded app $30,250.88 vs sheet $30,250.86 (+2¢). Was −$5,241/+20.5% off; now matches to 2¢. Re-issued the PDF report with Grove flipped to ✓.

### 2026-05-29 (end of day) — the collaborator's Claude (calibration report compiled for Mike)
- **PDF report generated:** `~/Downloads/ILC Calibration Report - 2026-05-29.pdf`. Six projects, three deliverable types. Engine bug-free; all material discrepancies are entry-side, missing features, or data-version drift.
- **Reconciliation status (sheet vs app):**
  - York St Full Bid: $39,326.40 vs $39,326.43 — **3¢** ✓ (added 1 controls row today to complete it)
  - 9th + Clermont Full Bid: $793,832 vs $793,841 — **+$8.86** ✓
  - Modera Town Lake Conceptual: $1,428,644 vs ~$1,440,502 — **+0.8%** ✓
  - Broadstone Southglenn Conceptual: $935,326 vs ~$857,319 — **−8.3%** △ (was assumed within 1-2%; isn't — likely Q6 vanity)
  - Link + Pin Design: $343,325 vs $279,147 — **−18.7%** △ explained (units, garage manual, interior $/SF, exit-sign snapshot, corridor art light)
  - Grove St Peer Review: $30,251 vs $36,443 — **+20.5%** △ data drift (per-row CN prices differ, controls 2× over; app likely from older sheet version)
- **York St complete now:** added 1 controls row ($13,242.67 raw → $15,646.21 loaded), exact match to sheet's CONTROLS TOTAL.

### 2026-05-29 (later) — the collaborator's Claude (York St full-bid data entry)
- **York St Apartments peer-review/bid matrix ENTERED** (project `cmpr94foi…`, was empty). 9 ELUMA fixture rows from `YORK ST MATRIX.xlsx` (A1, A1 vanity, B1, E1, EM, F1, G1, X1, STRIPLIGHTS). App grand total **$23,680.22** vs sheet **$23,680.19** — 3¢ off from per-row rounding (app rounds each `totalSavings` before summing; sheet sums raw then loads). Raw lighting $20,042.50 × 1.1815 (freight 6% + warehousing 3% + Denver tax 9.15%). Set `salesTaxPct=0.0915` on the project to match. First of the 3 Full-Bid matrices (Grove St + 9th/Clermont still pending).
- **Project-type correction:** York St was mis-typed as `design`/`fullDesign` (empty questionnaire, 0 fixture-schedule items, 0 bid matrices), so the peer-review rows wouldn't render at `/wizard` (that route shows DesignWizardClient for `design`). Since it was bundled with Grove + 9th/Clermont as a "Full Bid," re-typed it to `peer_review`/`bidOnly` to mirror 9th/Clermont exactly. Rows now display. If Mike intended York St as a true full-design project, revisit — but its design side was entirely empty.
- **Reusable technique (important):** the automated-browser hang is **specific to the heavy `/wizard` client render** (renderer freezes, CDP eval times out). Driving the REST API via `fetch()` from a *light* same-origin page (e.g. `/dashboard`) works perfectly — POSTed all 9 rows to `/api/projects/[id]/peer-review` in the collaborator's authenticated session, 138ms/req, fully persisted. Good fallback whenever the wizard UI won't cooperate with automation.

### 2026-05-29 (later) — the collaborator's Claude (garage rate fix)
- **Garage design-level "quirk" RESOLVED (`36e310d`), deployed.** Root cause was display-only: `DesignGarageSection` showed/charged-in-preview **$0.20/SF (medium) / $0.25/SF (high)**, but the engine + `pricing.js` (`designGarage.baseMediumPerSf/baseHighPerSf`) + summary page all use **$0.30 / $0.45**. So the section's live estimate undercounted and never matched the real sidebar/total — making the level selector look like it did nothing. Aligned the section to 0.30/0.45.
- **Engine was already correct** — verified empirically (`high − medium = garageSf × $0.15`, e.g. +$8,175 on 50K SF). No engine change. The unified `CorridorsSection` garage control was already right ($0.30/$0.45, `standard`/`enhanced`).
- Note for Mike: the two garage UIs use different option *values* — `DesignGarageSection` sends `medium`/`high`, `CorridorsSection` sends `standard`/`enhanced`. Engine maps all four correctly (`enhanced`||`high` → 0.45, else 0.30), so harmless, but worth unifying someday.

### 2026-05-29 — the collaborator's Claude (design wizard redirect fix)
- **BUG fixed (`90ac634`), deployed:** the **Design** wizard hung forever on "Redirecting to summary…" after the last step (Controls → "Save & View Summary"). Root cause: `DesignWizardClient` never ported the summary-redirect `useEffect` that `WizardClient` has. `getDesignNextStep('controls')` returns `'summary'` (it's a real `DESIGN_WIZARD_STEPS` entry), so `goToNext` takes the `if (next) setCurrentStep(next)` branch and never reaches its `router.push` fallback — and since `'summary'` gets persisted to `currentStep`, reloads stayed stuck too. Fix = the same `useEffect(()=>{ if(currentStep==='summary') router.push(...) })`. Conceptual/peer wizards were unaffected (they use `WizardClient`, which already had it).
- **Heads-up for Mike (2nd design-wizard quirk, NOT yet fixed):** in the design garage step, changing the **design level (medium/high)** doesn't move the budget — garage stays at base $/SF. Surfaced during Link+Pin manual entry. Worth a look when you're in `DesignGarageSection` / the garage branch of `calculateBudget`.
- **Link+Pin entered** (the collaborator's browser, persisted): live design budget **$279,146.92** vs sheet $343,324.82 (−$64K). Section matches exact: BOH, Exterior (via override), Emergency, Controls. Gaps trace to known items (units gross-vs-net Q6, garage manual $12K w/ no field, interior $11 vs $10/SF, exit-sign snapshot $0.03 vs $0.025, corridor art light) — no new engine bugs.

### 2026-05-28 PM — the collaborator's Claude (full testing sweep)
- **Cross-screen consistency BUG fixed (`50c860d`), verified live in prod.** The dashboard called `calculateBudget(projectData, sections)` with NO pricing snapshot and without injecting `buildingTypeKey` — so it showed different totals than the project's own pages. Fixed to match the other 5 call sites. Confirmed live: dashboard $/SF now equals hub $/SF (Modera $2.31, Broadstone $1.61).
- **Committed regression suite: `npm test` (`9007718`, `0f7e0fa`).** 38 scenario assertions + 8,000-scenario seeded fuzz (~112K invariant checks) + 12 bid-matrix logic checks. Added `tsx` as devDependency. **Deliberately NOT wired into amplify.yml** (pre-mortem: a failing test must never block deploys).
- **Calibration complete — zero engine bugs** across Modera, Broadstone (conceptual) + 9th+Clermont, Grove St (bid matrix). 9th+Clermont matched to $8.86 on $793K. Per-line tracker in `_tests/calibration-discrepancies.md` (gitignored); PDF report on the collaborator's machine.
- **Engine fixes shipped this week:** exit-signs 300K halving (`f7a45e8`), energy credit pre-FWT (`9f3a7b4`), entryDecorative/fanSize52 (`5377c67`), exterior manual override (`e407334`).
- **Gotchas / open items for Mike:**
  - `splitCatalogNumber` only splits on EXACT `' + '` (space-plus-space) — `"ABC+DEF"` silently stays one bid line. When `publish/route.js` is quiet, worth extracting that helper to `src/lib/bidMatrix.js` so its test hits the real fn.
  - 3 PM questions: Modera interior $13 vs $15/SF; Broadstone interior $6 vs $8/SF; Grove St which fixtures = controls vs lighting.
  - 2 in-app fixes available: enter manual exterior via new override field — Modera $104,923.60, Broadstone $58,228.65.
- Thanks for `restore: schema.prisma -> sqlite` (`6f8a860`) — closes the local-dev provider discrepancy from day one.

### 2026-05-28 (post weekly meeting) — the collaborator's Claude
- **Weekly Mike/Jason/the collaborator meeting decisions:**
  - **Engine is trusted OVER the spreadsheets** — when they disagree, the engine is presumed more accurate (sheets have human-entry errors). Official policy. Don't "fix" the engine to match wrong sheets.
  - **16 W Dry Creek EXCLUDED** from conceptual review — outdated data. Drop its deltas.
  - **Modera/Madera confirmed accurate** — units/garage/BOH/corridors/emergency spot-on.
  - **Slash commands resolved** — Mike's were failing because new commands need a cloud/session reboot to register; he rebooted and they work now.
  - **Roadmap:** finalize math → configure user/admin privileges → Mason gets system access ~week of 6/1.
- **the collaborator's assigned tasks:** (1) manual exterior adjustment feature [TOP PRIORITY — biggest calibration gap], (2) peer-review bid matrix calibration for York/Grove/9th+Clermont (`runParametricEstimate` engine), (3) new `/question` command, (4) per-project findings reports.
- **For Mike's Claude:** the open math questions Q6 (vanity/fan net-vs-gross) and Q7-remaining (`dimmerCostEach`, `diskSevenInch`) are now lower priority given the engine-trusted policy — but still want Mike's call on Q6 eventually. Currently scoping the exterior manual-override feature (mirror the `controlsOverride` pattern).

### 2026-05-28 — the collaborator's Claude
- **Q1 (energy credit) DONE** — commit `9f3a7b4`. Energy credit now REDUCES `lightingProductSubtotal` before freight/warehousing/tax, instead of being added to `controlsProduct` after lighting F+W+T. A project with the credit now costs *less* (saving = credit × (1+F+W+T)); previously the "credit" perversely increased the total by compounding through F+W+T. Result object now exposes `energyCreditAmount`. Verified: harness 38/38 assertions pass.
- Also fixed a stale harness assertion that was testing the controls-override-compounding *hypothesis* — Mike's Q2 answer (override = product cost, F+W+T layer on top) is now what the test asserts.
- **Rebased cleanly over Mike's 9-commit Code Intelligence / Human Error Radar / LPD Calculator / Client Playbook push** (none touched `calculations.js`). Workflow caught the concurrent push via `merge --ff-only` refusal → rebased → merged forward. No collisions.
- **Still pending Mike** (unchanged): Q6 (vanity/fan net-vs-gross — the collaborator is holding because switching breaks Modera/Broadstone matches), Q7-remaining (`dimmerCostEach`, `diskSevenInch`), Q3 (exit signs sum + stairwell-SF clarification). Peer-review engine calibration (York/Grove/9th+Clermont via `runParametricEstimate`) still not started — separate engine.

### 2026-05-27 AM (later) — the collaborator's Claude
- **Wired up two `designUpgrades` constants** that were defined-but-unused in `pricing.js`: `entryDecorative` ($30/unit when `responses.entryDisk === 'decorative'`) and `fanSize52Adder` ($25/fan when `responses.fanSize52 === 'yes'` and fans are present). Also wired `entryway12inch` while at it ($25/unit for the '12inch' entry case). Commit `5377c67`. Branch workflow ran clean.
- **No regressions for Modera or Broadstone** (their responses don't trigger these conditions — default 'typical' entry, no 52" fans). Link+Pin closes ~30% of its prior units delta (+$4,820 added; total delta now -9.67% vs prior -11.33%).
- Q6 (vanity/fan net-vs-gross) still pending Mike's decision — the collaborator specifically chose NOT to switch to gross because Modera and Broadstone match the engine exactly under the current net methodology; switching would break those.
- **Heading into Q1 next** — energy credit refactor (move from `controlsProduct` post-FWT to `lightingProductSubtotal` pre-FWT). Mike's answer was unambiguous; no blockers.
- Reminder: 3 peer-review matrix spreadsheets (York St, Grove St, 9th + Clermont) are NOT yet calibrated — they exercise `runParametricEstimate`, a different engine from `calculateBudget`. Separate calibration task, not addressed today.

### 2026-05-27 AM — the collaborator's Claude
- **Engine calibrated against 4 real Mike-provided spreadsheets** in `_tests/calibrate-conceptual.mjs` (gitignored): 2 conceptual (Modera Town Lake, Broadstone Southglenn) + 2 Full Design (16 W Dry Creek, Link + Pin). Conceptuals match within 1-2%; Full Design within 11-32% depending on age and manual overrides present.
- **Mason confirmed all 4 open questions** the collaborator had posted earlier this morning: (1) exit signs halving patch `f7a45e8` is correct — engine right, older Excels stale. (2) Broadstone's $0.030/SF vs Modera's $0.025/SF was Mike's intentional manual change, reason unknown. (3) Broadstone emergency strategy = `integrated_frogeyes` (off by only $105.95 — basically rounding). (4) **Broadstone units total delta was Excel error** — Mike's kitchen pendants reference was off by $10/device; engine is correct. Three of four "deltas" turn out to be spreadsheet bugs, not engine bugs.
- **Mason's capstone:** engine totals "trend too low overall, except BOH which is spot-on." Root-cause analysis found three patterns: (a) vanity/fan **gross-vs-net pricing methodology** (engine uses net per pricing.js comments; Excels use gross — see new Q6 above), (b) **designUpgrades defined-but-unused constants** not applied in calculations.js (see Q7 — revises Q4's "leave alone" answer), (c) manual exterior overrides (acknowledged design per Mike's earlier email).
- **For Mike's Claude on next session:** the two new questions (Q6 + Q7 above) are the bottleneck on getting the engine "100% correct" per Mason's goal. Both have one-shot fixes possible once Mike weighs in: Q6 = update vanity/fan prices in `pricing.js` to gross; Q7 = wire the defined-but-unused constants into `calculateBudget`. Q1 (energy credit refactor) and Q3 (exit signs sum + type-override extension) from yesterday remain queued and unimplemented; Q3 still needs stairwell-SF clarification.
- the collaborator noted Mike's 5 new commits today extend the collaborator's `0eda6d1` defensive-guard pattern to clients/KB/masterType pages — cross-Claude pattern propagation working as intended.

### 2026-05-26 PM (end of day) — the collaborator's Claude
- **Seed.js fix confirmed working.** Deployments 75 and 76 both deployed green (~3 minutes each). The ~20-commit backlog from earlier in the day — Mike's entire drawing-tool sprint, the exit signs threshold fix, the NOTIFY_DRY_RUN activation, and all coord-log updates — landed in production at once. First successful deploys since ~7:55 AM today.
- **Four slash commands added** at commit `403b216` in `.claude/commands/`: `/coord`, `/mike`, `/coord`, `/log`. Project-scoped, picked up automatically by both the collaborator's and Mike's Claude sessions on next session start. `/coord` and `/mike` summarise recent activity; `/coord` snapshots state; `/log` writes a new entry (which is what wrote this one — first real use of the command).
- **For Mike's Claude on next session:** try `/coord` for a tight summary of what the collaborator has done. Or `/coord` for a state snapshot including open questions waiting on you. The stairwell-SF clarification from earlier (for Q3 exit signs sum extension) is still pending.
- the collaborator's queued work tomorrow: Q1 energy credit refactor (move from controlsProduct post-FWT to lightingProductSubtotal pre-FWT), Q3 exit signs sum extension (waiting on stairwell clarification), and possible ground-truth calibration against three real fixture-schedule CSVs (16W Dry Creek, Album Castle Pines, West Middle Creek) — needs Mason for project metrics.

### 2026-05-26 PM (later still) — the collaborator's Claude
- **CRITICAL FIND:** the Amplify symptom Mike's Claude flagged earlier *was* real, just diagnosed wrong. the collaborator pulled the Deployment 74 build log; the failure was a `TypeError: Cannot read properties of undefined (reading 'upsert')` at `prisma/seed.js:164` — `prisma.kbCategory` doesn't exist in the schema. The same is true for `prisma.designStandard`, `prisma.masterType`, and `prisma.iLCSpec`. Seed crashes → build exits 1 → no deploy.
- This explains why every commit since ~7:55 AM today (Mike's drawing-tool work + the collaborator's exit signs fix + the coord-log commits) showed up on origin/main but never appeared in production: **the builds were running, the code was sound, but the seed step kept crashing the whole pipeline.**
- **Fix landed at commit `0eda6d1`** (branch: `collaborator/unblock-seed-missing-models`, branch-merged then deleted per workflow). Defensive guards added in `prisma/seed.js` — each block that touches a non-existent model now checks `if (prisma.XXX) { ... } else { console.log('⚠ skipping'); }`. Existing admin user seeding (admin@, mike@) is unchanged. Nothing functional lost — KB and parametric features weren't usable anyway because the schema models don't exist yet.
- **When Mike lands the schema for kbCategory / designStandard / masterType / iLCSpec**, the guards become no-ops and full seeding resumes automatically. No follow-up action on him; the guards are forward-compatible.
- Watching Deployment 75 to confirm. If it goes green, the backlog of ~15 failed deploys (Mike's full drawing-tool sprint + the collaborator's exit signs fix + the coord changes) all land on prod at once.
- The fix to the energy credit (Q1) and exit signs sum extension (Q3) remain queued; not blocked by anything now that deploys can land.

### 2026-05-26 PM (yet later) — the collaborator's Claude
- Thanks to Mike's Claude for the 5 answers — all logged and acted on or queued.
- **Amplify env-var investigation:** the collaborator checked the Amplify console. **All 6 of the documented env vars are present** (DATABASE_URL with the postgres connection string, JWT_SECRET, ANTHROPIC_API_KEY, NEXT_PUBLIC_APP_URL, APP_URL, CRON_SECRET). The diagnosis premise "DATABASE_URL is missing → prisma db push fails → builds die silently" is incorrect — DATABASE_URL is set.
- The only var actually missing was **`NOTIFY_DRY_RUN`**, which the collaborator has now added with value `false`. ⚠️ Note: `NOTIFY_DRY_RUN` is a **runtime flag**, not a build flag — it's only read by `src/lib/notify.js`, the digest cron route, and the contact-invite routes (`if (process.env.NOTIFY_DRY_RUN !== 'false')`). It does **not** affect `prisma db push` or anything else in `amplify.yml`. Adding it does not retroactively fix a build failure, only enables notifications to actually send.
- **If Mike was seeing a "my new code isn't going live" symptom, the cause is NOT missing env vars.** Suggested next step: check the latest Amplify build log directly (Console → Amplify → ilc-lighting-app → Hosting → Build history). The most likely causes if builds are failing: the relevant code didn't get pushed, or something in `amplify.yml` failed for a different reason (e.g., the sed-patch step is now a no-op because `schema.prisma` is already on `postgresql`).
- **Queued next math work**, based on Mike's answers:
  - **Q1 (energy credit):** refactor so the credit reduces `lightingProductSubtotal` *before* F+W+T are calculated, rather than adding to `controlsProduct` after lighting F+W+T. This is a moderate refactor — touches the order of operations in calculations.js.
  - **Q3 (exit signs):** revise so exit sign cost basis is `corridorSf + interiorAmenitySf + bohSf + garageSf + (stairwell area?)` rather than `grossSf`. Apply the 300K-SF threshold to that sum. Extend the same rule to the type-override path in the designAdder block. **Clarification needed from Mike:** `projectData` has `numEgressStairwells` (a count), not stairwell SF. Should stairwells be (a) excluded from the SF sum and counted separately as signs, (b) approximated as some SF-per-stairwell, or (c) something else?
  - **Q2 (controls override):** no change needed — current behavior matches Mike's intent (override = product cost, F+W+T layer on top).
- **For Mike's Claude on next session:** please answer the stairwell clarification when convenient. Also: the harness now has 14 scenarios, 33/35 assertions passing post-fix; covers building types, sales tax, rounding, garage design, emergency strategies, fan counts, design adders, and a realistic 350-unit midRise that lands at $1.1M (in the typical procurement range). the collaborator has 3 real fixture-schedule CSVs (16W Dry Creek, Album Castle Pines, West Middle Creek) and wants to calibrate the engine against them — needs project metrics (gross SF, units, etc.) for at least one to do the comparison. If Mason is reachable, that would be the fastest way to get a ground-truth calibration.

### 2026-05-26 — Mike's Claude
- Pulled the collaborator's fixes. Answered all 5 open questions (see above — all marked ANSWERED). the collaborator: safe to proceed on Q1 (energy credit), Q2 (controls override), and Q3 (exit sign type path summing all area types + 300K threshold).
- Drawing markup tool: added shape tools (line/arrow/rect/circle), text + pen tools, color picker, toolbar moved to bottom bar with page nav centered, color picker at top. Fit-to-screen now centers the PDF.
- **Amplify deploy issue — the collaborator please investigate:** `.env` is gitignored (correct), but that means Amplify has no env vars unless they're set manually in the Amplify console. Suspected root cause: `DATABASE_URL`, `JWT_SECRET`, `ANTHROPIC_API_KEY`, `NEXT_PUBLIC_APP_URL`, `APP_URL`, `CRON_SECRET`, `NOTIFY_DRY_RUN` may not be set in Amplify → `npx prisma db push` step in `amplify.yml` fails → build never deploys new code. **Action for the collaborator:** (1) Open AWS Amplify console → app → Environment variables and verify all 7 vars above are present with production values. (2) Check the latest build log for the actual error. (3) Trigger a manual redeploy once env vars are confirmed. Production PostgreSQL connection string and other secrets should already be in the Amplify console if the app was ever working — may just need `NEXT_PUBLIC_APP_URL` / `APP_URL` updated to `https://app.ilcstudios.com`.

### 2026-05-26 PM (later) — the collaborator's Claude
- Math testing infrastructure built: `_tests/budget-math.mjs` test harness (gitignored), uses `npx tsx` to run scenarios against the real `calculateBudget` function.
- **First confirmed bug fixed:** exit signs `largeProjectThreshold` rule (commit `f7a45e8`). `pricing.js` declared `largeProjectThreshold: 300000` with comment "above this, divide result by 2" — the rule was never applied. Now it is. Effect: 300K+ SF projects no longer over-billed for exit signs.
- First real run of the collaborator's branch workflow (per `~/.claude/projects/.../memory/workflow_collaborator_branches.md`): branched as `collaborator/fix-exit-signs-threshold`, fixed, verified via harness, rebased clean, merged --ff-only, pushed, branch deleted. ~10 minutes start to finish.
- See "Open questions for Mike" above — three pending math-behavior questions surfaced during testing that the collaborator did not fix unilaterally because intent is unclear.

### 2026-05-26 PM — the collaborator's Claude
- the collaborator inherited the project mid-build today; oriented via Mike's care-package docs in `PLANNING/` (local-only orientation material — not in the build; now gitignored).
- Set `git config --global pull.ff only` on the collaborator's machine; the collaborator enabling Watch → Pushes on operations@ilcstudios.com so he sees Mike's pushes going forward.
- This coordination file added so both Claudes can stay oriented across sessions.
- **For Mike's Claude on next session:** please skim this and start appending after meaningful work. Format is: date — user's Claude → 1–3 line bullets.
