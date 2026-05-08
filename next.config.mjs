/** @type {import('next').NextConfig} */
const nextConfig = {
    // Embed server-side env vars into the build so they are available in SSR Lambdas
    env: {
          DATABASE_URL: process.env.DATABASE_URL,
          JWT_SECRET: process.env.JWT_SECRET,
          ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
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
