#!/usr/bin/env bash
# Deploys the latest main of the DevTrack beta (docs/deploy/hostinger.md). Run as the `devtrack` user:
#   ~/devtrack/deploy/hostinger/update.sh
# The GitHub workflow deploy-hostinger.yml runs it too, as the forced command of its SSH key (section 12).

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

# Validate the command received through the forced SSH command.
if [[ -n "${SSH_CONNECTION:-}" ]]; then
    DEPLOY_SHA="$(bash deploy/hostinger/validate-ssh-command.sh)"
fi

# Atualiza a referência da main sem modificar os arquivos publicados.
git fetch --no-tags origin \
    +refs/heads/main:refs/remotes/origin/main

# Confirma que o SHA solicitado existe e pertence à main atualizada.
if [[ -n "${SSH_CONNECTION:-}" ]]; then
    DEPLOY_SHA="$(bash deploy/hostinger/validate-commit.sh "$DEPLOY_SHA")"
fi

# PENDENTE: verificar aprovação do CI e publicar o SHA exato.
echo "ERRO: Publicação bloqueada até a conclusão do Security Gate." >&2
exit 2
pnpm install --frozen-lockfile
pnpm build
pnpm --filter api prisma migrate deploy
pm2 startOrReload deploy/hostinger/ecosystem.config.cjs --update-env
pm2 save

echo "DevTrack $(git rev-parse --short HEAD) no ar."
