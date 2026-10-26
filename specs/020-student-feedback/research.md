# Research: 020 — Feedback dos Alunos

Decisions carry the prefix **J** (J1, J2, …). Each one gives the Decision, the Rationale and the
Alternatives considered. The spec left no `NEEDS CLARIFICATION`; these fix what it left to the plan.

## J1 — Where the entry point lives: a dialog in the student layout

**Decision**: an "Enviar feedback" button in the student layout (menu footer on desktop, the same
menu sheet on phone) opens a dialog with the form. The dialog reads the current pathname when it
opens and sends it as `originPath`. "Meus feedbacks" is a new page of the student menu
(`/meus-feedbacks`) that shows the list and the same button.

The attempt page of an exam and of a CONTROLLED work (`app/(focus)/minhas-atividades/[id]/responder`)
uses the focus layout, which has no student menu, so the button is absent there (FR-003, SC-006).
Exercises and NORMAL works are answered on `app/(student)/minhas-atividades/[id]`, inside the student
layout, so the button is there — as the spec asks. (Planning first assumed every activity was answered
on the focus page and amended the spec; the analysis found the focus page only serves exams and
CONTROLLED works, and the amendment was undone.)

**Rationale**:
- A dialog keeps the student on the screen where the problem happened, so the origin is the real
  screen. A separate page would always record `/meus-feedbacks` as the origin.
- The focus layout already exists to keep exams and CONTROLLED works free of navigation (015, 018);
  placing the button in the student layout excludes exactly those pages with no mode check.

**Alternatives**:
- A floating button on every page, including the focus page with a mode check: more code, and a
  floating control on the focus page competes with the timer and the integrity notices (015, 018).
- Only a "Feedback" page: loses the origin, which is the most useful field for a "Problema".

## J2 — The origin path: pathname only, validated in the contract, refused when invalid

