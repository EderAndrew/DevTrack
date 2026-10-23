#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "$SCRIPT_DIR/../.." && pwd)"

cd "$PROJECT_ROOT"

COMMIT_SHA="${1:-}"

if [[ ! "$COMMIT_SHA" =~ ^[a-fA-F0-9]{40}$ ]]; then
    echo "ERRO: SHA de commit inválido." >&2
    exit 2
fi

if ! git cat-file -e "${COMMIT_SHA}^{commit}" 2>/dev/null; then
    echo "ERRO: Commit não encontrado no repositório." >&2
    exit 2
fi

if ! git show-ref --verify --quiet refs/remotes/origin/main; then
    echo "ERRO: Referência origin/main não encontrada." >&2
    exit 2
fi

if ! git merge-base --is-ancestor "$COMMIT_SHA" refs/remotes/origin/main; then
    echo "ERRO: Commit não pertence ao histórico de origin/main." >&2
    exit 2
fi

# No rollback: the commit must be the published one or newer (a retry republishes HEAD).
if ! git merge-base --is-ancestor HEAD "$COMMIT_SHA"; then
    echo "ERRO: Commit mais antigo que a versão publicada." >&2
    exit 2
fi

printf '%s\n' "$COMMIT_SHA" | LC_ALL=C tr '[:upper:]' '[:lower:]'
