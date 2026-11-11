# syntax=docker/dockerfile:1
#
# The app as a container, for Render (2026-11-10; render.yaml). Amplify (amplify.yml) is not used by this copy.
# Nothing secret is baked in: DEPLOY_MODE=container makes next.config.mjs drop its Amplify env block and build a
# standalone server that reads its variables at run time.
#
# Run-time variables (set in Render, never in this file):
#   required  DATABASE_URL (postgresql://...), JWT_SECRET (32+ characters)
#   usual     CRON_SECRET, SEED_ADMIN_PASSWORD (creates the 1LUX accounts once; 12+ characters), ANTHROPIC_API_KEY
#   files     S3_BUCKET, S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY (without them uploads go to the container's
#             disk and are lost on every deploy)
# Build-time variables (Render passes them as build args): NEXT_PUBLIC_APP_URL, NEXT_PUBLIC_APP_ENV. NEXT_PUBLIC_*
# values are compiled into the code, so changing one needs a new build.
# On start the container applies migrations, runs the seed, and starts on $PORT (default 3000).

ARG NODE_VERSION=22
ARG PRISMA_VERSION=5.22.0

# ── 1. Dependencies and the production build ────────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION}-bookworm-slim AS build
ARG PRISMA_VERSION
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_APP_ENV
ENV NEXT_TELEMETRY_DISABLED=1 HUSKY=0 \
    NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL} \
    NEXT_PUBLIC_APP_ENV=${NEXT_PUBLIC_APP_ENV} \
    NODE_OPTIONS=--max-old-space-size=4096
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY public ./public
RUN npm ci --no-audit --no-fund
COPY . .
# The schema is committed with provider "sqlite" (local development); the hosted database is PostgreSQL.
RUN sed -i 's/provider = "sqlite"/provider = "postgresql"/' prisma/schema.prisma \
    && grep -n 'provider' prisma/schema.prisma \
    && npx prisma generate
ENV DEPLOY_MODE=container
# src/lib/db.js builds its client when a route module loads, and Prisma refuses an empty URL, so `next build`
# ("collecting page data") needs one. A placeholder for this step only: every page is force-dynamic, so nothing
# connects during the build, and the real URL comes from Render at run time.
RUN DATABASE_URL="postgresql://build:build@localhost:5432/build" npm run build
# The Lambda Chromium package is traced but never used here (CHROME_PATH points at the system Chromium).
RUN rm -rf .next/standalone/node_modules/@sparticuz
# Migrations run at start, so the image needs the Prisma CLI: a separate minimal install of the same version.
RUN mkdir -p /opt/prisma-cli && cd /opt/prisma-cli \
    && npm init -y >/dev/null && npm install --no-audit --no-fund "prisma@${PRISMA_VERSION}"

# ── 2. What actually runs ───────────────────────────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION}-bookworm-slim AS runtime
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    DEPLOY_MODE=container \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    CHROME_PATH=/usr/bin/chromium
# chromium renders the PDFs (with fonts, or text comes out as boxes); openssl for Prisma; curl for the health check.
RUN apt-get update && apt-get install -y --no-install-recommends \
        chromium fonts-liberation fonts-dejavu-core openssl ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
# The seed and the migrations run outside the Next server, so they need the client, bcrypt and the prisma folder.
COPY --from=build --chown=node:node /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build --chown=node:node /app/node_modules/@prisma/client ./node_modules/@prisma/client
COPY --from=build --chown=node:node /app/node_modules/bcryptjs ./node_modules/bcryptjs
COPY --from=build --chown=node:node /app/prisma ./prisma
COPY --from=build --chown=node:node /app/scripts/docker-entrypoint.sh ./scripts/docker-entrypoint.sh
COPY --from=build --chown=node:node /app/eng.traineddata ./eng.traineddata
COPY --from=build --chown=node:node /opt/prisma-cli /opt/prisma-cli
# WORKDIR made /app as root, so the app (user node) could not create its own folders: without S3, uploads go to
# /app/uploads and failed with "EACCES: permission denied, mkdir '/app/uploads'" (Job Loader on staging, 2026-11-11).
# Same for the other local stores (.intake-dev, .salesdocs-dev, .agent-runs, .mcp-audit). Still lost on every deploy.
RUN mkdir -p /app/uploads /app/.intake-dev /app/.salesdocs-dev /app/.agent-runs /app/.mcp-audit \
    && chown node:node /app /app/uploads /app/.intake-dev /app/.salesdocs-dev /app/.agent-runs /app/.mcp-audit
USER node
EXPOSE 3000
# Run through sh so the script needs no executable bit (Windows checkouts do not keep it).
ENTRYPOINT ["sh", "/app/scripts/docker-entrypoint.sh"]
