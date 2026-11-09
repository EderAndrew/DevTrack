# Implementation Plan: Aviso discreto do professor ao aluno durante a prova

**Branch**: `025-exam-student-nudge` | **Date**: 2026-11-08 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/025-exam-student-nudge/spec.md`

## Summary

A teacher watching an exam room in the mobile app (024) gets a bell next to each student whose attempt is in
progress with 2 or more counted occurrences (018). Tapping it (after a confirmation) creates one pending row in a new
table `exam_nudges` for that attempt — at most one pending per attempt (partial UNIQUE), created under the attempt's
lock, audited `exam_nudge.sent`. The route is `@MobileAccess()` and also `@MobileOnly()`: a web session gets `403
MOBILE_SESSION_REQUIRED` (spec FR-005), so this is the app's first and only write on an exam. The student's exam page
polls a light route every 5 s while visible and running (like the 016 pause watch, research N2) and shows the fixed
text in the Design System's `AlertDialog` with the student's name from the server; "Entendi" dismisses it once
(`exam_nudge.dismissed`). The nudge is never an occurrence: it never touches the occurrence, hold, pause, submission or
grading tables, and the page suspends inactivity while the dialog is open. The 018 monitor (web and app) gains a
per-student `nudge` summary (`canSend`, pending, count, last dismissal), and the attempt's integrity timeline (the
app's student detail and the web review) gains the attempt's nudges. Every status ("shown", "unseen") is derived on
read with the server clock.

## Technical Context

**Language/Version**: TypeScript 7 on Node.js 24 LTS (API, contracts, web); the app's TypeScript as in 024
**Primary Dependencies**: no new dependency (NestJS + Prisma, Next.js + shadcn `AlertDialog`, Expo app of 024)
**Storage**: PostgreSQL 17 — one migration: table `exam_nudges` (partial UNIQUE pending per attempt, insert/update
guard triggers), permission `provas.avisos.enviar` granted to TEACHER (data-model.md)
**Testing**: API Vitest (integration, security, boundary); web Vitest + RTL + `vitest-axe`; mobile Jest + RNTL; one
Playwright scenario for the student dialog (local E2E)
**Target Platform**: the existing API (Hostinger VPS), the web portal, the 024 Android app
**Project Type**: existing web service + web app + mobile app (monorepo)
**Performance Goals**: the student's poll `GET …/attempt/exam-nudge` p95 < 50 ms (one indexed lookup); a send p95 <
150 ms; the monitor's extra lateral read keeps the 018 targets
**Constraints**: no WebSockets (5 s polling, visible page only); the nudge never changes an 018 fact; no free text;
no push; mobile-only send
**Scale/Scope**: 40-student room → one more 5 s poll per student (≈ 8 req/s extra per room); 3 routes, 1 table, 2
web components, 2 mobile components

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.* — checked against v3.7.0.

- [x] **I. Security**: send body is exactly `{}`, dismiss body `{}`; ids from the path (UUID pipe); the mobile-only
  rule enforced in `SessionGuard` (`@MobileOnly()`); no text from the client; anti-enumeration by 404 outside context
- [x] **II. RBAC**: send `chamada.registrar` (the 024 room) + `provas.avisos.enviar` (new, TEACHER) + class ownership (`ClassContextPolicy`); student poll
  and dismiss `atividades.proprias.responder` + own attempt, ACTIVE enrollment, presence (016)
- [x] **III. Server authority**: eligibility, "shown" and "unseen" derived with the injected `Clock`; the client sends
  no time; the student's name comes from the server
- [x] **IV. Untrusted code**: N/A
- [x] **V. Data integrity**: one migration; FKs, CHECK `dismissed_at >= sent_at`, partial UNIQUE `(attempt_id) WHERE
  dismissed_at IS NULL`, triggers: insert only on an IN_PROGRESS EXAM attempt with no open hold/pause; update only
  `dismissed_at` NULL → value; no delete except by cascade
- [x] **VI. Audit & logs**: `exam_nudge.sent`, `exam_nudge.send_refused`, `exam_nudge.dismissed` with ids/enums/codes
  only (contracts/audit-events.md); never names or the text
- [x] **VII. Tests**: tests first for eligibility, idempotency/concurrency, mobile-only, isolation, student
  visibility, dismissal, "never an occurrence" (SC-003) and every screen
- [x] **VIII. Layering**: thin controllers; `ExamNudgesService` holds the rules, pure `nudge-status.ts` derives;
  React/RN components only render through hooks
- [x] **IX. Simplicity**: no dependency, no queue, no push, no WebSocket; one table; a light poll instead of widening
  the 016 pause route (N2)
- [x] **X. Evidence**: the nudge is a HUMAN_DECISION signal; occurrences stay the 018 facts; nothing concludes
  anything about the student
- [x] **XI. Human oversight**: only the teacher sends; nothing automatic; no grade, penalty or label
- [x] **XII. Determinism first**: no AI
- [x] **XIII. Risk level**: N/A (no automation)
- [x] **XIV–XV. AI governance**: N/A
- [x] **XVI. Explicit states**: PENDING → DISMISSED stored (`dismissed_at`); UNSEEN and "shown" derived (data-model)
- [x] **XVII. Idempotency**: partial UNIQUE + `ON CONFLICT DO NOTHING` returns the pending one (`200`, no event);
  dismiss repeated → same result, no second event
- [x] **XVIII. Safe interruption**: N/A beyond the existing kill switches (a nudge is a single short write)
- [x] **XIX. AI evals**: N/A
- [x] **XX. Pedagogy**: proportional and least invasive by design — replaces calling the student out loud; a fixed,
  neutral text; never "fraude", "cola" or "violação"; no new monitoring signal
- [x] **XXI. Configurable domain**: nothing subject-specific
- [x] **XXII. Personalization & accessibility**: no adaptation data; `alertdialog` role, focus trap, keyboard, screen
  reader; bell with accessible name, not colour only
- [x] **XXIII. Curricular traceability**: N/A
- [x] **XXIV. Academic isolation**: send scoped to the class's teacher (404 outside); a student reads and dismisses only
  their own attempt's nudge; no classmate learns of it
- [x] **XXV. Privileged provisioning**: no account path touched
- [x] **XXVI. Shared contracts**: new domain `packages/contracts/src/exam-nudges/` + fields on `ExamMonitorStudent`
  and `IntegrityTimeline`; texts only in web and app
- [x] **Frontend stack**: shadcn `AlertDialog` from `components/ui/alert-dialog.tsx`, TanStack Query polling;
  `apps/web/features/exam-nudge/`
- [x] **Mobile stack**: tokens-only `StyleSheet`, Lucide `Bell`, TanStack Query mutation; `features/exam-room/`; the
  bearer stays opaque and allowlisted; no push content changes

**Post-design re-check (after Phase 1)**: all gates ✅. Two plan amendments made in the spec first: the student's poll
is its own route (N2, FR-008 reworded), and the 024 read-only rule gets its single exception (spec "Emenda à 024").

## Project Structure

### Documentation (this feature)

```text
specs/025-exam-student-nudge/
├── plan.md
├── research.md            # N1–N10
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── http-api.md        # routes, mobile-only rule, permission matrix
│   ├── audit-events.md
│   └── ui.md              # web dialog, web monitor/timeline, mobile bell texts
├── checklists/requirements.md
└── tasks.md               # /speckit-tasks
```

### Source Code (repository root)

```text
apps/api/
├── prisma/migrations/<ts>_025_exam_student_nudge/   # exam_nudges, triggers, permission seed
├── prisma/schema.prisma                             # model ExamNudge
├── src/modules/access-control/
│   ├── permissions.ts                               # + provas.avisos.enviar
│   ├── decorators.ts                                # + @MobileOnly()
│   └── guards/session.guard.ts                      # MOBILE_SESSION_REQUIRED for a WEB session on @MobileOnly()
├── src/modules/exam-nudges/                         # new
│   ├── exam-nudges.module.ts
│   ├── nudge-status.ts (+ .spec.ts)                 # pure: canSend, shown, status
│   ├── exam-nudges.service.ts                       # send, studentPending, dismiss
│   ├── teacher-exam-nudges.controller.ts            # POST …/attempts/:attemptId/exam-nudges
│   ├── student-exam-nudge.controller.ts             # GET/POST /me/activities/:activityId/attempt/exam-nudge…
│   └── views.ts                                     # allowlists: student, teacher
├── src/modules/exam-sessions/exam-monitor.service.ts      # + lateral read of exam_nudges → `nudge` summary
├── src/modules/attempt-integrity/integrity-review.service.ts  # + the attempt's nudges in the timeline
└── test/
    ├── integration/025-us1-send.spec.ts, 025-us2-student.spec.ts, 025-us3-history.spec.ts, 025-schema.spec.ts
    ├── security/025-{isolation,mobile-only,concurrency,audit,never-occurrence}.spec.ts
    └── exam-nudges-boundary.spec.ts

