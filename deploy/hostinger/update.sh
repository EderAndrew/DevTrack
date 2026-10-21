#!/usr/bin/env bash
# Deploys the latest main of the DevTrack beta (docs/deploy/hostinger.md). Run as the `devtrack` user:
#   ~/devtrack/deploy/hostinger/update.sh
set -euo pipefail

cd "$(dirname "$0")/../.."

git pull --ff-only
pnpm install --frozen-lockfile
pnpm build
pnpm --filter api prisma migrate deploy
pm2 startOrReload deploy/hostinger/ecosystem.config.cjs --update-env
pm2 save

echo "DevTrack $(git rev-parse --short HEAD) no ar."
