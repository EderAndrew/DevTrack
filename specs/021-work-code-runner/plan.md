# Implementation Plan: 021 — Code Runner nos Trabalhos

**Branch**: `021-work-code-runner` | **Date**: 2026-10-27 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/021-work-code-runner/spec.md`

## Summary

The 019 Code Runner, unchanged, reaches the CODE questions of a Trabalho when the teacher allows it:

- **The option** (Y1, Y2): `class_activities.code_execution_allowed` (default false, ASSIGNMENT only by
  CHECK), set by `codeExecution` on apply and in the 015 options edit, fixed once a student starts
  (`409 ACTIVITY_ALREADY_STARTED`, also a trigger). Accepted only when the snapshot has a CODE question
  with a PUBLIC case in a language with execution (`422 CODE_EXECUTION_NOT_ELIGIBLE`); `WorkSummary`
  carries `runnableCodeQuestionCount` so the form shows the option only then.
- **Running on a work** (Y4–Y6): `CodeRunsService` admits an ASSIGNMENT with the option and applies the
  save rule of 012 (`decideOperation("SAVE")`) and the pause of 016 (`409 ATTEMPT_PAUSED`, audited as
  `attempt_pause.write_refused` with `operation: "CODE_RUN"`); triggers repeat it in the database
  (`code_runs_insert_valid` replaced, `code_runs_paused`). Reads of a work's runs only while the attempt
  is open and not paused. One pending run and 10/min per student, shared with exercises.
- **The teacher's summary** (Y7, Y8): `GET …/attempts/:attemptId/code-runs` in `code-runs` (the 015
  timeline pattern): per CODE question the run count, a pending flag and the last finished run's
  verdicts — derived on read from columns the 24 h purge keeps; no content ever.
- **Runner availability for the apply form** (Y3): `GET /code-runner/availability`.
- **Web** (Y9): the checkbox in `work-options.tsx`; `CodeRunPanel` mounted on any CODE question with an
  `execution` (so also in the focus page); `CodeRunSummary` in the attempt review.

## Technical Context

**Language/Version**: TypeScript 7 on Node.js 24 LTS (`apps/api` with SWC; `tsc` type-check)
**Primary Dependencies**: NestJS 11, Prisma 7, Zod 4 (`@repo/contracts`); web: Next.js 16, React 19,
TanStack Query 5, React Hook Form 7, shadcn/ui, Lucide, CodeMirror 6 (014). **No new dependency** and no
new infrastructure: the 019 worker, images and gVisor guard serve works as they are (Y13).
**Storage**: PostgreSQL 17 — one migration: `class_activities.code_execution_allowed` + CHECK + fixed-
after-start trigger; `code_runs_insert_valid` replaced; `code_runs_paused` trigger (Y5).
**Testing**:
- Vitest (API) with the 019 `FakeSandbox` and in-process worker (`test/helpers/code-runs.ts`, extended
  with a work helper): `021-schema`, `021-us1-run-work` … `021-us4-rules`, security (isolation, private
  cases on works, invariance of the submission and grades, refusal matrix, audit/log scan with
  `MARCADOR-CODIGO-021`), performance of the summary.
- Web: Testing Library + `vitest-axe` + keyboard helpers (option, panel on a work and in the focus page,
  summary).
- Playwright E2E `work-code-runner.spec.ts` (real worker, like 019).
- `test:sandbox` is unchanged (the execution is 019's).
**Target Platform**: Linux server (API, the 019 worker host); browser (desktop, phone).
**Project Type**: web service + worker + web app (pnpm/Turborepo monorepo)
**Performance Goals**: the 019 targets for a run (SC-001); summary route p95 < 150 ms for an attempt
with 10 CODE questions and 200 runs; apply/update unchanged (+ one eligibility query on the snapshot).
**Constraints**:
- student code never in the API (IV) — unchanged, only the 019 worker runs it;
- a run never changes the answer, attempt, submission, pause, grade, release, 015 events or helps
  (FR-008, SC-003);
- private cases never in a student response, not even their count (FR-015, SC-002);
- the teacher never sees code, inputs or outputs (FR-013);
- no new configuration, Redis, queue, WebSocket or npm dependency (IX).
**Scale/Scope**:
- 2 new routes, 3 changed request shapes (apply, update), 3 changed responses (teacher activity summary
  and detail, `WorkSummary`);
- 1 migration; changes in `activities` (column, eligibility, options, student view), `student-activities`
  (loader field), `works` (`runnableCodeQuestionCount`), `code-runs` (admission, reads, review service,
  availability route);
- no new permission or audit type; 4 changed audit metadata;
- web: `features/activities` (options, badge, review mount), `features/code-run` (summary + hook),
  `features/student-activities` (panel condition); 1 E2E.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] **I. Security**: strict bodies (`codeExecution` only on ASSIGNMENT; run body still `sourceCode`
  only); A01 every route scoped (student → own attempt; teacher → own class → 404); A03 output as text;
  A04 the 019 rate limit and pending rule.
- [x] **II. RBAC**: existing permissions only (`atividades.proprias.executar`, `atividades.aplicar`,
  `entregas.visualizar`); matrix rows for the two new routes; no role-name check.
- [x] **III. Server authority**: the option's eligibility, the save rule, the pause and every time come
  from the server and the injected `Clock`.
- [x] **IV. Untrusted code**: unchanged — the 019 worker and sandbox; the API still only writes QUEUED
  rows. The Code Runner keeps its own spec (019); this spec only widens where a run may start.
- [x] **V. Data integrity**: CHECK (ASSIGNMENT only), trigger fixing the option after the first attempt,
  the insert trigger widened with the option, the 016 pause trigger on `code_runs`.
- [x] **VI. Audit & logs**: setting changes and runs audited with ids/enums/counts; no content
  (SC-009).
- [x] **VII. Tests**: the refusal matrix, private cases, invariance and isolation written first.
- [x] **VIII. Layering**: thin controllers; the activities modules never import `code-runs` (the summary
  is a `code-runs` route; the student view keeps the 019 hook).
- [x] **IX. Simplicity**: one column, two routes, no new component or dependency.
- [x] **X. Evidence**: run counts and verdicts are facts shown to the teacher; no conclusion drawn.
- [x] **XI. Human oversight**: the grade stays the teacher's; nothing is prefilled (US3-6).
- [x] **XII. Determinism first**: execution and comparison are 019's deterministic rules; no AI.
- [x] **XIII. Risk level**: L1.
- [x] **XIV–XV, XIX. AI**: N/A — the `work-helper` does not see runs (edge case).
- [x] **XVI. Explicit states**: 019's run states; the option is a boolean setting, not a workflow.
- [x] **XVII. Idempotency**: one pending run per student (019); option change vs. first start serialized
  by the activity lock and the trigger.
- [x] **XVIII. Safe interruption**: 019's kill switch, deadlines and lease; works keep every flow when
  the runner is off (SC-007).
- [x] **XX. Pedagogy**: the teacher chooses whether the work allows this support; the summary is the
  least invasive form (counts and verdicts, no code).
- [x] **XXI. Configurable domain**: languages with execution stay catalog data.
- [x] **XXII. Accessibility**: keyboard and screen reader also in the focus page; verdicts in words.
- [x] **XXIII. Curricular traceability**: unchanged (011 topics).
- [x] **XXIV. Academic isolation**: student routes from the ACTIVE enrollment and presence; teacher
  routes from the owned class.
- [x] **XXV. Privileged provisioning**: N/A.
- [x] **XXVI. Shared contracts**: changes in `activities/`, `works/`, `code-runs/` and `endpoints.ts`;
  user-facing text only in the web.
- [x] **Frontend stack**: TanStack Query for the summary and availability; React Hook Form for the
  option; DS components only.

**Post-design re-check**: all ✅ against constitution v3.5.0; no amendment needed. The spec did not
change during planning; the details it left open are fixed in research Y1–Y13 (column and body field,
eligibility rule, availability route, admission order, read rules while paused or after submission,
summary route and shape, counting).

Touches outside the new code:
- `activities`: `activity-query.ts`, `views/teacher-view.ts`, `views/student-view.ts` (`executionOf` for
  an ASSIGNMENT with the option), `activities.service.ts` (apply/update options), a pure
  `code-execution.ts` (eligibility), snapshot readers;
- `student-activities/student-activity-loader.ts` (`codeExecutionAllowed`);
- `works/work-query.ts` + `views` (`runnableCodeQuestionCount`);
- `code-runs`: `code-runs.service.ts` (admission, reads), `code-run-review.service.ts` +
  `code-run-review.controller.ts`, `availability.controller.ts`, `views/teacher-run-summary.ts`;
- `audit-event-types.ts`, endpoint catalog, `authorization-matrix.ts`, `traceability.spec.ts`
  (`SPECS += 021`), journey (`MARCADOR-CODIGO-021`);
- docs: README, `CLAUDE.md` (root, api, web), `docs/deploy/code-runner.md` (works now run too).

## Project Structure

### Documentation (this feature)

```text
specs/021-work-code-runner/
├── plan.md
├── research.md                     # Y1–Y13
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── http-api.md
│   ├── permissions.md
│   ├── audit-events.md
│   └── web-ui.md
├── checklists/requirements.md
└── tasks.md                        # /speckit-tasks
```

### Source Code (repository root)

```text
apps/api/
├── prisma/{schema.prisma, migrations/<ts>_work_code_runner/}       # column, CHECK, triggers
├── src/modules/activities/
│   ├── code-execution.ts (new, pure eligibility), activities.service.ts, activity-query.ts
│   └── views/{teacher-view,student-view}.ts
├── src/modules/student-activities/student-activity-loader.ts
├── src/modules/works/{work-query.ts, views/*}                       # runnableCodeQuestionCount
├── src/modules/code-runs/
│   ├── code-runs.service.ts                                         # ASSIGNMENT admission, read rules
│   ├── code-run-review.{controller,service}.ts (new)                # teacher summary
│   ├── availability.controller.ts (new)                             # GET /code-runner/availability
│   └── views/teacher-run-summary.ts (new)                           # allowlist, no content
├── src/modules/audit/audit-event-types.ts
└── test/
    ├── helpers/code-runs.ts                                         # + createCodeWork
    ├── integration/021-us1-run-work … 021-us4-rules.spec.ts, 021-schema.spec.ts
    ├── security/021-{isolation,private-cases,invariance,refusals,audit,performance}.spec.ts
    └── traceability.spec.ts                                         # SPECS += 021
packages/contracts/src/{activities/*, works/works.ts, code-runs/{review,availability}.ts, endpoints.ts}
apps/web/
├── features/activities/components/{work-options,new-activity,activity-detail,class-activities,attempt-review}.tsx
├── features/code-run/{api,hooks,components/code-run-summary.tsx}
├── features/student-activities/components/activity-answering.tsx  # panel on any CODE question with execution
├── lib/messages/error-messages.ts                                 # CODE_EXECUTION_NOT_ELIGIBLE
└── e2e/work-code-runner.spec.ts
README.md, CLAUDE.md, apps/api/CLAUDE.md, apps/web/CLAUDE.md, docs/deploy/code-runner.md
```

**Structure Decision**: the existing monorepo. The option and its eligibility belong to `activities`
(the activity's settings, like 015); running and the review of runs stay in `code-runs`, which already
owns the queue and registers on the activities' hook, so no activity module imports it.

## Complexity Tracking

No constitution violation; nothing to justify.