packages/contracts/src/exam-nudges/                  # nudge.ts (+ endpoints.ts entries, monitor/timeline fields)

apps/web/
├── features/exam-nudge/{api,hooks,components,schemas}/   # useExamNudge (5 s), ExamNudgeDialog, texts
├── features/exam-attempt/components/exam-shell.tsx       # mounts the dialog; inactivity off while open
├── features/exam-session/components/exam-room-panel.tsx  # "Aviso pendente", count (no send button)
├── features/activities/components/attempt-records.tsx    # nudges in the timeline/review
└── e2e/exam-nudge.spec.ts

apps/mobile/
├── features/exam-room/api/exam-nudges.ts
├── features/exam-room/hooks/use-send-nudge.ts
├── features/exam-room/components/{nudge-bell.tsx,nudge-confirm.tsx}   # room row + student detail
├── features/exam-room/schemas/exam-room.ts                            # texts
└── components/ui/dialog.tsx                                           # tokens-only confirm modal (new base component)

apps/api/test/traceability.spec.ts                   # SPECS += 025
CLAUDE.md                                            # 024 "read-only" rule amended; 025 summary and rule
```

**Structure Decision**: one new API module `exam-nudges` that reads the attempt facts in its own scoped queries
(the 016/018 pattern); `exam-sessions` and `attempt-integrity` read `exam_nudges` in SQL of their own and import only
the pure `exam-nudges/nudge-status` and `exam-nudges/views` (boundary spec), never its service. Web code in a new `features/exam-nudge` mounted by `features/exam-attempt`; app code
inside the existing `features/exam-room`.

## Complexity Tracking

No violation.

## Pilot (T033)

Manual pilot on 2026-11-09, quickstart "Manual check" steps 1–6, the `development` build of the app on an Android
phone (Samsung SM-A236M, USB with `adb reverse` to the local API), web and API from `pnpm dev`:

- Steps 1–6 passed: the bell showed for the student with 2+ counted occurrences; the dialog reached only that student;
  "Entendi" closed it; the app showed the bell back with the closed warning and both timeline entries; the web room
  showed the count with no send button.
- `025/SC-001`: `exam_nudge.sent` 12:56:25.291Z, `exam_nudge.dismissed` 12:56:34.721Z — the student saw the warning
  within 9 s of the send (target ≤ 10 s).
- `025/SC-007`: from the room to the send, about 3 s, timed by the teacher (target < 5 s).
