// PM2 processes of the DevTrack beta on the Hostinger VPS (docs/deploy/hostinger.md).
// Run as the `devtrack` user from the repository root: pm2 start deploy/hostinger/ecosystem.config.cjs
// Both listen only on 127.0.0.1; nginx is the only public entry. The Code Runner worker is not here:
// the beta runs with CODE_RUNNER_ENABLED=false (docs/deploy/code-runner.md asks for its own machine).
const { join } = require("node:path");

const root = join(__dirname, "..", "..");

module.exports = {
  apps: [
    {
      name: "devtrack-api",
      cwd: join(root, "apps", "api"),
      script: "dist/main.js",
      // The API reads apps/api/.env (HOST=127.0.0.1, PORT=4010, NODE_ENV=production…).
      node_args: "--env-file=.env",
      kill_timeout: 30000,
      max_memory_restart: "1G",
    },
    {
      name: "devtrack-web",
      cwd: join(root, "apps", "web"),
      script: "node_modules/next/dist/bin/next",
      // API_ORIGIN comes from apps/web/.env.production.local, read by `next build` and `next start`.
      args: "start -H 127.0.0.1 -p 3010",
      env: { NODE_ENV: "production" },
      max_memory_restart: "1G",
    },
  ],
};
