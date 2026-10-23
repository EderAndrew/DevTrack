#!/usr/bin/env bash
set -euo pipefail

SSH_COMMAND="${SSH_ORIGINAL_COMMAND:-}"

if [[ ! "$SSH_COMMAND" =~ ^deploy[[:space:]]([a-fA-F0-9]{40})$ ]]; then
    echo "ERRO: Comando SSH de deploy inválido." >&2
    exit 2
fi

COMMIT_SHA="${BASH_REMATCH[1]}"

printf '%s\n' "$COMMIT_SHA" | LC_ALL=C tr '[:upper:]' '[:lower:]'