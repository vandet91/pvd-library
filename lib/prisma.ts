import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

// Reuse the existing client across hot-reloads in development.
// Never reset to undefined — that leaks a new connection pool on every reload.
export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn"] : [],
    datasources: {
      db: {
        // Cap the connection pool so hot-reload storms can't exhaust PostgreSQL.
        // Adjust the limit upward if you add more parallelism in production.
        url: `${process.env.DATABASE_URL}${
          process.env.DATABASE_URL?.includes("?") ? "&" : "?"
        }connection_limit=10`,
      },
    },
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
