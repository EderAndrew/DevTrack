# Implementation Plan: Matéria atual do aluno no Painel e em "Minhas atividades"

**Branch**: `026-student-subject-selector` | **Date**: 2026-11-16 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/026-student-subject-selector/spec.md`

## Summary

The student's Painel and "Minhas atividades" get a "Matéria" card on top that shows and switches the subject being
viewed; the two pages never mix subjects. A subject is a class of the student's ACTIVE enrollments (each class is the
offering of one subject, research D1). The API's `GET /me/activities` and `GET /me/dashboard` accept an optional
`classId`: the service checks an ACTIVE enrollment of the session student in it (`404` otherwise, the same for every
foreign case) and narrows the existing scoped query to that class, so every 012/013/016/018/023 visibility rule still
holds; without `classId` both answer exactly as today. The dashboard's ranking block narrows to the class too.
`GET /me/classes` gains `subjectName`. The web keeps the choice in the address (`?materia=`), resolves it against
"Minhas turmas" (most recent enrollment first, a notice when the asked class isn't available), carries it in the
dashboard's links and in the query keys of the 5 s polls. No migration, no new permission, no audit event.

## Technical Context

**Language/Version**: TypeScript 7 on Node.js 24 LTS (API, contracts, web)
**Primary Dependencies**: no new dependency (NestJS + Prisma, Next.js + the Design System's `NativeSelect`/`Alert`)
**Storage**: PostgreSQL 17 — no migration (reads `enrollments`, `school_classes.subject_id`, `subjects.name`)
**Testing**: API Vitest (integration, security); web Vitest + RTL + `vitest-axe`; contracts tests
**Target Platform**: the existing API (Hostinger VPS) and the web portal; the mobile app is untouched
**Project Type**: existing web service + web app (monorepo)
**Performance Goals**: with `classId`, the list and the dashboard read fewer rows than today (one extra indexed
enrollment lookup, then only the class's activities); a subject switch shows the new subject in < 2 s (SC-003)
**Constraints**: no WebSockets (the 5 s polls of 016 keep running, keyed by the class); never mix subjects on screen;
the class id from the address is untrusted
**Scale/Scope**: 2 query params (1 new schema), 1 response field, 3 API services touched, 1 new web component and its
hook, 4 web screens touched

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.* — checked against v3.7.0.

- [x] **I. Security**: `classId` validated as UUID by the contract schema (`400`), then checked against the session
  student's ACTIVE enrollments on the server; the web's resolution is UX only
- [x] **II. RBAC**: no new permission; `atividades.proprias.visualizar` (+ `ranking.turma.visualizar` for the ranking
  block) as today, combined with the enrollment context
- [x] **III. Server authority**: statuses, counts and deadlines still derived with the injected `Clock`; the web only
  chooses which class to ask for
- [x] **IV. Untrusted code**: N/A
- [x] **V. Data integrity**: no schema change
- [x] **VI. Audit & logs**: no event (reads only; contracts/audit-events.md); no `classId` in logs beyond the request
  logging of today
- [x] **VII. Tests**: tests first for the filter, the dashboard blocks, the four foreign cases, the unchanged responses
  without `classId`, the 016 presence rule under the filter, the switcher, the fallback notice and each screen
- [x] **VIII. Layering**: the enrollment check and the narrowing live in `MyActivitiesService` /
  `StudentActivityLoader` / `RankingService`; controllers only validate the query; the switcher calls a hook
- [x] **IX. Simplicity**: one optional query parameter on existing routes instead of new routes; no stored preference
- [x] **X–XV, XIX**: N/A (no evidence, decision, AI or automation)
- [x] **XVI. Explicit states**: none new (enrollment lifecycle of 003)
- [x] **XVII. Idempotency**: reads only
- [x] **XVIII. Safe interruption**: N/A
- [x] **XX. Pedagogy**: one subject at a time matches how the student studies; no grade or point semantics change
- [x] **XXI. Configurable domain**: subjects and classes stay teacher data; no subject in code
- [x] **XXII. Personalization & accessibility**: native labelled select, keyboard, screen reader, text not colour
- [x] **XXIII. Curricular traceability**: N/A
- [x] **XXIV. Academic isolation**: the filter can only narrow the student's own scope; a foreign class is `404`
  without revealing existence; the ranking block stays the 013 exception for the student's own class
- [x] **XXV. Privileged provisioning**: no account path touched
- [x] **XXVI. Shared contracts**: `classId` and `StudentDashboardQuerySchema` in `activities/student.ts`,
  `subjectName` in `classes/my-classes.ts`, `endpoints.ts` updated; texts only in the web
- [x] **Frontend stack**: TanStack Query (keys include the class), `NativeSelect`, `Alert`, tokens only;
  `features/student-activities` and `features/my-classes`

**Post-design re-check (after Phase 1)**: all gates ✅. The spec's FR-009 already allows `400` for a malformed id
(research D3); no spec change needed.

## Project Structure

### Documentation (this feature)

```text
specs/026-student-subject-selector/
├── plan.md
├── research.md            # D1–D9
├── data-model.md          # no migration; read model
├── quickstart.md
├── contracts/
│   ├── http-api.md        # classId on /me/activities and /me/dashboard, subjectName on /me/classes
│   ├── ui.md              # SubjectSwitcher, both pages, "Minhas turmas"
│   └── audit-events.md    # none
├── checklists/requirements.md
└── tasks.md               # /speckit-tasks
```

### Source Code (repository root)

```text
packages/contracts/src/
├── activities/student.ts             # StudentActivityListQuerySchema += classId; StudentDashboardQuerySchema
├── classes/my-classes.ts             # MyClassViewSchema += subjectName
└── endpoints.ts                      # myActivities.dashboard query

apps/api/src/modules/
├── student-activities/
│   ├── my-activities.controller.ts   # dashboard: @Query(StudentDashboardQuerySchema)
│   ├── my-activities.service.ts      # classId → assertActiveEnrollment (404) → narrowed summaries; dashboard blocks
│   └── student-activity-loader.ts    # loadAll(…, classId?) narrows visibleTo
├── ranking/ranking.service.ts        # dashboardFor(userId, classId?)
└── enrollments/my-classes.service.ts # + subject name
apps/api/test/
├── integration/026-us1-list.spec.ts, 026-us2-dashboard.spec.ts, 026-us4-my-classes.spec.ts
├── security/026-isolation.spec.ts    # other student's class, ended enrollment, nonexistent, malformed, 016 presence
└── traceability.spec.ts              # SPECS += 026

apps/web/
├── app/(student)/painel/page.tsx                 # reads ?materia=
├── app/(student)/minhas-atividades/page.tsx      # reads ?materia=
├── features/student-activities/
│   ├── api/student-activities.ts                 # classId on dashboard and list
│   ├── hooks/use-student-activities.ts           # keys include classId
│   ├── hooks/use-current-subject.ts              # resolve ?materia= against "Minhas turmas" (D6)
│   ├── schemas/student-activity.ts               # subject label, myActivitiesHref(+materia), texts
│   └── components/{subject-switcher,student-dashboard,my-activities}.tsx (+ tests)
└── features/my-classes/components/my-classes.tsx # shows the subject (+ test)

CLAUDE.md                                         # 026 summary and rule
```

**Structure Decision**: no new API module; the filter belongs to the student's reads in `student-activities` (and the
ranking block in `ranking`). On the web, the switcher lives in `features/student-activities` (both pages are there)
and reads the classes through `features/my-classes`' hook.

## Complexity Tracking

No violation.
