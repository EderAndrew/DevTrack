# apps/web — architecture, design system and guards

Paths below are relative to `apps/web` unless they start with `apps/` or `packages/`.

## Architecture

- Design system (005): every visual value comes from `design-system/tokens.css` (semantic colors
  of one dark theme, the Vice City palette, type scale, radii, shadows, layers, breakpoints, motion, focus); the
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
- Official stack: Tailwind + shadcn/ui (`components/ui`) + Lucide; charts with Recharts through `components/ui/chart.tsx`
  (bars only, each above a table with the same numbers; colors `--chart-1` or the state colors, 006 amendment 2026-10-22); TanStack Query for server
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
  text is never altered (no auto-close, completion or re-indent while typing; only `\r\n` → `\n`), except
  that Enter indents the new line by the grammar (FR-007, amended 2026-10-27); code is never
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
- Invitation e-mail status (017): the class tab (`features/classes/components/class-invitations-tab.tsx`) and the
  teacher and manager lists show, only next to a PENDING invitation, `DeliveryStatus`
  (`features/invitations/components/delivery-status.tsx`): "Enviando", "Envio falhou", or the badge "Não entregue"
  with the reason in words (never colour alone), from the API's `delivery`/`deliveryIssue`; nothing once sent.
  "Reenviar" on an UNDELIVERED invitation (`ResendInvitationButton` in
  `features/invitations/components/resend-confirm-dialog.tsx`) first asks "Reenviar para o mesmo endereço?" ("Voltar"
  sends nothing). Account e-mails show no delivery status anywhere. The E2E `production-email.spec.ts`
  reads the Message-ID from Mailpit and posts a Resend bounce signed with `.env.e2e`'s `MAIL_NOTICE_SECRET`.
- Exams (018): `features/exams` is the Banco de Provas (`ExamBankList`, `ExamForm` with `ExamQuestionCard`, `ExamDetail`
  with "Aprovar" listing the questions that block it, `ExamGenerationForm` and `ExamGenerationRequestDetail` for "Criar prova
  com IA"), apart from the exercise and work banks. Applying is the 012 "Nova atividade" with the source "Prova":
  the coverage by topic and difficulty before confirming, duration, inactivity and start window, and no mode, help,
  release, deadline or late policy. `features/exam-session` is the teacher's side of an applied exam: the tab "Chamada
  e prova" is the 016 `AttendanceTab` whose room is `ExamRoomPanel` (each situation in words with the server's
  times, holds first, "Confirmar cancelamento" with the zero said before the click, "Devolver prova" only with
  `canReturn`, "Não cancelar" after the end, "Ver ocorrências", "Pausar aluno"), polled every `ATTENDANCE_POLL_MS`.
  `features/exam-attempt` is the student's exam: `ExamEntry` (`rules-screen.tsx`: the rules and "Li as regras e quero iniciar", which
  sends `acceptRules` and asks for fullscreen) and `ExamAttempt` on the focus page, the 015 `ControlledSession` with
  `ExamTimer`, `TimeAlert` (10 and 5 min), `FinalCountdown` (10 s), the server's "Aviso n de 3" in `WarningDialog`,
  `useInactivity` and the hold, pause, return and end notices. The time is the server's (`useExamClock` counts only
  from `serverNow`, never the browser's clock), and the end reads the activity again after the grace. The timer and
  the countdown live only in `features/exam-attempt` and `components/ui/assessment`
  (`apps/api/test/activities-boundary.spec.ts`). No exam text says "fraude", "cola" or "violação"
  (`test/exam-wording.test.ts` scans the three exam features and the Exam Mode components, comments aside).
