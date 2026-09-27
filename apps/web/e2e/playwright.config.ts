import { defineConfig, devices } from "@playwright/test";
import { API_DIR, API_URL, OPENROUTER_MOCK_PORT, WEB_DIR, WEB_URL, e2eEnv } from "./env.ts";

/**
 * E2E suite (specs/002-stack-alignment/contracts/ci-and-e2e.md, research S14). Runs the builds
 * against a real API, database and Mailpit on their own ports (API 4100, web 3100), so an open
 * `pnpm dev` and the development database are left alone. Prerequisites: `docker compose up -d
 * postgres-test mailpit` and `pnpm build`.
 */
export default defineConfig({
  testDir: ".",
  testMatch: "*.spec.ts",
  outputDir: "../test-results",
  globalSetup: "./global-setup.ts",
  fullyParallel: true,
  forbidOnly: true,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  // SC-006: the whole run, builds included, stays under 10 minutes.
  globalTimeout: 10 * 60_000,
  reporter: [["list"], ["html", { outputFolder: "../playwright-report", open: "never" }]],
  use: { baseURL: WEB_URL, trace: "retain-on-failure" },
  projects: [
    // Activates the bootstrap ADMIN through the screens; teacher-invitation starts from that ADMIN.
    { name: "admin", testMatch: "admin-manager.spec.ts", use: devices["Desktop Chrome"] },
    // Students come only from class invitations (003 FR-048): the ADMIN invites the teacher of
    // the run, who creates the class every student journey is invited to.
    { name: "teacher", testMatch: "class-teacher-setup.spec.ts", dependencies: ["admin"], use: devices["Desktop Chrome"] },
    {
      name: "manager",
      testMatch: "teacher-invitation.spec.ts",
      dependencies: ["teacher"],
      use: devices["Desktop Chrome"],
    },
    {
      name: "journeys",
      testIgnore: ["admin-manager.spec.ts", "class-teacher-setup.spec.ts", "teacher-invitation.spec.ts"],
      dependencies: ["teacher"],
      use: devices["Desktop Chrome"],
    },
  ],
  webServer: [
    {
      // 008: the local OpenRouter mock the E2E API's OPENROUTER_BASE_URL points to.
      command: "node e2e/openrouter-mock.ts",
      cwd: WEB_DIR,
      env: e2eEnv,
      url: `http://127.0.0.1:${OPENROUTER_MOCK_PORT}/api/v1/key`,
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      // Playwright starts webServer before globalSetup: the database is recreated here, before the API boots.
      command: `node e2e/prepare-db.ts && node ${JSON.stringify(`${API_DIR}dist/main.js`)}`,
      cwd: WEB_DIR,
      env: e2eEnv,
      url: `${API_URL}/api/health/ready`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      // Next.js writes the `/api/*` rewrite target into the build (routes-manifest.json), so the web
      // is built for API 4100 in its own directory; `.next` of `pnpm build`/`pnpm dev` is untouched.
      command: "next build && next start --port 3100",
      cwd: WEB_DIR,
      env: { API_ORIGIN: API_URL, NEXT_DIST_DIR: ".next/e2e" },
      url: WEB_URL,
      reuseExistingServer: false,
      timeout: 300_000,
    },
  ],
});
