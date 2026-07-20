/** @type {import('next').NextConfig} */
const nextConfig = {
    // ── Environment variables ────────────────────────────────────────────────
    // DATABASE_URL is baked in at build time via webpack DefinePlugin.
    // This is required for Amplify SSR Lambda: @prisma/client is marked as an
    // external package (not bundled by webpack), so Prisma's engine reads the
    // URL from the datasources option in db.js. db.js IS bundled, so the baked-
    // in value of process.env.DATABASE_URL is what gets passed through.
    // Without this, the Lambda has no DB connection and every API route fails.
    //
    // ANTHROPIC_API_KEY must be baked in here — same Amplify Gen 1 trap as
    // DATABASE_URL and S3 keys. Console env vars do NOT reach the SSR Lambda
    // runtime; they're only available during the build. getAnthropicKey() in
    // src/lib/anthropicKey.js checks process.env first, then falls back to
    // reading .env from disk — but .env is gitignored and not in the bundle.
    // Without baking the key in here, all AI parsers (fixture schedule, schedule
    // extract, etc.) silently return null in production. Empirically confirmed
    // broken; same fix pattern as S3_ACCESS_KEY_ID (commit d0c8d8c).
    // JWT_SECRET is intentionally NOT here — it's only used by jose/bcrypt in
    // auth.js which is webpack-bundled differently and needs separate analysis.
    env: {
          DATABASE_URL:        process.env.DATABASE_URL,
          NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
          // S3_BUCKET / S3_REGION must be baked in here for the same reason as
          // DATABASE_URL: src/lib/qcStorage.js is webpack-bundled, so without
          // these in the env block, process.env.S3_BUCKET inlines as undefined
          // and the prod code path (putS3) never runs — uploads silently fall
          // back to the ephemeral Lambda filesystem and disappear immediately.
          S3_BUCKET:           process.env.S3_BUCKET,
          S3_REGION:           process.env.S3_REGION,
          // S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY: same trap, second layer.
          // Amplify Hosting Gen 1 does NOT propagate console-set env vars to
          // the SSR Lambda runtime — they're available at build time only.
          // Confirmed empirically: with both set in the Amplify console but
          // not in this env block, the Lambda saw process.env.S3_ACCESS_KEY_ID
          // as undefined and the AWS SDK threw CredentialsProviderError. So we
          // bake them in here. They end up in the server bundle (never sent to
          // the browser), and the IAM user backing them is scoped to PutObject/
          // GetObject/DeleteObject on the ilc-qc-media bucket only — minimal
          // blast radius if the bundle is ever exposed. Swap to a proper SSR
          // compute role during the security pass and delete this block.
          S3_ACCESS_KEY_ID:     process.env.S3_ACCESS_KEY_ID,
          S3_SECRET_ACCESS_KEY: process.env.S3_SECRET_ACCESS_KEY,
          ANTHROPIC_API_KEY:    process.env.ANTHROPIC_API_KEY,
    },
    experimental: {
          serverComponentsExternalPackages: ['@prisma/client', 'bcryptjs', 'xlsx', '@napi-rs/canvas', 'tesseract.js', 'pdfjs-dist', 'pdf-parse', '@anthropic-ai/sdk', '@aws-sdk/client-s3', '@aws-sdk/s3-request-presigner', 'puppeteer-core', '@sparticuz/chromium'],
          // Force-include the Chromium binary in Amplify's Lambda output tracing.
          // Dynamic imports of @sparticuz/chromium aren't statically traced by nft,
          // so without this the binary (.br file) would be missing from the Lambda.
          //
          // Same trap, second case: pdfjs-dist's standard_fonts/ is resolved at
          // RUNTIME via a constructed file:// path (see ocr.js / scheduleExtract.js /
          // fixture-schedule/parse), so nft never traces it — it only traced
          // pdfjs-dist/legacy/build. In prod the fonts directory simply wasn't in the
          // Lambda, standardFontDataUrl pointed at nothing, getTextContent yielded no
          // text, and every AI parse silently returned 0 rows while local worked fine.
          // 804K / 16 files — force-include it on every route that touches pdfjs.
          outputFileTracingIncludes: {
                '/api/projects/[id]/budget/pdf': ['./node_modules/@sparticuz/chromium/**/*'],
                '/api/projects/[id]/peer-review/pdf': ['./node_modules/@sparticuz/chromium/**/*'],
                '/api/projects/[id]/design-bid-matrix/pdf': ['./node_modules/@sparticuz/chromium/**/*'],
                // Public conceptual-budget intake — same pdfjs runtime-font trap.
                '/api/intake/parse': ['./node_modules/pdfjs-dist/standard_fonts/*'],
                '/api/projects/[id]/fixture-schedule/parse': ['./node_modules/pdfjs-dist/standard_fonts/*'],
                '/api/projects/[id]/files': ['./node_modules/pdfjs-dist/standard_fonts/*'],
                '/api/projects/[id]/files/[fileId]/reparse': ['./node_modules/pdfjs-dist/standard_fonts/*'],
                '/api/projects/[id]/peer-review/parse-pdf': ['./node_modules/pdfjs-dist/standard_fonts/*'],
                '/api/projects/[id]/analyze-contract': ['./node_modules/pdfjs-dist/standard_fonts/*'],
                '/api/projects/[id]/drawing-submissions': ['./node_modules/pdfjs-dist/standard_fonts/*'],
                '/api/projects/[id]/tracker/extract': ['./node_modules/pdfjs-dist/standard_fonts/*'],
                '/api/projects/[id]/tracker/import-toc': ['./node_modules/pdfjs-dist/standard_fonts/*'],
          },
          // Zero out the client-side router cache for dynamic pages so navigating
          // back to the dashboard (or any force-dynamic page) always re-fetches.
          staleTimes: {
                  dynamic: 0,
                  static: 180,
          },
    },
};

export default nextConfig;
