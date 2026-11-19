# Implementation Plan: Turmas do gestor e disciplinas da turma

**Branch**: `027-manager-classes` | **Date**: 2026-11-17 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/027-manager-classes/spec.md`

## Summary

The turma becomes the MANAGER's group of students and the teacher's offering becomes the "disciplina da turma". A new
table `cohorts` holds the turma (name, code unique per ano letivo, year, period, description, status); the existing
`classes` table keeps being the offering — same id, teacher, subject, calendar and status — and gains `cohort_id`,
so every pedagogical table of 004–026 keeps its foreign keys and routes (research Q1). Enrollments and invitations
move to the cohort; a SQL view `class_enrollments` lets the pedagogical queries keep asking "students of this class"
with a one-word change (Q3). The effective status (most restrictive of cohort and class) is derived in
`ClassContextPolicy` and a SQL function, so the 004–025 status checks hold unchanged (Q4). The MANAGER (and ADMIN)
gets the 003 class permissions plus `turmas.incluir_aluno` (lookup by exact e-mail and direct enrollment of an
existing student with an e-mail notice, constitution 4.1.0, Q7); the teacher gets `turmas.buscar` and
`disciplinas_turma.*`, and closes/archives a disciplina only after its calendar's last day (Q5). The main migration
(after one that only adds enum values) is also the transition: it builds cohorts from today's classes, merging those with the same code and year, and moves
enrollments and invitations without deleting a row (Q9). Web: the MANAGER's `/gestao/turmas`, the teacher's
`/turmas` rewritten around disciplinas da turma, "Minhas turmas" grouped by year.

## Technical Context

**Language/Version**: TypeScript 7 on Node.js 24 LTS (API, contracts, web)
**Primary Dependencies**: no new dependency (NestJS + Prisma, Next.js + the Design System)
**Storage**: PostgreSQL 17 — two migrations: `…_027_enum_values` (new enums and `ALTER TYPE … ADD VALUE`, which
PostgreSQL does not allow to be used in the same transaction) and `…_027_manager_classes` (schema + transition +
permissions, one transaction): table `cohorts`; `classes.cohort_id` (+ moved columns dropped, UNIQUE
`(cohort_id, subject_id)`, identity trigger); `enrollments`/`class_invitations` keyed by `cohort_id` with
`removal_reason`, `source`, `enrolled_by_id`; view `class_enrollments`; function `class_effective_status`; enums
`mail_kind` += `CLASS_ENROLLMENT_NOTICE`, cancel reasons += `MANAGER`/`ENROLLED_DIRECTLY`/`MERGED`; permissions moved
and added; the transition data steps
**Testing**: API Vitest (integration, security, boundary, transition), web Vitest + RTL + `vitest-axe`, contracts
tests, Playwright E2E (local)
**Target Platform**: the existing API and web on the Hostinger beta; the mobile app only reads a new label
**Project Type**: existing web service + web app (monorepo)
**Performance Goals**: the pedagogical queries keep their plans (indexed join `classes.cohort_id` → `enrollments
(cohort_id, status)`); cohort lists and the directory page by keyset, 20–50 per page, < 300 ms on the beta's size;
SC-004 (find a cohort and add a disciplina in < 1 min)
**Constraints**: the transition is atomic inside `migrate deploy` and loses, duplicates or reassigns nothing
(FR-028, SC-002); no WebSockets; dates by the injected `Clock` in America/Sao_Paulo (004); the lookup is a privileged
disclosure (rate-limited, audited)
**Scale/Scope**: ~13 new routes, ~8 rewritten routes, 1 view and 1 SQL function, ~15 raw SQL readers and ~5 Prisma
filters switched to the cohort, ~8 class-name readers, 1 new mail kind, 4 new web screens and 4 touched, test
factories (`createClass`, `createClassWithStudents`, invitations) adapted for the 004–026 suites

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.* — checked against v4.1.0.

- [x] **I. Security**: every body strict (Zod contract); e-mails only in POST bodies; ids from the session and scoped
  lookups; the teacher's `cohortId`/`subjectId` re-validated; names rendered as text
- [x] **II. RBAC**: `turmas.*` (MANAGER/ADMIN), `turmas.buscar` and `disciplinas_turma.*` (TEACHER),
  `turmas.proprias.listar` (STUDENT), each with its context (contracts/permissions.md)
- [x] **III. Server authority**: cohort/class states and the calendar rule use the server clock and DB constraints;
  effective status derived on read
- [x] **IV. Untrusted code**: N/A (no code execution touched)
- [x] **V. Data integrity**: one Prisma migration; FKs, partial UNIQUEs (`cohorts (year, upper(code))`, `classes
  (cohort_id, subject_id)`, active enrollment and pending invitation per cohort), CHECKs, identity trigger
- [x] **VI. Audit & logs**: contracts/audit-events.md; no e-mail or names in new metadata or logs
- [x] **VII. Tests**: integration per story, security matrix and isolation, concurrency (code, duplicate subject,
  archive × add, double enrollment), the transition comparison, the 004–026 suites (SC-005)
- [x] **VIII. Layering**: controllers thin; rules in services and pure helpers (`effectiveStatus`,
  `canCloseClass`, `classLabel`); no rule in React
- [x] **IX. Simplicity**: no new dependency or infra; one view and one SQL function justified by Q3/Q4
- [x] **X–XV, XIX**: N/A (no evidence, AI or monitoring change)
- [x] **XVI. Explicit states**: cohort and class use the 003 state machine; enrollment `removal_reason`/`source` enums
- [x] **XVII. Idempotency**: create cohort/class under UNIQUE; direct enrollment under the cohort's lock + partial
  UNIQUE; invitation acceptance unchanged (idempotent)
- [x] **XVIII. Safe interruption**: the transition is one transaction; failure rolls back the deploy's migration
- [x] **XX. Pedagogy**: N/A
- [x] **XXI. Configurable domain**: subjects stay data; no subject conditionals
- [x] **XXII. Personalization**: N/A; the MANAGER sees only name, e-mail and situations
- [x] **XXIII. Curricular traceability**: plan, lessons and coverage stay per disciplina da turma (class); trabalhos
  and provas still applied only to the class of their subject (`SUBJECT_MISMATCH`)
- [x] **XXIV. Academic isolation**: pedagogical context = the class (own teacher; student enrolled in its cohort via
  `class_enrollments`); another teacher's class in the same cohort → `404`; MANAGER never reaches class routes; the
  directory shows only the minimum
- [x] **XXV. Privileged provisioning**: invitations and direct enrollment only by MANAGER/ADMIN; direct enrollment
  only of an ACTIVE, verified STUDENT account, never creating an account or granting a role, with notice and audit;
  teachers create no cohort and invite no one
- [x] **XXVI. Shared contracts**: new `packages/contracts/src/cohorts/`, rewritten `classes/` schemas and
  `endpoints.ts`; texts only in the web
- [x] **Frontend stack**: official stack; `features/cohorts` new, `features/classes`, `features/class-invitations`,
  `features/my-classes` and `features/student-activities` (card) touched
- [x] **Mobile stack**: N/A (label only, no app change)

No ❌ — Complexity Tracking is empty.

**Post-design re-check (after Phase 1)**: unchanged — the view `class_enrollments` and `class_effective_status` are
read-only helpers inside the database (V, IX); the transition keeps every pedagogical row on its class id (SC-002).

## Project Structure

### Documentation (this feature)

```text
specs/027-manager-classes/
├── plan.md
├── research.md          # decisions Q1–Q12
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── http-api.md
│   ├── permissions.md
│   ├── audit-events.md
│   └── ui.md
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
apps/api/
├── prisma/schema.prisma                         # Cohort; SchoolClass/Enrollment/ClassInvitation changes
├── prisma/migrations/20261118115900_027_enum_values/migration.sql       # enum values only
├── prisma/migrations/20261118120000_027_manager_classes/migration.sql   # schema + transition + permissions
├── src/modules/cohorts/                         # NEW: cohorts.controller/service, cohort-directory.controller,
│   │                                            #      cohort.view, student-lookup (rate limit), cohort state
├── src/modules/classes/                         # create from cohort+subject, effective-status.ts, close rule,
│   │                                            # class-context.policy (effective status), class-label.ts
├── src/modules/class-invitations/               # routes under /cohorts/:id, mail subject names the cohort
├── src/modules/enrollments/                     # cohort enrollments, direct enrollment, notice MailSubject,
│   │                                            # my-classes grouped by year
├── src/modules/{activities,attendance,exam-sessions,ranking,student-activities,attempt-integrity}/  # class_enrollments
├── src/modules/{exam-alerts,mobile-exams,…}/    # class label through the cohort
├── src/modules/audit/audit-event-types.ts
└── test/
    ├── helpers/factories.ts, helpers/activities.ts   # createClass builds a cohort behind
    ├── integration/027-*.spec.ts, security/027-*.spec.ts
    ├── cohorts-boundary.spec.ts                       # NEW guard (Q3)
    └── traceability.spec.ts                           # SPECS += 027
packages/contracts/src/
├── cohorts/                                      # NEW: cohorts, directory, lookup, enrollments
├── classes/                                      # class view/create rewritten, my-classes by year
└── endpoints.ts
apps/web/
├── app/(app)/gestao/turmas/{page,[id]/page}.tsx  # NEW (MANAGER)
├── app/(app)/turmas/{page,nova/page,[id]/…}      # teacher, rewritten
├── app/(student)/minhas-turmas/page.tsx
├── features/cohorts/                             # NEW
├── features/{classes,class-invitations,my-classes,student-activities}/
└── e2e/manager-classes.spec.ts                   # NEW; class-*.spec.ts adapted
```

**Structure Decision**: the existing monorepo; a new API module `cohorts` and web feature `cohorts`; the 003/004
modules `classes`, `class-invitations` and `enrollments` are reshaped in place.

## Complexity Tracking

No violations.
