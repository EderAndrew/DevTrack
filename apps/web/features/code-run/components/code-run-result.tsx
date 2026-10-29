"use client";

import type { CodeRun, CodeRunVerdict } from "@repo/contracts";
import { ChevronDown, CircleCheck, CircleX, Clock, FileWarning, MemoryStick, TriangleAlert, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { CodeBlock } from "@/components/ui/code/code-block";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { COMPILATION_ERROR, RUN_FAILED, runSummary, STALE_RESULT, VERDICT_LABELS } from "../schemas/code-run";

export const VERDICT_ICONS: Record<CodeRunVerdict, LucideIcon> = {
  PASSED: CircleCheck,
  WRONG_OUTPUT: CircleX,
  RUNTIME_ERROR: TriangleAlert,
  TIME_LIMIT: Clock,
  MEMORY_LIMIT: MemoryStick,
  OUTPUT_LIMIT: FileWarning,
};

export const VERDICT_VARIANTS: Record<CodeRunVerdict, "success" | "danger" | "warning"> = {
  PASSED: "success",
  WRONG_OUTPUT: "danger",
  RUNTIME_ERROR: "danger",
  TIME_LIMIT: "warning",
  MEMORY_LIMIT: "warning",
  OUTPUT_LIMIT: "warning",
};

/**
 * The result of a final run (019 contracts/web-ui.md "Result"): the summary of the public cases,
 * the compiler message, or each case with its verdict in words and icon, the input and the expected
 * output (from `publicTestCases`, never from the run), the output obtained, the error output and the
 * time. Program text is shown only in `CodeBlock`, as text. A purged run shows nothing; a run of
 * another version of the code says so.
 */
export function CodeRunResult({
  run,
  publicTestCases,
  sourceCode,
}: {
  run: CodeRun;
  publicTestCases: readonly { input: string; expectedOutput: string }[];
  /** What the editor holds now: a different text makes the result "de uma versão anterior". */
  sourceCode: string;
}) {
  if (run.contentPurged) return null;
  if (run.status === "FAILED") {
    return (
      <Alert variant="warning">
        <AlertTitle>{RUN_FAILED}</AlertTitle>
      </Alert>
    );
  }
  if (run.status !== "COMPLETED") return null;
  const stale = run.sourceCode !== null && run.sourceCode !== sourceCode;
  return (
    <section aria-label="Resultado da execução" className="flex flex-col gap-3">
      {stale ? <p className="m-0 text-body-sm text-text-secondary">{STALE_RESULT}</p> : null}
      {run.outcome === "COMPILATION_ERROR" ? (
        <div className="flex flex-col gap-2">
          <p className="m-0 text-body font-semibold">{COMPILATION_ERROR}</p>
          <CodeBlock label="Mensagem do compilador" code={run.compileOutput ?? ""} highlight={undefined} />
        </div>
      ) : (
        <>
          <p className="m-0 text-body font-semibold">{runSummary(run.passedCount ?? 0, run.publicCaseCount)}</p>
          <ol aria-label="Casos públicos" className="m-0 flex list-none flex-col gap-2 p-0">
            {run.cases.map((item) => (
              <CaseResult
                key={`${run.id}-${item.position}`}
                item={item}
                testCase={publicTestCases[item.position]}
                defaultOpen={item.position === run.cases.find((other) => other.verdict !== "PASSED")?.position}
              />
            ))}
          </ol>
        </>
      )}
    </section>
  );
}

function CaseResult({
  item,
  testCase,
  defaultOpen,
}: {
  item: CodeRun["cases"][number];
  testCase: { input: string; expectedOutput: string } | undefined;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const Icon = VERDICT_ICONS[item.verdict];
  const title = `Caso ${item.position + 1}`;
  return (
    <li className="rounded-md border border-border bg-surface">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger className="flex w-full items-center gap-2 rounded-md p-3 text-left text-body focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
          <ChevronDown aria-hidden="true" className={open ? "size-4 rotate-180" : "size-4"} />
          <span className="font-semibold">{title}</span>
          <span aria-hidden="true">—</span>
          <Badge variant={VERDICT_VARIANTS[item.verdict]}>
            <Icon aria-hidden="true" />
            {VERDICT_LABELS[item.verdict]}
          </Badge>
        </CollapsibleTrigger>
        <CollapsibleContent className="flex flex-col gap-3 px-3 pb-3">
          <div className="grid gap-3 md:grid-cols-3">
            <Output label="Entrada" text={testCase?.input ?? ""} />
            <Output label="Saída esperada" text={testCase?.expectedOutput ?? ""} />
            <Output label="Saída obtida" text={item.stdout ?? ""} />
          </div>
          {item.stderr ? <Output label="Saída de erro" text={item.stderr} /> : null}
          <p className="m-0 text-body-sm text-text-secondary">Tempo: {item.durationMs} ms</p>
        </CollapsibleContent>
      </Collapsible>
    </li>
  );
}

function Output({ label, text }: { label: string; text: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <p className="m-0 text-body-sm font-semibold">{label}</p>
      <CodeBlock label={label} code={text} highlight={undefined} />
    </div>
  );
}
