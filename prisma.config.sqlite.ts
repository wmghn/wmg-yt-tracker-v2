import path from "node:path";
import { defineConfig } from "prisma/config";

import { config } from "dotenv";
config({ path: ".env.local" });
config(); // fallback to .env

const sqliteUrl = process.env.DATABASE_URL_SQLITE ?? "file:./local.db";

export default defineConfig({
  schema: path.join("prisma", "schema.sqlite.prisma"),
  datasource: {
    url: sqliteUrl,
  },
});
