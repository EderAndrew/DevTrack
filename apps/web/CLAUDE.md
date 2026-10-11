# apps/web — architecture, design system and guards

Paths below are relative to `apps/web` unless they start with `apps/` or `packages/`.

## Architecture

- Design system (005): every visual value comes from `design-system/tokens.css` (semantic colors
  with light and dark values, type scale, radii, shadows, layers, breakpoints, motion, focus); the
  Tailwind default scales are reset there, so `bg-red-500`, `text-2xl` or `shadow-lg` generate no
  CSS. Layers: tokens → `components/ui` (foundational components) → `components/layout` →
  `features` → `app` (ESLint-enforced). `components/layout` holds `AppShell` (side menu, `Topbar`,
  `main#conteudo`), `PageHeader` (every page's `<h1>`), `StudentLayout` and `accountLayoutFor`.
  Route groups only choose the frame, never the URL: `app/(app)` AppShell, `app/(student)` student
  layout, `app/(account)` either one by `STAFF_AREA_PERMISSIONS` (menu permissions, never role
  names), `app/(catalog)/design-system` the visual catalog (built from
  `features/design-system/registry.ts`; `notFound()` in production), `app/(focus)` the controlled
  mode's frame (015, no menu or topbar: `minhas-atividades/[id]/responder`, the page brings its own
  header with "Sair"). Docs: `README.md`,
  `tokens.md`, `components.md`, `layouts.md`, `exam-mode.md` and `exceptions.md` in
  `design-system/`.
- Official stack: Tailwind + shadcn/ui (`components/ui`) + Lucide; TanStack Query for server
  state; React Hook Form + `@hookform/resolvers`; native `fetch` only in `lib/api/client.ts`. Redux
  Toolkit is not installed: add it only with the first spec that has real global client state, and
  never make it authoritative over exam rules. Code goes in
  `features/<feature>/{api,components,hooks,schemas,store,types}`, with `app/` at the root (no
  `src/`). Components call hooks, hooks call `features/*/api`, and only that layer touches
  `lib/api` (ESLint-enforced). User-facing error text comes from the catalog in
  `lib/messages/error-messages.ts`, keyed by the API error `code`.

## Rules that are easy to get wrong

- UI only with Design System tokens and components: no literal colors, sizes, spacing steps,
  radii, shadows or fonts, and no recreated controls. An exception needs a
  `ds-exception: <reason>` marker on (or just above) the line and a row in
  `design-system/exceptions.md`. Destructive actions use `variant="danger"` with explicit text;
  states never rely on color alone.
- Code highlighting (014): colors only through the eight `--syntax-*` tokens (`text-syntax-*`, with
  a `forced-colors` rule) and the editor theme only through `var(--…)`; the web knows grammar keys
  (`components/ui/code/grammars.ts`), never a language of the catalog (the link is the
  `highlight` column); `@codemirror/*` and `@lezer/*` are imported statically only in
  `components/ui/code/load-*.ts` (ESLint), everything else reaches them by `import()`; the typed
  text is never altered (no auto-close, completion or auto-indent; only `\r\n` → `\n`); code is never
  rendered as HTML. Form fields use `CodeEditor` named by `aria-labelledby` (`fieldLabelId`); Tab
  indents inside it and Esc then Tab leaves (the `test/keyboard.ts` helpers do that).
- Controlled mode and AI help (015): monitoring lives only in `features/controlled-attempt` (the pure
  `focus-reducer.ts`, `use-focus-monitor`, `use-fullscreen`, `use-leave-guard`, `use-clipboard-block`,
  and `use-integrity-events` with the offline queue in `store/pending-events.ts`) and in
  `components/ui/assessment`; `features/activities`, `features/student-activities` and
  `features/work-help` never listen to focus, fullscreen or the clipboard
  (`apps/api/test/activities-boundary.spec.ts`). Copy, cut, paste and drop are blocked by capture-phase
  document listeners and, in the code editor, by `CodeEditor`'s `blockClipboard` (passed through
  `CodeAnswer`), fixed while mounted; nothing is ever read from the clipboard and typed text is never
  altered. Event times shown to anyone come from the server's `recordedAt` ("Estamos registrando este
  evento" until it arrives); no text calls an exit fraud or a violation. The AI help (`QuestionHelp`,
  `HelpGuidance`) shows the orientation as text and its example in `CodeBlock`; whether a help is used,
  pending or refused comes from the API.
- Attendance (016): `features/attendance` holds the "Chamada" (`AttendanceTab`: the checklist with "Marcar todos" and
  a confirmed "Liberar para os presentes" that sends only the differences, then `RoomPanel` with each student's
  situation in words, "Marcar presente", "Desmarcar", "Liberar retorno" and "Pausar aluno"), `ExitRoomDialog` ("Sair
  da sala", the closed list of reasons, "Outro" with up to 200 characters) and `PausedNotice` (no questions while
  paused, "Retomar" after the release; CONTROLLED goes back to fullscreen only on the student's gesture). The room,
  the student's dashboard and list and the open pause are polled every `ATTENDANCE_POLL_MS` (5 s) only while the
  page is visible; there are no WebSockets. The answering page reads the pause from the activity and a
  `409 ATTEMPT_PAUSED` on save, so a pause opened elsewhere (another device, the teacher) takes the questions off
  the screen. Exercises never show "Chamada" or "Sair da sala".

## Guards

- `test/student-portal-xss.test.tsx` (012/FR-035): answers, titles and feedback with HTML render
  as text (since 013 also the exercise result, the teacher's marks and the ranking names; since
  014 code with HTML in the editor and in `CodeBlock`; since 015 the student's question to the AI, the
  orientation and its example on both screens; since 016 the note of "Outro" on the room panel, in the review, on
  the paused notice and in the history), and no `dangerouslySetInnerHTML` in the 012
  features, `features/ranking`, `components/ui/assessment`, `components/ui/code`, the banks,
  `features/controlled-attempt`, `features/work-help` or `features/attendance`.
- `test/keyboard.ts` (`expectTabOrder`, `tabTo`, `expectFieldErrorLinked`) backs the `SC-012`
  keyboard tests in each page's test file.
- `test/lint-boundaries.test.ts` runs the real ESLint config to pin the layer rules, and
  `test/contrast.test.ts` checks the token pairs of `tokens.css` for WCAG AA in both themes.
- Design system (`test/design-system/`): `token-usage.test.ts` fails with file:line on any color,
  font size, spacing step, radius, shadow, font family, breakpoint or icon size outside the tokens
  (rule `valores`) and on a `<button>`, `<select>`, `<textarea>`, `<table>`, checkbox or radio
  recreated outside `components/ui` (rule `controles`), and keeps the `ds-exception` markers equal
  to `exceptions.md`; `identity.test.ts` pins fonts and icons (Lucide only, `font-mono` only in
  `components/ui`); `docs.test.ts` checks that every token, catalog entry and Exam Mode component
  is documented; `features/design-system/components/catalog.test.tsx` runs axe and Tab over the
  whole catalog. A new foundational component needs a registry entry, a showcase and a
  `components.md` section.
- E2E AI flows (007 POO analysis, 010 `exercise-bank.spec.ts` and 011 `work-bank.spec.ts`, each
  replaying its generator's `sql-joins-sem-linguagem` case) run against `e2e/openrouter-mock.ts`,
  the local mock of OpenRouter's chat completions that the E2E API's `OPENROUTER_BASE_URL` points
  to (`MOCK_PRIMARY_DOWN=1` answers 503 to the primary model; `MOCK_PRIMARY_MODEL` defaults to the
  catalog's cheapest BASIC id).
