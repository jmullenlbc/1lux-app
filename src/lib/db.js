import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis;

// Amplify Lambda injects environment variables from the Amplify console into
// process.env at runtime, so DATABASE_URL is always available here.
// The `datasources.db.url` override is kept to be explicit and ensure the
// correct URL is used even when @prisma/client is loaded as an external module.
export const prisma = globalForPrisma.prisma ?? new PrismaClient({
    datasources: {
          db: {
                  url: process.env.DATABASE_URL,
          },
    },
});

if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.prisma = prisma;
}
