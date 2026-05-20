/** @type {import('next').NextConfig} */
const nextConfig = {
    // ── Public env vars (safe to expose to browser) ─────────────────────────
    // Do NOT put DATABASE_URL, JWT_SECRET, or ANTHROPIC_API_KEY here.
    // Those are server-only and must never appear in the client bundle.
    // Amplify Lambda injects all env vars from the Amplify console into
    // process.env at runtime — server code reads them directly from there.
    env: {
          NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    },
    experimental: {
          serverComponentsExternalPackages: ['@prisma/client', 'bcryptjs', 'xlsx', '@napi-rs/canvas', 'tesseract.js', 'pdfjs-dist', 'pdf-parse', '@anthropic-ai/sdk'],
          // Zero out the client-side router cache for dynamic pages so navigating
          // back to the dashboard (or any force-dynamic page) always re-fetches.
          staleTimes: {
                  dynamic: 0,
                  static: 180,
          },
    },
};

export default nextConfig;
