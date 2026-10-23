#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-}"
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
HOOK_DIR="$PROJECT_DIR/.claude/hooks"
STATE_DIR="$HOOK_DIR/.audit-state"
LOG_FILE="$HOOK_DIR/security.log"

mkdir -p "$STATE_DIR"

# Claude Code sends the hook payload on standard input.
INPUT=$(cat)
json_field() {
    printf '%s' "$INPUT" | jq -r "$1 // empty"
}

SESSION_ID=$(json_field '.session_id')
if [ -z "$SESSION_ID" ]; then
    echo "[OWASP] ERRO: session_id ausente." >&2
    exit 1
fi

SESSION_HASH=$(printf '%s' "$SESSION_ID" | shasum -a 256 | awk '{print $1}')
SESSION_DIR="$STATE_DIR/$SESSION_HASH"
mkdir -p "$SESSION_DIR"

# Compatibility with the current SKILL.md. This global pointer is not safe
# for concurrent Claude Code sessions; it must be replaced in a later step.
# Mantém o identificador isolado por sessão.
printf '%s' "$SESSION_ID" > "$SESSION_DIR/session-id"

PENDING_FILE="$SESSION_DIR/pending"
REQUESTED_FILE="$SESSION_DIR/requested"
COMPLETED_FILE="$SESSION_DIR/completed"
REPORT_FILE="$SESSION_DIR/audit-report.json"
FILES_FILE="$SESSION_DIR/files"
ATTEMPTS_FILE="$SESSION_DIR/attempts"
MAX_ATTEMPTS=3

cd "$PROJECT_DIR"

# Keep this algorithm identical to audit-complete.sh.
calculate_hash() {
    while IFS= read -r file; do
        [ -n "$file" ] || continue
        if [ -f "$file" ]; then
            hash=$(shasum -a 256 "$file" | awk '{print $1}')
            printf 'FILE:%s:%s\n' "$file" "$hash"
        else
            printf 'MISSING:%s\n' "$file"
        fi
    done < <(LC_ALL=C sort -u "$FILES_FILE") |
        shasum -a 256 |
        awk '{print $1}'
}

