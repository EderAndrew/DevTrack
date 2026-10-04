# Research: 014 — Realce de Sintaxe do Código

Decisions L1–L14. The 005 contract of the code editor (`text-code`, line numbers in
`--text-secondary`, official focus outline, Tab indents, Esc then Tab leaves, no colors outside the
tokens) and the 012/013 rules (autosave, revisions, offline buffer, blank rule, answer key only after
a conclusion, text-only rendering) still hold; these decisions add the library and the colors.

## L1 — CodeMirror 6 for editing, its parsers for reading

**Decision**: CodeMirror 6 — `@codemirror/state`, `@codemirror/view`, `@codemirror/language`,
`@codemirror/commands` and `@lezer/highlight` — plus one package per grammar the catalog uses
(`@codemirror/lang-java`, `-python`, `-javascript` (JS and TS), `-cpp` (C and C++), `-php`, `-rust`,
`-go`, `-html` (HTML with embedded CSS and JS)). All MIT, maintained (releases in 2026-09), modular.

**Rationale**: a real editor on `contenteditable` with first-class keyboard and screen-reader support
(`role="textbox"`, `aria-multiline`, attributes through `EditorView.contentAttributes`), touch and
virtual keyboards, undo history, and a token model (Lezer tags) we map to our own classes, so no
color comes from the library. The same Lezer parsers highlight read-only code without an editor
(L4). Each piece loads on demand (L6).

**Alternatives**:
- *Monaco*: ~97 MB unpacked, desktop-oriented, weak on phones, own theming — rejected (FR-022/SC-004,
  US4-4).
- *Textarea + highlighted overlay* (react-simple-code-editor + Prism/highlight.js): the highlighters
  produce HTML strings injected with `dangerouslySetInnerHTML` (forbidden, 012/FR-035) and the
  overlay drifts on wrapping, IME and mobile — rejected.
- *Shiki*: TextMate grammars + WASM regex engine, themes as data, HTML output; heavy for the client
  and HTML strings again — rejected.
- *CodeMirror 5*: unmaintained, poor mobile support — rejected.

## L2 — The editor's behavior: nothing typed is changed

**Decision**: the extensions are exactly: the grammar (L3), our highlight style (L5), line numbers,
`history()` with its keymap (undo/redo), a Tab binding that inserts two spaces (the 012 `INDENT`),
`EditorView.lineWrapping` off, `EditorState.readOnly`/`EditorView.editable` from props, and an
update listener that reports `doc.toString()`. Not included: `closeBrackets`, autocompletion,
linting, search panel, bracket matching colors, `insertNewlineAndIndent` (Enter is a plain
`insertNewline`), drawn selection themes from the library.

Esc then Tab: CodeMirror's tab-focus mode (Escape makes the next Tab move the focus) matches the
005 rule; the implementation verifies it on the installed version and, if absent, adds the same
two-key handling the 012 textarea has. Shift+Tab keeps moving the focus back (not bound).

**Rationale**: FR-007 (no automatic completion or indentation), FR-010, FR-024 (no autocompletion,
lint or formatting). Line breaks: CodeMirror splits on `\r\n`, `\r` and `\n` and joins with `\n` —
the same normalization the HTML textarea applies to its value today (spec FR-007, amended).

## L3 — The grammar of a language is catalog data

**Decision**: `programming_languages` gains `highlight` (text, nullable, CHECK
`^[a-z][a-z0-9-]{0,31}$`), seeded by the migration: `java→java`, `python→python`,
`javascript→javascript`, `typescript→typescript`, `c→cpp`, `cpp→cpp`, `php→php`, `rust→rust`,
`go→go`, `html-css→html`, `angular→typescript`, `nest→typescript`, `node→javascript`. The web keeps a
registry of **grammar keys** (`components/ui/code/grammars.ts`): key → lazy loader of the CodeMirror
`LanguageSupport` (`typescript` = `javascript({ typescript: true })`). An unknown key or null →
plain text.

**Rationale**: constitution XXI and spec FR-002/FR-003: no domain language is a condition in code.
The registry lists the parsing capabilities of the library (like a list of file formats), not the
catalog; mapping a catalog entry to a grammar is data, so a new catalog language whose grammar
exists needs only a migration row, and one without a grammar works uncolored.

**Alternatives**: mapping by catalog `key` in the web (`if key === "java"`) — the hard-coded
conditional XXI forbids; a free-text grammar column without a format CHECK — accepts garbage;
an enum of grammars in the database — couples the schema to the library's list.

