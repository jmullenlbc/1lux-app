import { PrismaClient } from '@prisma/client';
import { withArchiveFilter } from './archive';

const globalForPrisma = globalThis;

// Amplify Lambda injects environment variables from the Amplify console into
// process.env at runtime, so DATABASE_URL is always available here.
// The `datasources.db.url` override is kept to be explicit and ensure the
// correct URL is used even when @prisma/client is loaded as an external module.
// Wrapped so archived clients, projects, people and notes drop out of every
// list and count on their own, and files, drawing sets, budget versions,
// products, conceptual budgets and questionnaire answers can never be deleted
// see src/lib/archive.js (migrations 0075 + 0076).
// Cached under its own name so a dev reload never reuses an unwrapped client.
export const prisma = globalForPrisma.prismaArchiveAware ?? withArchiveFilter(new PrismaClient({
    datasources: {
          db: {
                  url: process.env.DATABASE_URL,
          },
    },
}));

if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.prismaArchiveAware = prisma;
}
