# Research: Calendário com tipos de data e calendário do aluno (031)

Decisions carry the prefix **CK** (Calendar Kinds).

## CK1 — Where the kinds live: meetings keep being the encontros, plus one table for the other days

- **Decision**: `class_meetings` keeps meaning "encontro" and gains `kind` (`CLASS`, `EXAM`, `ASSIGNMENT`, `REVIEW`,
  `MAKEUP`; default `CLASS`) and `description`. A new table `class_calendar_days` holds the four kinds that are not
  encontros (`HOLIDAY`, `RECESS`, `SPECIAL_EVENT`, `TEACHER_ABSENCE`) with their texts. A date of a class lives in at most
  one of the two tables.
- **Rationale**: every reader of 004–030 that needs "the aulas" (meeting numbers, topic MOVE targets, coverage, plan view,
  US9 completion, the 007 proposal's meeting count, the period guard) reads `class_meetings` and stays correct without a
  single new filter (FR-002, FR-025, SC-007). Turning a meeting into a non-meeting day is then exactly the 004 removal
  (FR-029 resolutions, then delete) plus one insert, so no new topic path exists (SC-003).
- **Alternatives considered**: (a) one table with all nine kinds — every meeting reader must learn to filter, and a missed
  filter offers a feriado as an aula; (b) the Falta as a `CANCELLED` meeting — still a meeting row for every reader, and
  topics would stay attached to a day that has no class. Both rejected.

## CK2 — One mark per date across the two tables

- **Decision**: the calendar save runs under the existing owned-class lock (`lockOwnedClass`) and checks the date in both
  tables; DB defense: a `BEFORE INSERT OR UPDATE OF … ` trigger on each table refuses a date the other table has for the
  same class. `UNIQUE (class_id, day_date)` on the new table, as `UNIQUE (class_id, meeting_date)` today.
- **Rationale**: Postgres has no cross-table UNIQUE; the lock already serializes saves of one class, the trigger guards
  any other writer.
- **Alternatives considered**: a third "calendar date" table both point to — more joins for every 004 reader; rejected.

## CK3 — The save request: today's `add`/`remove` plus `set`

- **Decision**: `PUT /classes/:id/meetings` keeps `planRevision`, `add` (dates → `CLASS`, no effect on an existing date),
  `remove` and `resolutions`, and gains `set: CalendarDayInput[]` (default `[]`): an entry per date with the kind and its
  texts, a discriminated union by `kind`. A date appears at most once across `add`, `set` and `remove` (`400`).
  `set` on:
  - an unmarked date → creates the meeting or the day;
  - a meeting with a meeting kind → updates `kind`/`description` (topics kept, FR-008);
  - a meeting with a non-meeting kind → the meeting is removed as in 004 (its non-archived topics need resolutions, else
    `409 MEETING_HAS_TOPICS`), then the day is created;
  - a day with a meeting kind → the day is deleted, the meeting created;
  - a day with a non-meeting kind → its kind/texts are updated.
  The response `ClassMeetingList` keeps `items` (meetings, now with `kind` and `description`) and `total` (meetings) and
  gains `days` (the non-meeting marks with their texts, the teacher's view).
- **Rationale**: the existing 004 tests and clients that send only `add`/`remove` keep working; one operation per save
  (FR-007); the resolution logic is reused because "leaves the meeting condition" is computed into the same removed set.
- **Alternatives considered**: replacing `add` by `set` — churn in every 004 test for no gain; a separate route for kinds —
  two operations per save, against FR-007.

## CK4 — Texts

- **Decision**: trimmed; counted in code points; `description` 1–120 (required on `EXAM`, `ASSIGNMENT`, `REVIEW`, `MAKEUP`,
  `HOLIDAY`, `RECESS`, `SPECIAL_EVENT`, absent on `CLASS` and `TEACHER_ABSENCE`); `absenceReason` 1–500 and
  `absenceNotice` 0–200 (empty after trim → `null`) only on `TEACHER_ABSENCE`; no NUL. Zod in the contract, the same
  limits as `CHECK (char_length(…))` in SQL. Rendered as text (React text nodes), never HTML.
- **Rationale**: same handling as 020's message (code points, trim, no NUL).

## CK5 — Period change

- **Decision**: `class.offering_updated` keeps refusing meetings outside the new period (`409 MEETINGS_OUTSIDE_PERIOD`, 004
  US4-7); in the same transaction it deletes the `class_calendar_days` outside the new period (or all of them when the
  dates are cleared) and adds `calendarDaysRemoved` (count) to that event's metadata.
- **Rationale**: FR-009; non-meeting days carry no topics, so nothing needs resolving.

## CK6 — The student's read

- **Decision**: new route `GET /me/classes/:classId/calendar`, permission `calendario.turma.visualizar` (STUDENT), new API
  module `modules/student-calendar` with its own scoped query: the ACTIVE enrollment check of 026 (an enrollment of the
  turma of that class, by `cohort.classes`) before any read, else `404` (same body for every case); a malformed id `400`
  (`ParseUUIDPipe`/contract param). It selects only `meeting_date`, `kind`, `description` from `class_meetings` and
  `day_date`, `kind`, `description`, `absence_notice` from `class_calendar_days` — never topics, `absence_reason`,
  `status`, ids or times — and builds the shape in `views/student-calendar.view.ts` by copying an allowlist. The
  student's text is `description`, or `absenceNotice` for `TEACHER_ABSENCE`, or `null` for `CLASS`.
- **Rationale**: FR-021/FR-022, SC-004/SC-005; a separate module keeps the teacher's plan code out of reach
  (CK12 boundary test). The class's effective status does not hide the calendar (US4-5): only the enrollment decides.
- **Alternatives considered**: adding the days to `GET /me/dashboard` — couples the Painel's 5 s poll to a calendar that
  changes rarely, and makes the response bigger on every poll; rejected.

## CK7 — "Today"

- **Decision**: the response carries `today` = `planningToday(clock.now())` (America/Sao_Paulo, the 004 helper) from the
  injected `Clock`; the web never uses the browser's date to decide the initial week.
- **Rationale**: constitution's server-time rule; same zone as the meeting dates.

## CK8 — The student card in the web

- **Decision**: `apps/web/features/student-calendar/` with pure helpers in `schemas/` (`weekStart` Monday,
  `weekDays`, `clampWeek` to the period, `initialSelection(today, period, days)`, `weekLabel` "16–22 nov",
  `monthLabel` of the Monday, `dayDetail`), a `useStudentCalendar(classId)` TanStack Query hook (no polling,
  `refetchOnWindowFocus` default; FR-020) and the `StudentCalendarCard` component placed in the Painel's main column after
  "Próximas"/"Atrasadas". The selected week and day are component state (not in the address). The card is rendered only
  with the 026 `classId` and the permission.
- **Rationale**: FR-014–FR-019; the Painel already resolves the matéria and falls back on `404` (026), so the card follows
  it by key (`classId`).

## CK9 — Colors per kind

- **Decision**: a dot per kind from Design System tokens grouped by meaning: `CLASS` primary; `EXAM` danger; `ASSIGNMENT`
  warning; `REVIEW` and `MAKEUP` info; `HOLIDAY` and `RECESS` muted-foreground; `SPECIAL_EVENT` success;
  `TEACHER_ABSENCE` danger-text with a hollow dot. Color is never the only signal: each day has an accessible name with the
  kind, the teacher's calendar shows a short label/icon per day and a legend, and the student's detail names the kind.
  The contrast test (`test/contrast.test.ts`) gains the dot tokens against `card` in both themes (non-text ≥ 3:1).
- **Rationale**: FR-010, FR-015, FR-024, SC-008; no new token.

## CK10 — The teacher's modal and pending changes

- **Decision**: clicking a day of the period opens a `Dialog` ("Marcar dia") with a radio group of the nine kinds and the
  conditional fields; "Confirmar" stores the entry in the editor's pending map (date → entry or "removed"); "Desmarcar dia"
  marks removal. On "Salvar calendário" the editor computes `add`/`set`/`remove`: a saved meeting whose pending entry is a
  non-meeting kind or removal and that has topics opens the existing `TopicResolutionDialog` first (same as unmarking
  today). Kind labels and hints live in `features/class-calendar/schemas/day-kinds.ts` (text only in the web).
- **Rationale**: FR-003–FR-008, FR-010; reuses the 004 editor and resolution dialog.

## CK11 — Audit

- **Decision**: `class_meetings.updated` (one per save, as today) keeps `added`, `removed`, `total`, `resolutions` and gains
  `kinds` (count per kind after the save, the nine keys) and `changed` (entries whose kind or text changed). It is written
  when anything changed. Never a description, reason or notice. The student's read writes nothing; `class.offering_updated`
  gains `calendarDaysRemoved`.
- **Rationale**: constitution VI; texts can hold personal data (Falta's reason).

## CK12 — Boundary test

- **Decision**: `apps/api/test/student-calendar-boundary.spec.ts`: `modules/student-calendar` imports nothing from
  `class-plans`, `syllabus`, `curriculum-ai`, activities or AI; its source never names `absenceReason`/`absence_reason`,
  `topic`/`Topic` or `status` of a meeting; the view file copies a fixed list of keys. The web `features/student-calendar`
  imports nothing from `class-plan`/`class-calendar`.
- **Rationale**: SC-004 kept by a guard that fails when the code drifts, as the other boundary specs.

## CK13 — Permission

- **Decision**: migration seeds `calendario.turma.visualizar` ("Ver o calendário das disciplinas das próprias turmas") for
  `STUDENT` only; no change to `calendario.gerenciar`/`planejamento.visualizar`. The web shows the card only with it (UX);
  the API decides.