case "$MODE" in
    post-tool)
        TOOL_NAME=$(json_field '.tool_name')
        FILE_PATH=$(json_field '.tool_input.file_path')

        case "$TOOL_NAME" in
            Write|Edit|MultiEdit) ;;
            *) exit 0 ;;
        esac

        case "$FILE_PATH" in
            *.ts|*.tsx|*.js|*.jsx|*.py|*.java|*.go|*.rs|*.sql) ;;
            *) exit 0 ;;
        esac

        case "$FILE_PATH" in
            /*)
                case "$FILE_PATH" in
                    "$PROJECT_DIR"/*) ;;
                    *) exit 0 ;;
                esac
                ;;
        esac

        printf '%s\n' "$FILE_PATH" >> "$FILES_FILE"
        touch "$PENDING_FILE"

        # Every new edit invalidates any previous request/confirmation.
        rm -f "$REQUESTED_FILE" "$COMPLETED_FILE" "$ATTEMPTS_FILE"
        echo "[OWASP] Alteração registrada: $FILE_PATH" >> "$LOG_FILE"
        ;;

    stop)
        if [ ! -f "$PENDING_FILE" ]; then
            exit 0
        fi

        STOP_HOOK_ACTIVE=$(json_field '.stop_hook_active')

        # A confirmação válida deve ser processada antes desta proteção.
        # Nunca ignore uma confirmação já existente.
        if [ "$STOP_HOOK_ACTIVE" = "true" ] &&
        [ ! -f "$COMPLETED_FILE" ]; then

            echo "[OWASP] Encerrando repetição do hook Stop." >> "$LOG_FILE"
            echo "[OWASP] Auditoria permanece pendente: $SESSION_ID" >> "$LOG_FILE"

            # Permite encerrar a resposta, não a auditoria.
            # Preserva pending, requested, files e attempts.
            exit 0
        fi

            if [ ! -s "$FILES_FILE" ]; then
                echo "[OWASP] ERRO: auditoria pendente sem arquivos." >> "$LOG_FILE"
                echo "OWASP: estado inconsistente; revisão manual necessária." >&2
                # Avoid a blocking loop; do not mark this audit as completed.
                exit 2
            fi

            if [ -f "$REQUESTED_FILE" ]; then
            
            if [ -f "$COMPLETED_FILE" ]; then
                CONFIRMED_HASH=""
                CONFIRMED_REPORT_HASH=""
                CONFIRMED_AT=""

                if [ -s "$COMPLETED_FILE" ]; then
                    read -r CONFIRMED_HASH CONFIRMED_REPORT_HASH CONFIRMED_AT \
                        < "$COMPLETED_FILE" || true
                fi

                if [[ ! "$CONFIRMED_HASH" =~ ^[a-f0-9]{64}$ ]] ||
                   [[ ! "$CONFIRMED_REPORT_HASH" =~ ^[a-f0-9]{64}$ ]] ||
                   [ -z "$CONFIRMED_AT" ]; then
                    echo "[OWASP] FALHA: confirmação inválida." >> "$LOG_FILE"
                    rm -f "$COMPLETED_FILE" "$REQUESTED_FILE" "$ATTEMPTS_FILE"
                    echo "OWASP: confirmação inválida. Execute nova auditoria." >&2
                    exit 2
                fi

                if [ ! -s "$REPORT_FILE" ]; then
                    echo "[OWASP] FALHA: relatório ausente." >> "$LOG_FILE"
                    rm -f "$COMPLETED_FILE" "$REQUESTED_FILE" "$ATTEMPTS_FILE"
                    echo "OWASP: relatório ausente. Execute nova auditoria." >&2
                    exit 2
                fi

                CURRENT_HASH=$(calculate_hash)
                CURRENT_REPORT_HASH=$(
                    shasum -a 256 "$REPORT_FILE" | awk '{print $1}'
                )

                if [ "$CONFIRMED_HASH" = "$CURRENT_HASH" ] &&
                   [ "$CONFIRMED_REPORT_HASH" = "$CURRENT_REPORT_HASH" ]; then

                    rm -f "$PENDING_FILE" "$REQUESTED_FILE" \
                          "$COMPLETED_FILE" "$ATTEMPTS_FILE"

                    : > "$FILES_FILE"

                    echo "[OWASP] Integridade do código validada." >> "$LOG_FILE"
                    echo "[OWASP] Integridade do relatório validada." >> "$LOG_FILE"
                    echo "[OWASP] Auditoria concluída e confirmada." >> "$LOG_FILE"
                    exit 0
                fi

                echo "[OWASP] FALHA: divergência de integridade." >> "$LOG_FILE"

                if [ "$CONFIRMED_HASH" != "$CURRENT_HASH" ]; then
                    echo "[OWASP] Hash do código divergente." >> "$LOG_FILE"
                fi

                if [ "$CONFIRMED_REPORT_HASH" != "$CURRENT_REPORT_HASH" ]; then
                    echo "[OWASP] Hash do relatório divergente." >> "$LOG_FILE"
                fi

                rm -f "$COMPLETED_FILE" "$REQUESTED_FILE" "$ATTEMPTS_FILE"

                echo "OWASP: o código ou o relatório mudou após a confirmação." >&2
                echo "Execute novamente a auditoria dos arquivos pendentes." >&2
                exit 2
            fi

            ATTEMPTS=0
            if [ -f "$ATTEMPTS_FILE" ]; then
                ATTEMPTS=$(cat "$ATTEMPTS_FILE")
            fi
            if [[ ! "$ATTEMPTS" =~ ^[0-9]+$ ]]; then
                ATTEMPTS=0
            fi
            ATTEMPTS=$((ATTEMPTS + 1))
            printf '%s\n' "$ATTEMPTS" > "$ATTEMPTS_FILE"

            
            if [ "$ATTEMPTS" -ge "$MAX_ATTEMPTS" ]; then
                echo "[OWASP] BLOQUEADO: limite de tentativas atingido." >> "$LOG_FILE"
                echo "OWASP: auditoria obrigatória não confirmada." >&2
                echo "SESSION_ID da auditoria: $SESSION_ID" >&2
                echo "Limite de tentativas atingido ($ATTEMPTS)." >&2
                echo "Intervenção manual necessária antes de concluir." >&2
                exit 2
            fi


            echo "[OWASP] Aguardando confirmação ($ATTEMPTS/$MAX_ATTEMPTS)." >> "$LOG_FILE"
            echo "A auditoria OWASP ainda não foi confirmada." >&2
            echo "SESSION_ID da auditoria: $SESSION_ID" >&2
            echo "Execute a Skill e registre a conclusão usando audit-complete.sh." >&2
            exit 2
        fi

        touch "$REQUESTED_FILE"
        echo "[OWASP] Auditoria solicitada." >> "$LOG_FILE"
        echo "Execute a skill owasp-security-auditor." >&2
        echo "SESSION_ID da auditoria: $SESSION_ID" >&2
        echo "Utilize exclusivamente este identificador na confirmação." >&2
        echo "Audite os arquivos alterados nesta sessão:" >&2
        LC_ALL=C sort -u "$FILES_FILE" >&2
        echo "Não modifique o código durante a auditoria." >&2
        echo "Apresente evidências e severidade." >&2
        exit 2
        ;;

    *) exit 0 ;;
esac
