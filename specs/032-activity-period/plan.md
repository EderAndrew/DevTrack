# Implementation Plan: Período de aplicação da prova e do trabalho

**Branch**: `032-activity-period` | **Date**: 2026-11-26 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/032-activity-period/spec.md`

## Summary

Replace the exam's start window (0–60 min) and the work's deadline + late policy with one **period** chosen when the
activity is applied: start (now or scheduled, the existing `publish_at`) and end (date and time). The end reuses
`class_activities.deadline`, now set for ASSIGNMENT **and** EXAM (AP1). A new work is always `REJECT` and its body no
longer takes `latePolicy`; works applied with `ACCEPT_MARKED` keep it (AP2). An exam can be started by a present student
anywhere in the period, and every attempt ends at `min(start + duration, end, close, cancel)` (AP3). `startDeadline` and
`closesAt` stay on the wire equal to the end so the installed mobile app keeps working (AP4). A published exam's end can
only be extended (AP5); attendance marks after the end are refused (AP6). One migration converts every exam to `deadline =
publish + window + duration`, drops `start_window_minutes` and updates the CHECKs and triggers (AP7). The web form gets a
"Período" fieldset (AP8).

## Technical Context

**Language/Version**: TypeScript 7 on Node.js 24 LTS (API, contracts, web)
**Primary Dependencies**: no new dependency — NestJS + Prisma (API), Next.js 16 + React 19 + React Hook Form + shadcn/ui
(web), Zod (contracts)
**Storage**: PostgreSQL 17 — one migration `…_032_activity_period`: exam `deadline` backfill, `type_fields_chk` and
`exam_chk` replaced, `class_activities_fixed_columns()` (an exam's end never decreases once it has an attempt, no clock)
and `exam_attempt_holds_transition()` (capped by the end) replaced, `start_window_minutes` dropped
**Testing**: Vitest (API unit/integration on `postgres-test`, security), contracts tests, web Vitest + RTL + vitest-axe,
mobile Jest unchanged (compatibility), Playwright E2E (local) for the apply form
**Target Platform**: web (desktop and phone) and the 024 mobile app (unchanged), API on Node
**Project Type**: web application (monorepo `apps/api`, `apps/web`, `packages/contracts`)
**Performance Goals**: no new query; the period is read from the activity row already loaded
**Constraints**: no attempt's end changes in the migration (SC-005); the mobile APK keeps parsing the monitor and list (AP4);
exercises unchanged (SC-006); server clock only
**Scale/Scope**: every ACTIVE ASSIGNMENT and EXAM; ~25 API files read `deadline`/exam timing (listed in research AP1)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] **I. Security**: ✅ strict bodies (`startWindowMinutes`, `latePolicy` → `400`), dates validated as ISO in the contract
  and compared on the server; no new input surface.
- [x] **II. RBAC**: ✅ unchanged permissions (`atividades.*`, `chamada.registrar`); context → `404` as today.
- [x] **III. Server authority**: ✅ start, end, `endsAt`, attendance and extension rules use the injected `Clock`; "Agora"
  is the server's now; the browser only formats.
- [x] **IV. Untrusted code**: N/A.
- [x] **V. Data integrity**: ✅ migration only; CHECKs (`deadline` iff ASSIGNMENT/EXAM, exam period ≥ duration), trigger
  "a published exam's end never decreases", holds trigger capped by the end; conversion with a proven invariant (AP7).
- [x] **VI. Audit & logs**: ✅ no new event; `startWindowMinutes` leaves `class_activity.created` metadata; `changed`
  lists `deadline` on an exam extension; ids/enums only.
- [x] **VII. Tests**: ✅ written first: pure `exam-time` tests, integration per US scenario, migration invariant, contracts,
  web with a11y; traceability `SPECS += 032`.
- [x] **VIII. Layering**: ✅ timing stays in pure `status/exam-time.ts` and the period rules in pure `status/period.ts`
  (constitution VII: testable without HTTP), applied by `ActivitiesService` and `AttendanceService`; controllers unchanged; web rules in `schemas/activity-form.ts`.
- [x] **IX. Simplicity**: ✅ no new column, route or dependency; the period reuses `publish_at` + `deadline` (AP1); legacy
  late policy kept instead of a conversion with side effects (AP2).
- [x] **X. Evidence**: N/A.
- [x] **XI. Human oversight**: ✅ the system still never cancels or zeroes an exam; the period end is a time rule, the
  decisions stay the teacher's.
- [x] **XII–XV, XIX. AI**: N/A (no AI).
- [x] **XVI. Explicit states**: ✅ no new state; phase, in/out of period and `endsAt` derived on read; the extension's
  allowed transitions are listed (data-model).
- [x] **XVII. Idempotency**: ✅ apply keeps its idempotency key; attendance batches stay idempotent; repeating the same
  extension changes nothing.
- [x] **XVIII. Safe interruption**: ✅ one transaction per write; the migration is one transaction.
- [x] **XX. Pedagogy**: ✅ the teacher chooses the period and who is released.
- [x] **XXI. Configurable domain**: ✅ period and duration are per-activity data.
- [x] **XXII. Accessibility**: ✅ date/time fields with labels and hints, errors tied to the field, both themes.
- [x] **XXIII. Curricular traceability**: N/A.
- [x] **XXIV. Academic isolation**: ✅ unchanged scoping.
- [x] **XXV. Privileged provisioning**: N/A.
- [x] **XXVI. Shared contracts**: ✅ body and shape changes in `packages/contracts`; messages only in the API errors and web.
- [x] **Frontend stack**: ✅ existing DS fields, React Hook Form, `features/activities`.
- [x] **Mobile stack**: ✅ no change; compatibility kept by AP4 and checked by the existing mobile tests.

Post-design re-check: ✅ unchanged — one migration, no new route, permission or dependency; no violation to track.

## Project Structure

### Documentation (this feature)

```text
specs/032-activity-period/
├── spec.md
├── plan.md              # this file
├── research.md          # AP1–AP11
├── data-model.md        # migration, constraints, derived values, end-change table
├── quickstart.md
├── contracts/
│   ├── http-api.md      # create/update bodies, attendance, exam start, shapes, errors
│   ├── audit-events.md
│   └── ui.md            # "Período" fieldset, detail, monitor, attendance, student
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
packages/contracts/
├── src/activities/teacher.ts        # create/update bodies (deadline on EXAM, no latePolicy/startWindowMinutes), ActivityExamSchema
├── src/activities/enums.ts          # EXAM_START_WINDOW_* removed
└── test/…                           # bodies accept/refuse

