#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-}"
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
HOOK_DIR="$PROJECT_DIR/.claude/hooks"
STATE_DIR="$HOOK_DIR/.audit-state"
LOG_FILE="$HOOK_DIR/security.log"

# shellcheck source=lib/audit-files.sh
. "$HOOK_DIR/lib/audit-files.sh"

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

# Mantém o identificador isolado por sessão.
printf '%s' "$SESSION_ID" > "$SESSION_DIR/session-id"

PENDING_FILE="$SESSION_DIR/pending"
REQUESTED_FILE="$SESSION_DIR/requested"
COMPLETED_FILE="$SESSION_DIR/completed"
DECISION_FILE="$SESSION_DIR/decision"
REPORT_FILE="$SESSION_DIR/audit-report.json"
FILES_FILE="$SESSION_DIR/files"
ATTEMPTS_FILE="$SESSION_DIR/attempts"
BASH_SNAPSHOT_FILE="$SESSION_DIR/bash-snapshot"
MAX_ATTEMPTS=3

cd "$PROJECT_DIR"

# Adds a changed file to the audit set. Every new edit invalidates any previous
# request, confirmation or policy decision.
record_change() {
    printf '%s\n' "$1" >> "$FILES_FILE"
    touch "$PENDING_FILE"
    rm -f "$REQUESTED_FILE" "$COMPLETED_FILE" "$ATTEMPTS_FILE" "$DECISION_FILE"
    echo "[OWASP] Alteração registrada: $1" >> "$LOG_FILE"
}

