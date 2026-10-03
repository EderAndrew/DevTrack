"use client"

import * as React from "react"
import { Check } from "lucide-react"
import { cn } from "@/lib/utils"
import { Progress } from "@/components/ui/progress"

// Exam Mode (design-system/exam-mode.md, 012 research P21): the progress and the question
// navigator, NORMAL mode subset (atual, não respondida, respondida; no review flag or lock).

/** "Questão N de M" and how many are answered (`ExamProgress`); updates without moving the focus. */
function ExamProgress({
  current,
  total,
  answered,
  className,
}: {
  /** 1-based. */
  current: number
  total: number
  answered: number
  className?: string
}) {
  const label = `${answered} de ${total} respondidas`
  return (
    <div data-slot="exam-progress" className={cn("flex flex-col gap-2", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-label text-foreground">
          Questão {current} de {total}
        </span>
        <span className="text-caption text-text-secondary">{label}</span>
      </div>
      <Progress
        value={total === 0 ? 0 : Math.round((answered / total) * 100)}
        getValueLabel={() => label}
        aria-label="Questões respondidas"
      />
    </div>
  )
}

interface NavigatorQuestion {
  id: string
  answered: boolean
}

/** The announcement of a question's states (exam-mode.md, "Estados de questão"). */
const questionLabel = (number: number, answered: boolean, current: boolean) =>
  `Questão ${number}, ${current ? "atual, " : ""}${answered ? "respondida" : "não respondida"}`

/**
 * One button per question (`QuestionNavigator`): current (square, `aria-current="step"`), answered
 * (filled with a check) or not (outlined circle) — never by color alone. Tab and the arrow keys
 * (plus Home/End) move between them.
 */
function QuestionNavigator({
  questions,
  currentIndex,
  onSelect,
  className,
}: {
  questions: readonly NavigatorQuestion[]
  currentIndex: number
  onSelect: (index: number) => void
  className?: string
}) {
  const refs = React.useRef<(HTMLButtonElement | null)[]>([])

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = questions.length - 1
    const target =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? Math.min(index + 1, last)
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? Math.max(index - 1, 0)
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? last
              : null
    if (target === null) return
    event.preventDefault()
    refs.current[target]?.focus()
  }

  return (
    <nav aria-label="Questões" data-slot="question-navigator" className={cn("overflow-x-auto", className)}>
      <ol className="m-0 flex list-none flex-wrap gap-2 p-1">
        {questions.map((question, index) => {
          const current = index === currentIndex
          return (
            <li key={question.id}>
              <button
                ref={(element) => {
                  refs.current[index] = element
                }}
                type="button"
                data-state={current ? "current" : question.answered ? "answered" : "unanswered"}
                aria-current={current ? "step" : undefined}
                aria-label={questionLabel(index + 1, question.answered, current)}
                onClick={() => onSelect(index)}
                onKeyDown={(event) => onKeyDown(event, index)}
                className={cn(
                  "relative inline-flex size-10 cursor-pointer items-center justify-center border text-label transition-colors duration-(--duration-fast) ease-standard focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                  current
                    ? "rounded-sm border-2 border-primary bg-primary-subtle font-bold text-foreground"
                    : question.answered
                      ? "rounded-full border-primary bg-primary text-primary-foreground"
                      : "rounded-full border-border-control bg-surface text-foreground hover:bg-accent"
                )}
              >
                {String(index + 1).padStart(2, "0")}
                {question.answered ? (
                  <Check
                    aria-hidden="true"
                    className={cn(
                      "absolute -right-1 -top-1 size-4 rounded-full",
                      current ? "bg-primary text-primary-foreground" : "bg-surface text-primary"
                    )}
                  />
                ) : null}
              </button>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

export { ExamProgress, QuestionNavigator, type NavigatorQuestion }
