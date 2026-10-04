# Contract: web components and screens

Two design-system components in `apps/web/components/ui/code/` (moved from
`components/ui/assessment/code-editor.tsx`, which re-exports `CodeEditor` for the assessment
components), each with a registry entry, a showcase and a `components.md` section.

## `CodeEditor` (editable)

```ts
CodeEditor(props: {
  id: string                       // also the base of the hint id
  value: string
  onChange: (value: string) => void
  highlight: CodeHighlight         // grammar key from the language object; null → plain
  disabled?: boolean
  readOnly?: boolean               // kept for compatibility; read-only screens use CodeBlock
  "aria-labelledby": string        // the Field label id
  "aria-describedby"?: string
  "aria-invalid"?: boolean
  ref?: { focus(): void }          // React Hook Form focus on error (FR-013)
})
```

- Renders the 012 textarea at once; swaps to CodeMirror when the chunk loads, keeping value,
  selection and focus; stays a textarea if the load fails (research L6).
- Tab inserts two spaces; Esc then Tab leaves; Shift+Tab moves back; Enter inserts a plain newline;
  no auto-closing, completion or lint (L2).
- Hint below (unchanged): "Tab indenta o código; Esc e depois Tab sai do editor."
- Line numbers in `--text-secondary`, `text-code`, official focus outline, `bg-background`;
  horizontal scroll inside the editor (no page scroll at 360 px).

## `CodeBlock` (read-only)

```ts
CodeBlock(props: {
  code: string
  highlight: CodeHighlight
  label: string                    // accessible name ("Solução de referência", "Resposta do aluno")
})
```

- `<figure>`-like region with the label, a line-number column (`aria-hidden`, not selectable) and
  `<pre><code>` with `<span class="text-syntax-…">` segments; plain text until the grammar loads or
  if it fails (L4). Focusable (`tabIndex=0`) only when it overflows, as a labeled scroll region.
- Copying yields the code text only.

## Screens

| Screen | Before | After |
|--------|--------|-------|
| Student answering a Código question (`CodeAnswer`, 012/013) | `CodeEditor` plain | `CodeEditor` with the question's `language.highlight`; label "Sua resposta (Java)" |
| Exercise result (013): own answer, starter code, reference solution | `CodeEditor readOnly` / text | `CodeBlock` |
| Teacher attempt review: student's code answer, expected solution | text | `CodeBlock` |
| Teacher activity detail questions: starter code, expected solution | text | `CodeBlock` |
| Exercise form and AI draft editor (010): "Código inicial", "Solução esperada" | `TextareaField` | `CodeEditor` in a `Field`, highlight from the chosen language (changes live) |
| Work question card (011): "Código inicial", "Solução esperada" | `TextareaField` | same as the exercise form |
| Exercise read view (`exercise-parts`), work student preview ("Ver como aluno") | text | `CodeBlock` (the preview still without the solution) |
| Test cases (input/expected output) | text fields | unchanged |

Labels and messages stay in Portuguese; no new user-facing error code.
