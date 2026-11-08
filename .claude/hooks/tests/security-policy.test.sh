#!/usr/bin/env bash
# Tests of security-policy.sh with exceptions (ADR-0005 §9). Run: bash .claude/hooks/tests/security-policy.test.sh
# Each case runs the real policy against a throwaway git repository and a local bare "origin", never this one.
set -euo pipefail

HOOKS="$(cd "$(dirname "$0")/.." && pwd)"
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
FAILURES=0

# A working copy and a bare "origin" standing in for GitHub: an exception counts only once merged into main.
repo() {
    rm -rf "$WORK/repo" "$WORK/origin.git"
    git init -q --bare -b main "$WORK/origin.git"
    mkdir -p "$WORK/repo/.claude/hooks" "$WORK/repo/docs/security/exceptions" "$WORK/repo/src"
    cp "$HOOKS/security-policy.sh" "$HOOKS/severity-classifier.sh" "$WORK/repo/.claude/hooks/"
    git -C "$WORK/repo" init -q -b main
    git -C "$WORK/repo" remote add origin "$WORK/origin.git"
    git -C "$WORK/repo" config user.email test@example.invalid
    git -C "$WORK/repo" config user.name test
    echo "# exceção" > "$WORK/repo/docs/security/exceptions/SEC-EXC-0001.md"
}

registry() { # valid-until [max-severity]
    jq -n --arg until "$1" --arg max "${2:-medium}" '{schemaVersion: 1, exceptions: [{
        id: "SEC-EXC-0001", rule: "A07:2021", maxSeverity: $max, files: ["src/reset.ts"],
        approvedBy: "Responsável", approvedAt: "2026-01-01", validUntil: $until,
        document: "docs/security/exceptions/SEC-EXC-0001.md"}]}' > "$WORK/repo/docs/security/exceptions/exceptions.json"
}

commit() { git -C "$WORK/repo" add -A && git -C "$WORK/repo" commit -qm test; }
# What a reviewed pull request does: the commit reaches main on the remote.
merge() { commit && git -C "$WORK/repo" push -q origin main; }

# report <finding JSON>...
report() {
    local findings
    findings=$(printf '%s\n' "$@" | jq -s -c '.')
    jq -n --argjson f "$findings" '{schemaVersion:1,sessionId:"s",status:"completed",result:"findings",
        files:[{path:"x",sha256:"MISSING"}],findings:$f}' > "$WORK/report.json"
}

finding() { # rule severity file [exception]
    jq -n -c --arg r "$1" --arg s "$2" --arg f "$WORK/repo/$3" --arg e "${4:-}" \
        '{rule:$r,severity:$s,file:$f,description:"d",recommendation:"r"} + (if $e == "" then {} else {exception:$e} end)'
}

decide() { CLAUDE_PROJECT_DIR="$WORK/repo" bash "$WORK/repo/.claude/hooks/security-policy.sh" "$WORK/report.json" 2>/dev/null || true; }

expect() { # name expected-decision expected-applied
    local out decision applied
    out=$(decide)
    decision=$(jq -r '.decision' <<<"$out")
    applied=$(jq -c '.exceptionsApplied // []' <<<"$out")
    if [ "$decision" = "$2" ] && [ "$applied" = "$3" ]; then
        echo "ok   $1"
    else
        echo "FAIL $1: decision=$decision applied=$applied (expected $2 $3)"
        FAILURES=$((FAILURES + 1))
    fi
}

FUTURE="2099-12-31"

repo; registry "$FUTURE"; merge
report "$(finding A07:2021 medium src/reset.ts SEC-EXC-0001)"
expect "exceção válida e já em origin/main cobre o achado médio" eligible '["SEC-EXC-0001"]'

report "$(finding A07:2021 low src/reset.ts SEC-EXC-0001)"
expect "achado abaixo da severidade aprovada também é coberto" eligible '["SEC-EXC-0001"]'

report "$(finding A07:2021 high src/reset.ts SEC-EXC-0001)"
expect "achado alto acima da severidade aprovada continua bloqueando" blocked '[]'

report "$(finding A07:2021 critical src/reset.ts SEC-EXC-0001)"
expect "achado crítico acima da severidade aprovada continua bloqueando" blocked '[]'

report "$(finding A07:2021 medium src/reset.ts)"
expect "achado sem citar a exceção continua pedindo revisão" review_required '[]'

report "$(finding A03:2021 medium src/reset.ts SEC-EXC-0001)"
expect "regra diferente da exceção não é coberta" review_required '[]'

report "$(finding A07:2021 medium src/outro.ts SEC-EXC-0001)"
expect "arquivo fora da exceção não é coberto" review_required '[]'

report "$(finding A07:2021 medium src/reset.ts SEC-EXC-0002)"
expect "id inexistente não cobre" review_required '[]'

report "$(finding A07:2021 medium src/reset.ts SEC-EXC-0001)" "$(finding A01:2021 medium src/outro.ts)"
expect "outro achado médio sem exceção continua pedindo revisão" review_required '["SEC-EXC-0001"]'

report "$(finding A07:2021 medium src/reset.ts SEC-EXC-0001)" "$(finding A01:2021 high src/outro.ts)"
expect "achado alto sem exceção continua bloqueando" blocked '["SEC-EXC-0001"]'

report "$(finding A07:2021 medium src/reset.ts SEC-EXC-0001)" "$(finding A05:2021 low src/outro.ts)"
expect "achado baixo ao lado do coberto: elegível" eligible '["SEC-EXC-0001"]'

repo; registry "$FUTURE"
report "$(finding A07:2021 medium src/reset.ts SEC-EXC-0001)"
expect "exceção não commitada não vale" review_required '[]'

repo; registry "$FUTURE"; commit
expect "exceção commitada só na cópia local, fora de origin/main, não vale" review_required '[]'

repo; registry "$FUTURE"; merge; registry "2100-01-01"
expect "registro alterado depois do merge não vale" review_required '[]'

repo; registry "$FUTURE"; merge; echo "editado" >> "$WORK/repo/docs/security/exceptions/SEC-EXC-0001.md"
expect "documento alterado depois do merge não vale" review_required '[]'

repo; registry "$FUTURE"; merge; git -C "$WORK/repo" remote set-url origin "$WORK/nao-existe.git"
expect "sem acesso ao remoto nenhuma exceção vale" review_required '[]'

repo; registry "$FUTURE"; merge; registry "$FUTURE" high; commit; git -C "$WORK/repo" update-ref refs/remotes/origin/main HEAD
report "$(finding A07:2021 high src/reset.ts SEC-EXC-0001)"
expect "mover origin/main à mão não aprova: vale o que o remoto tem" blocked '[]'

repo; registry "2026-01-02"; merge
report "$(finding A07:2021 medium src/reset.ts SEC-EXC-0001)"
expect "exceção vencida não vale" review_required '[]'

if [ "$FAILURES" -gt 0 ]; then
    echo "$FAILURES falha(s)"
    exit 1
fi
echo "todos os casos passaram"
