import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

// Reuse one client across hot reloads in dev so we don't exhaust the Supabase pooler.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * Lazily creates the client, so importing this module (e.g. during `next build`)
 * doesn't require DATABASE_URL to be set.
 */
export function db(): PrismaClient {
  if (globalForPrisma.prisma) return globalForPrisma.prisma;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");

  const client = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  globalForPrisma.prisma = client;
  return client;
}
