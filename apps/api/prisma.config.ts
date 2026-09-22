import { existsSync } from "node:fs";
import { defineConfig } from "prisma/config";

// Only the Prisma CLI (migrate/generate) reads this file. The application builds its own
// connection from the validated config (src/platform/config). Prisma 7 no longer loads `.env`
// by itself; variables already set (e.g. the test DATABASE_URL) take precedence over the file.
if (existsSync(".env")) process.loadEnvFile(".env");

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: process.env.DATABASE_URL ?? "" },
});
