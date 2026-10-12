# Implementation Plan: 018 — Prova em Modo Restrito com Avisos e Decisão do Professor

**Branch**: `018-controlled-exams` | **Date**: 2026-10-12 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/018-controlled-exams/spec.md`

## Summary

The EXAM type, reserved since 012, becomes real:

- **Banco de Provas** (T1, T2): a third teacher bank, apart from exercises and works, with 1–20
  questions of the 011 types, a difficulty and 1–3 topics per question, DRAFT → APPROVED →
  ARCHIVED. The pure 011 rules (types, grading, exact value split) are reused, not copied.
- **"Criar prova com IA"** (T14): a new L2 agent `exam-generator`, DISABLED until the admin enables
  it, with its own 009 task, deterministic validation, DRAFT output and release-gate evals.
- **Applying** (T3, T15): an EXAM activity is always CONTROLLED, without help and `PRESENT_ONLY`
  (pinned by CHECKs). The teacher sets duration (1–120 min), inactivity limit (30–60 s), opening
  and start window (0–60 min), after seeing the coverage by topic and difficulty.
- **Time** (T4, T5): each attempt ends at `startedAt + duration` (server clock); starts only until
  `publishAt + startWindow`. An expired attempt is settled on its next touch into a submission dated
  at the computed end, graded on the saved answers. No job, no stored "expired" status.
- **Occurrences** (T6, T7): screen exits, fullscreen exits, clipboard attempts and the new
  `INACTIVITY` event count, grouped within 2 s, numbered gap-free under the attempt lock.
- **Hold** (T8): the 4th occurrence (or the next one after a return) opens an `exam_attempt_holds`
  row: writes are refused, questions hidden, and the teacher is asked to decide. It is a
  RULE_RESULT; nothing is cancelled or graded.
- **Decisions** (T9, T10): the teacher confirms the cancellation (grade 0, HUMAN_DECISION), returns
  the exam (only while time is left) or, after the end, does not cancel. Result release is refused
  while a hold is open.
- **Pause** (T11): only the teacher pauses an exam (016), and the time keeps running.
- **Monitor** (T12): the teacher's "Chamada e prova" panel, polled every 5 s.

## Technical Context

**Language/Version**: TypeScript 7 on Node.js 24 LTS (`apps/api` with SWC; `tsc` type-check)
**Primary Dependencies**:
- NestJS 11, Prisma 7, Zod 4 (`@repo/contracts`);
- web: Next.js 16, React 19, TanStack Query 5, React Hook Form 7, shadcn/ui, Lucide, CodeMirror 6
  (014, already lazy-loaded for code questions);
- no new dependency.

**Storage**: PostgreSQL 17. One migration adds:
- the Banco de Provas tables (8) with their triggers, mirroring 011;
- `EXAM` in `class_activity_type`, four exam columns on `class_activities`, `exam_difficulty` on
  the snapshot questions, `end_reason`/`cancelled_by_id` on submissions;
- `INACTIVITY` and `idle_seconds` on integrity events;
- the tables `exam_occurrences` and `exam_attempt_holds`, 5 enums, CHECKs, partial UNIQUE,
  triggers, and the 016 defense triggers extended to holds;
- the permission seed.

**Testing**:
- Vitest (API):
  - pure: `exam-time`, `exam-occurrences` (grouping, counting, buffered batches), `exam-status`,
    `coverage`, `validate-generated-exam`, the exam rules;
  - integration per story (`018-us1-bank` … `018-us8-grading`), `018-schema`;
  - security: isolation (not present, other class, other teacher's bank), time (writes after end,
    start after the window), holds (writes refused on every route and device), concurrency (10
    simultaneous occurrences → one hold; decision × decision; decision × time; pause × occurrence;
    submit × time), settlement idempotency, rate limits, audit coverage, boundaries, performance.
- Evals: `test/eval/exam-generator.eval.ts` (on demand), recorded replay in CI.
- Web: Testing Library with `vitest-axe` and the keyboard helpers; fake timers for the timer,
  alerts, countdown and inactivity; the forbidden-words scan.
- Playwright E2E `exam.spec.ts`: teacher + 2 students (warnings → hold → return; time out; cancel →
  release).

**Target Platform**: Linux server (API); browser for the teacher (desktop, tablet) and the student
(desktop, phone).
**Project Type**: web service + web app (pnpm/Turborepo monorepo)
**Performance Goals**:
- events batch with occurrence counting p95 < 200 ms;
- exam monitor of 60 students p95 < 300 ms (3 queries + settlement of expired attempts);
- decision p95 < 300 ms;
- timer drift ≤ 2 s after a reload (SC-002); visible hold ≤ 10 s via 5 s polling (SC-007).

**Constraints**:
- server clock only; the browser's time is information or grouping, never official;
- no stored expired/hold/paused status; end times derived;
- no automatic cancellation or zero; no fraud wording;
- no WebSocket, SSE, scheduler, Redux or new dependency;
- works and exercises behave exactly as before (012–016 suites unchanged except the SC-012 guard).

**Scale/Scope**:
- 15 new routes (bank 8, generation 3, monitor 1, decisions 3) and ~10 changed shapes;
- 1 migration;
- 3 new API modules (`exams`, `exam-ai`, `exam-sessions`) and changes in `activities`,
  `student-activities`, `attempt-integrity`, `attendance` (student exit refused), `work-help` (none
  beyond the CHECK);
- 7 permissions, 13 new audit types, 5 changed;
- 1 agent with evals;
- 3 web features (`exams`, `exam-session`, `exam-attempt`), 4 Exam Mode components, 1 E2E.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] **I. Security**:
  - strict bodies; server fields refused (`startedAt`, `endsAt`, counts, ordinals, resolutions,
    end reasons, grades, mode/help/release mode);
  - OWASP A01: every exam, activity, attempt and hold scoped → `404`; A04: rate limits on
    decisions, generation, events; A03: generated and teacher text rendered as text, the syllabus
    as untrusted data to the model.
- [x] **II. RBAC**: 7 new permissions (`provas.*`, `ia.provas.gerar`,
  `provas.encerramentos.decidir`) + 012/016 ones; matrix rows for every route; no role-name check.
- [x] **III. Server authority**: start, end, remaining time, occurrence count, holds and settlement
  come from the injected `Clock` and the DB; the client's timer, alerts and inactivity are UX and
  signals only.
- [x] **IV. Untrusted code**: nothing executed; code answers are text and the teacher grades them.
- [x] **V. Data integrity**: one migration; composite FKs; partial UNIQUE (open hold); gap-free
  ordinals; CHECKs pinning EXAM to CONTROLLED/no help/PRESENT_ONLY; append-only occurrences;
  immutable resolutions; defense triggers.
- [x] **VI. Audit & logs**: bank, generation, holds, decisions, settlement and refusals audited in
  the same transaction; metadata ids/enums/counts only.
- [x] **VII. Tests**: the hold, the decisions, the time settlement, the isolation and the
  concurrency suites are written first (tasks).
- [x] **VIII. Layering**: thin controllers; services with scoped queries and row locks; pure
  `exam-time`, `exam-occurrences`, `exam-status`, `coverage`; no rule in React components.
- [x] **IX. Simplicity**: no new dependency, transport or scheduler; settlement on the next touch
  (T5); holds and occurrences as rows like the 016 pause; no Redux (T18).
- [x] **X. Evidence**: events are facts; occurrences, warnings, hold and settlement are rule results
  of an explicit, announced rule (`eventos → evidências → regras → professor`); no fraud wording.
- [x] **XI. Human oversight**: cancellation and zero only by the teacher's decision; the hold is
  reversible (return); see Complexity Tracking for the reading of "bloqueio disciplinar".
- [x] **XII. Determinism first**: everything during the exam is deterministic; AI only drafts the
  bank exam.
- [x] **XIII. Risk level**: `exam-generator` L2, DRAFT output, never approves, applies, publishes,
  ends or grades (FR-006); no AI reaches the student in an exam (help allowance 0 by CHECK).
- [x] **XIV–XV. AI governance**: one read-only tool with ownership; schema-validated output;
  timeout and escalation by the 009 policy; grounded on the chosen topics.
- [x] **XVI. Explicit states**: `exam_status`, `exam_end_reason`, `exam_hold_resolution`,
  `exam_occurrence_kind`; transitions validated; no boolean flags for workflow.
- [x] **XVII. Idempotency**: idempotency keys on apply and generation; resend-safe events
  (015 `clientEventId`); one hold per ordinal; decisions keyed by hold; settlement re-runs as a
  no-op.
- [x] **XVIII. Safe interruption**: generation has timeout and kill switch (006 agent status);
  a closed or cancelled activity ends attempts with their saved answers; holds stay decidable.
- [x] **XIX. AI evals**: golden set and release-gate evidence per model before enabling.
- [x] **XX. Pedagogy**: monitoring limited to browser signals the student is told about; least
  invasive (no camera, microphone, screen recording or OS lock); teacher's adjustable inactivity.
- [x] **XXI. Configurable domain**: topics, languages and difficulties are data/enums of the
  question model; no subject in code.
- [x] **XXII. Personalization & accessibility**: no adaptation data (extra time is a later
  feature); timer, alerts and countdown accessible (`role` timer/status/alert, reduced motion);
  keyboard-only flows (SC-011).
- [x] **XXIII. Curricular traceability**: every exam question linked to 1–3 topics; coverage by
  topic and difficulty before applying; taught-scope flag (012 FR-005a); AI generation limited to
  the teacher-chosen topics; snapshot on apply.
- [x] **XXIV. Academic isolation**: teacher routes through `ClassContextPolicy` and bank ownership;
  student routes from the ACTIVE enrollment, then presence, then the own attempt.
- [x] **XXV. Privileged provisioning**: N/A. Permissions granted to TEACHER by migration.
- [x] **XXVI. Shared contracts**: `packages/contracts/src/exams/*`, `src/exam-sessions/*`, changes
  in `activities/` and `attempt-integrity/`, endpoint catalog; user-facing text stays in the web.
- [x] **Frontend stack**: `features/{exams,exam-session,exam-attempt}`, TanStack Query (polling),
  React Hook Form + Zod for the bank editor and the apply form, DS components only.

**Post-design re-check**: all ✅ against constitution v3.4.0. No amendment is needed (research
T19); the one interpretation is recorded below.

Touches outside the new modules:
- `activities`: EXAM create/snapshot/scope-check coverage, roster statuses, release refusal,
  settlement, close/cancel with holds;
- `student-activities`: start window and rules acceptance, end + grace, hold refusals, exam view;
- `attempt-integrity`: `INACTIVITY`, occurrence counting, holds, review fields;
- `attendance`: student exit refused for EXAM; pause end kind `TIME_EXPIRED`;
- boundary guards (`activities-boundary` SC-012, new `exams-boundary`, `exam-sessions` guard);
- the permission seed, audit types, endpoint catalog, authorization matrix, config;
- `traceability.spec.ts` (`SPECS += 018` at the first implementation phase).

During planning the spec did not change. Two details it left to the plan are fixed here: the
grouping window (2 s) and the network grace at the end (2 s).

## Project Structure

### Documentation (this feature)

```text
specs/018-controlled-exams/
├── plan.md
├── research.md                     # T1–T19
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── http-api.md
│   ├── permissions.md
│   ├── audit-events.md
│   ├── configuration.md
│   ├── exam-generator.md
│   └── web-ui.md
├── checklists/requirements.md
└── tasks.md                        # /speckit-tasks
```

### Source Code (repository root)

```text
apps/api/
├── prisma/{schema.prisma, migrations/<ts>_controlled_exams/}   # bank tables, EXAM columns, occurrences, holds, triggers, seed
├── src/platform/config/config.schema.ts                        # RATE_LIMIT_EXAM_DECISIONS_PER_MINUTE, RATE_LIMIT_EXAM_GENERATIONS_PER_HOUR
├── src/modules/exams/                                          # bank: controller, service, rules, coverage.ts, views (teacher/student preview)
├── src/modules/exam-ai/                                        # requests controller/service, definitions/exam-generator.ts, generation/{validate,materialize,build-proposal}
├── src/modules/exam-sessions/                                  # monitor + decisions controllers/services, exam-status.ts (pure), views
├── src/modules/attempt-integrity/exam-occurrences.ts           # pure grouping + counting; hold opening in focus-events.service
├── src/modules/activities/
│   ├── snapshot/from-exam.ts, scope/… (coverage)                # apply EXAM
│   ├── status/exam-time.ts                                      # pure (research T4)
│   └── submission/settle-exam.ts                                # T5, used by student and teacher paths
├── src/modules/student-activities/{attempts.service,student-activity-loader}.ts   # window, grace, holds, exam view
├── src/modules/attendance/my-pause.service.ts                   # EXIT_NOT_ALLOWED
├── src/modules/audit/audit-event-types.ts
└── test/
    ├── helpers/exams.ts
    ├── integration/018-us1-bank … 018-us8-grading.spec.ts, 018-schema.spec.ts
    ├── security/018-{isolation,time,holds,concurrency,settlement,rate-limits,audit,boundaries,performance}.spec.ts
    ├── eval/exam-generator.eval.ts, fixtures/exam-generator/, fixtures/evaluations/exam-generation/
    ├── exams-boundary.spec.ts (new), activities-boundary.spec.ts (amended)
    └── traceability.spec.ts                                     # SPECS += 018
packages/contracts/src/{exams/*, exam-sessions/*, activities/*, attempt-integrity/*, endpoints.ts}
apps/web/
├── features/exams/{api,components,hooks,schemas}/…              # bank list, editor, AI dialog
├── features/exam-session/{api,components,hooks}/…               # ExamRoomPanel, HoldDecisionDialog, OccurrenceList
├── features/exam-attempt/{api,components,hooks}/…               # RulesScreen, ExamShell, use-exam-clock, use-inactivity
├── components/ui/assessment/{exam-timer,time-alert,final-countdown,warning-dialog}.tsx
├── features/activities/components/{apply-activity,activity-detail,roster,attempt-review}.tsx
├── features/student-activities/components/activity-answering.tsx  # routes EXAM to exam-attempt
├── lib/messages/error-messages.ts                               # EXAM_* codes
└── e2e/exam.spec.ts
README.md, CLAUDE.md, apps/api/CLAUDE.md, apps/web/CLAUDE.md, apps/api/.env.example
```

**Structure Decision**: the existing monorepo.
- **API**: three new modules (`exams`, `exam-ai`, `exam-sessions`). Time, the hold refusal and the
  settlement live inside the 012 queries and locks (T4, T5, T8); occurrence counting lives in
  `attempt-integrity` with the rest of the monitoring (T6).
- **Web**: three new features and the Exam Mode components of 005.

## Complexity Tracking

No constitution violation. Two structural choices and one reading are recorded.

| Change | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| A third bank (8 tables) mirroring 011 | Clarification Q1; constitution XXIII keeps banks apart; per-question difficulty and required topics differ from works | Reusing `works` tables: would change 011's rules and triggers and mix the banks the boundary guards keep apart |
| Settlement as an idempotent write on the next touch (T5) | Grading and release need a submission; there is no scheduler | A job: no scheduler exists (IX); grading without a submission duplicates 012 |
| Reading of XI for the hold (T19) | XI lists "bloqueio disciplinar" and "anulação" as human decisions. The hold stops answering automatically, but it is the announced rule of this assessment (X allows explicit rules), reversible by the teacher, and never cancels, grades or labels; cancellation and zero stay `HUMAN_DECISION` | Cancelling automatically: forbidden by XI without an amendment; no stop at all: contradicts the user's rule. If a reviewer reads the hold as a disciplinary block, the fix is a `/speckit-constitution` amendment, not a code change |
