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
          DATABASE_URL:       process.env.DATABASE_URL,
          NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    },
    experimental: {
          serverComponentsExternalPackages: ['@prisma/client', 'bcryptjs', 'xlsx', '@napi-rs/canvas', 'tesseract.js', 'pdfjs-dist', 'pdf-parse', '@anthropic-ai/sdk', '@aws-sdk/client-s3', '@aws-sdk/s3-request-presigner'],
          // Zero out the client-side router cache for dynamic pages so navigating
          // back to the dashboard (or any force-dynamic page) always re-fetches.
          staleTimes: {
                  dynamic: 0,
                  static: 180,
          },
    },
};

export default nextConfig;
