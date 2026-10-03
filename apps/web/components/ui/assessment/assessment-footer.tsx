import * as React from "react"
import { ArrowLeft, ArrowRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

/**
 * The answering screen's footer (`ExamFooter` of exam-mode.md, NORMAL mode): "Anterior"
 * (`secondary`) and "Próxima" (`primary`), absent at the ends, and the slot for the submit action,
 * which always asks for confirmation.
 */
function AssessmentFooter({
  onPrevious,
  onNext,
  hasPrevious,
  hasNext,
  submit,
  className,
}: {
  onPrevious: () => void
  onNext: () => void
  hasPrevious: boolean
  hasNext: boolean
  submit?: React.ReactNode
  className?: string
}) {
  return (
    <footer
      data-slot="assessment-footer"
      className={cn("flex flex-wrap items-center justify-between gap-3 border-t border-border pt-6", className)}
    >
      <div>
        {hasPrevious ? (
          <Button type="button" variant="secondary" onClick={onPrevious}>
            <ArrowLeft aria-hidden="true" />
            Anterior
          </Button>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {hasNext ? (
          <Button type="button" onClick={onNext}>
            Próxima
            <ArrowRight aria-hidden="true" />
          </Button>
        ) : null}
        {submit}
      </div>
    </footer>
  )
}

export { AssessmentFooter }
