#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
STATE_DIR="$PROJECT_DIR/.claude/hooks/.audit-state"
LOG_FILE="$PROJECT_DIR/.claude/hooks/security.log"

# Same hash algorithm as security-check.sh.
# shellcheck source=lib/audit-files.sh
. "$PROJECT_DIR/.claude/hooks/lib/audit-files.sh"

SESSION_ID="${1:-}"

# A sessão deve ser informada explicitamente.
# Nunca utiliza o ponteiro global current-session.
if [ -z "$SESSION_ID" ]; then
    echo "[OWASP] ERRO: session_id obrigatório." >&2
    exit 1
fi

# Rejeita identificadores com caracteres de controle.
if [[ "$SESSION_ID" == *$'\n'* ||
      "$SESSION_ID" == *$'\r'* ]]; then
    echo "[OWASP] ERRO: session_id inválido." >&2
    exit 1
fi


SESSION_HASH=$(
    printf '%s' "$SESSION_ID" |
        shasum -a 256 |
        awk '{print $1}'
)

SESSION_DIR="$STATE_DIR/$SESSION_HASH"

REQUESTED_FILE="$SESSION_DIR/requested"
PENDING_FILE="$SESSION_DIR/pending"
FILES_FILE="$SESSION_DIR/files"
COMPLETED_FILE="$SESSION_DIR/completed"
REPORT_FILE="$SESSION_DIR/audit-report.json"

if [ ! -f "$REQUESTED_FILE" ] ||
   [ ! -f "$PENDING_FILE" ] ||
   [ ! -s "$FILES_FILE" ]; then
    echo "Erro: nenhuma auditoria pendente válida." >&2
    exit 1
fi

cd "$PROJECT_DIR"


# Exige evidências estruturadas antes da confirmação.
if [ ! -s "$REPORT_FILE" ]; then
    echo "[OWASP] ERRO: relatório de auditoria ausente." >&2
    exit 1
fi

# Valida a estrutura e a correspondência dos arquivos auditados.
if ! jq -e \
    --arg session_id "$SESSION_ID" \
    --rawfile pending_files "$FILES_FILE" '
    def valid_hash:
        type == "string" and test("^[a-f0-9]{64}$");

    def valid_file:
        type == "object" and
        (.path | type == "string" and length > 0) and
        (.sha256 | valid_hash or . == "MISSING");

    def valid_finding:
        type == "object" and
        (.rule | type == "string" and length > 0) and
        (.severity | IN("low", "medium", "high", "critical", "info")) and
        (.file | type == "string" and length > 0) and
        (.description | type == "string" and length > 0) and
        (.recommendation | type == "string" and length > 0);

    ($pending_files | split("\n") | map(select(length > 0)) | unique) as $pending |
    .schemaVersion == 1 and
    .sessionId == $session_id and
    .status == "completed" and
    (.result | IN("passed", "findings")) and
    (.files | type == "array" and length > 0) and
    (.files | all(.[]; valid_file)) and
    ([.files[].path] | unique) == $pending and
    (.findings | type == "array") and
    (.findings | all(.[]; valid_finding)) and
    (if .result == "passed" then
        (.findings | length == 0)
     else
        (.findings | length > 0)
     end)
    ' "$REPORT_FILE" > /dev/null; then
    echo "[OWASP] ERRO: relatório JSON inválido ou incompleto." >&2
    exit 1
fi

# Confere os hashes individuais declarados no relatório.
while IFS= read -r file; do
    [ -n "$file" ] || continue

    # A deleted or renamed file must be declared "MISSING" in the report.
    ACTUAL_HASH=$(file_hash "$file")

    REPORTED_HASH=$(jq -r \
        --arg path "$file" \
        '.files[] | select(.path == $path) | .sha256' \
        "$REPORT_FILE")

    if [ "$ACTUAL_HASH" != "$REPORTED_HASH" ]; then
        echo "[OWASP] ERRO: hash divergente no relatório: $file" >&2
        exit 1
    fi
done < <(LC_ALL=C sort -u "$FILES_FILE")


CONTENT_HASH=$(calculate_hash "$FILES_FILE")
REPORT_HASH=$(shasum -a 256 "$REPORT_FILE" | awk '{print $1}')
TIMESTAMP=$(date -u '+%Y-%m-%dT%H:%M:%SZ')

# Registra os hashes do código e do relatório.
printf '%s %s %s\n' \
    "$CONTENT_HASH" \
    "$REPORT_HASH" \
    "$TIMESTAMP" \
    > "$COMPLETED_FILE"

echo "[OWASP] Auditoria confirmada: $SESSION_HASH" \
    >> "$LOG_FILE"

echo "[OWASP] Hash do código: $CONTENT_HASH" \
    >> "$LOG_FILE"

echo "[OWASP] Hash do relatório: $REPORT_HASH" \
    >> "$LOG_FILE"

echo "Confirmação registrada."
echo "SHA-256 do código: $CONTENT_HASH"
echo "SHA-256 do relatório: $REPORT_HASH"

