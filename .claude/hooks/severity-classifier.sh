#!/usr/bin/env bash
set -euo pipefail

REPORT="${1:-}"

if [ -z "$REPORT" ] || [ ! -f "$REPORT" ]; then
    echo "ERRO: relatório não encontrado." >&2
    exit 2
fi

jq -er '
  if (
    .schemaVersion == 1 and
    (.sessionId | type == "string" and length > 0) and
    .status == "completed" and
    (.findings | type == "array") and
    (
      (.result == "passed" and (.findings | length) == 0) or
      (.result == "findings" and (.findings | length) > 0)
    ) and
    all(.findings[]; 
      (.rule | type == "string" and length > 0) and
      (.severity | type == "string" and
        IN("critical", "high", "medium", "low", "info")) and
      (.file | type == "string" and length > 0) and
      (.description | type == "string" and length > 0) and
      (.recommendation | type == "string" and length > 0)
    )
  )
  then
    if (.findings | length) == 0 then
      "none"
    else
      [.findings[].severity] |
      if index("critical") != null then "critical"
      elif index("high") != null then "high"
      elif index("medium") != null then "medium"
      elif index("low") != null then "low"
      else "info"
      end
    end
  else
    error("Relatório inválido ou inconclusivo")
  end
' "$REPORT"
