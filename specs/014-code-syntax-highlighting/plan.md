# Implementation Plan: 014 — Realce de Sintaxe do Código

**Branch**: `014-code-syntax-highlighting` | **Date**: 2026-10-03 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/014-code-syntax-highlighting/spec.md`

## Summary

Code gets syntax colors wherever a Código question shows it — the student's editor (Trabalho and
Exercício), the 013 answer key, the teacher's attempt review and activity detail, and the exercise and
work banks (forms, AI drafts, "Ver como aluno"). The 005 decision on the editor library is taken here:
CodeMirror 6 for editing, its Lezer parsers for read-only code rendered as React `<span>`s (no
`dangerouslySetInnerHTML`). Each catalog language gets a grammar key as data
(`programming_languages.highlight`, seeded: frameworks map to the language they're written in), every
language object in the API responses carries it, and a web registry maps grammar keys to lazy
loaders. Colors are nine new semantic tokens with light/dark values (all ≥ 4.5:1) and a forced-colors
fallback; the editor's theme uses only tokens. CodeMirror loads on demand: the answering screen shows
the current textarea at once and swaps to the colored editor when the chunk arrives (or stays a
textarea if it fails). Nothing typed is changed (no auto-close, auto-indent, completion or lint);
autosave, offline buffer, submission and conclusion are untouched.

## Technical Context

**Language/Version**: TypeScript 7 on Node.js 24 LTS
**Primary Dependencies**: web: Next.js 16, React 19, React Hook Form 7, shadcn/ui, Lucide; **new**:
`@codemirror/state`, `@codemirror/view`, `@codemirror/language`, `@codemirror/commands`,
`@lezer/highlight`, `@codemirror/lang-{java,python,javascript,cpp,php,rust,go,html}` (all MIT,
research L1); API: NestJS 11, Prisma 7, Zod 4 (`@repo/contracts`)
**Storage**: PostgreSQL 17 — one migration: `programming_languages.highlight` (text NULL, CHECK) + seed
**Testing**: Vitest + Testing Library + `vitest-axe` + keyboard helpers (CodeEditor, CodeBlock, grammar
registry, theme-uses-tokens, contrast pairs, design-system guards, XSS); API integration for the column
and the views' `highlight` (student allowlists included); contracts guards; Playwright E2E of colors,
keyboard, 360 px and timings
**Target Platform**: browser (student phone/desktop, teacher), Linux server (API)
**Project Type**: web app + web service (pnpm/Turborepo monorepo)
**Performance Goals**: answering screen ready to type ≤ 300 ms more than today; ≤ 50 ms per keystroke at
10 000 characters; no extra JS on pages without code (spec SC-004, SC-007)
**Constraints**: text never altered (only the textarea's existing CRLF→LF); no HTML from code; colors
only from tokens; no language as a code conditional (catalog data); no execution, completion, lint or
formatting
**Scale/Scope**: 1 migration (1 column), 7 contract shapes + their API views, 2 design-system
components (1 new, 1 rewritten), 9 tokens, ~11 screens switched, 1 E2E

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] **I. Security**: code from students, teachers and AI rendered only as React text (L4); no
  `dangerouslySetInnerHTML`; `highlight` never accepted from clients (strict bodies); new packages
  audited (L11)
- [x] **II. RBAC**: no protected operation added or changed; screens keep their permissions and context
- [x] **III. Server authority**: autosave, revisions, offline buffer, submission and conclusion unchanged
  (the editor reports the same `onChange` stream, L6)
- [x] **IV. Untrusted code**: nothing executes code; highlighting only parses text in the browser
- [x] **V. Data integrity**: one Prisma migration, nullable column with a format CHECK, idempotent seed
- [x] **VI. Audit & logs**: no audited operation changes; nothing new logged
- [x] **VII. Tests**: unit, integration and E2E for every rule touched (text round trip, XSS, contrast,
  keyboard, fallback, catalog mapping, student allowlists)
- [x] **VIII. Layering**: no business rule in components; the grammar comes from the API data
- [x] **IX. Simplicity**: the one new dependency family is required by this spec (005 deferred the
  library to a spec); lazy-loaded, no infrastructure; justified in `DEPENDENCIES.md`
- [x] **X. Evidence**: N/A — no events or conclusions
- [x] **XI. Human oversight**: N/A — presentation only
- [x] **XII. Determinism first**: deterministic parsing; no AI
- [x] **XIII. Risk level**: N/A — no automated operation
- [x] **XIV–XV. AI governance**: N/A
- [x] **XVI. Explicit states**: N/A — no workflow
- [x] **XVII. Idempotency**: unchanged (012/013)
- [x] **XVIII. Safe interruption**: N/A; a failed chunk load degrades to the textarea (L6)
- [x] **XIX. AI evals**: N/A
- [x] **XX. Pedagogy**: N/A
- [x] **XXI. Configurable domain**: the grammar of each language is catalog data (L3); the web registry
  lists the library's grammars, never the catalog's languages; a language without a grammar works
  uncolored
- [x] **XXII. Personalization & accessibility**: WCAG AA contrast for every syntax color in both themes,
  forced-colors fallback, screen reader reads text, keyboard-only and touch use (L5, L7)
- [x] **XXIII. Curricular traceability**: N/A — snapshots unchanged (`language_id` kept)
- [x] **XXIV. Academic isolation**: unchanged; no new data exposed (the grammar key is not an answer key)
- [x] **XXV. Privileged provisioning**: N/A
- [x] **XXVI. Shared contracts**: one `CodeHighlightSchema` in `@repo/contracts`, reused by every language
  shape; API views return it; no duplicated type in web
- [x] **Frontend stack**: Tailwind tokens, shadcn/ui and Lucide unchanged; CodeMirror fills the editor slot
  the 005 spec left open, inside `components/ui` (not a replacement of any stack element)

## Project Structure

### Documentation (this feature)

```text
specs/014-code-syntax-highlighting/
├── plan.md
├── research.md            # L1–L14
├── data-model.md
├── quickstart.md
├── contracts/{http-api.md, design-tokens.md, web-ui.md}
├── checklists/requirements.md
└── tasks.md               # /speckit-tasks
```

### Source Code (repository root)

```text
apps/api/
├── prisma/{schema.prisma, migrations/<ts>_code_highlight/}         # L3
├── src/modules/exercises/{exercise-query?,views/*,programming-languages*}  # select + copy `highlight` (L8, L10)
├── src/modules/works/views/*                                       # idem
├── src/modules/activities/views/{rows,teacher-view,student-view}.ts# idem
└── test/
    ├── integration/014-highlight.spec.ts                           # catalog seed, views (teacher and student)
    ├── security/{010,011,012}-student-view.spec.ts                 # allowlists still exact (+ highlight)
    └── traceability.spec.ts                                        # SPECS += 014
packages/contracts/src/common/code-highlight.ts                     # CodeHighlightSchema (L8)
packages/contracts/src/exercises/programming-languages.ts           # + highlight
packages/contracts/src/{exercises/exercises,works/works,activities/teacher,activities/student}.ts
apps/web/
├── package.json                                                    # CodeMirror packages
├── eslint.config.js                                                # no static @codemirror/@lezer imports (L6)
├── design-system/{tokens.css,tokens.md,components.md,exam-mode.md} # L5, L14
├── components/ui/code/{code-editor,code-block,grammars,highlighter,editor-theme,load-editor}.ts(x)   # new home
├── components/ui/assessment/{answers,code-editor}.tsx              # CodeAnswer uses the new editor; re-export
├── features/design-system/{registry.ts,components/*-showcase.tsx}
├── features/student-activities/components/{activity-answering,exercise-result}.tsx
├── features/activities/components/{attempt-review,activity-questions}.tsx
├── features/exercises/components/{exercise-form,draft-editor,exercise-parts}.tsx
├── features/works/components/{work-question-card,student-preview}.tsx
├── test/{setup (jsdom polyfills), contrast.test.ts, keyboard.ts, student-portal-xss.test.tsx}
└── e2e/code-highlighting.spec.ts
DEPENDENCIES.md, README.md, CLAUDE.md
```

**Structure Decision**: the editor and the read-only block are foundational design-system components
(`components/ui/code/`), consumed by the 010–013 features; the API change is data and view fields only.

## Complexity Tracking

No violation. The new dependency family is required by this spec (constitution IX allows it with a
spec-backed need) and fills the editor-library decision the 005 spec deferred.
