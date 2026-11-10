#!/bin/sh
# Container start-up (Render, 2026-11-10): migrate, seed, serve. All three are safe to repeat.
set -e

if [ -z "${JWT_SECRET:-}" ] || [ "${#JWT_SECRET}" -lt 32 ]; then
  echo "[entrypoint] JWT_SECRET is missing or shorter than 32 characters; refusing to start" >&2
  exit 1
fi

echo "[entrypoint] applying database migrations"
node /opt/prisma-cli/node_modules/prisma/build/index.js migrate deploy --schema /app/prisma/schema.prisma

# Creates the 1LUX accounts once when SEED_ADMIN_PASSWORD is set (they must change it at first sign-in), and the
# reference defaults (knowledge base, proposal and dashboard templates). Never resets an existing account.
echo "[entrypoint] seeding"
node prisma/seed.js || echo "[entrypoint] seed failed; starting anyway"

echo "[entrypoint] starting on port ${PORT:-3000}"
exec node server.js
