/**
 * SQLite Prisma client adapter.
 *
 * Sử dụng khi DB_PROVIDER=sqlite. Client đọc DATABASE_URL từ env.
 * Khi dùng SQLite local, đặt trong .env.local:
 *   DB_PROVIDER=sqlite
 *   DATABASE_URL=file:./local.db
 *
 * SQLite schema dùng String thay vì String[] cho array fields.
 * Adapter này tự động:
 *   - Stringify arrays trước khi write
 *   - Parse JSON strings thành arrays sau khi read
 */

import { PrismaClient } from "../generated/prisma-sqlite";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

// Mapping: model → fields cần serialize/deserialize
const ARRAY_FIELDS: Record<string, string[]> = {
  syncJob: ["channelIds"],
  cronLog: ["errors"],
  cronConfig: ["lastResult"],
  metricPermission: ["allowedRoles"],
  permissionConfig: ["allowedRoles"],
  payrollRecord: ["detail"],
  channelTrackerConfig: ["data"],
};

function serializeFields(model: string, data: Record<string, unknown>) {
  const fields = ARRAY_FIELDS[model];
  if (!fields) return data;
  const result = { ...data };
  for (const field of fields) {
    if (field in result && typeof result[field] !== "string") {
      result[field] = JSON.stringify(result[field] ?? null);
    }
  }
  return result;
}

function deserializeFields(model: string, data: Record<string, unknown>) {
  const fields = ARRAY_FIELDS[model];
  if (!fields || !data) return data;
  const result = { ...data };
  for (const field of fields) {
    if (field in result && typeof result[field] === "string") {
      try {
        result[field] = JSON.parse(result[field] as string);
      } catch {
        // keep as-is if not valid JSON
      }
    }
  }
  return result;
}

function createSqliteClient() {
  const url = (process.env.DATABASE_URL ?? "file:./local.db").replace(/^file:/, "");
  const adapter = new PrismaBetterSqlite3({ url });

  const client = new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return client.$extends({
    query: {
      $allModels: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async create({ model, args, query }: any) {
          const m = model.charAt(0).toLowerCase() + model.slice(1);
          if (args.data) args.data = serializeFields(m, args.data);
          const result = await query(args);
          return deserializeFields(m, result);
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async update({ model, args, query }: any) {
          const m = model.charAt(0).toLowerCase() + model.slice(1);
          if (args.data) args.data = serializeFields(m, args.data);
          const result = await query(args);
          return deserializeFields(m, result);
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async upsert({ model, args, query }: any) {
          const m = model.charAt(0).toLowerCase() + model.slice(1);
          if (args.create) args.create = serializeFields(m, args.create);
          if (args.update) args.update = serializeFields(m, args.update);
          const result = await query(args);
          return deserializeFields(m, result);
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async findUnique({ model, args, query }: any) {
          const m = model.charAt(0).toLowerCase() + model.slice(1);
          const result = await query(args);
          return result ? deserializeFields(m, result) : result;
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async findFirst({ model, args, query }: any) {
          const m = model.charAt(0).toLowerCase() + model.slice(1);
          const result = await query(args);
          return result ? deserializeFields(m, result) : result;
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async findMany({ model, args, query }: any) {
          const m = model.charAt(0).toLowerCase() + model.slice(1);
          const results = await query(args);
          return (results as Record<string, unknown>[]).map((r) => deserializeFields(m, r));
        },
      },
    },
  }) as unknown as PrismaClient;
}

const globalForSqlite = globalThis as unknown as { sqliteClient?: PrismaClient };

export const sqliteDb =
  globalForSqlite.sqliteClient ?? createSqliteClient();

if (process.env.NODE_ENV !== "production") globalForSqlite.sqliteClient = sqliteDb;
