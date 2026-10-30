# Implementation Plan: 023 — Trabalho individual ou em grupo

**Branch**: `023-group-work` | **Date**: 2026-10-30 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/023-group-work/spec.md`

> **Gate**: requires constitution **v3.6.0** — applied on 2026-10-30 (`constitution-amendment-3.6.0.md`; XXIV gains
> the "trabalho em grupo" exception; research U1).

## Summary

A work applied "Em grupo" is done by a group sharing **one attempt** of the 012 model:

- **The format** (U2): `class_activities.group_size` (`NULL` = individual, 2–5 counting the leader; ASSIGNMENT and
  `PRESENT_ONLY` only; fixed after the first attempt), `groupSize` in the apply body and the 015 options PATCH.
- **The group is the attempt** (U3–U5): the student who starts creates the usual attempt; the new
  `attempt_participants` lists who takes part (every attempt gets its owner's row; a group adds its members), and
  `UNIQUE (activity_id, student_user_id, attempt_number)` makes "one group or one own attempt per work" a database
  rule. `attempt_groups` holds the leader and the editor. The per-student facts (015 events, 015 helps, 016 pauses,
  019/021 runs) point their composite FK at the participant, so they stay per student inside a group. Every
  student-side "attempt of this student" query joins the participants.
- **Forming and adding** (U6): start with `{ memberIds }` or `{ alone: true }`, and `POST …/group/members`, under an
  advisory lock per activity, all or nothing (`409 GROUP_MEMBERS_UNAVAILABLE`); candidates from
  `GET …/group/candidates` (present, active, not started; name only).
- **Editing** (U7, U8): one editor per group; `POST …/group/editing` (HAND, TAKE_BACK, RETURN) with conditional
  updates and the append-only `attempt_group_events`; saves only from the editor and the submit only from the leader
  holding the editing (service + triggers); every accepted save logged by trigger in `activity_answer_saves`
  (who, question, revision, when — no content).
- **Pauses and access** (U9, U10): the 016 pause triggers look at the writer; a paused or removed editor, and a
  removed leader, are settled by the next touch (`settleGroup`, the 018 pattern).
- **Help, runs, grade** (U13, U14): 3 orientations per attempt = per group, requested by the editor, read by all;
  runs per member; one submission, the released result to every participant.
- **Teacher** (U16): roster and attempt carry `participants`; `GET …/attempts/:attemptId/group` (members, editing
  history, saves per question).
- **Web** (U12, U17): `features/group-work` (start dialog, group bar, notice), read-only answering for readers with
  5 s polling, "Formato" in the apply form, "Grupo" in the review.

## Technical Context

**Language/Version**: TypeScript 7 on Node.js 24 LTS (`apps/api` with SWC; `tsc` type-check)
**Primary Dependencies**: NestJS 11, Prisma 7, Zod 4 (`@repo/contracts`); web: Next.js 16, React 19, TanStack Query 5,
React Hook Form 7, shadcn/ui, Lucide. **No new dependency** and no new infrastructure (U18).
**Storage**: PostgreSQL 17 — one migration: `class_activities.group_size` (+ CHECKs, freeze trigger);
`attempt_participants` (backfilled), `attempt_groups`, `attempt_group_events`, `activity_answer_saves`;
`activity_answers.saved_by_user_id`, `activity_submissions.submitted_by_user_id` (backfilled); four composite FKs
moved to the participants; `attempt_paused_writes` per writer; editor/leader/log triggers (data-model.md).
**Testing**:
- Vitest (API): `023-schema` (CHECKs, uniqueness, FK moves, triggers, backfill on a scratch copy of 012–021 data),
  `023-us1-apply` … `023-us7-options`, and in `test/security/` isolation (outsiders, other groups, other classes →
  404; members never read another member's events, pauses or runs), concurrency (two leaders × one classmate;
  start alone × added; two HANDs; save × TAKE_BACK; submit × add), boundaries (strict bodies, server fields, 0/1/4/5
  member ids, sizes 1/2/5/6), invariance (SC-007: the 012–021 suites unchanged), audit (`MARCADOR-GRUPO-023` names
  and answers out of audit and logs) and performance (candidates of 60 students, group read with 5 members × 10
  questions × 50 saves).
- Web: Testing Library + `vitest-axe` + keyboard helpers for the dialog, the bar, read-only answering, the apply
  option and the review; XSS guard extended to the group names.
- Playwright E2E `group-work.spec.ts` (three browser contexts: form, read, hand off, submit, release).
**Target Platform**: Linux server (API); browser (desktop, phone).
**Project Type**: web service + web app (pnpm/Turborepo monorepo)
**Performance Goals**: SC-004 — a reader sees a save within 10 s (5 s polling); `GET /me/activities/:id` with a
group p95 < 150 ms; candidates p95 < 100 ms for a class of 60; the teacher's group read p95 < 150 ms.
**Constraints**:
- individual works, exercises and exams behave exactly as before (SC-007);
- only the editor writes answers, only the leader submits — enforced in the service and in the database (SC-003);
- no student sees another student's individual facts; outsiders get 404 (XXIV as amended);
- no WebSocket, Redis, queue, new env var or npm dependency (IX).
**Scale/Scope**:
- 4 new routes (3 student, 1 teacher), 5 changed (apply, options, start, student activity, roster/attempt);
- 1 migration; changes in `activities` (format, roster, review, pure `group/`), `student-activities` (start,
  saves, submit, loader, group service), `attempt-integrity`, `work-help`, `attendance`, `code-runs` (participant
  lookups); new web feature `group-work` and changes in `activities`/`student-activities`; 1 E2E.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] **I. Security**: strict bodies (only `memberIds`, `alone`, `action`, `toUserId`); A01 every route scoped to the
  participant (student) or the owned class (teacher) → 404; A04 rate limits reused (U18); names as text.
- [x] **II. RBAC**: existing permissions only; leader/editor are resource context checked in the service and by
  triggers; matrix rows for the four new routes.
- [x] **III. Server authority**: eligibility, sizes, roles, times (server `Clock`) and every refusal decided on the
  server; autosave unchanged (012) for the editor.
- [x] **IV. Untrusted code**: unchanged — runs still go to the 019 worker.
- [x] **V. Data integrity**: one migration; PK/FK/UNIQUE/CHECK for every rule (data-model.md), backfills in the same
  migration, append-only logs by trigger.
- [x] **VI. Audit & logs**: five new types, ids/enums/counts only (contracts/audit-events.md); names and answers
  scanned out (`MARCADOR-GRUPO-023`).
- [x] **VII. Tests**: schema, stories, concurrency, isolation and invariance suites written first.
- [x] **VIII. Layering**: thin controllers; the group service in `student-activities`; pure roles in
  `activities/group`; `attendance`, `attempt-integrity`, `work-help` and `code-runs` keep their own scoped queries
  (no new imports between them; boundary guard U5).
- [x] **IX. Simplicity**: the group reuses the attempt; one participants table instead of parallel models; polling
  instead of push.
- [x] **X. Evidence**: saves, handoffs, exits, pauses and runs are facts per student; nothing concludes from them.
- [x] **XI. Human oversight**: the grade is the teacher's, one per group; no record changes it (FR-015).
- [x] **XII. Determinism first**: all rules deterministic; no AI added.
- [x] **XIII. Risk level**: L1 for the group rules; the 015 L2 help keeps its exception, capped per group.
- [x] **XIV–XV, XIX. AI**: unchanged; the `work-helper` still sees only the student view of the question.
- [x] **XVI. Explicit states**: the attempt's 012 states; the editing owner with explicit transitions and
  `409 INVALID_STATE_TRANSITION`; event kinds as an enum.
- [x] **XVII. Idempotency**: start returns the existing participation (200); HAND to the current editor is a no-op;
  formation and inclusion all or nothing under one lock; the unique participation index as the last defense.
- [x] **XVIII. Safe interruption**: no long operation; a stuck editor is resolved by TAKE_BACK or by the settlement.
- [x] **XX. Pedagogy**: the save log keeps who and when, never content; per-student monitoring unchanged.
- [x] **XXI. Configurable domain**: the format and size are per activity, chosen by the teacher.
- [x] **XXII. Accessibility**: dialog, checklist and handoff by keyboard; "Editando agora" announced; states in words.
- [x] **XXIII. Curricular traceability**: unchanged (the work's topics).
- [x] **XXIV. Academic isolation**: the sharing inside a group (answers, names, editor, helps, released grade) and
  the candidate names are the v3.6.0 "trabalho em grupo" exception; everything else stays isolated (student routes
  from the participant, teacher routes from the owned class → 404).
- [x] **XXV. Privileged provisioning**: N/A.
- [x] **XXVI. Shared contracts**: `activities/group.ts` and changes in `activities/*`, `endpoints.ts`; texts only in
  the web.

**Post-design re-check**: all ✅ against constitution **v3.6.0** (amendment applied on 2026-10-30, recorded in
`constitution-amendment-3.6.0.md`). The spec did not change during planning; its open details are fixed in research
U2–U19 (column, participants model, FK moves, locks, roles settlement, writer-based pause triggers, polling, routes).

Touches outside the new code:
- `activities`: `activities.service.ts` (apply/options `groupSize`), `activity-query.ts`, `views/{teacher,student}-view.ts`,
  `roster.ts`, `attempts-review.service.ts` (participants), `submission/register-submission.ts` (`submitted_by`);
- `student-activities`: `attempts.service.ts` (start with members, editor/leader checks, participant lookups),
  `student-activity-loader.ts`, `my-activities.service.ts`;
- `attempt-integrity`, `work-help`, `attendance` (`MyPauseService`, unmark rule), `code-runs`, `activities/exam-settlement.ts`:
  their attempt lookups through `attempt_participants`;
- `audit-event-types.ts`, endpoint catalog, `authorization-matrix.ts`, `traceability.spec.ts` (`SPECS += 023`),
  journey (`MARCADOR-GRUPO-023`), `domain-boundary.spec.ts` if it pins these models;
- docs: README, `CLAUDE.md` (root, api, web), constitution 3.6.0 sync.

## Project Structure

### Documentation (this feature)

```text
specs/023-group-work/
├── plan.md
├── research.md                         # U1–U19
├── data-model.md
├── quickstart.md
├── constitution-amendment-3.6.0.md     # gate: apply before implementing
├── contracts/
│   ├── http-api.md
│   ├── permissions.md
│   ├── audit-events.md
│   └── web-ui.md
├── checklists/requirements.md
└── tasks.md                            # /speckit-tasks
```

### Source Code (repository root)

```text
apps/api/
├── prisma/{schema.prisma, migrations/<ts>_group_work/}
├── src/modules/activities/
│   ├── group/{group-roles.ts (pure), settle-group.ts}                # U9
│   ├── views/{teacher-view,student-view,teacher-group-view}.ts       # allowlists
│   ├── activities.service.ts, activity-query.ts, roster.ts, attempts-review.{service,controller}.ts
│   └── submission/register-submission.ts
├── src/modules/student-activities/
│   ├── group-work.{service,controller}.ts (new)                      # candidates, members, editing
│   ├── attempts.service.ts, student-activity-loader.ts, my-activities.service.ts
├── src/modules/{attempt-integrity,work-help,attendance,code-runs}/…  # participant lookups (U5, U13, U15)
├── src/modules/audit/audit-event-types.ts
└── test/
    ├── helpers/group-work.ts (new)                                   # startGroup, addMembers, handEditing…
    ├── integration/023-schema.spec.ts, 023-us1-apply … 023-us7-options.spec.ts
    ├── security/023-{isolation,concurrency,boundaries,invariance,audit,performance}.spec.ts
    ├── group-work-boundary.spec.ts (new)                             # U5 guard
    └── traceability.spec.ts                                          # SPECS += 023
packages/contracts/src/{activities/{group.ts (new), teacher.ts, student.ts}, endpoints.ts}
apps/web/
├── features/group-work/{api,hooks,components,schemas}/ (new)
├── features/activities/components/{work-options,attempt-review,class-activities}.tsx, group-facts.tsx (new)
├── features/student-activities/components/{activity-answering,activity-detail}.tsx
├── lib/messages/error-messages.ts                                    # the GROUP_* codes
└── e2e/group-work.spec.ts
README.md, CLAUDE.md, apps/api/CLAUDE.md, apps/web/CLAUDE.md, .specify/memory/constitution.md (3.6.0)
```

**Structure Decision**: the existing monorepo. The format and the teacher's review belong to `activities`; the
student's group actions to `student-activities`, next to the attempt they act on; the other modules only change how
they find "the student's attempt".

## Complexity Tracking

| Item | Why needed | Simpler alternative rejected because |
|------|------------|--------------------------------------|
| Constitution amendment 3.6.0 (XXIV, applied) | The user's group work shares answers, names and grade between students | A private copy per member contradicts the user's "uma tentativa, uma entrega" |
| Moving four composite FKs to `attempt_participants` | Per-student facts (FR-021) inside a shared attempt | New per-member fact tables would duplicate four models and their triggers |
| Advisory lock per activity for formation | All-or-nothing groups under concurrent leaders (FR-006, SC-002) | Row locks on many enrollments need a global lock order and risk deadlocks |