## L4 — Read-only code: static highlighting rendered as React elements

**Decision**: a `CodeBlock` component (design system) renders read-only code without an editor: it
loads the grammar (L6), parses the text with the language's Lezer parser and walks it with
`highlightTree` + our `tagHighlighter` (L5), producing an array of `{ text, className }` segments per
line that React renders as `<span>`s inside `<pre><code>`. A line-number column sits beside it,
`aria-hidden` and `select-none`, so copying selects only code (US2-4). Until the grammar loads, or if
it fails, the same component renders the plain text.

**Rationale**: no `dangerouslySetInnerHTML` (React escapes every segment — FR-009, SC-003), no editor
cost for the several code blocks of an attempt review, natural Tab order (FR-011), and the exact
stored text (no normalization on read). When the block overflows horizontally it is a focusable
scroll region (`tabIndex=0`, labeled) as axe requires.

**Alternatives**: a read-only CodeMirror per block — heavier, focus semantics of an editor;
`highlightCode` to HTML — string output.

## L5 — Colors: syntax tokens and one highlighter

**Decision**: eight semantic tokens in `tokens.css`, light and dark (values in
contracts/design-tokens.md, each ≥ 4.5:1 over `--background`): `--syntax-keyword`, `--syntax-string`,
`--syntax-number`, `--syntax-comment`, `--syntax-type`, `--syntax-function`, `--syntax-operator`,
`--syntax-punctuation`, plain text = `--foreground`. A `tagHighlighter` maps Lezer tags to classes
(`keyword`/`controlKeyword`/`modifier`/`definitionKeyword` → keyword; `string`/`regexp`/`special(string)`
→ string; `number`/`bool`/`null`/`atom` → number; `comment` family → comment; `typeName`/`className`/
`namespace` → type; `function(variableName)`/`function(propertyName)` → function; `operator`/
`compareOperator`/`logicOperator` → operator; `punctuation`/`bracket`/`separator` → punctuation;
`tagName`/`attributeName` (HTML) → keyword/type). The classes are Tailwind utilities generated from the
tokens (`text-syntax-keyword`…), used by both the editor and `CodeBlock`. The editor's own theme
(`EditorView.theme`) sets every color property CodeMirror's base theme defines (content, cursor,
selection, gutters, active line, focus outline) to `var(--…)` tokens.
`@media (forced-colors: active)`: syntax classes fall back to `CanvasText` (FR-019).

**Rationale**: FR-004, FR-016–FR-019; the token-usage guard keeps scanning the source (no literal
color can appear in the theme), and a unit test checks that every color value of the editor theme is
a `var(--…)`.

## L6 — Loaded only where code appears; plain first, colored after

**Decision**: `CodeEditor` and `CodeBlock` import CodeMirror and the grammars only through dynamic
`import()` in `components/ui/code/load-*.ts`; an ESLint `no-restricted-imports` rule forbids static
imports of `@codemirror/*` and `@lezer/*` elsewhere. `CodeEditor` renders the current 012 textarea
immediately (same props, same behavior) and swaps to CodeMirror when the chunk resolves, carrying
the value, the selection and the focus; if the import fails it simply stays the textarea (FR-014).

