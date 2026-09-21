import { defineConfig } from "prisma/config";

// Only the Prisma CLI (migrate/generate) reads this file. The application builds its own
// connection from the validated config (src/platform/config).
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: process.env.DATABASE_URL ?? "" },
});
