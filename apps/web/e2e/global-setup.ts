import { execFileSync } from "node:child_process";
import { assertE2eDatabase, childEnv } from "./env.ts";
import { uniqueEmail } from "./fixtures/emails.ts";

/**
 * Starts the first-ADMIN bootstrap once per run, like an operator would (001 quickstart), on the
 * database recreated by prepare-db.ts. The CLI runs `dist/`, so `pnpm build` comes first. The link
 * and e-mail reach the journeys through the environment, which Playwright hands to the workers.
 */
export default function globalSetup(): void {
  assertE2eDatabase();

  const email = uniqueEmail("admin");
  const output = execFileSync("pnpm", ["--filter", "api", "admin:bootstrap", "--email", email, "--print-link"], {
    env: childEnv(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });
  const link = /Link de ativação: (\S+)/.exec(output)?.[1];
  if (!link) throw new Error("admin:bootstrap não imprimiu o link de ativação.");

  process.env.E2E_ADMIN_EMAIL = email;
  process.env.E2E_ADMIN_LINK = link;
}
