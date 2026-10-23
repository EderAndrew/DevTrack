#!/usr/bin/env bash
# Deploys the DevTrack beta (docs/deploy/hostinger.md). Run as the `devtrack` user, it deploys the tip of main:
#   ~/devtrack/deploy/hostinger/update.sh
# The GitHub workflow deploy-hostinger.yml runs it too, as the forced command of its SSH key (section 12),
# sending `deploy <sha>`: the commit whose CI passed, published only if it is on main and not older than HEAD.

# A non-interactive SSH session doesn't read ~/.bashrc: load nvm's Node, pnpm and pm2 here, before
# `set -eu` (nvm.sh isn't written for it).
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
# shellcheck source=/dev/null
. "$NVM_DIR/nvm.sh"
set -euo pipefail
command -v pnpm >/dev/null && command -v pm2 >/dev/null || { echo "pnpm ou pm2 fora do PATH do nvm." >&2; exit 1; }

cd "$(dirname "$0")/../.."

# One update at a time: a manual run and the workflow wait for each other (up to 15 min).
exec 9>"${TMPDIR:-/tmp}/devtrack-update.lock"
flock -w 900 9 || { echo "Outra atualização ainda está rodando." >&2; exit 1; }

# SSH_ORIGINAL_COMMAND exists only under the key's forced command: the workflow must send
# `deploy <sha>`. A manual run (any other login) deploys the tip of main.
DEPLOY_SHA=""
if [[ -n "${SSH_ORIGINAL_COMMAND+set}" ]]; then
    DEPLOY_SHA="$(bash deploy/hostinger/validate-ssh-command.sh)"
fi

# Atualiza a referência da main sem modificar os arquivos publicados.
git fetch --no-tags origin \
    +refs/heads/main:refs/remotes/origin/main

[[ -n "$DEPLOY_SHA" ]] || DEPLOY_SHA="$(git rev-parse refs/remotes/origin/main)"

# Confirma que o SHA pertence à main atualizada e não é mais antigo que o publicado.
DEPLOY_SHA="$(bash deploy/hostinger/validate-commit.sh "$DEPLOY_SHA")"

# Publica exatamente o SHA validado (só avança a main local, nunca volta).
git merge --ff-only --quiet "$DEPLOY_SHA"
[[ "$(git rev-parse HEAD)" == "$DEPLOY_SHA" ]] || { echo "ERRO: HEAD diferente do SHA validado." >&2; exit 2; }

pnpm install --frozen-lockfile
pnpm build
pnpm --filter api prisma migrate deploy
pm2 startOrReload deploy/hostinger/ecosystem.config.cjs --update-env
pm2 save

echo "DevTrack $(git rev-parse --short HEAD) no ar."
