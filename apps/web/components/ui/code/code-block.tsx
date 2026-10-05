"use client"

import * as React from "react"
import type { CodeHighlight } from "@repo/contracts"
import { cn } from "@/lib/utils"
import { grammarLoader } from "./grammars"
import type { CodeSegment } from "./load-highlighter"

type CodeBlockProps = {
  code: string
  /** Grammar key of the language (`language.highlight`); null or unknown → plain text. */
  highlight: CodeHighlight | undefined
  /** Accessible name ("Solução de referência", "Resposta do aluno"). */
  label: string
  className?: string
}

/** The visible lines: a trailing line break in `<pre>` opens no new line. */
function lineCount(code: string): number {
  const lines = code.split("\n").length
  return code.endsWith("\n") && lines > 1 ? lines - 1 : lines
}

/**
 * Read-only code (`CodeBlock`, 014 contracts/web-ui.md, research L4): the stored text in
 * `<pre><code>`, colored by the language's grammar as React `<span>`s (never HTML from the code),
 * with a line-number column outside the code (`aria-hidden`, not selectable) so copying yields the
 * code only. Plain text until the grammar loads, and for good if it fails or there is none. Tab
 * moves on; the code is focusable only when it scrolls sideways, as a labeled region.
 */
function CodeBlock({ code, highlight, label, className }: CodeBlockProps) {
  const scroller = React.useRef<HTMLDivElement>(null)
  const [colored, setColored] = React.useState<{ code: string; highlight: string; segments: CodeSegment[] } | null>(null)
  const [overflows, setOverflows] = React.useState(false)

  React.useEffect(() => {
    const grammar = grammarLoader(highlight)
    if (!grammar || !highlight) return
    let cancelled = false
    Promise.all([import("./load-highlighter"), grammar()])
      .then(([module, support]) => {
        if (!cancelled) setColored({ code, highlight, segments: module.highlightCode(code, support) })
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [code, highlight])

  React.useLayoutEffect(() => {
    const element = scroller.current
    if (!element) return
    const measure = () => setOverflows(element.scrollWidth > element.clientWidth)
    measure()
    if (typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [code])

  // Segments of another code or grammar never show: until the new ones arrive, the plain text.
  const shown = colored && colored.code === code && colored.highlight === highlight ? colored.segments : null
  const lines = lineCount(code)

  return (
    <div
      role="group"
      aria-label={label}
      data-slot="code-block"
      className={cn("flex min-w-0 overflow-hidden rounded-md border border-border bg-background", className)}
    >
      <div
        aria-hidden="true"
        data-slot="code-block-lines"
        className="shrink-0 border-r border-border px-2 py-2 text-right font-mono text-code text-text-secondary select-none"
      >
        {Array.from({ length: lines }, (_, index) => (
          <div key={index}>{index + 1}</div>
        ))}
      </div>
      <div
        ref={scroller}
        data-slot="code-block-scroll"
        role={overflows ? "region" : undefined}
        aria-label={overflows ? label : undefined}
        tabIndex={overflows ? 0 : undefined}
        className="min-w-0 flex-1 overflow-x-auto focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
      >
        <pre className="m-0 px-3 py-2 font-mono text-code whitespace-pre text-foreground">
          <code>
            {shown
              ? shown.map((segment, index) =>
                  segment.className ? (
                    <span key={index} className={segment.className}>
                      {segment.text}
                    </span>
                  ) : (
                    <React.Fragment key={index}>{segment.text}</React.Fragment>
                  ),
                )
              : code}
          </code>
        </pre>
      </div>
    </div>
  )
}

export { CodeBlock }
