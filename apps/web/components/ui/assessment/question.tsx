import * as React from "react"
import { cn } from "@/lib/utils"
import { Status } from "@/components/ui/status"

// Exam Mode (design-system/exam-mode.md): the question's header, its answer state and statement.

/** The answer state of the question in words (`QuestionStatus`). */
function QuestionStatus({ answered, className }: { answered: boolean; className?: string }) {
  return (
    <Status data-slot="question-status" variant={answered ? "success" : "neutral"} className={className}>
      {answered ? "Respondida" : "Não respondida"}
    </Status>
  )
}

/**
 * "Questão N" (`text-h2`), then the type and the value in `text-caption` (`QuestionHeader`), with
 * the answer state when given.
 */
function QuestionHeader({
  number,
  typeLabel,
  valueLabel,
  answered,
  className,
  headingId,
  headingRef,
}: {
  number: number
  typeLabel: string
  /** e.g. "Vale 0,17". */
  valueLabel: string
  answered?: boolean
  className?: string
  headingId?: string
  /** Receives the focus when the student moves to this question. */
  headingRef?: React.Ref<HTMLHeadingElement>
}) {
  return (
    <header data-slot="question-header" className={cn("flex flex-col gap-1", className)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id={headingId} ref={headingRef} tabIndex={headingRef ? -1 : undefined} className="m-0 text-h2 text-foreground">
          Questão {number}
        </h2>
        {answered === undefined ? null : <QuestionStatus answered={answered} />}
      </div>
      <p className="m-0 text-caption text-text-secondary">
        {typeLabel} · {valueLabel}
      </p>
    </header>
  )
}

/** The statement as plain text in `text-reading` (`QuestionStatement`); line breaks kept, never HTML. */
function QuestionStatement({ children, className }: { children: string; className?: string }) {
  return (
    <div data-slot="question-statement" className={cn("text-reading whitespace-pre-wrap text-foreground", className)}>
      {children}
    </div>
  )
}

export { QuestionHeader, QuestionStatement, QuestionStatus }
