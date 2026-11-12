# File storage: one bucket for every host

_2026-11-12. Jason: "set up the proper storage, let's make this easy when we transition [to Replit]."_

## Why
Without a bucket, uploaded files (drawings, receipts, Sales Docs, bot knowledge, project files, QC screenshots) go to the server's own disk. Render wipes that disk on every deploy, and Replit does the same. With a bucket, files live outside the server: Render and later Replit use the same bucket with the same settings, so the move copies no files at all.

## What the code does (done)
- `src/lib/objectStore.js` is the one place that builds the storage connection. Every storage module uses it: `uploadStorage.js`, `projectFileStorage.js`, `qcStorage.js`, `salesDocs/storage.js`, `botKnowledge/storage.js`.
- It works with **any S3-compatible bucket**: AWS S3, Cloudflare R2, Backblaze B2, MinIO.
- No bucket set = local disk, exactly as before. Local development needs nothing.
- Tests: `scripts/tests/objectStore.test.mjs` (part of `npm run verify`).

## Settings
| Variable | AWS S3 | Cloudflare R2 |
|-|-|-|
| `S3_BUCKET` | bucket name | bucket name |
| `S3_ACCESS_KEY_ID` | IAM user key, this bucket only | R2 API token's Access Key ID |
| `S3_SECRET_ACCESS_KEY` | its secret | the token's Secret Access Key |
| `S3_REGION` | e.g. `us-east-2` | `auto` |
| `S3_ENDPOINT` | leave blank | `https://<account id>.r2.cloudflarestorage.com` |
| `S3_FORCE_PATH_STYLE` | leave blank | leave blank (`true` only for MinIO and similar) |

Never use `ilc-qc-media` (ILC's production bucket).

## Recommended: Cloudflare R2
S3-compatible, no charge for downloads (drawings are read back often), simple per-bucket keys, and not tied to Render, Replit or AWS. AWS S3 works the same way if 1LUX has its own AWS account (today only Sean can reach ILC's).

### Steps (Jason, in Cloudflare; about 15 minutes)
1. Sign in or create a Cloudflare account for 1LUX → **R2 Object Storage** → enable R2 (needs a payment method; the free tier covers 10 GB).
2. **Create bucket**: name `onelux-app-files` (or one per copy: `onelux-app-files-staging` now, a separate one for the live app later). Location: automatic. Leave public access **off**: the app hands out short-lived signed links.
3. Bucket → **Settings → CORS policy** → add (browsers send large files straight to the bucket):
   ```json
   [{ "AllowedOrigins": ["https://onelux-app.onrender.com", "http://localhost:3000"],
      "AllowedMethods": ["PUT", "GET", "HEAD"],
      "AllowedHeaders": ["*"],
      "MaxAgeSeconds": 3600 }]
   ```
   Add the Replit address (and any custom domain) here on move day.
4. Bucket → **Settings → Object lifecycle rules** → add:
   - prefix `uploads/`: delete objects after **7 days** (temporary copies of uploads; the app keeps what it needs under other prefixes);
   - abort incomplete multipart uploads after **1 day**.
5. R2 overview → **Manage API tokens → Create API token**: permission **Object Read & Write**, applied to **this bucket only**, no expiry (or a long one, with a reminder). Copy the Access Key ID, Secret Access Key and the endpoint (`https://<account id>.r2.cloudflarestorage.com`). They are shown once.
6. Render → `onelux-app` → **Environment**: set `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_REGION=auto`, `S3_ENDPOINT`. Save (Render redeploys). Type them in Render only: not in chat, email or git.
7. Check: sign in on staging, upload a drawing to a job, open it, deploy again (or restart), open it again. It should still be there.

## On move day (Replit)
Copy the same five values into Replit Secrets and add the Replit address to the bucket's CORS list. Nothing else changes.
