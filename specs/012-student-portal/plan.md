# Implementation Plan: 012 — Portal do Aluno

**Branch**: `012-student-portal` | **Date**: 2026-10-01 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/012-student-portal/spec.md`

## Summary

The first class activity of the platform and the student's side of it. A teacher applies an
APPROVED work (011) or 1–10 APPROVED exercises (010) to a class: the content is copied into a
snapshot (questions, values, answer key, grading strategy, topics), with publication date,
deadline, late policy (`REJECT` or `ACCEPT_MARKED`, Q2) and, for exercises, a total grade
distributed in exact hundredths (Q3). Topics outside the class's taught scope (items of
COMPLETED plan topics, 004) are flagged and need the teacher's confirmation (constitution XXIII).
The activity type (`EXERCISE`, `ASSIGNMENT`) and execution mode (`NORMAL`) are enums that the
exams spec extends.

The student lands on a dashboard (counters, next deadlines, urgency), lists and filters their
activities, starts one (one attempt, unique), answers with autosave (one answer per question with
a revision: retries are no-ops, tabs never overwrite each other silently, offline answers wait in
the browser) and submits once (row locks, idempotent repeat, late flag by the server clock).
Statuses (PENDENTE, EM_ANDAMENTO, ATRASADO, ENTREGUE, CORRIGIDO) are derived on every read by one
pure function. At submission the 011 grading registry grades multiple choice (`EXACT_MATCH`);
open answers and code wait for the teacher (no AI, no Code Runner), who grades with feedback
and releases the activity's results (Q1). The student sees grade and feedback only after release
with complete grading, and never the answer key: every student response is an allowlist built
on the server.

## Technical Context

**Language/Version**: TypeScript 7 on Node.js 24 LTS (`apps/api` with SWC; `tsc` type-check)
**Primary Dependencies**: NestJS 11, Prisma 7 + `@prisma/adapter-pg`, Zod 4 (`@repo/contracts`); web: Next.js 16, React 19, TanStack Query 5, React Hook Form 7, shadcn/ui, Lucide; no new dependency (the code editor is a textarea, research P21)
**Storage**: PostgreSQL 17 — tables `class_activities`, `class_activity_questions`, `class_activity_alternatives`, `class_activity_test_cases`, `class_activity_question_topics`, `activity_attempts`, `activity_answers`, `activity_submissions`, `activity_question_gradings`; 8 enums; `numeric(5,2)` grades; UNIQUEs, composite FKs, CHECKs and (deferred) triggers; browser `localStorage` only for unsent answers
**Testing**: Vitest (pure status/operation rules exhaustively with an injected clock, integration per story against the test DB, security suites for isolation, student view, concurrency, rate limits, performance; contract tests), Testing Library + `vitest-axe` + keyboard helpers, Playwright E2E of the whole cycle
**Target Platform**: Linux server (API), browser (student on phone and desktop, teacher)
**Project Type**: web service + web app (pnpm/Turborepo monorepo)
**Performance Goals**: dashboard and list < 1 s for a student in 10 classes × 50 activities; save round-trip < 300 ms p95 locally; teacher activity detail with 60 students < 1 s
**Constraints**: no answer key, private test case, explanation or unreleased grade in any student response; server clock only; one attempt / one answer per question / one submission under any concurrency; no code execution, no AI, no file upload; banks unchanged; grades never floats
**Scale/Scope**: 17 routes, 1 migration, 2 API modules, 8 permissions, 13 audit types, 8 web pages, ~12 assessment components, 1 E2E

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] **I. Security**: strict bodies (no `studentUserId`, `status`, dates, grades or flags from students); answers validated by type, alternative and size; student texts rendered as text; OWASP A01 (context checks, 404), A03 (Prisma parameters, no raw SQL from input), A04 (rate limits), A05/A09 (no stack traces, audit)
- [x] **II. RBAC**: `atividades.visualizar/aplicar`, `entregas.visualizar`, `notas.lancar/liberar` (TEACHER), `atividades.proprias.visualizar/responder`, `notas.proprias.visualizar` (STUDENT); matrix rows for every route; no role-name check
- [x] **III. Server authority**: publication phase, deadline, late flag, status and permissions computed with the server clock; autosave with offline buffer (P8, P22); the client only displays `serverNow`-based warnings; a transient failure at the deadline never loses the work: the teacher can accept the saved attempt as a late submission (FR-006b)
- [x] **IV. Untrusted code**: student code stored as text, never executed; `UnavailableCodeRunner` is the only runner; `activities-boundary.spec.ts` forbids execution APIs
- [x] **V. Data integrity**: one migration; UNIQUEs (attempt, answer, submission, idempotency, positions), composite FKs (alternative of the question), CHECKs (type ↔ strategy, kind ↔ type, grade ranges, sizes, attempt number), triggers (value sum, 1–10 questions, 3–5 alternatives with one correct, no change after submission, immutable submission columns)
- [x] **VI. Audit & logs**: 13 event types (contracts/audit-events.md) with ids/counts/codes only; "envio de respostas" read as the submission, always audited; progress throttled; disconnection/focus events left to CONTROLLED mode (P19, XX); denied access audited; the journey and the secret scan cover answers and feedback
- [x] **VII. Tests**: status, operation and grading rules exhaustive; "submissão", "autosave", "cálculo de notas" and "autorização" are the critical rules named by the constitution, each with integration and concurrency tests written first
- [x] **VIII. Layering**: pure `status/`, `views/`, `snapshot/` mapping, `scope/`; services with scoped Prisma queries and locks; thin controllers; no rule in React (the web shows `canAnswer` and status from the API)
- [x] **IX. Simplicity**: no new dependency, queue, job or WebSocket; status derived instead of a scheduler (P4); in-memory list bounded by enrollments (P16)
- [x] **X. Evidence**: answers and timestamps are FACT; rule grades RULE_RESULT; nothing concludes about the student from one event
- [x] **XI. Human oversight**: open answer and code grades, feedback, release and the out-of-scope application are HUMAN_DECISION
- [x] **XII. Determinism first**: multiple choice by `EXACT_MATCH`, grades by integer arithmetic, scope by plan data; no AI anywhere
- [x] **XIII. Risk level**: N/A — no automated decision beyond deterministic rules; no AI
- [x] **XIV–XV. AI governance**: N/A (no agent, tool or model call; `activities-boundary.spec.ts` forbids `modules/ai` imports)
- [x] **XVI. Explicit states**: `class_activity_status`, `activity_attempt_status`, `activity_grading_status`; publication phase and student status derived, never flags
- [x] **XVII. Idempotency**: create by idempotency key; start by `ON CONFLICT`; saves by content + revision; submit returns the existing submission; close/cancel/release no-ops
- [x] **XVIII. Safe interruption**: a submit is one transaction (all or nothing); a dropped connection after the POST is resolved by the idempotent repeat; offline answers survive in the browser
- [x] **XIX. AI evals**: N/A (no AI)
- [x] **XX. Pedagogy**: no monitoring at all in NORMAL mode (no focus, clipboard or tab tracking); progress audit is coarse (15 min, counts only)
- [x] **XXI. Configurable domain**: no subject or language hard-coded; activity types, modes and question types are platform concepts (constitution names them)
- [x] **XXII. Personalization & accessibility**: no adaptation data touched; Exam Mode components with axe and keyboard tests; responsive; statuses never by color alone
- [x] **XXIII. Curricular traceability** (Exercise as practice deferred — see Complexity Tracking): bank items snapshotted into the class activity (XXIII "Bancos do professor × atividade"); question topics copied; taught scope computed deterministically from COMPLETED plan topics, out-of-scope topics flagged and confirmed by the teacher (P5, spec FR-005a); a work only to a class of its subject
- [x] **XXIV. Academic isolation**: student reads and writes start at the ACTIVE enrollment; teacher routes at `ClassContextPolicy`; 404 out of context; ADMIN/MANAGER 403; isolation suite with two teachers and three students (SC-002)
- [x] **XXV. Privileged provisioning**: N/A (no account or role change)
- [x] **XXVI. Shared contracts**: `packages/contracts/src/activities/*` (teacher, student, grading shapes, enums), reusing `Grade`, `distributeGrade` and `AnswerSchema` from `works`; endpoints catalog; the web previews values with `distributeGrade`
- [x] **Frontend stack**: `apps/web/features/{activities,student-activities}`, TanStack Query (no Redux: unsent answers are local to the page and `localStorage`), React Hook Form for the teacher forms, design-system components

**Post-design re-check**: all ✅. Touches outside the new modules: the permission seed, audit
event types, endpoints catalog, config (3 rate limits), the student menu and `startPathFor`, the
class page link, the domain-boundary prefixes (`nota`, `submiss` now allowed, P24), the 011
grading port gaining `UNAVAILABLE` / `AI_REVIEW_UNAVAILABLE` (P12) and the Exam Mode components
built from the 005 contract (P21). The spec was updated during planning for the taught scope
(FR-005a), the activity lifecycle (FR-004) and the official save texts (FR-018).

## Project Structure

### Documentation (this feature)

```text
specs/012-student-portal/
├── plan.md
├── research.md          # P1–P24
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── http-api.md
│   ├── student-status.md
│   ├── permissions.md
│   ├── audit-events.md
│   ├── configuration.md
│   └── web-ui.md
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
apps/api/
├── prisma/{schema.prisma, migrations/<ts>_class_activities/}      # tables, enums, triggers, permission seed
├── src/platform/config/config.schema.ts                           # 3 rate limits
├── src/modules/activities/                                        # domain + teacher routes
│   ├── activity-types.ts                                          # registry by type (P3)
│   ├── activity.state-machine.ts                                  # ACTIVE/CLOSED/CANCELLED (P4)
│   ├── status/{student-status,roster-status,operations}.ts        # pure (P10, P11)
│   ├── snapshot/{from-work,from-exercises,write-snapshot}.ts      # bank → snapshot (P2, P6)
│   ├── scope/taught-scope.ts                                      # P5
│   ├── grading/{grade-submission,unavailable-ai-review}.ts        # 011 registry bridge (P12)
│   ├── views/{teacher-view,student-view}.ts                       # allowlist (P15)
│   ├── activities.{controller,service}.ts                         # apply, edit, close, cancel, release
│   ├── attempts-review.{controller,service}.ts                    # teacher: attempt view, grades
│   └── activities.module.ts
├── src/modules/student-activities/
│   ├── student-activity-loader.ts                                 # P16, P18
│   ├── my-activities.{controller,service}.ts                      # dashboard, list, detail
│   ├── attempts.{controller,service}.ts                           # start, save, submit (P7–P10)
│   └── student-activities.module.ts
├── src/modules/works/grading/ai-review.ts                         # + UNAVAILABLE outcome (P12)
├── src/modules/audit/audit-event-types.ts
└── test/
    ├── helpers/activities.ts                                      # applyWork, applyExercises, enrollStudent, startAttempt, …
    ├── integration/012-us1-apply … 012-us6-history.spec.ts, 012-schema.spec.ts
    ├── security/012-{isolation,student-view,concurrency,rate-limits,performance,boundaries}.spec.ts
    ├── security/{domain-boundary,audit-coverage,authorization-matrix}…  # updated
    ├── activities-boundary.spec.ts
    └── traceability.spec.ts                                       # SPECS += 012
packages/contracts/src/activities/{enums,teacher,student,grading}.ts
packages/contracts/src/works/grading.ts                            # + AI_REVIEW_UNAVAILABLE
apps/web/
├── components/ui/assessment/…                                     # Exam Mode subset (P21)
├── features/design-system/registry.ts, design-system/{components,exam-mode}.md
├── features/activities/{api,components,hooks,schemas}/…
├── features/student-activities/{api,components,hooks,schemas,store}/…   # store = offline answers (P22)
├── app/(student)/{painel,minhas-atividades,minhas-atividades/[id],historico}/page.tsx
├── app/(app)/turmas/[id]/atividades/{page,nova/page,[activityId]/page,[activityId]/tentativas/[attemptId]/page}.tsx
├── lib/navigation.ts, lib/messages/error-messages.ts, components/layout/student-layout.tsx, proxy.ts
└── e2e/student-portal.spec.ts
README.md, CLAUDE.md, apps/api/CLAUDE.md, apps/api/.env.example
```

**Structure Decision**: the existing monorepo; the class activity domain and the teacher routes
in `modules/activities`, the student routes in `modules/student-activities` (the 003
`enrollments` / `my-classes` split), the banks untouched except the 011 grading port's new
outcome (P1, P12). Web: one feature per side plus the Exam Mode components in `components/ui`.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Constitution XXIII describes `EXERCISE` as practice with multiple attempts and immediate feedback; in 012 an Exercise activity has one attempt, no immediate feedback and a grade (Q3 = A), behaving like an `ASSIGNMENT` | The first activity cycle ships end to end (apply → answer → submit → grade → release) with one submission path to make idempotent and test (XVII); immediate feedback would show the correction right after each answer, which conflicts with "no answer key in a student response" (FR-030) until a spec decides what feedback may reveal | Building multiple attempts and immediate feedback now doubles the attempt and grading rules before the single-attempt path is validated, and needs a feedback-without-answer-key design no spec has decided. The deviation is contained: the type stays its own enum value and registry entry (P3), the attempt has a `number` column whose `CHECK (number = 1)` is the one line to remove (P7), and the practice behaviour is listed for a follow-up spec (spec Assumptions) |