apps/api/
├── prisma/schema.prisma + migrations/…_032_activity_period/migration.sql
├── src/modules/activities/
│   ├── status/exam-time.ts (+ .spec.ts)   # period cap, startDeadline = deadline, closesAt = deadline
│   ├── status/period.ts (+ .spec.ts)      # new pure: validPeriod, canChangeEnd, acceptsAttendanceMark (AP5, AP6)
│   ├── activity-types.ts                  # hasDeadline for EXAM, new hasLatePolicy (AP11)
│   ├── status/facts.ts                    # examTiming from deadline
│   ├── activities.service.ts              # create (REJECT, exam deadline), update (exam extension rules)
│   ├── views/teacher-view.ts, student-view.ts
│   └── roster.ts, activity-query.ts, attempts-review.service.ts, submission/settle-exam.ts
├── src/modules/attendance/attendance.service.ts   # ACTIVITY_PERIOD_ENDED
├── src/modules/exam-sessions/…, exam-alerts/mobile-exams.service.ts, exam-nudges/…   # read deadline instead of the window
├── src/modules/student-activities/…   # loader and attempts: exam timing from deadline
├── src/modules/audit/audit-event-types.ts   # drop startWindowMinutes
├── src/platform/http/errors.ts        # new codes and messages
└── test/integration/032-*.spec.ts, test/migrations/032-*.spec.ts, test/traceability.spec.ts

apps/web/features/
├── activities/schemas/activity-form.ts, components/new-activity.tsx, activity-detail.tsx (+ tests)
├── attendance/…                       # disabled marks after the end
├── exam-session/…                     # "Termina às"
└── exam-attempt/components/rules-screen.tsx
```

**Structure Decision**: existing monorepo modules only; no new module.

## Complexity Tracking

No violations.
