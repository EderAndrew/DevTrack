"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { Textarea } from "@/components/ui/textarea"

const INDENT = "  "

/**
 * The code editor of Exam Mode (`CodeEditor`, 012 research P21): a textarea in `text-code` with a
 * line-number gutter, no editor library and no colors outside the tokens. Tab indents; Esc then Tab
 * leaves the editor (said in the description). The code is text only: nothing here runs it.
 * `readOnly` (013, the answer key after a conclusion) keeps Tab moving the focus and drops the hint.
 */
function CodeEditor({
  id,
  value,
  onChange,
  disabled,
  readOnly,
  className,
  "aria-describedby": describedBy,
  ...props
}: Omit<React.ComponentProps<"textarea">, "value" | "onChange"> & {
  id: string
  value: string
  onChange: (value: string) => void
}) {
  const gutter = React.useRef<HTMLDivElement>(null)
  const escaped = React.useRef(false)
  const hintId = `${id}-ajuda`
  const lines = Math.max(1, value.split("\n").length)

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (readOnly) return
    if (event.key === "Escape") {
      escaped.current = true
      return
    }
    if (event.key !== "Tab" || escaped.current || event.shiftKey) {
      escaped.current = false
      return
    }
    event.preventDefault()
    const target = event.currentTarget
    const { selectionStart, selectionEnd } = target
    const next = value.slice(0, selectionStart) + INDENT + value.slice(selectionEnd)
    onChange(next)
    requestAnimationFrame(() => {
      target.selectionStart = target.selectionEnd = selectionStart + INDENT.length
    })
  }

  return (
    <div data-slot="code-editor" className={cn("flex flex-col gap-2", className)}>
      <div className="flex overflow-hidden rounded-md border border-border-control bg-background focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring">
        <div
          ref={gutter}
          aria-hidden="true"
          className="shrink-0 overflow-hidden border-r border-border px-2 py-2 text-right font-mono text-code text-text-secondary select-none"
        >
          {Array.from({ length: lines }, (_, index) => (
            <div key={index}>{index + 1}</div>
          ))}
        </div>
        <Textarea
          id={id}
          value={value}
          disabled={disabled}
          readOnly={readOnly}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          wrap="off"
          aria-describedby={[readOnly ? null : hintId, describedBy].filter(Boolean).join(" ") || undefined}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={onKeyDown}
          onScroll={(event) => {
            if (gutter.current) gutter.current.scrollTop = event.currentTarget.scrollTop
          }}
          className="min-h-48 flex-1 resize-y rounded-none border-0 font-mono text-code whitespace-pre focus-visible:outline-none"
          {...props}
        />
      </div>
      {readOnly ? null : (
        <p id={hintId} className="m-0 text-caption text-text-secondary">
          Tab indenta o código; Esc e depois Tab sai do editor.
        </p>
      )}
    </div>
  )
}

export { CodeEditor }