- Code Runner (019, 021): `features/code-run` holds `CodeRunPanel` (mounted by `activity-answering.tsx` on any CODE
  question of the open attempt whose `execution` is filled — an EXERCISE, or since 021 a work with "Permitir executar o
  código", also on the CONTROLLED focus page — and hidden while paused or once submitted: "Executar" from the question's `execution`, the convention, version and limits,
  "Na fila"/"Executando" in a `role="status"` region, the other-question notice, the `429` wait from `Retry-After`),
  `CodeRunResult` (the summary "n de m casos públicos passaram", one collapsible case per public case with the verdict
  in words and an icon, the first failing case open, input, expected and obtained output and stderr in `CodeBlock`,
  the compiler message, the stale notice when the editor differs from the run's `sourceCode`) and `use-code-run`
  (the latest run of the question, polled every `CODE_RUN_POLL_MS` only while pending and the page is visible). The
  words live in `features/code-run/schemas/code-run.ts`; the convention arrives as a key. "Executar" never saves or
  concludes. 021: `CodeRunSummary` (`hooks/use-attempt-code-runs.ts`) is mounted by `attempt-review.tsx` on each CODE
  question when `activity.codeExecution`: "n execuções", "Última execução: …" and each case's verdict in words, never
  code or output; the apply form's "Permitir executar o código" (`work-options.tsx`) appears only for a work with
  `runnableCodeQuestionCount > 0`, with the availability warning. The bank's "Casos de teste" section is `features/exercises/components/exercise-test-cases.tsx`, with
  "Os alunos poderão executar o código." / "Sem execução nesta linguagem." next to the language.
- Student feedback (020): `features/feedback` holds `FeedbackDialog` (behind `SendFeedbackButton` at the bottom of the
  student menu in `components/layout/student-layout.tsx`, only with `feedbacks.enviar`; the `(focus)` layout has no
  menu, so never during an exam or a CONTROLLED work): React Hook Form with the contract schema, a `submissionId` from
  `crypto.randomUUID()` per opening (kept on a retry after a network failure), `originPath` = `location.pathname` only
  when it passes `OriginPathSchema` (else `null`), the counter "N de 2.000" in code points, the `429` wait from
  `Retry-After` with the text kept. `MyFeedbacks` (`/meus-feedbacks`), and for the ADMIN `AdminFeedbackList`
  (`/admin/feedbacks`, filters in the URL `?situacao=&categoria=` as slugs, "Carregar mais") and `AdminFeedbackDetail`
  (only the buttons of the allowed transitions; a `409` refetches). The menu item "Feedbacks" (`feedbacks.visualizar`)
  carries the RECEIVED badge, named "Feedbacks, N novos", refetched on focus and invalidation, never polled. Words in
  `features/feedback/schemas/`; the message is always text.

## Guards

- `test/student-portal-xss.test.tsx` (012/FR-035): answers, titles and feedback with HTML render
  as text (since 013 also the exercise result, the teacher's marks and the ranking names; since
  014 code with HTML in the editor and in `CodeBlock`; since 015 the student's question to the AI, the
  orientation and its example on both screens; since 016 the note of "Outro" on the room panel, in the review, on
  the paused notice and in the history; since 018 the Banco de Provas form, the student's exam and the teacher's
  exam room; since 019 the run's output, stderr, compiler message and public cases (021: also on a work, and the
  teacher's run summary); since 020 the feedback message and
  the student's name in "Meus feedbacks" and the ADMIN's list and detail), and no `dangerouslySetInnerHTML` in the 012
  features, `features/ranking`, `components/ui/assessment`, `components/ui/code`, the banks,
  `features/controlled-attempt`, `features/work-help`, `features/attendance`, the three exam features,
  `features/code-run` or `features/feedback`.
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

## E2E commands (moved from the root CLAUDE.md)

Own API :4100 + web :3100, DB `devtrack_e2e` reset each run, e-mails via Mailpit; since 019 also the real Code
Runner worker (`dist/code-runner/main.js`, Docker with `runc`), so Docker must be running with the pinned images. Local only (not in CI);
`e2e/prepare-db.ts` runs `prisma migrate reset`, which needs the user's consent under an AI agent.

```bash
docker compose up -d postgres-test mailpit
pnpm build                                              # the E2E API runs apps/api/dist
pnpm --filter api code-runner:images                    # 019, first time only: code-runner.spec.ts runs real programs
pnpm --filter web exec playwright install chromium      # first time only
pnpm --filter web test:e2e
pnpm --filter web test:e2e work-bank                    # one spec by path regex; the admin → teacher setup projects still run first
```