**Decision**: `OriginPathSchema` in the contract: optional/nullable string that starts with `/`, has
at most 200 characters and uses only `[A-Za-z0-9/_.-]` (so no query, fragment, space or `%`); it
never starts with `//` (a protocol-relative URL) and has no `..` segment, so the value can never point
outside the portal even if a later screen turns it into a link (security audit, 2026-10-25). An
invalid value is a `400` like any other invalid field (constitution I: "rejeitados quando
inválidos"). The web sends `window.location.pathname` only when it passes the same schema
(`OriginPathSchema.safeParse`), otherwise `null`, so the portal never loses the student's text to its
own path.

**Rationale**: the query string carries invitation and reset tokens on some pages (001, 003); the
pathname of the student portal holds ids at most. One schema shared by the web and the API means the
client check and the server check never disagree, and the server stays the final authority.

**Alternatives**: storing the route pattern (`/minhas-atividades/[id]`): loses the id the ADMIN
needs to reproduce a problem. Dropping an invalid path silently and accepting the send: arguable
under constitution I (rejected at analysis).

## J3 — Idempotency: a client submission id with a UNIQUE per student

**Decision**: the dialog generates a `submissionId` (UUID v4, `crypto.randomUUID()`) when it opens
and sends it with the form. `student_feedbacks` has `UNIQUE (student_id, submission_id)`. The insert is
`INSERT … ON CONFLICT DO NOTHING RETURNING`; on conflict the service reads and returns the existing
row with `200` (a new one is `201`). A retried request with a different body under the same id
returns the stored feedback unchanged.

**Rationale**: a double click or a network retry carries the same id, so SC-005 ("10 envios
simultâneos do mesmo pedido gravam exatamente 1") holds by the database, without timing windows.

**Alternatives**: deduplicating identical text within N seconds: fragile (two real feedbacks with
the same text) and a time window. Disabling the button only: does not cover network retries.

## J4 — The limit of 5 in 24 hours: counted on the table, under an advisory lock

**Decision**: inside the create transaction, `pg_advisory_xact_lock(hashtext('student-feedback'),
hashtext(studentId))`, then the idempotency lookup (a known `submissionId` returns its row and does
not count), then `SELECT count(*) … WHERE student_id = $1 AND created_at > now() − interval '24
hours'`. With 5 or more, the transaction rolls back and the API answers `429 RATE_LIMITED` with
`Retry-After` = seconds until the oldest of those rows turns 24 h old. The refusal is audited
(`student_feedback.rate_limited`) in its own short transaction after the rollback.

**Rationale**: the spec says "nas últimas 24 horas" (a rolling window). The feedback rows already
hold the exact history, and the lock serialises one student's sends without touching others
(SC-005). The 001 `RateLimitService` is a fixed window, which would allow up to 10 sends in a few
minutes across a window boundary.

**Alternatives**: `RateLimitService.hit` with `windowSec = 86400`: a fixed window, not the spec's
rule. A configurable limit: the spec fixes 5 for this stage (Assumptions).

## J5 — States and the history: enum + append-only table, conditional transition

**Decision**: enum `student_feedback_status` (`RECEIVED`, `IN_REVIEW`, `RESOLVED`, `ARCHIVED`). The
pure `feedback-state.ts` holds the allowed transitions (spec Security). A change runs in one
transaction: `SELECT … FOR UPDATE` of the feedback, check the transition, `UPDATE` status and
`status_changed_at`, insert `student_feedback_status_changes (from, to, changed_by, changed_at)`,
audit. A DB trigger refuses any other transition and any update of other columns (FR-012); the
history is append-only (trigger), except for the retention job (J8).

**Rationale**: constitution XVI/XVII and the project's rule "explicit states, invalid transitions →
409". The row lock makes two ADMINs serialise: the second sees the first's result and either applies
over it (still valid) or gets `409 INVALID_STATE_TRANSITION` (same state), with exactly one history row
per applied change.

**Alternatives**: a status column with the history derived from audit events: audit is for
security, not for a screen; reading it to build a UI couples the two.

## J6 — Who reads what: two views by allowlist

**Decision**:
- `views/student-feedback-view.ts` copies `id`, `category`, `message`, `status`, `createdAt` — never
  the history, the ADMIN, the origin or the student's own id.
- `views/admin-feedback-view.ts` adds the student (`id`, `name`, `email`), `originPath`,
  `statusChangedAt` and, on the detail, the history with the ADMIN's name.

The student's routes filter by `student_id = session user` (another student's feedback → `404`).
The ADMIN routes need `feedbacks.visualizar`; there is no class context, the feedback belongs to the
platform (spec Resource context).

**Rationale**: the project's rule "every student shape is built by copying an allowlist, never by
stripping the teacher view" (012), applied here to the ADMIN view.

## J7 — Lists: keyset pages of 50, filters as query params, a summary for the menu

**Decision**: `GET /me/feedbacks` and `GET /feedbacks` return `{ items, nextCursor }` ordered by
`(created_at DESC, id DESC)`, 50 per page, with an opaque cursor (the existing pattern of `classes`
and `subjects`). `GET /feedbacks` accepts `status` and `category` (each optional, one value). `GET
/feedbacks/summary` returns `{ received }` for the menu badge; the web refetches it on focus and
after a status change (TanStack Query invalidation), never by polling.

**Rationale**: the spec asks for "na próxima abertura ou atualização" (SC-002), which focus refetch
and invalidation give without a timer. Index `(status, created_at DESC, id DESC)` serves the ADMIN
filter; `(student_id, created_at DESC, id DESC)` serves the student list and the 24 h count.

**Alternatives**: offset pagination: the project uses keysets. Polling the badge: no requirement,
and the ADMIN area has no other polling.

## J8 — Retention: a maintenance job `student-feedback`

**Decision**: a job in `platform/maintenance` deletes, in batches of 1 000, feedbacks whose status is
`RESOLVED` or `ARCHIVED` and whose `status_changed_at` is older than 24 months, with their history
rows, under `SET LOCAL devtrack.feedback_purge = 'on'` (the history's append-only trigger and the
feedback's immutability trigger let only this flag delete). Like the other technical purges it
writes no audit event and logs the job name and the count.

**Rationale**: FR-015, and the same shape as `mail-records` (017) and `code-run-content` (019).
`RECEIVED`/`IN_REVIEW` are never touched (the job's `WHERE`).

## J9 — Text: trimmed, counted in code points, NUL refused, rendered as text

**Decision**: the contract trims `message` and refines its length on code points (`[...value].length`
between 10 and 2 000), so an emoji counts as one character as the student sees it. A NUL character is
a `400` (PostgreSQL rejects it in `text`). The DB has `CHECK (char_length(message) BETWEEN 10 AND
2000)` (code points in PostgreSQL). The web renders the message as text with `white-space:
pre-wrap`, never through a Markdown or HTML renderer; URLs stay plain text (spec Edge Cases).

**Rationale**: the same length on the client counter, the contract and the database; XSS is
impossible by construction (no HTML path), covered by the web XSS guard.

## J10 — Boundaries: a `feedback-boundary.spec.ts`

**Decision**: a new guard keeps `modules/student-feedback` (API) and `features/feedback` (web)
away from AI (`ai`, `*-ai`, `work-help`), mail (`platform/mail`), grading, points, the ranking, the
banks and activities, and forbids the feedback text in audit and log calls (FR-014, SC-004). The
audit metadata keys are fixed in `audit-event-types.ts` and the guard checks that no key named
`message`/`text`/`originPath` is allowed for the `student_feedback.*` types.

**Rationale**: the project guards each feature's isolation by a boundary test (011–019); FR-014 is a
"never" rule, which a test enforces better than a review.
