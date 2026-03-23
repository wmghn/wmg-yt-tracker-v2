import path from "node:path";
import { defineConfig } from "prisma/config";

// Load .env manually since prisma.config.ts runs before Prisma's env loading
import { config } from "dotenv";
config();

export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  datasource: {
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL!,
  },
  migrate: {
    async adapter() {
      const { PrismaPg } = await import("@prisma/adapter-pg");
      const { default: pg } = await import("pg");

      const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL!;
      const pool = new pg.Pool({ connectionString });

      return new PrismaPg(pool);
    },
  },
});
