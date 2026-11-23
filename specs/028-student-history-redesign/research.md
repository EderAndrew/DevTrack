# Research: Histórico do aluno redesenhado (028)

Decisions carry the prefix **HI** (histórico): the single letters left unused (I, O) read like digits.

## HI1 — A new read route, `GET /me/history`, instead of new parameters on `GET /me/activities`

- **Decision**: the history gets its own route, `GET /me/history`, with its own query (`tab`, `q`, `classId`, `cursor`,
  `pageSize`) and its own page shape (items + `total` + `tabCounts` + `totals`). `GET /me/activities` and its schemas
  stay byte-for-byte as they are (spec FR-016, SC-005); the web's Histórico stops calling it.
- **Rationale**: the history orders by delivery date (newest first) while the list orders by deadline, splits by a
  situation the list doesn't have (aguardando/corrigida), searches, and answers counts with the page. Bolting all of
  that onto `/me/activities` would change its cursor meaning per parameter and grow its response for every caller
  ("Minhas atividades", the Painel's links, E2E). A separate route keeps each contract simple (IX) and the 012/026
  tests untouched.
- **Alternatives**: extra optional params on `/me/activities` (`order`, `situation`, `q`, `withCounts`) — rejected:
  two orderings behind one cursor, a response whose shape depends on a flag; a separate counts route
  (`/me/history/summary`) — rejected: two requests that can disagree mid-poll; one response is consistent.

## HI2 — The data comes from the existing scoped loader, filtered and counted in memory

- **Decision**: `MyActivitiesService.history` reuses `summaries(userId, now, classId)` (the 026 path: ACTIVE-enrollment
  check → `examSettlement.ofStudent` → `StudentActivityLoader.loadAll` → `toStudentSummary`), keeps the delivered ones
  (status `SUBMITTED`, `GRADED`, `COMPLETED` — today's history), derives each one's situation and delivery date, then
  counts, searches, sorts and pages in memory.
- **Rationale**: every visibility rule (012 scope, 016 presence, 018 settlement, 023 group participants, result only
  after release) already lives in that path; a second SQL path would have to repeat them (VIII). `dashboard` and
  `list` already work this way. A student has tens to a few hundred activities; SC-004 (≤ 2 s with 500 deliveries) is
  far inside what one scoped query + an in-memory pass does.
- **Alternatives**: SQL `COUNT … FILTER` + `ILIKE unaccent` — rejected: duplicates the derived statuses (released,
  grading complete, exercise awaiting correction) in SQL, needs the `unaccent` extension (a migration and a new
  database dependency) and would drift from the summaries.

## HI3 — Situation: `GRADED` only when the student can see the result

- **Decision**: a pure `historySituation(summary)` in `student-activities/history.ts`:
  - ASSIGNMENT/EXAM → `GRADED` when `summary.result !== null` (released ∧ grading complete ∧
    `notas.proprias.visualizar`, the same gate as the grade), else `AWAITING`;
  - EXERCISE (status `COMPLETED`) → `AWAITING` when `points.awaitingCorrection`, else `GRADED`.
  `delivered = awaiting + graded` always (FR-002).
- **Rationale**: deriving from `result` (not from the status `GRADED`) means a student without
  `notas.proprias.visualizar` never sees "corrigida" counted (spec US4-3) and a released-but-incomplete correction stays
  awaiting (US4-2), with no new rule: it is exactly the 012 visibility (`resultVisible`). The exercise mapping is the
  spec's assumption (013 "Pontos aguardando correção").
- **Pill**: in the history the pill follows the situation, not the 012 status: GRADED → "Corrigida", AWAITING →
  "Entregue" ("… com atraso" when late), EXERCISE → "Concluída". The pill, the tab and the cards never disagree (spec
  FR-010, US4-3); "Minhas atividades" and the activity page keep the 012 labels.

## HI4 — Delivery date: the submission, or the exercise's first conclusion

- **Decision**: `deliveredAt` = `submission.submittedAt` for ASSIGNMENT/EXAM (group work: the group's submission, as
  today); for EXERCISE, the `completedAt` of attempt 1 (the conclusion that scores, 013). The loader's attempt rows
  already select `completedAt`; `StudentActivityInput` gains `firstCompletedAt: Date | null` and the history item
  carries `deliveredAt` (ISO).
- **Rationale**: the summary's `submittedAt` is null for exercises (no submission row), so today's history can't
  order them; attempt 1 is the one the student's points come from.

## HI5 — Order and cursor: `deliveredAt` desc, then id

- **Decision**: sort by `deliveredAt` descending, ties by `id` ascending; the cursor is the existing opaque keyset
  (`platform/database/keyset.ts`) over `{ name: deliveredAt ISO, id }`, read as "strictly after this key in this
  order". The cursor is only meaningful with the same `tab`, `q` and `classId` (as 026's).
- **Rationale**: stable across pages and polls (no repeats or skips when two deliveries share a timestamp, spec edge
  case); same helper as every keyset list.

## HI6 — Search: contains, case- and accent-insensitive, in code

- **Decision**: `q` is trimmed by the schema; empty after trim = no search; max 100 characters (code points), no NUL
  (`400` otherwise). Matching: `normalize(title).includes(normalize(q))` with `normalize = s.normalize("NFD")
  .replace(/\p{M}/gu, "").toLocaleLowerCase("pt-BR")`. Only the activity title (spec Assumptions).
- **Rationale**: plain substring on normalized text — no regex built from input, no SQL, no new dependency (I, IX).
- **Logging**: `q` travels in the query string, and pino-http's default request serializer logs `req.url` with it
  (`platform/logging/logging.module.ts` redacts headers and fields, not query values). The spec keeps the search out of
  the logs, so the logging module gets a `serializers.req` wrapper that replaces the value of the `q` query parameter
  in `req.url` with `[REDACTED]` (any route; today no other route uses `q`), and `REDACT_PATHS` gains `req.query.q`
  (the default serializer also logs the parsed `req.query`, found in T022). Tested with the module's capturable
  `destination`, like the 001 secret scan. No audit event exists to carry it (HI10).
- **Alternatives**: `POST /me/history/search` with the text in the body — rejected: a read as POST needs `Origin` +
  JSON and breaks the GET cache/poll model; dropping every query string from the logs — rejected: a cross-cutting
  change to the 001 logging nobody asked for.
- **Scope**: the beta's nginx access log (`deploy/hostinger`) records the full URI; it is out of scope (spec Security:
  "logs da aplicação"), noted for the deploy guide if it ever matters.

## HI7 — What each count respects

- **Decision**: `totals` (the cards) = by `classId` only; `tabCounts` (`all`, `awaiting`, `graded`) = by `classId` and
  `q`; `items`, `nextCursor` and `total` (the "M") = by `classId`, `q` and `tab`. `total` equals the matching
  `tabCounts` entry.
- **Rationale**: spec FR-007; the cards describe the student's situation in the matéria and must not jump while typing.

## HI8 — `classId` as in 026

- **Decision**: `classId` (UUID, `400` if malformed) goes through the same `assertActiveEnrollment` (ACTIVE enrollment
  in the class's cohort, 027) → `404 NOT_FOUND`, identical for another student's class, an ended enrollment and an
  unknown class; not audited (026 D2). The web's filter options come from `GET /me/classes` (ACTIVE enrollments, label
  "<disciplina> · <turma>", the 026 `baseSubjectLabel`/disambiguation).
- **Stale context**: a `404` for the chosen class (enrollment ended while open) → the web invalidates "Minhas turmas",
  drops the class and falls back to "Todas as matérias" with "Essa matéria não está mais disponível para você."
  (FR-014, the 026 `SUBJECT_UNAVAILABLE`), the 026 D6 pattern.
- **Naming**: the filter is "Matéria" (the 026 word for a class of the student), not "Turma" as in the image: since 027
  "turma" is the MANAGER's cohort and a class is the disciplina da turma (spec Assumptions).

## HI9 — Web: one feature component, address-held state, Design System parts

- **Decision**: `StudentHistory` is rewritten in `features/student-activities/components/student-history.tsx` (the
  screen exits/pauses/occurrences helpers in that file stay). State in the address: `?aba=aguardando|corrigidas`,
  `?busca=`, `?materia=<classId>` (Portuguese slugs; `materia` as in 026); the search box updates the address
  after a 300 ms pause or on Enter (no request per keystroke). Parts: three summary cards (the `Card` pattern of
  "Minhas atividades"' `GradeSummaryCards`), `Tabs` (Radix, roving focus, the count inside each trigger's accessible
  name), `Input type="search"` with a label, `NativeSelect` "Matéria", `Table` on ≥ md and a card list below md (no
  horizontal scroll at 360 px), `Status` pill, `Badge` type/"Com feedback", `Progress` for the grade (value clamped
  0–100, `aria-label` "Nota 1,80 de 3,00"), `ChevronRight` link with an accessible name "Abrir <título>". "Carregar
  mais" stays (TanStack `useInfiniteQuery`, key includes `tab`, `q`, `classId`); the 5 s visible-page poll of the
  student lists (`POLL_WHILE_VISIBLE`) applies.
- **Rationale**: constitution frontend stack and the design-system rule (no recreated control); native select and Radix
  tabs are keyboard/screen-reader complete; the address keeps the choice across reload/back/share (FR-013).
- **Dates**: "13 de novembro" and "Sexta-feira, 16:47" from new `formatDayMonth`/`formatWeekdayTime` in
  `lib/messages/dates.ts`, in the browser's time zone like `formatLongDateTime`.

## HI10 — Out of scope

- No migration, permission, audit event, mobile change, menu or sidebar change; the image's "Biblioteca", "Mensagens",
  bell and "Todas as entregas" are not built. The activity page and the result's first-view audit stay as they are
  (the history never marks a result viewed).

## HI11 — Amendment 2026-11-23: "não entregue" (`MISSED`) is derived from the facts the list already has

- **Decision**: a pure `isMissed(facts)` next to `historySituation` in `student-activities/history.ts`: no delivery
  (`submission === null` for ASSIGNMENT/EXAM, no attempt-1 conclusion for EXERCISE) ∧ `canAnswer(facts) === false`
  (012 `status/operations.ts`: CLOSED, class or turma not effectively ACTIVE, deadline passed under REJECT, exam start
  window closed) ∧ not an EXAM with an open hold (the list's facts now carry `onHold`, read in one query of the
  student's open holds). A 016 pause doesn't change `canAnswer` (the deadline never moves for a pause), so a paused
  attempt is missed exactly when an unpaused one would be. `StudentHistorySituation`
  gains `MISSED`; the item's `deliveredAt` becomes nullable (null only for `MISSED`) and a `missedAt` (non-null only for
  `MISSED`) carries the moment it stopped accepting: the earliest of the deadline (REJECT, passed), the activity's
  `closedAt`, the exam's start-window end, and the class's or turma's `statusChangedAt` when not ACTIVE. The order key
  is `deliveredAt ?? missedAt` (HI5 otherwise unchanged; the cursor encodes that key).
- **Rationale**: `canAnswer` is already the single rule of "can the student still start or continue" used by the list's
  action; reusing it keeps the two screens complementary (`028/SC-008`). Holds and pauses are excluded because the
  activity is still in course for the student (018 FR-019).
- **Alternatives considered**: storing a "missed" flag (rejected: statuses are derived on every read); using the 012
  `OVERDUE` status (rejected: it includes overdue work that still accepts a late submission).

## HI12 — Amendment 2026-11-23: counts

- **Decision**: `totals` stays the three cards of deliveries (MISSED never counts there); `tabCounts` gains `missed`, and
  `all = awaiting + graded + missed`; `total = tabCounts[tab ?? all]` as before. The whole-page empty state ("Você ainda
  não entregou nenhuma atividade.") shows only when `totals.delivered === 0` and `totals.missed === 0` (`missed`, a new
  field of `totals` the cards ignore, by `classId` only).
- **Rationale**: spec FR-004, FR-015, FR-024; the cards keep meaning "what I delivered".

## HI13 — Amendment 2026-11-23: "Minhas atividades" and the Painel

- **Decision**: `MyActivitiesService.list` drops every input that is delivered (SUBMITTED, GRADED, COMPLETED) or
  `isMissed`, before the status filter and the cursor; `StudentActivityFilterSchema` loses `COMPLETED` (a request with
  it → `400`, FR-023). `dashboard`: `counts.overdue` = the overdue that still accept a submission (`overdueOpen` before
  the `DASHBOARD` cut, so the number matches the list); `counts.completed` keeps counting the deliveries (SUBMITTED,
  GRADED, COMPLETED) and the web card links to `/historico?materia=`. Pending/in-progress counts and the lists don't
  change. The web drops the "Entregues/concluídas" option; an old `?situacao=concluidas` reads as "Todas"
  (unknown slug, as today).
- **Rationale**: spec FR-023, FR-025; filtering in the service keeps paging and counts on the server (no page with
  holes), and the 012 status derivation stays untouched.
- **Alternatives considered**: hiding them only in the web (rejected: pages would come back short and counts would
  disagree with the list).

