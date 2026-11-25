# Implementation Plan: "Minhas turmas" do aluno redesenhada

**Branch**: `030-student-classes-redesign` | **Date**: 2026-11-25 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/030-student-classes-redesign/spec.md`

## Summary

Redesign the student's "Minhas turmas" from the reference image: one card per disciplina da turma (turma code and name,
disciplina, teacher, year, period, the student's enrollment date, "Acessar turma", and the "Ranking da turma" panel with
the permission), a header with the "Ano letivo" card, the tab "Todas as turmas" with its count, a search and a year
filter kept in the address, and the footer. The only server change is one field: `GET /me/classes` returns, per turma,
`enrolledAt` of the student's own ACTIVE enrollment (MT1). Search and year filter run in the browser over the full list
the route already returns (MT2), in pure functions (MT3–MT5).

## Technical Context

**Language/Version**: TypeScript 7 on Node.js 24 LTS (API, contracts, web)
**Primary Dependencies**: no new dependency — NestJS + Prisma (API), Next.js 16 + React 19 + TanStack Query + shadcn/ui +
Lucide (web), Zod (contracts)
**Storage**: PostgreSQL 17 — no migration (reads the existing `enrollments.enrolled_at`)
**Testing**: Vitest (API integration against `postgres-test`; web with jsdom + Testing Library + vitest-axe); contracts tests
**Target Platform**: web (desktop and phone browsers), API on Node
**Project Type**: web application (monorepo: `apps/api`, `apps/web`, `packages/contracts`)
**Performance Goals**: search/year change < 1 s with ≤ 50 disciplinas, no extra request (SC-003)
**Constraints**: Design System only, dark/light themes, 360 px without horizontal scroll; the response stays a superset of
today's for the 026/028/ranking consumers (SC-006)
**Scale/Scope**: one route field, one contract field, one web feature (`features/my-classes`) rewritten

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] **I. Security**: ✅ no new input reaches the API (the route keeps no parameters); `ano`/`busca` are read only by the
  web, validated against the student's years and capped at 100 characters; names render as text (FR-013).
- [x] **II. RBAC**: ✅ unchanged: `turmas.proprias.listar` for the route and page, `ranking.turma.visualizar` for the panel;
  context = the session's ACTIVE enrollments.
- [x] **III. Server authority**: ✅ the date and statuses come from the server; nothing is decided in the browser beyond
  filtering what was received.
- [x] **IV. Untrusted code**: N/A.
- [x] **V. Data integrity**: ✅ no schema change.
- [x] **VI. Audit & logs**: ✅ read only, no event; no new data logged.
- [x] **VII. Tests**: ✅ API integration (field, own enrollment, order, ended enrollment absent), contracts schema test, web
  tests per scenario (US1–US3) with a11y, traceability.
- [x] **VIII. Layering**: ✅ the service copies one more column; filtering/derivation in pure functions of
  `features/my-classes/schemas`, the component only renders.
- [x] **IX. Simplicity**: ✅ no new route, dependency or abstraction; client-side filtering instead of server parameters
  (MT2).
- [x] **X. Evidence**: N/A.
- [x] **XI. Human oversight**: N/A.
- [x] **XII. Determinism first**: N/A (no AI).
- [x] **XIII. Risk level**: N/A.
- [x] **XIV–XV. AI governance**: N/A.
- [x] **XVI. Explicit states**: ✅ no new state; 027 effective statuses as today.
- [x] **XVII. Idempotency**: N/A (read).
- [x] **XVIII. Safe interruption**: N/A.
- [x] **XIX. AI evals**: N/A.
- [x] **XX. Pedagogy**: N/A.
- [x] **XXI. Configurable domain**: ✅ turmas, disciplinas and years are data.
- [x] **XXII. Personalization & accessibility**: ✅ keyboard and screen reader (names of repeated actions, MT7); no
  personal data beyond the student's own enrollment date.
- [x] **XXIII. Curricular traceability**: N/A.
- [x] **XXIV. Academic isolation**: ✅ only the student's ACTIVE enrollments; `enrolledAt` is the student's own; no other
  student's data.
- [x] **XXV. Privileged provisioning**: N/A (no account or enrollment change).
- [x] **XXVI. Shared contracts**: ✅ `enrolledAt` added to `MyCohortSchema` in `packages/contracts`; texts stay in the web.
- [x] **Frontend stack**: ✅ shadcn/ui + Tailwind tokens + Lucide, TanStack Query (existing `useMyClasses`), Vitest + RTL +
  vitest-axe; code in `apps/web/features/my-classes/`.
- [x] **Mobile stack**: N/A (the app does not read `GET /me/classes`).

Post-design re-check: ✅ unchanged — the design adds one read field and web-only filtering.

## Project Structure

### Documentation (this feature)

```text
specs/030-student-classes-redesign/
├── spec.md
├── plan.md              # this file
├── research.md          # MT1–MT7
├── data-model.md        # no migration; contract field + web view model
├── quickstart.md
├── contracts/
│   ├── http-api.md      # GET /me/classes + enrolledAt
│   └── ui.md            # the page, toolbar, card, footer, states
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
packages/contracts/
├── src/classes/my-classes.ts          # MyCohortSchema + enrolledAt
└── test/cohorts.spec.ts               # schema accepts/refuses enrolledAt

apps/api/
├── src/modules/enrollments/my-classes.service.ts   # select enrolledAt, copy it
└── test/integration/030-my-classes.spec.ts         # new: US1/US3 of the API side
    (+ fixtures of 003-us7 / 027-us8 if they compare whole bodies)

apps/web/
├── app/(student)/minhas-turmas/page.tsx            # session/permission check only; the PageHeader moves into MyClasses
├── features/my-classes/
│   ├── schemas/my-classes.ts                       # subjectCards, studentYears, resolveYear, normalizeSearch, filterSubjectCards, cardStatusBadge, texts
│   ├── schemas/my-classes.test.ts                  # new: pure helpers
│   ├── components/my-classes.tsx                   # rewritten: PageHeader + "Ano letivo" card, toolbar, cards, footer, states
│   ├── hooks/use-my-classes-filters.ts             # new: ano/busca from the address (router.replace)
│   ├── components/subject-card.tsx                 # new: one card + ranking panel
│   ├── components/academic-year-card.tsx           # new: "Ano letivo"
│   └── components/my-classes.test.tsx              # rewritten with 030 ids (keeps 003/027 ids it covers)
├── features/student-activities/components/test-fixtures.ts, features/cohorts/…test.tsx,
│   test/student-portal-xss.test.tsx                # fixtures gain enrolledAt
└── e2e/student-classes.spec.ts (new: 360 px, SC-005) and the existing "Minhas turmas" steps adjusted to the cards

apps/api/test/traceability.spec.ts                  # SPECS += 030
```

**Structure Decision**: the existing monorepo layout; the change is confined to the 027 "Minhas turmas" slice (contract,
`MyClassesService`, `features/my-classes`).

## Complexity Tracking

No violations.
