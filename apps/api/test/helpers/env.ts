import { existsSync } from "node:fs";
import { resolve } from "node:path";

/** apps/api — Vitest always runs from the package directory (`pnpm --filter api test`). */
export const API_ROOT = resolve(__dirname, "../..");

/**
 * Loads `.env.test` (or the committed `.env.test.example`) without overriding variables that
 * are already set, so CI can point DATABASE_URL elsewhere.
 */
export function loadTestEnv(): void {
  const candidates = [".env.test", ".env.test.example"].map((file) => resolve(API_ROOT, file));
  const file = candidates.find((path) => existsSync(path));
  if (file) process.loadEnvFile(file);
  assertTestDatabase();
}

/** Tests truncate tables: refuse to run against anything that is not a test database. */
export function assertTestDatabase(): void {
  const url = process.env.DATABASE_URL ?? "";
  const database = url ? new URL(url).pathname.replace(/^\//, "") : "";
  if (process.env.NODE_ENV !== "test" || !database.includes("test")) {
    throw new Error(
      `Refusing to run tests: NODE_ENV must be "test" and the database name must contain "test" (got "${database}").`,
    );
  }
}
