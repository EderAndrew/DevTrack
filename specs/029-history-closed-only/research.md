# Research: Histórico só com provas e trabalhos encerrados ou cancelados (029)

Decisions carry the prefix **HC** (028 used HI).

## HC1 — Placement rule

- **Decision**: two pure predicates in `student-activities/history.ts` over the loaded input:
  `inHistory = type ∈ {ASSIGNMENT, EXAM} ∧ activityStatus ∈ {CLOSED, CANCELLED}` and `inList = ¬inHistory` (so every
  EXERCISE, and every ACTIVE work or exam). The class's or turma's effective status does not move a row (spec
  Assumptions); the 028 `isMissed`/`canAnswer` placement is removed.
- **Rationale**: the user's rule is the teacher's act on the activity; one predicate and its negation make
  `029/SC-001` (each activity in exactly one screen) true by construction.
- **Alternatives**: keep `canAnswer` for inactive classes (rejected: contradicts "encerrada ou cancelada pelo
  professor"); move exercises with the same rule (rejected by the user).

## HC2 — Loading cancelled activities

- **Decision**: a new `StudentActivityLoader.loadCancelled(userId, now, classId?)`: `status = CANCELLED`, `type IN
  (ASSIGNMENT, EXAM)`, `publish_at ≤ cancelled_at` (and `≤ now`), the same ACTIVE-enrollment and 016 release clauses as
  `visibleTo`, the same select and `toInput` as `loadAll`, always with `canSeeResults = false`. `visibleTo` itself is
  unchanged, so every other student route still answers `404` (`student_access.denied` with `CANCELLED`).
- **Rationale**: `visibleTo` is shared by the activity page, attempts, saves, runs and help; widening it would need a
  guard on each. A history-only query keeps the cancelled activity out of every other path.
- **Alternatives**: a raw SQL row with only the history fields (rejected: duplicates the summary's label/teacher/subject
  joins); a flag on `loadAll` (rejected: easy to pass by mistake from another read).

## HC3 — The cancelled row's shape

- **Decision**: `toCancelledSummary(input)` in `activities/views/student-view.ts` builds the summary through the same
  allowlist and then fixes: `result: null`, `points: null`, `canAnswer: false`, `urgent: false`, `status` =
  `SUBMITTED` when there is a submission, else `OVERDUE` (the summary's `status` is required; the web shows the history's
  `situation`, never this `status`, for the pill).
- **Rationale**: one place builds every student shape (root CLAUDE.md); with `canSeeResults = false` at load and
  `result: null` here, a released grade can never reach a cancelled row (`029/SC-002`) by two independent guards.
- **Alternatives**: a new `StudentActivityStatus` value `CANCELLED` (rejected: it would ripple into the list, the
  Painel and the 012 status contract for a value the list never shows).

## HC4 — Situation, dates and order

- **Decision**: `StudentHistorySituation = AWAITING | GRADED | MISSED | CANCELLED`. For a CLOSED row: delivered →
  AWAITING/GRADED (028 HI3); a held exam (open hold, no submission) → AWAITING; otherwise MISSED. CANCELLED rows →
  CANCELLED whatever the delivery. The item keeps `deliveredAt` (the submission; null without one) and replaces
  `missedAt` with `endedAt` = `closedAt` (CLOSED) or `cancelledAt` (CANCELLED), always set (a database CHECK of `class_activities` requires `closed_at` on CLOSED and `cancelled_at` on CANCELLED, so
  there is no fallback). Order: `deliveredAt ?? endedAt` desc, then id; the
  cursor stays the 028 keyset over that date.
- **Rationale**: the user asked for the delivery date when there is one; `endedAt` gives the "Encerrada em …" /
  "Cancelada em …" line and the order for the rest; one non-null date per row keeps the cursor unchanged.
- **Alternatives**: order everything by `endedAt` (rejected: a row's visible date would differ from its order).

## HC5 — "Minhas atividades"

- **Decision**: `list` keeps `inList` items in every 012/013 status; `StudentActivityFilter` regains `COMPLETED`
  (SUBMITTED + GRADED + COMPLETED, its pre-028-amendment meaning); `OVERDUE` lists every overdue in the list, accepting
  or not. The web filter "Entregues/concluídas" returns and `?situacao=concluidas` selects it.
- **Rationale**: delivered active works and concluded exercises must be somewhere (spec US3); the 012 filter did that.

## HC6 — Painel

- **Decision**: `counts.pending/inProgress/overdue` count the `inList` items by status (overdue = all overdue);
  `counts.completed` = the number of history rows of the same `classId` (CLOSED works/exams + cancelled). `next` and
  `overdueOpen` unchanged. The web link stays `/historico?materia=`.
- **Rationale**: the card opens the Histórico, so its number is what the student will find there (confirmed by the
  user 2026-11-23).

## HC7 — Totals and tabs

- **Decision**: `tabCounts = { all, awaiting, graded, missed, cancelled }` (`all` = their sum; `classId` + `q`);
  `totals = { delivered, awaiting, graded, missed, cancelled }` (`classId` only), `delivered = awaiting + graded`;
  `missed` and `cancelled` never added to the cards. A held CLOSED exam is AWAITING and counts in `awaiting` and
  `delivered` (decided 2026-11-23), so the cards always equal the tabs' awaiting + graded.

## HC8 — What happens to 028's amendment

- **Decision**: 028 stays in `traceability.spec.ts`'s `SPECS`; its spec gets a note at the top of the amendment
  ("superseded by 029 on 2026-11-23: FR-022–FR-025 and US5 now read as 029/FR-001–FR-009") and the 028 tests whose
  expectations change keep their 028 ids in the title, with the assertion updated and a comment citing the 029 FR. The
  tests of 012/013/015/019/026/027 that the 028 amendment moved to `/api/me/history` move back to `/api/me/activities`
  where the activity is still ACTIVE, each citing `029/FR-007` (`029/SC-005`).
- **Rationale**: CLAUDE.md: the spec wins and merged features are not re-specified; a note keeps 028's history readable
  while the guard keeps checking its ids.

## HC9 — Performance

- **Decision**: keep the in-memory pass; the extra query is indexed by `(class_id, status, deadline)`. The 028 SC-004
  test seeds its 500 activities as CLOSED (they would otherwise not be in the history) and also asserts `029/SC-004`.
