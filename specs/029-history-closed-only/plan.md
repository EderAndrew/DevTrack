# Implementation Plan: Histórico só com provas e trabalhos encerrados ou cancelados

**Branch**: `029-history-closed-only` | **Date**: 2026-11-23 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/029-history-closed-only/spec.md`

## Summary

The boundary between "Minhas atividades" and the "Histórico" moves from "can the student still do it?" (028 amendment)
to "did the teacher close or cancel it?". `GET /me/history` answers only ASSIGNMENT/EXAM rows whose activity is CLOSED
or CANCELLED (research HC1); exercises and active activities stay in `GET /me/activities`, which gets its `COMPLETED`
filter back (HC5). Cancelled activities, today invisible to students, are loaded by a separate, narrower loader query
(published before the cancellation, released to the student, ACTIVE enrollment) and leave through a new allowlist
builder that never carries a result (HC2, HC3). The situation enum gains `CANCELLED`; the row date becomes
`deliveredAt ?? endedAt` (HC4). The Painel's "Concluídas" counts the history rows; "Atrasadas" counts every overdue in
the list again (HC6). The 028 tests and spec parts that this supersedes are rewritten in place and point at 029 (HC8).
No migration, permission or audit event.

## Technical Context

**Language/Version**: TypeScript 7 on Node.js 24 LTS (API, contracts, web)
**Primary Dependencies**: no new dependency
**Storage**: PostgreSQL 17 — no migration (`class_activities.status`, `closed_at`, `cancelled_at` already exist)
**Testing**: API Vitest (unit for the pure history/list helpers, integration per story, security: cancelled rows never
carry a result or open any other route, isolation), web Vitest + RTL + `vitest-axe`, contracts tests, the 028 E2E
updated
**Target Platform**: the existing API and web portal; the mobile app is untouched
**Project Type**: existing web service + web app (monorepo)
**Performance Goals**: one scoped load + one extra indexed query for the cancelled rows; 028/SC-004's 2 s with 500 rows
kept (`029/SC-004`)
**Constraints**: never a grade before release, never any result on a cancelled row; the student view stays an
allowlist built in `activities/views/student-view.ts`; no WebSockets (5 s poll)
**Scale/Scope**: contracts (1 enum value, 1 item field renamed/added, filter value back), 1 loader method, 1 view
builder, the service's three reads, the web history component and list filter, ~15 existing test files touched

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.* — checked against v4.1.0.

- [x] **I. Security**: no new input beyond the enum value `CANCELLED` of `tab` and `COMPLETED` of `status` (strict
  schemas, `400` before any query); cancelled rows come from a query scoped like `visibleTo` (ACTIVE enrollment,
  attendance release) plus "published before the cancellation"
- [x] **II. RBAC**: same permissions (`atividades.proprias.visualizar`, grades only with `notas.proprias.visualizar`)
- [x] **III. Server authority**: situation, row date, counts and placement derived on every read with the server clock
- [x] **IV. Untrusted code**: N/A
- [x] **V. Data integrity**: no schema change
- [x] **VI. Audit & logs**: no event; `q` stays redacted (028 HI6)
- [x] **VII. Tests**: tests first — placement matrix (type × status × delivered × held), cancelled visibility (before
  publication, never released, other student, ended enrollment), cancelled rows with a released grade carry none,
  other routes stay `404`, counts invariants, the list filter, the Painel counters, UI states, axe
- [x] **VIII. Layering**: controller unchanged; `MyActivitiesService` + pure `history.ts`; the cancelled shape built in
  `student-view.ts`; no rule in React
- [x] **IX. Simplicity**: the in-memory pass of 028 kept; one extra loader query rather than letting cancelled rows
  through `visibleTo` (which every student route shares)
- [x] **X–XV, XIX**: N/A
- [x] **XVI. Explicit states**: `CANCELLED` is a derived read-model value, never stored
- [x] **XVII. Idempotency**: reads only
- [x] **XVIII. Safe interruption**: N/A
- [x] **XX. Pedagogy**: grades only after release; exercise points never in the history
- [x] **XXI. Configurable domain**: unchanged
- [x] **XXII. Accessibility**: the new tab and pill are text; rows without a link stay keyboard-neutral
- [x] **XXIII. Curricular traceability**: N/A
- [x] **XXIV. Academic isolation**: cancelled rows only for the session student's ACTIVE enrollments and releases; no
  route other than `GET /me/history` serves a cancelled activity
- [x] **XXV. Privileged provisioning**: N/A
- [x] **XXVI. Shared contracts**: changes in `activities/{enums,student}.ts`; texts only in the web
- [x] **Frontend stack**: unchanged (TanStack Query, Design System)
- [x] **Mobile stack**: N/A

No ❌ — Complexity Tracking is empty.

**Post-design re-check (after Phase 1)**: all gates ✅. One spec point needed a design decision, not a spec change: the
summary's required `status` on a cancelled row (HC3).

## Project Structure

### Documentation (this feature)

```text
specs/029-history-closed-only/
├── plan.md
├── research.md            # HC1–HC9
├── data-model.md          # no migration; read model
├── quickstart.md
├── contracts/
│   ├── http-api.md        # GET /me/history, /me/activities, /me/dashboard changes
│   ├── ui.md              # Histórico, Minhas atividades, Painel
│   └── audit-events.md    # none
├── checklists/requirements.md
└── tasks.md               # /speckit-tasks
```

### Source Code (repository root)

```text
packages/contracts/src/
├── activities/enums.ts                 # StudentHistorySituation += CANCELLED; StudentActivityFilter += COMPLETED
└── activities/student.ts               # StudentHistoryItem: missedAt → endedAt; tabCounts/totals += cancelled

apps/api/src/modules/
├── activities/views/student-view.ts    # StudentActivityInput += cancelledAt; toCancelledSummary (allowlist, no result)
└── student-activities/
    ├── student-activity-loader.ts      # loadCancelled (ASSIGNMENT/EXAM, published before cancelled_at, released, ACTIVE enrollment)
    ├── history.ts                      # inHistory, inList, historySituation (+ CANCELLED/MISSED), endedAt, rowDate
    └── my-activities.service.ts        # list/dashboard/history on the new placement; COMPLETED filter back
apps/api/test/
├── unit/029-placement.spec.ts
├── integration/029-us1-closed-history.spec.ts, 029-us2-cancelled.spec.ts, 029-us3-list-dashboard.spec.ts
├── security/029-cancelled-isolation.spec.ts
├── (updated) 028-*, 012/013/015/019/026/027 expectations moved back by the 028 amendment
└── traceability.spec.ts                # SPECS += 029

apps/web/features/student-activities/
├── schemas/student-history.ts          # tab "canceladas", CANCELLED label, row date, empty texts
├── components/student-history.tsx      # pill, no link on CANCELLED, "Encerrada em"/"Cancelada em"
├── schemas/student-activity.ts         # COMPLETED filter back ("Entregues/concluídas")
└── components/student-dashboard.tsx    # unchanged link; caption if needed
apps/web/e2e/student-history.spec.ts    # updated journey

specs/028-student-history-redesign/spec.md   # a note: US5/FR-022–FR-025 superseded by 029
CLAUDE.md, apps/api/CLAUDE.md               # 029 summary and rule
```

**Structure Decision**: no new module; everything stays in `student-activities` beside `list`, `dashboard` and
`history`, and the cancelled shape in the single student-view file.

## Complexity Tracking

No violation.
