#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
CLASSIFIER="$PROJECT_DIR/.claude/hooks/severity-classifier.sh"
REPORT="${1:-}"

if [ -z "$REPORT" ]; then
    echo '{"decision":"blocked","reason":"missing_report"}'
    exit 2
fi

if ! SEVERITY=$(bash "$CLASSIFIER" "$REPORT" 2>/dev/null); then
    echo '{"decision":"blocked","reason":"invalid_report"}'
    exit 2
fi

case "$SEVERITY" in
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
        REASON="no_blocking_findings"
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
    --arg policyVersion "ADR-0005-v1" \
    --arg evaluatedAt "$EVALUATED_AT" \
    --arg severity "$SEVERITY" \
    --arg decision "$DECISION" \
    --arg reason "$REASON" \
    --arg reportSha256 "$REPORT_SHA256" \
    '{
        sessionId: $sessionId,
        policyVersion: $policyVersion,
        evaluatedAt: $evaluatedAt,
        highestSeverity: $severity,
        decision: $decision,
        reason: $reason,
        approvalStatus: "not_approved",
        reportSha256: $reportSha256,
    }'
