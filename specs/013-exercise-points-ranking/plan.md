# Implementation Plan: 013 — Pontuação e Ranking dos Exercícios

**Branch**: `013-exercise-points-ranking` | **Date**: 2026-10-03 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/013-exercise-points-ranking/spec.md`

## Summary

EXERCISE activities stop being graded assessments and become practice that earns points. On the
012 tables, an EXERCISE activity loses grade, deadline and late policy (nullable columns with
CHECKs by type) and its snapshot gains each exercise's difficulty and fixed points (15/30/60,
`EXERCISE_POINTS` in `@repo/contracts`). Students get numbered attempts with one open at a time:
attempt 1 concluded is the first conclusion (the only one that scores); "Refazer" creates the next
attempt idempotently. Concluding writes one `exercise_question_results` row per question —
multiple choice right/wrong by 011 `EXACT_MATCH`, blanks wrong, open answer and code
`PENDING_TEACHER` on the scoring row — and a partial UNIQUE makes a bank exercise score once per
student and class. After each conclusion the student sees the answer key and explanation through
the `student-view.ts` allowlist. The teacher marks pending rows right or wrong (no grade, no
release). A new `ranking` module derives each class's ranking on read (Σ points of non-cancelled
activities over ACTIVE enrollments, competition positions, pt-BR alphabetical ties) for the
dashboard's top 5 and the full ranking pages. ASSIGNMENT is untouched; existing EXERCISE
activities are converted without keeping grades (Q3 = A).

## Technical Context

**Language/Version**: TypeScript 7 on Node.js 24 LTS (`apps/api` with SWC; `tsc` type-check)
**Primary Dependencies**: NestJS 11, Prisma 7 + `@prisma/adapter-pg`, Zod 4 (`@repo/contracts`); web: Next.js 16, React 19, TanStack Query 5, React Hook Form 7, shadcn/ui, Lucide; no new dependency
**Storage**: PostgreSQL 17 — one migration: nullable grade/deadline/late columns with CHECKs by type, snapshot `difficulty`/`points`, attempt numbering (`completed_at`, one-open partial UNIQUE, numbering trigger), new `exercise_question_results` (+ enum `exercise_result`), 3 permissions, conversion of 012 EXERCISE data
**Testing**: Vitest (pure: student status EXERCISE branch, operations, results table, `rankClass`; integration per story; security: isolation, student view before/after conclusion, concurrency of complete/retry/once-per-class, rate limit; migration test), Testing Library + `vitest-axe` + keyboard helpers; Playwright E2E of the practice → mark → ranking cycle
**Target Platform**: Linux server (API), browser (student phone/desktop, teacher)
**Project Type**: web service + web app (pnpm/Turborepo monorepo)
**Performance Goals**: ranking of a 200-student class < 300 ms; dashboard with 10 classes (rankings included) < 1 s; conclusion round-trip < 500 ms p95 locally
**Constraints**: points never a grade (no `notas.*`, no release); answer key only after a conclusion; once per class under concurrency; integers only; ASSIGNMENT behavior byte-for-byte as 012; no code execution, no AI
**Scale/Scope**: 6 new routes + 8 changed, 1 migration, 1 new API module (`ranking`), 3 permissions, 2 new audit types, 2 new web pages + 6 changed, 1 E2E

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] **I. Security**: strict bodies (EXERCISE create refuses `totalGrade`/`deadline`/`latePolicy`; marks accept only CORRECT/WRONG); no points, result or "first" from the client; texts rendered as text; OWASP A01 (context → 404), A04 (new rate limit)
- [x] **II. RBAC**: `exercicios.corrigir`, `ranking.visualizar` (TEACHER), `ranking.turma.visualizar` (STUDENT) + 012 permissions; matrix rows for every new route; no role-name check (K14)
- [x] **III. Server authority**: first conclusion = attempt 1 by the data; results, points, statuses and ranking computed on the server; autosave and offline buffer of 012 reused
- [x] **IV. Untrusted code**: code answers stored as text, never executed; boundary guard unchanged
- [x] **V. Data integrity**: CHECKs by type, difficulty ↔ points CHECK, composite FKs (result ↔ attempt, result ↔ question points), partial UNIQUEs (one open attempt, once per class), numbering and immutability triggers (data-model.md)
- [x] **VI. Audit & logs**: `exercise_attempt.completed`, `exercise_result.marked`, extended 012 events; ids/counts/enums only; ranking reads not audited (no assessment data) (K15)
- [x] **VII. Tests**: points, first conclusion, once per class, answer-key visibility and ranking order are critical rules with pure, integration and concurrency tests written first; ASSIGNMENT regression = the 012 suites unchanged and green
- [x] **VIII. Layering**: pure `status/`, `results/`, `rank.ts`; services with scoped queries and locks; thin controllers; React only displays API fields
- [x] **IX. Simplicity**: no new dependency, cache, job or table family; ranking derived on read (K11); the 012 tables reused (K1)
- [x] **X. Evidence**: answers and conclusion times FACT; MC results, points, ranking RULE_RESULT; nothing inferred about a student from the ranking
- [x] **XI. Human oversight**: open answer and code results are the teacher's HUMAN_DECISION, changeable and audited
- [x] **XII. Determinism first**: MC by `EXACT_MATCH`, fixed points, deterministic ranking; no AI
- [x] **XIII. Risk level**: N/A — no automated decision beyond deterministic rules
- [x] **XIV–XV. AI governance**: N/A — no agent or model call
- [x] **XVI. Explicit states**: `exercise_result` enum; attempt states of 012; student status derived
- [x] **XVII. Idempotency**: start `ON CONFLICT`; retry by `afterNumber` (K4); complete of a concluded attempt returns it; equal marks no-op
- [x] **XVIII. Safe interruption**: conclusion is one transaction; offline answers survive in the browser (012)
- [x] **XIX. AI evals**: N/A
- [x] **XX. Pedagogy**: practice without timer or monitoring; ranking shows only points of practice, never grades (proportional, engagement-only)
- [x] **XXI. Configurable domain**: point values tied to the platform's exercise difficulty, not to subject/language
- [x] **XXII. Personalization & accessibility**: no adaptation data; statuses and the viewer's ranking row by text + icon; axe and keyboard tests
- [x] **XXIII. Curricular traceability**: snapshot and taught-scope flag of 012 unchanged; EXERCISE now matches the constitution's definition (practice, multiple attempts, feedback after conclusion), which closes 012's Complexity Tracking deviation
- [x] **XXIV. Academic isolation**: ranking only for ACTIVE enrollment (student) or the class's teacher; attempts by number inside the session student's; 404 out of context; a student sees classmates' name and points only — no answer, result or grade, as the v3.3.0 ranking exception allows
- [x] **XXV. Privileged provisioning**: N/A
- [x] **XXVI. Shared contracts**: `activities/points.ts`, `activities/exercise-results.ts`, changed `teacher.ts`/`student.ts`, new `ranking/`; endpoints catalog; `EXERCISE_POINTS` shared by API and web
- [x] **Frontend stack**: `features/ranking` + changes to the 012 features; TanStack Query; design-system components only

**Post-design re-check**: all ✅. Touches outside the activities modules: the permission seed,
audit event types, endpoints catalog, config (1 rate limit), the student dashboard and
`/minhas-turmas`, the class page link, `activities-boundary.spec.ts` (covers `ranking`),
`traceability.spec.ts` (SPECS += 013), and the 012 spec (a note that 013 amends its Exercise
rules — the spec wins over the code, so 012's text must not contradict it).

## Project Structure

### Documentation (this feature)

```text
specs/013-exercise-points-ranking/
├── plan.md
├── research.md          # K1–K18
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
├── prisma/{schema.prisma, migrations/<ts>_exercise_points/}        # K1–K3, K6, K14, K17
├── src/platform/config/config.schema.ts                            # K16
├── src/modules/activities/
│   ├── activity-types.ts                                           # scoring, hasDeadline, attempts (K1)
│   ├── snapshot/from-exercises.ts                                  # difficulty + points (K2)
│   ├── status/{student-status,roster-status,operations}.ts         # EXERCISE branch (K9)
│   ├── results/{exercise-results,complete-attempt}.ts              # K5, K6 (new)
│   ├── views/{teacher-view,student-view}.ts                        # K10
│   ├── activities.service.ts                                       # create/edit by type; release/grades refuse EXERCISE
│   └── attempts-review.{controller,service}.ts                     # marks (K8)
├── src/modules/student-activities/attempts.{controller,service}.ts # retry, complete, attempt by number (K4, K5)
├── src/modules/student-activities/my-activities.service.ts         # dashboard rankings, points in lists
├── src/modules/ranking/{rank.ts,ranking.service.ts,ranking.controller.ts,ranking.module.ts}   # K11–K13 (new)
├── src/modules/audit/audit-event-types.ts                          # K15
└── test/
    ├── integration/013-us1-apply … 013-us5-teacher-ranking.spec.ts, 013-migration.spec.ts
    ├── security/013-{isolation,student-view,concurrency,rate-limits}.spec.ts
    ├── security/{authorization-matrix,route-declarations,audit-coverage}…   # updated
    ├── activities-boundary.spec.ts                                 # + ranking
    └── traceability.spec.ts                                        # SPECS += 013
packages/contracts/src/activities/{enums,teacher,student,points,exercise-results}.ts
packages/contracts/src/ranking/index.ts, endpoints.ts
apps/web/
├── features/activities/…                                           # apply form, detail, marks
├── features/student-activities/…                                   # conclude, result, retry, points
├── features/ranking/{api,components,hooks}/…                       # RankingTable, RankingCard (new)
├── app/(student)/{painel,minhas-turmas,minhas-turmas/[id]/ranking}/page.tsx
├── app/(app)/turmas/[id]/{page,ranking/page}.tsx
├── lib/messages/error-messages.ts
└── e2e/exercise-points.spec.ts
specs/012-student-portal/spec.md                                    # amendment note
README.md, CLAUDE.md, apps/api/CLAUDE.md, apps/api/.env.example
```

**Structure Decision**: the 012 modules carry the EXERCISE changes behind the type registry; the
ranking is its own module (API and web) because it spans activities and enrollments and is read
by both sides. The banks (010/011) don't change.

## Complexity Tracking

No violation. 012's deviation ("Exercise as practice deferred") is resolved by this feature.
