# Implementation Plan: 016 — Lista de Chamada e Liberação do Trabalho aos Presentes

**Branch**: `016-attendance-gated-release` | **Date**: 2026-10-09 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/016-attendance-gated-release/spec.md`

## Summary

Every work applied from now on is released **per student, by the teacher's attendance**:

- **Release mode** (M2): a new ASSIGNMENT starts with `release_mode = PRESENT_ONLY` and is
  invisible to everyone. Exercises, and works applied before 016, stay `ALL_ENROLLED`, so 012/013
  behave as before.
- **Attendance** (M3, M5): the "Chamada" tab marks the students who are in the room. Marking
  releases the work to that student, and a late student is simply marked later. Unmarking is
  allowed only before the student starts.
- **Visibility** (M4): a single SQL clause, added to the three scoped queries that 012 centralized,
  enforces the release. A trigger refuses an attempt without presence.
- **Pause** (M6): during the attempt, the student declares "Sair da sala" with a reason, or the
  teacher pauses them. The pause is an `attempt_pauses` row written under the attempt's 012 row
  lock. While it is open:
  - every write (save, submit, 015 events and help) answers `409 ATTEMPT_PAUSED`;
  - the student's view omits the questions and answers on every device;
  - defense triggers refuse the same writes at the DB level.
- **Release of a pause** (M7): only the teacher releases it, and the student resumes where they
  stopped. The deadline keeps running.
- **Closing or cancelling**: ends an open pause by derivation, never by a write.
- **Refresh** (M8): the room panel and the student's pages poll every 5 s, with no WebSocket.
- **What the pause never does**: change a grade, submit the attempt, or carry a fraud label. 015's
  screen exits still never pause anything (M10).

## Technical Context

**Language/Version**: TypeScript 7 on Node.js 24 LTS (`apps/api` with SWC; `tsc` type-check)
**Primary Dependencies**:
- NestJS 11, Prisma 7, Zod 4 (`@repo/contracts`);
- web: Next.js 16, React 19, TanStack Query 5, React Hook Form 7, shadcn/ui, Lucide;
- no new dependency.

**Storage**: PostgreSQL 17. One migration adds:
- the enum `activity_release_mode` and the column `class_activities.release_mode`;
- the tables `activity_attendances` and `attempt_pauses`, with 2 enums;
- CHECKs, a partial UNIQUE and triggers (attendance rules, pause immutability, the attempt-start
  presence check, and the defense triggers on answers, submissions, integrity events and help
  requests);
- the permission seed.

**Testing**:
- Vitest:
  - pure `room-status`, pause durations;
  - integration per story;
  - schema/trigger suite;
  - security suites: isolation of the not-present student on every route, paused-attempt
    refusals across sessions, concurrency of mark/unmark/start and pause/save/submit/release,
    rate limit, boundaries.
- Testing Library with `vitest-axe` and the keyboard helpers.
- Playwright E2E: a teacher with two students.

**Target Platform**: Linux server (API); browser for the teacher (desktop, tablet) and the student
(phone, desktop).
**Project Type**: web service + web app (pnpm/Turborepo monorepo)
**Performance Goals**:
- room view of 60 students p95 < 300 ms (3 queries);
- attendance batch of 60 < 500 ms;
- student list with the visibility clause unchanged from 012 (indexed `EXISTS`);
- pause/release p95 < 200 ms;
- visible change ≤ 10 s, through 5 s polling (SC-002, SC-004).

**Constraints**:
- server clock only;
- no stored PAUSED status or durations;
- no WebSocket, SSE or new dependency;
- no grade, submission or fraud label from pauses;
- exercises and `ALL_ENROLLED` works untouched;
- not-present students get `404` without a hint.

**Scale/Scope**:
- 7 new routes and 6 changed shapes;
- 1 migration;
- 1 new API module (`attendance`);
- 1 permission;
- 5 new audit types, 5 changed;
- 1 web feature (`features/attendance`), with changes to the activity detail, the roster, the
  review, the answering pages and the history;
- 1 E2E.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] **I. Security**:
  - strict bodies; server fields refused (`markedAt`, `startedAt`, `releasedAt`, `initiatedBy`,
    `releaseMode`);
  - note ≤ 200 characters and rendered as text, batches ≤ 200;
  - OWASP A01: context → `404`, including the not-present student;
  - A04: rate limit on pauses.
- [x] **II. RBAC**:
  - `chamada.registrar` (new, TEACHER);
  - `entregas.visualizar` and `atividades.proprias.responder/visualizar` reused;
  - matrix rows for every route; no role-name check.
- [x] **III. Server authority**:
  - presence, pause and release times come from the injected `Clock`;
  - visibility and PAUSED are derived on the server;
  - the client's checkboxes are only a draft until the batch.
- [x] **IV. Untrusted code**: N/A. Nothing is executed.
- [x] **V. Data integrity**:
  - one migration;
  - composite FKs;
  - PK on presence, partial UNIQUE on the open pause;
  - CHECKs (release mode by type, reason ↔ initiator, note only for OTHER, release fields
    together);
  - triggers: presence rules, no unmark after start, pause immutability, start needs presence,
    writes refused while paused.
- [x] **VI. Audit & logs**:
  - every mark, unmark, pause and release is audited;
  - `student_access.denied` gains `NOT_PRESENT`;
  - the close records `pausedCount`;
  - metadata holds ids and enums only; the note never appears.
- [x] **VII. Tests**: visibility on every student route, the pause refusals and the concurrency of
  start/unmark and pause/save/submit are written first.
- [x] **VIII. Layering**:
  - thin controllers;
  - `AttendanceService`/`PausesService` with scoped queries and row locks;
  - pure `room-status.ts`;
  - `student-activities` reads the tables inside its own queries (M1).
- [x] **IX. Simplicity**:
  - no new dependency or transport; polling (M8);
  - PAUSED derived from a row, not a new attempt status (M6);
  - the close ends pauses by derivation (M7).
- [x] **X. Evidence**:
  - presence and exits are FACT with server times;
  - durations are derived;
  - no rule concludes anything from a pause, and the UI shows it as a record.
- [x] **XI. Human oversight**:
  - marking, pausing and releasing are HUMAN_DECISION by the teacher;
  - the student's own declaration starts a pause;
  - nothing automatic pauses, submits or grades.
- [x] **XII. Determinism first**: everything here is deterministic; there is no AI.
- [x] **XIII. Risk level**: no AI operation. The pause is a supervision workflow under the
  teacher's control, not a disciplinary block (XI lists "bloqueio disciplinar" as a human
  decision, which is exactly what happens).
- [x] **XIV–XV, XIX. AI**: N/A. The 015 help is refused while paused, and nothing about attendance
  reaches a model.
- [x] **XVI. Explicit states**:
  - `activity_release_mode`, `attempt_pause_initiator` and `attempt_pause_reason` enums;
  - the pause is open or released, with one transition;
  - invalid transitions → `409`;
  - no boolean flags.
- [x] **XVII. Idempotency**:
  - a repeated mark or unmark is a no-op;
  - an open pause is returned again;
  - release is keyed by pause, so a double click never ends a later pause.
- [x] **XVIII. Safe interruption**: a closed or cancelled activity ends every open pause by
  derivation. The attempt stays recoverable through 012 FR-006b.
- [x] **XX. Pedagogy**:
  - works are done in class, under supervision, as the teacher asked;
  - exercises stay free;
  - pauses carry no penalty, and there is no limit on their number.
- [x] **XXI. Configurable domain**: no subject or language. Exit reasons are a platform list.
- [x] **XXII. Personalization & accessibility**:
  - no adaptation data;
  - the student is told not to put personal data in the note;
  - dialogs and the room panel are keyboard-operable, statuses are shown as text, and the pause
    notice uses `role="status"`.
- [x] **XXIII. Curricular traceability**: N/A. The activity's topics are untouched.
- [x] **XXIV. Academic isolation**:
  - teacher routes go through `ClassContextPolicy`;
  - student routes start at the ACTIVE enrollment, then presence, then their own attempt;
  - another student's pause or presence never reaches a student.
- [x] **XXV. Privileged provisioning**: N/A. One permission is granted to TEACHER by migration.
- [x] **XXVI. Shared contracts**:
  - `packages/contracts/src/attendance/*` (new domain directory);
  - changes in `activities/`;
  - endpoint catalog.
- [x] **Frontend stack**: `features/attendance/{api,components,hooks,schemas}`, TanStack Query
  polling, React Hook Form for the exit dialog, design-system components only. No Redux: the
  checklist draft is component state.

**Post-design re-check**: all ✅ against constitution v3.4.0. No amendment is needed.

Touches outside the new module:
- the 012 student visibility (`visibleTo`, `ownAttempt`, `lockContext`, `deniedReason`);
- the attempt writes (the paused check under the existing lock);
- the activities create, summary, roster and close;
- the 015 events and help (`409 ATTEMPT_PAUSED`);
- the answering pages (NORMAL and 015 focus);
- `activities-boundary.spec.ts`;
- the permission seed, audit types, endpoint catalog and config.

During planning the spec changed in one place: FR-013 now omits questions on the paused read
instead of answering `409`, so the notice can be rendered.

## Project Structure

### Documentation (this feature)

```text
specs/016-attendance-gated-release/
├── plan.md
├── research.md                     # M1–M13
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── http-api.md
│   ├── permissions.md
│   ├── audit-events.md
│   ├── configuration.md
│   └── web-ui.md
├── checklists/requirements.md
└── tasks.md                        # /speckit-tasks
```

### Source Code (repository root)

```text
apps/api/
├── prisma/{schema.prisma, migrations/<ts>_attendance_gated_release/}  # enum+column, 2 tables, 2 enums, triggers, permission seed
├── src/platform/config/config.schema.ts                              # RATE_LIMIT_ATTEMPT_PAUSES_PER_HOUR
├── src/modules/activities/                                           # create PRESENT_ONLY, summary attendance, roster ABSENT + pauses, close/cancel/accept pause audit
│   └── status/pause-time.ts                                          # pure pause end and durations (research M1)
├── src/modules/student-activities/
│   ├── student-activity-loader.ts                                    # visibility clause, NOT_PRESENT, pause in detail/ownAttempt
│   ├── attempts.service.ts                                           # lockContext clause, ATTEMPT_PAUSED on save/submit
│   └── (views via activities/views/student-view.ts)                  # pause / pauses allowlisted
├── src/modules/attempt-integrity/focus-events.service.ts             # ATTEMPT_PAUSED
├── src/modules/work-help/work-help.service.ts                        # ATTEMPT_PAUSED
├── src/modules/attendance/
│   ├── attendance.{controller,service}.ts                            # room view, mark/unmark batch
│   ├── pauses.{controller,service}.ts                                # teacher pause/release/review
│   ├── my-pause.{controller,service}.ts                              # student exit + read
│   ├── room-status.ts                                                # pure (data-model "Derived")
│   ├── views.ts
│   └── attendance.module.ts
├── src/modules/audit/audit-event-types.ts
└── test/
    ├── helpers/attendance.ts
    ├── integration/016-us1-release … 016-us5-teacher-pause.spec.ts, 016-schema.spec.ts
    ├── security/016-{isolation,paused-writes,concurrency,rate-limits,boundaries,performance}.spec.ts
    ├── attendance-boundary.spec.ts (new), activities-boundary.spec.ts (amended)
    └── traceability.spec.ts                                          # SPECS += 016
packages/contracts/src/{attendance/*, activities/*, endpoints.ts}
apps/web/
├── features/attendance/{api,components,hooks,schemas}/…              # AttendanceTab, RoomPanel, ExitRoomDialog, PausedNotice, polling hooks
├── features/activities/components/{activity-detail,roster,attempt-review,activity-list}.tsx
├── features/student-activities/components/{activity-answering,student-history,…}.tsx, hooks (polling)
├── features/controlled-attempt/components/controlled-attempt.tsx    # stop monitor before pause, resume notice
├── lib/messages/error-messages.ts                                   # ATTEMPT_PAUSED, ATTENDANCE_STARTED, …
└── e2e/attendance.spec.ts
README.md, CLAUDE.md, apps/api/CLAUDE.md, apps/web/CLAUDE.md, apps/api/.env.example
```

**Structure Decision**: the existing monorepo.
- **API**: one new module, `attendance`, for the teacher's attendance and the pauses. The
  visibility clause and the paused-write check live inside the 012 queries and locks that already
  own them (M1, M4, M6).
- **Web**: one new feature, `features/attendance`, imported by the activity and the answering
  pages.

## Complexity Tracking

No constitution violation. The one structural change worth noting is below.

| Change | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Defense triggers on four existing tables (answers, submissions, integrity events, help requests) | "Nenhum dispositivo acessa durante a pausa" is the feature's security promise (SC-003). The service check sits under the attempt lock, and the triggers keep the promise if a future write path forgets it | Service check only: one missed path (a new route, a worker) would silently break the promise; the project already pins similar rules with triggers (012/015) |
