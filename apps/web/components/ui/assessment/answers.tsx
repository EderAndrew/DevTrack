"use client"

import * as React from "react"
import type { CodeHighlight } from "@repo/contracts"
import { cn } from "@/lib/utils"
import { Label } from "@/components/ui/label"
import { Radio, RadioGroup } from "@/components/ui/radio"
import { Textarea } from "@/components/ui/textarea"
import { CodeEditor } from "./code-editor"

// Exam Mode answer areas (design-system/exam-mode.md "AnswerArea", 012 research P21). They only
// show and edit the answer: saving, limits and rules belong to the page and the server.

const LETTERS = "ABCDEFGHIJ"

/**
 * One alternative per row (`MultipleChoiceAnswer`): the whole row is the target (≥ 44 px), letter
 * plus text; the chosen one gets the `--primary` border and `--primary-subtle` background besides
 * the checked radio.
 */
function MultipleChoiceAnswer({
  name,
  legend = "Alternativas",
  alternatives,
  value,
  onChange,
  disabled,
  className,
}: {
  name: string
  legend?: string
  alternatives: readonly { id: string; text: string }[]
  value: string | null
  onChange: (alternativeId: string) => void
  disabled?: boolean
  className?: string
}) {
  return (
    <RadioGroup data-slot="multiple-choice-answer" legend={legend} className={cn("gap-3", className)}>
      {alternatives.map((alternative, index) => {
        const checked = alternative.id === value
        const id = `${name}-${alternative.id}`
        return (
          <label
            key={alternative.id}
            htmlFor={id}
            data-state={checked ? "checked" : "unchecked"}
            className={cn(
              "flex min-h-11 cursor-pointer items-start gap-3 rounded-md border px-4 py-3 text-body text-foreground transition-colors duration-(--duration-fast) ease-standard",
              checked ? "border-2 border-primary bg-primary-subtle" : "border-border-control bg-surface hover:bg-accent",
              disabled && "cursor-not-allowed"
            )}
          >
            <Radio
              id={id}
              name={name}
              value={alternative.id}
              checked={checked}
              disabled={disabled}
              onChange={() => onChange(alternative.id)}
              className="mt-1"
            />
            <span className="font-semibold">{LETTERS[index] ?? index + 1})</span>
            <span className="whitespace-pre-wrap">{alternative.text}</span>
          </label>
        )
      })}
    </RadioGroup>
  )
}

/** Bucket of the remaining characters in tenths of the limit: announced only when it changes. */
const tenth = (remaining: number, max: number) => Math.floor((remaining / max) * 10)

/** A long text answer with a character counter (`EssayAnswer`), announced only every 10% left. */
function EssayAnswer({
  id,
  label = "Sua resposta",
  value,
  onChange,
  maxLength,
  disabled,
  className,
}: {
  id: string
  label?: string
  value: string
  onChange: (value: string) => void
  maxLength: number
  disabled?: boolean
  className?: string
}) {
  const remaining = maxLength - value.length
  const bucket = tenth(remaining, maxLength)
  const [announced, setAnnounced] = React.useState(bucket)
  const [announcement, setAnnouncement] = React.useState("")
  if (bucket !== announced) {
    setAnnounced(bucket)
    setAnnouncement(`Restam ${remaining.toLocaleString("pt-BR")} caracteres.`)
  }
  const counterId = `${id}-contador`

  return (
    <div data-slot="essay-answer" className={cn("flex flex-col gap-2", className)}>
      <Label htmlFor={id}>{label}</Label>
      <Textarea
        id={id}
        value={value}
        maxLength={maxLength}
        disabled={disabled}
        aria-describedby={counterId}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-48"
      />
      <p id={counterId} className="m-0 text-caption text-text-secondary">
        {value.length.toLocaleString("pt-BR")} de {maxLength.toLocaleString("pt-BR")} caracteres
      </p>
      <span role="status" className="sr-only">
        {announcement}
      </span>
    </div>
  )
}

/**
 * A code answer (`CodeAnswer`, 012 subset): the language, the editor with the starter code and the
 * public test cases, read-only. No output, error or result regions: nothing is executed in 012.
 * Since 014 the editor colors the code by the language's grammar (`highlight`, catalog data).
 */
function CodeAnswer({
  id,
  language,
  highlight = null,
  value,
  onChange,
  publicTestCases,
  disabled,
  className,
}: {
  id: string
  language: string | null
  highlight?: CodeHighlight
  value: string
  onChange: (value: string) => void
  publicTestCases: readonly { input: string; expectedOutput: string }[]
  disabled?: boolean
  className?: string
}) {
  return (
    <div data-slot="code-answer" className={cn("flex flex-col gap-6", className)}>
      <div className="flex flex-col gap-2">
        <Label id={`${id}-rotulo`} htmlFor={id}>
          Sua resposta{language ? ` (${language})` : ""}
        </Label>
        <CodeEditor
          id={id}
          aria-labelledby={`${id}-rotulo`}
          highlight={highlight}
          value={value}
          onChange={onChange}
          disabled={disabled}
        />
      </div>
      {publicTestCases.length > 0 ? (
        <section aria-labelledby={`${id}-casos`} className="flex flex-col gap-3 rounded-md border border-border p-4">
          <h3 id={`${id}-casos`} className="m-0 text-label text-foreground">
            Casos de teste públicos
          </h3>
          <ol className="m-0 flex list-none flex-col gap-3 p-0">
            {publicTestCases.map((testCase, index) => (
              <li key={index} className="flex flex-col gap-1">
                <span className="text-caption text-text-secondary">Caso {index + 1}</span>
                <dl className="m-0 grid gap-2 sm:grid-cols-2">
                  <div className="flex flex-col gap-1">
                    <dt className="text-caption text-text-secondary">Entrada</dt>
                    <dd className="m-0 overflow-x-auto rounded-sm bg-background p-2 font-mono text-code whitespace-pre">
                      {testCase.input}
                    </dd>
                  </div>
                  <div className="flex flex-col gap-1">
                    <dt className="text-caption text-text-secondary">Saída esperada</dt>
                    <dd className="m-0 overflow-x-auto rounded-sm bg-background p-2 font-mono text-code whitespace-pre">
                      {testCase.expectedOutput}
                    </dd>
                  </div>
                </dl>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </div>
  )
}

export { CodeAnswer, EssayAnswer, MultipleChoiceAnswer }
