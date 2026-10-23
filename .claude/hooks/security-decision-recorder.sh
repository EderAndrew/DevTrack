#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
POLICY="$PROJECT_DIR/.claude/hooks/security-policy.sh"
DECISIONS_DIR="$PROJECT_DIR/.claude/hooks/.security-decisions"

REPORT="${1:-}"

if [ -z "$REPORT" ] || [ ! -f "$REPORT" ]; then
    echo "ERRO: relatório não encontrado." >&2
    exit 2
fi

# Executa a política de segurança.
if ! DECISION=$(bash "$POLICY" "$REPORT"); then
    echo "ERRO: avaliação da política falhou." >&2
    exit 2
fi

# Valida a estrutura da decisão.
if ! printf '%s\n' "$DECISION" | jq -e '
    (.sessionId | type == "string" and length > 0) and
    (.reportSha256 | type == "string" and
        test("^[a-f0-9]{64}$")) and
    (.decision | IN("blocked", "review_required", "eligible")) and
    (.approvalStatus == "not_approved")
' >/dev/null; then
    echo "ERRO: decisão inválida." >&2
    exit 2
fi

SESSION_ID=$(printf '%s\n' "$DECISION" | jq -r '.sessionId')
SESSION_HASH=$(printf '%s' "$SESSION_ID" | shasum -a 256 | awk '{print $1}')

DESTINATION="$DECISIONS_DIR/$SESSION_HASH"

mkdir -p "$DESTINATION"
chmod 700 "$DESTINATION"

REPORT_HASH=$(printf '%s\n' "$DECISION" | jq -r '.reportSha256')
DECISION_TYPE=$(printf '%s\n' "$DECISION" | jq -r '.decision')

# Reutiliza uma decisão já registrada para o mesmo relatório.
# Verifica todos os registros antes de reutilizar qualquer decisão.
MATCHING_RECORD=""

for EXISTING_RECORD in "$DESTINATION"/decision-*; do
    [ -e "$EXISTING_RECORD" ] || [ -L "$EXISTING_RECORD" ] || continue

    if [ -L "$EXISTING_RECORD" ] || [ ! -f "$EXISTING_RECORD" ]; then
        echo "ERRO: entrada de auditoria inválida: $EXISTING_RECORD" >&2
        exit 2
    fi

    if ! jq -e --arg sid "$SESSION_ID" '
        type == "object" and
        .sessionId == $sid and
        .approvalStatus == "not_approved" and
        (.decision | IN("blocked", "review_required", "eligible")) and
        (.reportSha256 | type == "string" and test("^[a-f0-9]{64}$"))
    ' "$EXISTING_RECORD" >/dev/null 2>&1; then
        echo "ERRO: registro de auditoria inconsistente: $EXISTING_RECORD" >&2
        exit 2
    fi

    if jq -e --argjson expected "$DECISION" '
        .sessionId == $expected.sessionId and
        .policyVersion == $expected.policyVersion and
        .highestSeverity == $expected.highestSeverity and
        .decision == $expected.decision and
        .reason == $expected.reason and
        .approvalStatus == $expected.approvalStatus and
        .reportSha256 == $expected.reportSha256
    ' "$EXISTING_RECORD" >/dev/null 2>&1; then
        MATCHING_RECORD="$EXISTING_RECORD"
    fi
done

if [ -n "$MATCHING_RECORD" ]; then
    echo "Decisão já registrada: $MATCHING_RECORD"
    printf '%s\n' "$DECISION"
    exit 0
fi

# Cria um novo registro somente quando necessário.
RECORD=$(mktemp "$DESTINATION/decision-XXXXXXXX")

printf '%s\n' "$DECISION" > "$RECORD"
chmod 600 "$RECORD"

# Confirma que o conteúdo persistido corresponde à decisão avaliada.
EXPECTED_HASH=$(printf '%s\n' "$DECISION" | shasum -a 256 | awk '{print $1}')
STORED_HASH=$(shasum -a 256 "$RECORD" | awk '{print $1}')

if [ "$EXPECTED_HASH" != "$STORED_HASH" ]; then
    echo "ERRO: falha de integridade na gravação." >&2
    rm -f "$RECORD"
    exit 2
fi

echo "Decisão registrada: $RECORD"
printf '%s\n' "$DECISION"
