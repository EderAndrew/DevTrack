# Research: 025 — Aviso discreto do professor ao aluno durante a prova

Decisions carry the prefix **N** (nudge).

## N1 — One table, pending = `dismissed_at IS NULL`

- **Decision**: `exam_nudges` with `sent_at` and nullable `dismissed_at`. PENDING and DISMISSED are the only stored
  states; UNSEEN (pending when the attempt ended) and "shown" (pending and the attempt running) are derived on read
  (constitution XVI: states explicit, derived statuses never stored — the 016/018 rule). A partial UNIQUE
  `(attempt_id) WHERE dismissed_at IS NULL` is the "one pending" rule.
- **Rationale**: an ended attempt can never get a new nudge (eligibility), so a pending row left on an ended attempt
  blocks nothing; no job is needed to mark UNSEEN.
- **Alternatives**: a status enum column updated by a job (rejected: statuses are derived, no jobs for exam state);
  rows deleted on dismissal (rejected: history is required, US3).

## N2 — The student's poll is its own light route

- **Finding**: while an exam is running, the student's page does not re-read the activity; the only 5 s poll is the
  016 pause watch (`GET /me/activities/:activityId/attempt/pause`, module `attendance`). The activity itself is
  polled only while on hold (`useHoldWatch`).
- **Decision**: `GET /me/activities/:activityId/attempt/exam-nudge` → `{ nudge: { id, studentName } | null }`, polled
  every `ATTENDANCE_POLL_MS` (5 s) while the page is visible and the exam is running, by `features/exam-nudge`. The
  spec's FR-008 was reworded first (from "the poll the page already does" to "a 5 s poll like the pause's").
- **Rationale**: the pause route belongs to `attendance`, whose boundary spec forbids exam code; widening it would
  couple attendance to exams. Polling the full activity every 5 s would resend statements and answers. One indexed
  lookup per 5 s per student is cheap (≈ 8 req/s for 40 students).
- **Alternatives**: add `nudge` to `MyPause` (rejected: boundary); poll the activity while running (rejected: payload,
  re-render of the answering form); WebSocket/SSE (forbidden).

## N3 — Mobile-only enforcement: `@MobileOnly()` in `SessionGuard`

- **Decision**: a new decorator `@MobileOnly()` that implies `@MobileAccess()`; `SessionGuard` refuses a WEB session
  (cookie) on such a route with `403 MOBILE_SESSION_REQUIRED` before the permission guard. Only the send route has it.
- **Rationale**: the spec says only the app sends (FR-005). A guard rule is declarative, appears in the allowlist
  security suite and keeps the controller thin. `ctx.auth.client` already exists (024).
