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
    // ANTHROPIC_API_KEY and JWT_SECRET are intentionally NOT here — those stay
    // server-only and are read from process.env at runtime by the Lambda.
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
    },
    experimental: {
          serverComponentsExternalPackages: ['@prisma/client', 'bcryptjs', 'xlsx', '@napi-rs/canvas', 'tesseract.js', 'pdfjs-dist', 'pdf-parse', '@anthropic-ai/sdk', '@aws-sdk/client-s3', '@aws-sdk/s3-request-presigner', 'puppeteer-core', '@sparticuz/chromium'],
          // Zero out the client-side router cache for dynamic pages so navigating
          // back to the dashboard (or any force-dynamic page) always re-fetches.
          staleTimes: {
                  dynamic: 0,
                  static: 180,
          },
    },
};

export default nextConfig;
