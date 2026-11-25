# Research: "Minhas turmas" do aluno redesenhada (030)

Decisions carry the prefix **MT**.

## MT1 — `enrolledAt` on the turma of `GET /me/classes`, no new route

- **Decision**: add `enrolledAt` (ISO date-time, the `enrollments.enrolled_at` of the student's ACTIVE enrollment) to
  `MyCohortSchema`. `MyClassesService.list` already reads one ACTIVE enrollment per turma and orders by `enrolledAt`; it
  only selects the column and copies it. No new route, no parameter, no migration.
- **Rationale**: the enrollment is the turma's (027), so the date belongs to the turma, not to each disciplina; one field
  serves every card of the turma (spec edge case). The route is scoped by the session (`studentUserId = userId`,
  `status = ACTIVE`), so the date is always the student's own (US3).
- **Alternatives considered**: a field per disciplina (`MyCohortClass.enrolledAt`) — repeats the same value and suggests
  a per-subject enrollment that does not exist; a new route `GET /me/enrollments` — a second request for one column.

## MT2 — Search and year filter on the client, over the received list

- **Decision**: the year (`?ano=`) and the search (`?busca=`) live in the address and filter in the browser, in a pure
  function (`filterSubjectCards`) over the cards derived from `MyCohortList`. The route takes no parameters.
- **Rationale**: the list has no pagination and is small (the enrollments of one student; SC-003 asks for ≤ 50
  disciplinas); every card already arrives, so counting and filtering in the browser is exact (no "first page only"
  problem, unlike 028), needs no API input validation and keeps the response the same for the other consumers
  (026 card, 028 filter, ranking).
- **Alternatives considered**: server-side `academicYear`/`q` like 028 — new untrusted input and redaction for a list
  that is fully received anyway.

## MT3 — One card per disciplina, derived by a pure function

- **Decision**: `subjectCards(list)` (in `features/my-classes/schemas/my-classes.ts`) flattens `years → cohorts →
  classes` into cards in the API's order (ano desc, enrollment desc, disciplina by creation), each with the turma's
  fields, `enrolledAt` and the class; a turma without disciplinas yields one card with `classId: null`. The existing
  `mySubjectClasses` (026/028 consumers) stays untouched.
- **Rationale**: the order is already the server's (FR-002); one pure function makes the count, the footer and the
  filters testable without React.

## MT4 — Search matching

- **Decision**: trim, then "contains" over the turma's name and code and the disciplina's name, case- and
  accent-insensitive (`normalize("NFD")` without combining marks, `toLocaleLowerCase("pt-BR")`); empty after trim = no
  search; the input caps at 100 characters (`maxLength`), and a longer `busca` in the address is cut to 100.
- **Rationale**: the same rule the 028 search uses on the server, so both searches behave alike; the teacher's name is
  not searched (the placeholder says "turma ou disciplina").

## MT5 — Year in the address

- **Decision**: `ano` = a four-digit year among the student's years, or `todos`; absent, malformed or unknown → the most
  recent year (FR-010), with `router.replace` writing nothing (no redirect loop). The "Ano letivo" card shows the
  chosen year, or the most recent with `todos`.
- **Rationale**: an old link must never empty the screen; the most recent year is the spec's default.

## MT6 — Layout and components

- **Decision**: `PageHeader` with `description` (subtitle) and `actions` (the "Ano letivo" card), rendered inside the
  client component `MyClasses` because the chosen year comes from the client query and the address (the page keeps
  only the session and permission check); `Tabs` with one tab
  "Todas as turmas" and its count; `Input type="search"` with the magnifier and `NativeSelect` "Ano"; each card a `Card`
  with a two-column grid (data | ranking panel) that stacks below `md`; `Badge` for the code and the status; Lucide
  icons `User`, `CalendarDays`, `BookOpen`, `Clock`, `Trophy`, `ArrowRight`, `Search`, all `aria-hidden` with visible
  text beside. Dates through `formatDateTime` ("07/11/2026, 18:08", Brasília).
- **Rationale**: only Design System components and tokens (FR-014); the existing 028 toolbar is the model (tabs with
  count, search, native select), so the two student screens look alike.
- **Alternatives considered**: keeping the table — what the reference replaces and what overflows on phones.

## MT7 — Accessible names of repeated actions

- **Decision**: "Acessar turma" and "Ver ranking" keep their visible text, with `aria-label` "Acessar <disciplina ·
  turma>" and "Ver ranking de <disciplina · turma>" (the 027 `mySubjectLabel`); each card is an `article` labelled by
  the disciplina heading (`h2`).
- **Rationale**: FR-005 — several cards repeat the same buttons; screen-reader users need to tell them apart.
