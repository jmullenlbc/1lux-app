import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis;

// Pass the DATABASE_URL explicitly so that the value baked in at build time
// (via next.config.mjs env config + webpack DefinePlugin) is used instead of
// relying on process.env inside the externalized @prisma/client package,
// which does not have access to env vars in the Amplify SSR Lambda.
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
