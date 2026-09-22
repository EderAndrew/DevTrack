/**
 * Recreates the E2E database before the API starts (FR-031). Runs as the first half of the API's
 * `webServer` command, not in global-setup.ts: Playwright starts `webServer` before `globalSetup`,
 * and the API must boot on a migrated database. Executed by Node itself (type stripping).
 */
import { execFileSync } from "node:child_process";
import { assertE2eDatabase, childEnv } from "./env.ts";

// Refuses before running any command: nothing below may reach another database.
assertE2eDatabase();

// Creates `devtrack_e2e` when missing, drops everything and applies the migrations (which also
// seed roles and permissions). The E2E variables win over apps/api/.env in prisma.config.ts.
execFileSync("pnpm", ["--filter", "api", "exec", "prisma", "migrate", "reset", "--force"], {
  env: childEnv(),
  stdio: ["ignore", "ignore", "inherit"],
});