- **Alternatives**: check `client` in the service (rejected: rule hidden in business code); allow both (rejected by
  the user's decision).

## N4 — New permission `provas.avisos.enviar`

- **Decision**: seed `provas.avisos.enviar` ("Enviar aviso discreto a um aluno durante a prova") granted to TEACHER.
  The send route requires both `chamada.registrar` (the room it is sent from) and `provas.avisos.enviar` (analysis
  I1); the mobile login keeps requiring `chamada.registrar` (024).
- **Rationale**: constitution II: a write that reaches a student gets its own explicit permission; reading the room
  (`chamada.registrar`) does not imply writing to a student's screen.
- **Alternatives**: reuse `chamada.registrar` (rejected: a write under a read/attendance permission) or
  `provas.encerramentos.decidir` (rejected: a nudge is not a decision on a hold).

## N5 — Eligibility and serialization

- **Decision**: `canSend` = attempt IN_PROGRESS, no submission, no open hold, no open pause, `now < endsAt`, activity
  ACTIVE, occurrence count ≥ 2, and no pending nudge. The send runs in a transaction that first runs the 018
  settlement for the attempt (an expired attempt ends here, so the send gets `409`), then takes the attempt row
  `FOR UPDATE` (the same lock the 018 events batch, save and decisions take), re-derives eligibility, then `INSERT …
  ON CONFLICT DO NOTHING RETURNING`; no row → read the pending one and return it with `200`, no audit. A DB trigger
  re-checks IN_PROGRESS, EXAM, no open hold and no unreleased pause (defense in depth, like the 016/018 triggers).
- **Refusals**: ineligible → `409 EXAM_NUDGE_NOT_ALLOWED` with `exam_nudge.send_refused` (`reason`: `NOT_IN_PROGRESS`,
  `ON_HOLD`, `PAUSED`, `TOO_FEW_OCCURRENCES`) in its own transaction; another class, not an EXAM, an unknown attempt →
  `404` (no event).
- **Rationale**: the hold count comes from the batch's own transaction, so locking the attempt guarantees a nudge never
  races with the 4th occurrence.

## N6 — The pure `nudge-status.ts`

- **Decision**: `canSendNudge(facts)`, `nudgeShown(nudge, attemptFacts, now)` and `nudgeStatus(nudge, attemptFacts,
  now): "PENDING" | "DISMISSED" | "UNSEEN"`. Imported by `exam-nudges`, `exam-sessions` (monitor `canSend`) and
  `attempt-integrity` (timeline status) — the only cross-module import allowed.
- **Rationale**: one derivation for the three readers (SC-005 consistency between web, app and server).

## N7 — Dismissal

- **Decision**: `POST /me/activities/:activityId/attempt/exam-nudge/:nudgeId/dismiss` with `{}`. Allowed only on the
  student's own attempt while it is running and not paused or held (the dialog is only shown then): `UPDATE … SET
  dismissed_at = now WHERE id = … AND attempt_id = … AND dismissed_at IS NULL RETURNING`; already dismissed → `200`
  with no event; paused → `409 ATTEMPT_PAUSED`, held → `409 EXAM_ATTEMPT_ON_HOLD`, ended → `409 EXAM_NUDGE_NOT_PENDING`;
  a nudge of another attempt → `404`. Writes `exam_nudge.dismissed` in the same transaction.
- **Rationale**: same codes as the 018 writes for the same states (FR-014). The web closes the dialog at once and
  retries the dismissal in the background, remembering the nudge id in `sessionStorage` so the poll never re-shows it
  on that device (analysis U1: a modal waiting for the network would block answering, against FR-013).

## N8 — The dialog in fullscreen and inactivity

- **Decision**: `ExamNudgeDialog` uses `components/ui/alert-dialog.tsx` like `WarningDialog`: fullscreen is on
  `document.documentElement`, so the portal in `body` stays inside it and opening/closing never exits fullscreen. The
  exam page passes `enabled={running && !nudgeOpen}` to `useInactivity`, so no INACTIVITY event while the dialog is
  open, and closing it is an interaction that starts a new period. The 018 `WarningDialog` has priority: the nudge
  waits while a warning is open.
- **Rationale**: FR-013 (never an occurrence); Radix focus trap and `role="alertdialog"` meet FR-018.

## N9 — Monitor and timeline shapes

- **Decision**: `ExamMonitorStudent.nudge: { canSend, pendingSince | null, sentCount, lastDismissedAt | null }` (one
  lateral aggregate over `exam_nudges` in the monitor's query) and `IntegrityTimeline.nudges: TeacherExamNudge[]`
  (`{ id, sentAt, dismissedAt, status }`, oldest first, empty for works). The web review already renders the
  timeline route, so the review and the app's student detail both get the history from one place.
- **Risk**: the app parses responses with strict schemas, so an installed app older than the API would refuse the new
  fields. The 024 pilot (T040) has not started, so no installed app exists; API and app ship together. Recorded for
  future changes to app-read shapes.

## N10 — What is *not* done

- No push for a nudge, no e-mail, no teacher-written text, no send from the web, no nudge in works or exercises, no
  limit beyond one pending (each new one needs the student's dismissal). The text lives in the web
  (`features/exam-nudge/schemas`) and the app (`features/exam-room/schemas`), never in the API or contracts.
- Retention: the rows live with the attempt (FK `ON DELETE CASCADE`), like `exam_occurrences`; no job.
