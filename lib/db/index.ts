import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL!;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pool = new pg.Pool({ connectionString }) as any;
  const adapter = new PrismaPg(pool);

  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/**
 * DB_PROVIDER=sqlite → dùng SQLite local (không cần Supabase)
 * DB_PROVIDER=postgresql (hoặc không set) → dùng Supabase PostgreSQL
 */
function createDb(): PrismaClient {
  if (process.env.DB_PROVIDER === "sqlite") {
    // webpackIgnore: true → webpack bỏ qua module này khi build (không cần generate SQLite client trên Netlify/Vercel)
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { sqliteDb } = require(/* webpackIgnore: true */ "./sqlite-client") as { sqliteDb: PrismaClient };
    return sqliteDb;
  }
  return createPrismaClient();
}

export const db = globalForPrisma.prisma ?? createDb();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;

/** Hiển thị thông tin DB đang dùng (cho settings UI) */
export function getDbProvider(): "sqlite" | "postgresql" {
  return process.env.DB_PROVIDER === "sqlite" ? "sqlite" : "postgresql";
}
