import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

/** apps/web and apps/api, absolute: Playwright and the helper scripts run from different cwds. */
export const WEB_DIR = fileURLToPath(new URL("..", import.meta.url));
export const API_DIR = fileURLToPath(new URL("../../api/", import.meta.url));

/**
 * Variables of `.env.e2e`, as an object (never loaded into this process). Handed to the API, the
 * Prisma CLI and admin:bootstrap on top of `process.env`: already-set variables win over
 * apps/api/.env in prisma.config.ts and in `--env-file-if-exists`, so the dev database is never used.
 */
export const e2eEnv: Record<string, string> = Object.fromEntries(
  Object.entries(parseEnv(readFileSync(new URL(".env.e2e", import.meta.url), "utf8"))).filter(
    (entry): entry is [string, string] => entry[1] !== undefined,
  ),
);

function required(name: string): string {
  const value = e2eEnv[name];
  if (!value) throw new Error(`e2e/.env.e2e: ${name} ausente.`);
  return value;
}

export const WEB_URL = new URL(required("WEB_ORIGIN")).origin;
export const API_URL = `http://localhost:${required("PORT")}`;
export const MAILPIT_URL = required("MAILPIT_URL").replace(/\/+$/, "");
/** Port of the OpenRouter mock (e2e/openrouter-mock.ts), from the API's `OPENROUTER_BASE_URL`. */
export const OPENROUTER_MOCK_PORT = Number(new URL(required("OPENROUTER_BASE_URL")).port);

/**
 * FR-031: the suite recreates its database, so it refuses to touch any database whose name does
 * not say it is the E2E one (the development database is `devtrack`).
 */
export function assertE2eDatabase(): void {
  const name = new URL(required("DATABASE_URL")).pathname.slice(1);
  if (!name.includes("e2e")) {
    throw new Error(`Banco "${name}" recusado: o E2E só roda num banco cujo nome contém "e2e".`);
  }
}

/** Environment of the child processes that must see the E2E configuration (API, Prisma, CLI). */
export const childEnv = (): NodeJS.ProcessEnv => ({ ...process.env, ...e2eEnv });
