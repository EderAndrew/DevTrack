#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
CLASSIFIER="$PROJECT_DIR/.claude/hooks/severity-classifier.sh"
REPORT="${1:-}"
# Exceptions approved by a human (ADR-0005 §9). The auditor only cites one in a finding (`exception`);
# it never grants one (ADR-0005 §10). Fixed path: no variable points the policy elsewhere.
REGISTRY_REL="docs/security/exceptions/exceptions.json"
# An exception counts only as merged into the protected branch, read from the remote at evaluation time:
# a commit in the working copy (an agent can make one) is not an approval; a merge into main needs a
# reviewed pull request (branch protection on GitHub).
APPROVED_REMOTE="origin"
APPROVED_BRANCH="main"
FETCH_TIMEOUT_SECONDS=20

if [ -z "$REPORT" ]; then
    echo '{"decision":"blocked","reason":"missing_report"}'
    exit 2
fi

if ! SEVERITY=$(bash "$CLASSIFIER" "$REPORT" 2>/dev/null); then
    echo '{"decision":"blocked","reason":"invalid_report"}'
    exit 2
fi

# The commit of the approved branch, fetched now (a local ref could have been moved by hand). Empty when the
# remote cannot be reached: then no exception applies.
approved_commit() {
    local fetch=(git -C "$PROJECT_DIR" fetch --quiet --no-tags "$APPROVED_REMOTE" "$APPROVED_BRANCH")
    if command -v timeout >/dev/null 2>&1; then fetch=(timeout "$FETCH_TIMEOUT_SECONDS" "${fetch[@]}"); fi
    if GIT_TERMINAL_PROMPT=0 "${fetch[@]}" >/dev/null 2>&1; then
        git -C "$PROJECT_DIR" rev-parse --verify -q 'FETCH_HEAD^{commit}' 2>/dev/null || true
    fi
}

# A path counts only when it is in the approved commit and the working copy holds exactly that version.
approved() {
    git -C "$PROJECT_DIR" cat-file -e "$APPROVED_COMMIT:$1" 2>/dev/null &&
        git -C "$PROJECT_DIR" diff --quiet "$APPROVED_COMMIT" -- "$1" 2>/dev/null
}

# The exceptions in force today: well formed, approved, not expired, and with the registry and the entry's
# document merged unchanged into the approved branch. Anything else is ignored, never an error.
TODAY=$(date -u '+%Y-%m-%d')
VALID_EXCEPTIONS='[]'
APPROVED_COMMIT=""
if [ -f "$PROJECT_DIR/$REGISTRY_REL" ]; then
    APPROVED_COMMIT=$(approved_commit)
fi
if [ -n "$APPROVED_COMMIT" ] && approved "$REGISTRY_REL"; then
    CANDIDATES=$(jq -c --arg today "$TODAY" '
        def date: type == "string" and test("^[0-9]{4}-[0-9]{2}-[0-9]{2}$");
        if .schemaVersion == 1 and (.exceptions | type == "array") then
            [.exceptions[] | select(
                (.id | type == "string" and test("^SEC-EXC-[0-9]{4}$")) and
                (.rule | type == "string" and length > 0) and
                (.maxSeverity | IN("critical", "high", "medium", "low", "info")) and
                (.files | type == "array" and length > 0 and all(.[]; type == "string" and length > 0)) and
                (.approvedBy | type == "string" and length > 0) and
                (.approvedAt | date) and (.validUntil | date) and
                .approvedAt <= $today and $today <= .validUntil and
                (.document | type == "string" and length > 0)
            )]
        else [] end
    ' "$PROJECT_DIR/$REGISTRY_REL" 2>/dev/null || echo '[]')
    while IFS= read -r entry; do
        [ -n "$entry" ] || continue
        DOCUMENT=$(printf '%s' "$entry" | jq -r '.document')
        if [ -f "$PROJECT_DIR/$DOCUMENT" ] && approved "$DOCUMENT"; then
            VALID_EXCEPTIONS=$(jq -c --argjson e "$entry" '. + [$e]' <<<"$VALID_EXCEPTIONS")
        fi
    done < <(jq -c '.[]' <<<"$CANDIDATES")
fi

# A finding is covered when it cites a valid exception whose rule and files match it and whose approved
# severity is at least the finding's: an exception for a medium finding never waives a high or critical one
# (ADR-0005 §5). The finding stays in the report (ADR-0005 §9); only the decision reads the uncovered ones.
COVERAGE=$(jq -c --argjson valid "$VALID_EXCEPTIONS" --arg root "$PROJECT_DIR/" '
    def relative: if startswith($root) then .[($root | length):] else . end;
    def rank: {"info": 0, "low": 1, "medium": 2, "high": 3, "critical": 4}[.];
    def covered($f):
        ($f.exception // null) as $id |
        $id != null and
        any($valid[]; .id == $id and .rule == $f.rule and ($f.severity | rank) <= (.maxSeverity | rank) and
            (($f.file | relative) as $p | any(.files[]; . == $p)));
    {
        uncovered: [.findings[] | select(covered(.) | not) | .severity],
        applied: ([.findings[] | select(covered(.)) | .exception] | unique)
    }
' "$REPORT")

EFFECTIVE=$(jq -r '
    .uncovered |
    if length == 0 then "none"
    elif index("critical") != null then "critical"
    elif index("high") != null then "high"
    elif index("medium") != null then "medium"
    elif index("low") != null then "low"
    else "info" end
' <<<"$COVERAGE")
APPLIED=$(jq -c '.applied' <<<"$COVERAGE")

case "$EFFECTIVE" in
    critical|high)
        DECISION="blocked"
        REASON="high_severity_findings"
        ;;
    medium)
        DECISION="review_required"
        REASON="medium_severity_findings"
        ;;
    low|info|none)
        DECISION="eligible"
        if [ "$APPLIED" != "[]" ]; then
            REASON="findings_covered_by_exceptions"
        else
            REASON="no_blocking_findings"
        fi
        ;;
    *)
        echo '{"decision":"blocked","reason":"unknown_severity"}'
        exit 2
        ;;
esac

SESSION_ID=$(jq -r '.sessionId' "$REPORT")
EVALUATED_AT=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
REPORT_SHA256=$(shasum -a 256 "$REPORT" | awk '{print $1}')

jq -n \
    --arg sessionId "$SESSION_ID" \
    --arg policyVersion "ADR-0005-v3" \
    --arg evaluatedAt "$EVALUATED_AT" \
    --arg severity "$SEVERITY" \
    --arg effectiveSeverity "$EFFECTIVE" \
    --argjson exceptionsApplied "$APPLIED" \
    --arg decision "$DECISION" \
    --arg reason "$REASON" \
    --arg reportSha256 "$REPORT_SHA256" \
    '{
        sessionId: $sessionId,
        policyVersion: $policyVersion,
        evaluatedAt: $evaluatedAt,
        highestSeverity: $severity,
        effectiveSeverity: $effectiveSeverity,
        exceptionsApplied: $exceptionsApplied,
        decision: $decision,
        reason: $reason,
        approvalStatus: "not_approved",
        reportSha256: $reportSha256,
    }'
