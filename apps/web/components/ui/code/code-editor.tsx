"use client"

import * as React from "react"
import { flushSync } from "react-dom"
import type { CodeHighlight } from "@repo/contracts"
import { cn } from "@/lib/utils"
import { Textarea } from "@/components/ui/textarea"
import { grammarLoader } from "./grammars"
import type { CodeEditorInstance } from "./load-editor"

const INDENT = "  "
const HINT = "Tab indenta o código; Esc e depois Tab sai do editor."

export interface CodeEditorHandle {
  focus(): void
}

type CodeEditorProps = {
  id: string
  value: string
  onChange: (value: string) => void
  /** Grammar key of the language (`language.highlight`); null or absent → no colors. */
  highlight?: CodeHighlight
  disabled?: boolean
  /** The 013 answer key: stays the plain textarea (read-only screens use `CodeBlock`). */
  readOnly?: boolean
  /** Fixed height with a vertical scroll bar instead of growing with the code (the student's answer). */
  fixedHeight?: boolean
  /**
   * A CONTROLLED attempt (015 research F6): paste, drop, copy and cut do nothing, in the textarea
   * and in CodeMirror; the typed text is untouched. Fixed while the editor is mounted.
   */
  blockClipboard?: boolean
  /** Example text shown while the field is empty, in the textarea and in CodeMirror; never part of the value. */
  placeholder?: string
  className?: string
  "aria-labelledby"?: string
  "aria-label"?: string
  "aria-describedby"?: string
  "aria-invalid"?: boolean | "true" | "false"
  ref?: React.Ref<CodeEditorHandle>
}

const sameAttributes = (a: Record<string, string>, b: Record<string, string>) =>
  Object.keys(a).length === Object.keys(b).length && Object.entries(a).every(([key, value]) => b[key] === value)

/**
 * The code editor (`CodeEditor`, 005/012 contract, 014 research L2, L6, L7). It shows the 012
 * textarea at once — line numbers, Tab indents, Esc then Tab leaves — and, when the CodeMirror
 * chunk arrives, swaps to the colored editor carrying the value, the selection and the focus,
 * without reporting a change. If the chunk fails it stays the textarea (FR-014). The text is never
 * altered: no closing brackets, completion or automatic indentation; the only normalization is the
 * textarea's own (`\r\n` → `\n` when edited). Nothing here runs the code.
 */