case "$MODE" in
    post-tool)
        TOOL_NAME=$(json_field '.tool_name')
        FILE_PATH=$(json_field '.tool_input.file_path')

        case "$TOOL_NAME" in
            Write|Edit|MultiEdit) ;;
            *) exit 0 ;;
        esac

        is_audited_code "$FILE_PATH" || exit 0

        case "$FILE_PATH" in
            /*)
                case "$FILE_PATH" in
                    "$PROJECT_DIR"/*) ;;
                    *) exit 0 ;;
                esac
                ;;
        esac

        record_change "$FILE_PATH"
        ;;

    pre-bash)
        # Never blocks the command: without a snapshot, post-bash records nothing.
        dirty_code_snapshot "$PROJECT_DIR" > "$BASH_SNAPSHOT_FILE" 2>/dev/null ||
            rm -f "$BASH_SNAPSHOT_FILE"
        exit 0
        ;;

    post-bash)
        [ -f "$BASH_SNAPSHOT_FILE" ] || exit 0

        # Code files that are new or different since the snapshot. Files that went back to
        # HEAD (commit, checkout) left the dirty list and introduce no new code.
        CHANGES=$(
            LC_ALL=C comm -13 "$BASH_SNAPSHOT_FILE" <(dirty_code_snapshot "$PROJECT_DIR")
        )
        rm -f "$BASH_SNAPSHOT_FILE"

        while IFS=$'\t' read -r path _; do
            [ -n "$path" ] || continue
            record_change "$path"
        done <<< "$CHANGES"
        ;;

    stop)
        if [ ! -f "$PENDING_FILE" ]; then
            exit 0
        fi

        # A repeated Stop in the same turn. The hook never blocks forever: once it has said what is
        # missing, it lets the turn end with the audit still pending (pending, requested, files kept).
        STOP_HOOK_ACTIVE=$(json_field '.stop_hook_active')

        if [ ! -s "$FILES_FILE" ]; then
            echo "[OWASP] ERRO: auditoria pendente sem arquivos." >> "$LOG_FILE"
            [ "$STOP_HOOK_ACTIVE" = "true" ] && exit 0
            echo "OWASP: estado inconsistente; revisão manual necessária." >&2
            exit 2
        fi

        if [ ! -f "$REQUESTED_FILE" ]; then
            touch "$REQUESTED_FILE"
            printf '1\n' > "$ATTEMPTS_FILE"
            echo "[OWASP] Auditoria solicitada." >> "$LOG_FILE"
            echo "Execute a skill owasp-security-auditor." >&2
            echo "SESSION_ID da auditoria: $SESSION_ID" >&2
            echo "Utilize exclusivamente este identificador na confirmação." >&2
            echo "Audite os arquivos alterados nesta sessão:" >&2
            LC_ALL=C sort -u "$FILES_FILE" >&2
            echo "Não modifique o código durante a auditoria." >&2
            echo "Apresente evidências e severidade." >&2
            exit 2
        fi

        # A valid confirmation is always processed, even on a repeated Stop.
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

            CURRENT_HASH=$(calculate_hash "$FILES_FILE")
            CURRENT_REPORT_HASH=$(
                shasum -a 256 "$REPORT_FILE" | awk '{print $1}'
            )

            if [ "$CONFIRMED_HASH" = "$CURRENT_HASH" ] &&
               [ "$CONFIRMED_REPORT_HASH" = "$CURRENT_REPORT_HASH" ]; then
                # Avalia e registra a política antes de encerrar a auditoria.
                RECORDER="$PROJECT_DIR/.claude/hooks/security-decision-recorder.sh"

                if ! POLICY_OUTPUT=$(bash "$RECORDER" "$REPORT_FILE"); then
                    echo "[OWASP] ERRO: falha na avaliação da política." >> "$LOG_FILE"
                    echo "OWASP: não foi possível registrar a decisão de segurança." >&2
                    exit 2
                fi

                echo "[OWASP] Decisão de segurança registrada." >> "$LOG_FILE"
                # O gravador imprime o caminho do arquivo na primeira linha.
                # O restante da saída contém a decisão JSON.
                if ! POLICY_DECISION=$(
                    printf '%s\n' "$POLICY_OUTPUT" |
                        sed '1d' |
                        jq -er '
                            select(
                                .approvalStatus == "not_approved" and
                                (.decision == "eligible" or
                                .decision == "review_required" or
                                .decision == "blocked")
                            ) | .decision
                        '
                ); then
                    echo "[OWASP] ERRO: decisão de política inválida." >> "$LOG_FILE"
                    echo "OWASP: resposta de política inválida." >&2
                    exit 2
                fi

                case "$POLICY_DECISION" in
                    eligible)
                        echo "[OWASP] Política: elegível para conclusão técnica." >> "$LOG_FILE"
                        ;;
                    review_required | blocked)
                        # Recorded once: the confirmation is consumed so the recorder does not run
                        # again on every Stop. The audit stays pending until the code changes.
                        printf '%s\n' "$POLICY_DECISION" > "$DECISION_FILE"
                        rm -f "$COMPLETED_FILE"
                        if [ "$POLICY_DECISION" = "blocked" ]; then
                            echo "[OWASP] Política: bloqueado por vulnerabilidades." >> "$LOG_FILE"
                            echo "OWASP: vulnerabilidades bloqueantes identificadas." >&2
                        else
                            echo "[OWASP] Política: revisão humana necessária." >> "$LOG_FILE"
                            echo "OWASP: achados médios exigem revisão humana." >&2
                        fi
                        exit 2
                        ;;
                esac

                rm -f "$PENDING_FILE" "$REQUESTED_FILE" \
                      "$COMPLETED_FILE" "$ATTEMPTS_FILE" "$DECISION_FILE"

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

        # A blocking decision waits for a human or a code change: said once per turn.
        if [ -f "$DECISION_FILE" ]; then
            DECISION=$(cat "$DECISION_FILE")
            if [ "$STOP_HOOK_ACTIVE" = "true" ]; then
                echo "[OWASP] Turno encerrado; decisão '$DECISION' pendente." >> "$LOG_FILE"
                exit 0
            fi
            echo "OWASP: a decisão '$DECISION' aguarda revisão humana ou correção do código." >&2
            echo "SESSION_ID da auditoria: $SESSION_ID" >&2
            exit 2
        fi

        # Attempts are counted per turn: the first Stop of a turn starts again from 1.
        ATTEMPTS=0
        if [ "$STOP_HOOK_ACTIVE" = "true" ] && [ -f "$ATTEMPTS_FILE" ]; then
            ATTEMPTS=$(cat "$ATTEMPTS_FILE")
        fi
        if [[ ! "$ATTEMPTS" =~ ^[0-9]+$ ]]; then
            ATTEMPTS=0
        fi
        ATTEMPTS=$((ATTEMPTS + 1))
        printf '%s\n' "$ATTEMPTS" > "$ATTEMPTS_FILE"

        if [ "$ATTEMPTS" -gt "$MAX_ATTEMPTS" ]; then
            echo "[OWASP] Limite de tentativas; turno encerrado com auditoria pendente: $SESSION_ID" >> "$LOG_FILE"
            exit 0
        fi

        if [ "$ATTEMPTS" -eq "$MAX_ATTEMPTS" ]; then
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
        ;;

    *) exit 0 ;;
esac
