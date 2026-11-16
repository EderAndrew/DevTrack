# Research: Matéria atual do aluno (026)

Decisions carry the prefix **D** (disciplina), unused by the earlier features.

## D1 — "Matéria" is the class of an active enrollment

- **Decision**: the subject the student picks is a **class** (`school_classes.id`) where the student holds an ACTIVE
  enrollment; its label is the class's subject name and the class name. No new entity, table or column.
- **Rationale**: a class is the offering of one subject by one teacher (004 E2), and every activity belongs to a class
  (`class_activities.class_id`, constitution XXIV). Filtering by class is exact; filtering by subject would mix two
  offerings of the same subject (two periods, two teachers) and would need the student to know subject ids.
- **Alternatives**: a subject id (`subjects.id`) — rejected: two active classes of one subject would merge, and a class
  without a subject (pre-004) could not be chosen; a new "student subject" entity — rejected (IX, no data to keep).

## D2 — The API filters by an optional `classId`

- **Decision**: `GET /me/activities` and `GET /me/dashboard` accept an optional `classId` (UUID). With it, the service
  first checks an ACTIVE enrollment of the session student in that class (any class status, as `GET
  /me/classes/:classId/ranking` does, 013); without one → `404 NOT_FOUND`, the same for another student's class, an
  ended enrollment and a class that does not exist. Then the loader reads only that class's activities (the `classId`
  joins the existing `visibleTo` scope, so every 012/013/016/018/023 visibility rule still applies). Without `classId`
  both routes answer exactly as today (spec SC-005).
- **Rationale**: the server is the authority (I, III); the id from the URL is untrusted. One enrollment lookup before
  the existing scoped query keeps the denial uniform and cheap, and pushing `classId` into the `where` avoids loading
  the other classes at all.
- **Alternatives**: filter only in the web — rejected: the list is paged (20) and the summary cards would still mix
  subjects; a new route per class (`/me/classes/:classId/activities`) — rejected: duplicates the list and the dashboard
  contracts for no gain; audit the denial as `student_access.denied` — rejected: that event names an existing
  **activity**; a class read outside context is treated like the 013 class ranking (not audited), spec "Audit events".

## D3 — Malformed `classId` is a validation error

- **Decision**: the query schema types `classId` as a UUID; a malformed value is `400 VALIDATION_ERROR` from the
  existing `ZodValidationPipe` before any database access; a well-formed id outside the student's context is `404`.
- **Rationale**: the same split the project uses for every path id (`UuidSchema`); spec FR-009 allows either answer for
  a malformed id and forbids a 500.

## D4 — The dashboard filters every block, including the ranking

- **Decision**: with `classId`, `counts`, `next`, `overdueOpen` come from that class only, and `rankings` holds at most
  that class's block: `RankingService.dashboardFor(userId, classId?)` narrows its `where` to the class. Its current rule
  stays: only an ACTIVE class and only with `ranking.turma.visualizar`; an INACTIVE or ARCHIVED class of the chosen
  subject shows no ranking block (as today, where it is not listed).
- **Rationale**: spec FR-006; reuses the 013 query and its permission check.

## D5 — "Minhas turmas" carries the subject name

- **Decision**: `MyClassViewSchema` gains `subjectName: string | null` (null for a class without a subject); the
  service selects `subject.name`. The web's "Minhas turmas" shows it, and the subject switcher builds its options from
  this same list, in its order (ACTIVE enrollments, most recent first).
- **Rationale**: one source for the options and the default (spec FR-002, FR-003, FR-013); the student already sees
  every field of this list.

## D6 — The choice lives in the page address (`?materia=`)

- **Decision**: both pages read `?materia=<classId>` (the slug follows the Portuguese `?situacao=&tipo=`); the web never
  stores it elsewhere. Resolution, in the web: no enrollment → no card and the old request without `classId` (empty
  state of today, FR-012); a `materia` in the list → that one; none or one not in the list → the first class of the
  list, and when one was given, the notice "Essa matéria não está mais disponível para você." (FR-011). The request is
  made only after "Minhas turmas" answers, so the web never sends an id it does not know.
- **Rationale**: spec FR-004 and clarification 4; reloading, going back and sharing keep the subject; no new state.
- **Stale context**: if the list or the dashboard answers `404` for the chosen class (enrollment ended while the page
  was open, spec US3-6), the web invalidates "Minhas turmas"; the class drops out of the options and the resolution
  above falls back with the notice. No URL rewrite (no redirect loop).

## D7 — The subject switcher is a card around the Design System's `NativeSelect`

- **Decision**: a new feature component `SubjectSwitcher` (`features/student-activities`), a card with the `BookOpen`
  icon, the label "Matéria" bound to a `NativeSelect` (as the "Situação"/"Tipo" filters of 012). Option text:
  "<disciplina> · <turma>", only "<turma>" without a subject; when two options would read the same, the period and the
  teacher are added ("… · 2026.2 · Ana Professora"). With a single option the select still shows it (keyboard and
  screen reader read the subject) and the card says "Sua única matéria".
- **Rationale**: a native select is keyboard and screen-reader complete, works on phones, and is already the filter
  control of this page (constitution frontend stack, design-system `controles` rule: no recreated control).
- **Alternatives**: the Radix `Select` or a `DropdownMenu` — no gain over the native one here and heavier on mobile.

## D8 — Links and cache keys carry the class

- **Decision**: `myActivitiesHref` takes the class too and writes `materia`; the dashboard's counters and "Ver todas"
  use it (FR-007). The TanStack Query keys of the dashboard and the list include the class id, so switching subjects
  never shows the other subject's cached page and the 5 s poll (016) follows the choice (FR-015).
- **Rationale**: no mixed data on screen during a switch (spec SC-002).

## D9 — Out of scope

- The history page, an activity page, the answering page, the full class ranking, "Meus feedbacks", the teacher's side
  and the mobile app do not change. Remembering the last subject across visits is not done (spec Assumptions).