**Rationale**: FR-022/SC-007 (other pages don't download anything), SC-004 (the answering screen is
ready to type at once; colors arrive when the chunk does), FR-014. The swap keeps one value source
(the parent's state), so autosave and the offline buffer see the same `onChange` stream.

**Alternatives**: `next/dynamic` with a loading placeholder — the student couldn't type until the
chunk loads; bundling CodeMirror into the assessment route — every activity page pays for it even
without code.

## L7 — Accessibility of the editor

**Decision**: `EditorView.contentAttributes` sets `aria-labelledby` (the field's label id),
`aria-describedby` (the Tab hint, error and hint ids, as today), `aria-invalid`, `aria-readonly` and
`aria-disabled`; the visible label still uses the `Field` component, now linked by
`aria-labelledby` (a `contenteditable` can't be a `<label for>` target). The label text includes the
language ("Sua resposta (Java)"). The component exposes `focus()` through its ref so React Hook Form's
`setFocus`/error focus reaches the editor (FR-013); `expectFieldErrorLinked` learns to accept
`aria-labelledby`. Gutters are `aria-hidden` (CodeMirror default); the screen reader reads the
content as text lines (FR-018).

## L8 — Contracts: the language objects carry the grammar

**Decision**: every language object a screen receives gains `highlight: string | null` —
`ProgrammingLanguageView` (catalog, for the forms' language picker), the exercise teacher view and
student view, the work teacher view and student view, and the activity question teacher and student
views. One shared schema `CodeHighlightSchema` in `packages/contracts/src/common/code-highlight.ts`
(`z.string().regex(/^[a-z][a-z0-9-]{0,31}$/).nullable()`) — in `common/` because the exercise and
work contracts may not import each other (`works-boundary.spec.ts`). The student views copy it explicitly in
their allowlists (`student-view.ts` of exercises, works and activities): it is presentation data,
not an answer key.

**Rationale**: constitution XXVI (one schema), the student-view rule (allowlist, never stripping);
no new route. Activity snapshots keep `language_id`; the grammar is read from the catalog at view
time (presentation, not part of the frozen content).

## L9 — Where the components are used

**Decision**: `CodeEditor` (editable) in `CodeAnswer` (student answering, 012/013), the exercise form
and draft editor (010: "Código inicial", "Solução esperada"), the work question card (011: same two
fields); `CodeBlock` (read-only) in the exercise result (013: the student's answer, starter code and
reference solution, replacing `CodeEditor readOnly`), the attempt review (student's code answer and
expected solution), the activity detail questions, the exercise read view (`exercise-parts`) and the
work student preview. Test cases (input/expected output) stay plain text fields (spec Assumptions).

## L10 — No API logic beyond the column and the views

**Decision**: the API changes are the migration (column + seed), the Prisma field, the language
selects of the views (`highlight` added where `name` is read) and the catalog list. No route, rule,
permission or audit event changes.

## L11 — Dependency record

**Decision**: `DEPENDENCIES.md` gains one row per direct package (license, purpose, why not
trivial, size on the code pages), `pnpm audit` stays without high/critical findings, and the
license guard (if any) accepts MIT. Versions pinned by the lockfile like the rest.

## L12 — Performance checks

**Decision**: an E2E check on the answering page measures navigation → editor focusable and typing a
character in a 10 000-character answer (performance marks around `keyboard.type`), with the SC-004
limits (≤ 300 ms more than the textarea baseline; ≤ 50 ms per keystroke). The other pages' first-load
JS is compared before and after through `next build` output in the review (SC-007), backed by the
ESLint rule of L6.

**Result (2026-10-04, T026)**: Next.js 16 no longer prints "First Load JS", so it was computed from
the build: per route, the gzip size of the union of `entryJSFiles` in its
`page_client-reference-manifest.js`, for `17153aa` (before T001) and for US1–US4 done, same machine.
- No route has CodeMirror or Lezer in its first load (searched for `cm-content`, `EditorView`,
  `lezer` in the chunks): the editor and the grammars arrive only through `import()`.
- Routes without code: +29 to +62 bytes gzip (≈ 0.03 %; `/` and `/_not-found` −5). The difference
  is in the shared chunk and comes from `@repo/contracts`: `CodeHighlightSchema` and the `highlight`
  field of the language objects (FR-002) in the response schemas of `endpoints.ts`, which every page
  bundles. No editor or highlighting code.
- Routes with code (`CodeEditor`/`CodeBlock` and the grammar registry, not CodeMirror): `/exercicios`
  +1.2 KB, `/exercicios/[id]` +3.0 KB, `/exercicios/lotes/[id]` +3.0 KB, `/exercicios/novo` and
  `/novo/avulso` +2.5 KB, `/minhas-atividades/[id]` +2.2 KB, `/trabalhos/[id]` +3.1 KB,
  `/trabalhos/novo` and `/trabalhos/gerar` +2.5 KB, `/turmas/[id]/atividades/[activityId]` and its
  `tentativas/[attemptId]` +1.4 KB, `/design-system` +2.7 KB.
- Accepted by the product owner on 2026-10-04: the contract field's bytes on pages without code meet
  SC-007's intent (no editor or highlighting code there).

## L13 — Tests in jsdom

**Decision**: the web tests polyfill what CodeMirror needs in jsdom (`Range.getClientRects`,
`getBoundingClientRect`, `document.createRange`) in `test/setup`; editor tests assert on the content
DOM and on `onChange` values, keyboard tests use the existing helpers; visual color checks are E2E.

## L14 — Design system documentation

**Decision**: `tokens.md` (syntax tokens), `components.md` (`CodeEditor` with the library, `CodeBlock`),
`exam-mode.md` (the 005 decision on the editor library taken here, the editor no longer a plain
textarea), the registry entry and showcase of `CodeBlock`, the `CodeEditor` showcase with Java, Python
and plain text; no `ds-exception`.