function CodeEditor({
  id,
  value,
  onChange,
  highlight = null,
  disabled = false,
  readOnly = false,
  fixedHeight = false,
  blockClipboard = false,
  placeholder,
  className,
  "aria-labelledby": labelledBy,
  "aria-label": label,
  "aria-describedby": describedBy,
  "aria-invalid": invalid,
  ref,
}: CodeEditorProps) {
  const wrapper = React.useRef<HTMLDivElement>(null)
  const textarea = React.useRef<HTMLTextAreaElement>(null)
  const host = React.useRef<HTMLDivElement>(null)
  const instance = React.useRef<CodeEditorInstance | null>(null)
  const pending = React.useRef<{ create: typeof import("./load-editor").createCodeEditor; carry: Carry } | null>(null)
  const [mode, setMode] = React.useState<"textarea" | "editor">("textarea")
  const [fieldsetDisabled, setFieldsetDisabled] = React.useState(false)

  const latest = React.useRef({ value, onChange, placeholder })
  React.useLayoutEffect(() => {
    latest.current = { value, onChange, placeholder }
  })

  const hintId = `${id}-ajuda`
  const describedByIds = [readOnly ? null : hintId, describedBy].filter(Boolean).join(" ") || undefined
  const off = disabled || fieldsetDisabled
  const attributes = React.useMemo(() => {
    const result: Record<string, string> = {
      id,
      spellcheck: "false",
      autocapitalize: "off",
      autocorrect: "off",
      "aria-multiline": "true",
    }
    if (labelledBy) result["aria-labelledby"] = labelledBy
    if (label) result["aria-label"] = label
    if (describedByIds) result["aria-describedby"] = describedByIds
    if (invalid === true || invalid === "true") result["aria-invalid"] = "true"
    if (off) result["aria-disabled"] = "true"
    if (off || readOnly) result["aria-readonly"] = "true"
    return result
  }, [id, labelledBy, label, describedByIds, invalid, off, readOnly])
  const appliedAttributes = React.useRef(attributes)
  const loadedHighlight = React.useRef<CodeHighlight>(highlight)

  React.useImperativeHandle(ref, () => ({
    focus: () => (instance.current ? instance.current.focus() : textarea.current?.focus()),
  }))

  // A `contenteditable` doesn't inherit `<fieldset disabled>`: check it like the textarea would.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- after every render: the fieldset is outside this component
  React.useLayoutEffect(() => {
    const inside = Boolean(wrapper.current?.closest("fieldset:disabled"))
    if (inside !== fieldsetDisabled) setFieldsetDisabled(inside)
  })

  // Load the editor and the grammar after the first paint; the textarea works meanwhile.
  React.useEffect(() => {
    if (readOnly || mode === "editor") return
    let cancelled = false
    const grammar = grammarLoader(highlight)
    Promise.all([import("./load-editor"), grammar ? grammar().catch(() => null) : Promise.resolve(null)])
      .then(([module, support]) => {
        const field = textarea.current
        if (cancelled || !field) return
        const focused = document.activeElement === field
        const backward = field.selectionDirection === "backward"
        const carry: Carry = {
          grammar: support,
          highlight,
          focused,
          selection: {
            anchor: backward ? field.selectionEnd : field.selectionStart,
            head: backward ? field.selectionStart : field.selectionEnd,
          },
        }
        pending.current = { create: module.createCodeEditor, carry }
        // Synchronous: no keystroke can land between reading the textarea and replacing it.
        flushSync(() => setMode("editor"))
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loads once; a later `highlight` is applied below
  }, [readOnly])

  React.useLayoutEffect(() => {
    if (mode !== "editor" || instance.current || !pending.current || !host.current) return
    const { create, carry } = pending.current
    pending.current = null
    instance.current = create({
      parent: host.current,
      value: latest.current.value,
      selection: carry.selection,
      grammar: carry.grammar,
      editable: !off,
      readOnly,
      attributes,
      blockClipboard,
      placeholder: latest.current.placeholder,
      onChange: (next) => latest.current.onChange(next),
    })
    appliedAttributes.current = attributes
    // The grammar of the highlight when the load started: a language chosen meanwhile loads below.
    loadedHighlight.current = carry.highlight
    if (carry.focused) instance.current.focus()
  })

  React.useEffect(
    () => () => {
      instance.current?.destroy()
      instance.current = null
    },
    [],
  )

  // Controlled value: a change from outside (a CONFLICT of 012, "Refazer" of 013) replaces the text.
  React.useEffect(() => {
    instance.current?.setValue(value)
  }, [value, mode])

  React.useEffect(() => {
    instance.current?.setEditable(!off, readOnly)
  }, [off, readOnly, mode])

  // The example follows the form (another language, another example), never the text.
  React.useEffect(() => {
    instance.current?.setPlaceholder(placeholder)
  }, [placeholder, mode])

  React.useEffect(() => {
    if (!instance.current || sameAttributes(appliedAttributes.current, attributes)) return
    appliedAttributes.current = attributes
    instance.current.setAttributes(attributes)
  }, [attributes, mode])

  // A new language in a form changes the colors, never the text (FR-006).
  React.useEffect(() => {
    if (!instance.current || loadedHighlight.current === highlight) return
    loadedHighlight.current = highlight
    const grammar = grammarLoader(highlight)
    let cancelled = false
    ;(grammar ? grammar().catch(() => null) : Promise.resolve(null)).then((support) => {
      if (!cancelled) instance.current?.setGrammar(support)
    })
    return () => {
      cancelled = true
    }
  }, [highlight, mode])

  return (
    <div ref={wrapper} data-slot="code-editor" className={cn("flex min-w-0 flex-col gap-2", className)}>
      {mode === "editor" ? (
        <div
          ref={host}
          data-slot="code-editor-host"
          className={cn(
            "min-w-0 font-mono text-code",
            "[&_.cm-editor]:rounded-md [&_.cm-editor]:border [&_.cm-editor]:border-border-control [&_.cm-gutters]:rounded-l-md",
            fixedHeight ? "[&_.cm-editor]:h-[65dvh] [&_.cm-editor]:min-h-96 [&_.cm-scroller]:overflow-auto" : "[&_.cm-editor]:min-h-48 [&_.cm-scroller]:overflow-x-auto",
            invalid === true || invalid === "true" ? "[&_.cm-editor]:border-2 [&_.cm-editor]:border-danger" : null,
            off ? "cursor-not-allowed [&_.cm-editor]:border-dashed [&_.cm-editor]:border-disabled-border" : null,
          )}
        />
      ) : (
        <PlainEditor
          id={id}
          ref={textarea}
          value={value}
          onChange={onChange}
          disabled={off}
          readOnly={readOnly}
          fixedHeight={fixedHeight}
          blockClipboard={blockClipboard}
          placeholder={placeholder}
          aria-labelledby={labelledBy}
          aria-label={label}
          aria-describedby={describedByIds}
          aria-invalid={invalid}
        />
      )}
      {readOnly ? null : (
        <p id={hintId} className="m-0 text-caption text-text-secondary">
          {HINT}
        </p>
      )}
    </div>
  )
}

interface Carry {
  grammar: Awaited<ReturnType<NonNullable<ReturnType<typeof grammarLoader>>>> | null
  highlight: CodeHighlight
  focused: boolean
  selection: { anchor: number; head: number }
}

/**
 * The 012 textarea (research P21): line numbers beside it, Tab inserts two spaces, Esc then Tab
 * leaves; read-only keeps Tab moving the focus. It is the editor until CodeMirror arrives, and for
 * good if it doesn't.
 */
function PlainEditor({
  id,
  value,
  onChange,
  disabled,
  readOnly,
  fixedHeight,
  blockClipboard,
  placeholder,
  ref,
  ...aria
}: {
  id: string
  value: string
  onChange: (value: string) => void
  disabled: boolean
  readOnly: boolean
  fixedHeight: boolean
  blockClipboard: boolean
  placeholder?: string
  ref: React.Ref<HTMLTextAreaElement>
  "aria-labelledby"?: string
  "aria-label"?: string
  "aria-describedby"?: string
  "aria-invalid"?: boolean | "true" | "false"
}) {
  const gutter = React.useRef<HTMLDivElement>(null)
  const escaped = React.useRef(false)
  const lines = Math.max(1, value.split("\n").length)
  const refuse = blockClipboard ? (event: React.SyntheticEvent) => event.preventDefault() : undefined

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
    <div
      className={cn(
        "flex overflow-hidden rounded-md border border-border-control bg-background focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring",
        fixedHeight ? "h-[65dvh] min-h-96" : null,
      )}
    >
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
        ref={ref}
        value={value}
        disabled={disabled}
        readOnly={readOnly}
        placeholder={placeholder}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        wrap="off"
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
        onPaste={refuse}
        onDrop={refuse}
        onCopy={refuse}
        onCut={refuse}
        onScroll={(event) => {
          if (gutter.current) gutter.current.scrollTop = event.currentTarget.scrollTop
        }}
        className={cn(
          "min-h-48 flex-1 rounded-none border-0 font-mono text-code whitespace-pre focus-visible:outline-none",
          fixedHeight ? "h-full resize-none overflow-auto" : "resize-y",
        )}
        {...aria}
      />
    </div>
  )
}

export { CodeEditor }
