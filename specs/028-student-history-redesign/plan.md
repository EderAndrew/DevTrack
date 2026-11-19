# Implementation Plan: Histórico do aluno redesenhado

**Branch**: `028-student-history-redesign` | **Date**: 2026-11-19 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/028-student-history-redesign/spec.md`

## Summary

The student's "Histórico" (012 US6) is redesigned from the reference image: three summary cards (entregues,
aguardando correção, corrigidas), tabs Todas/Aguardando/Corrigidas with counts, a search by activity title, a subject
filter, richer rows (type badge, turma + disciplina, date + weekday + time, status pill, grade with a bar, arrow), a
footer "Exibindo N de M atividades · Mais recentes primeiro" and the note on corrections. A new read route
`GET /me/history` (research HI1) reuses the student's scoped summaries (HI2), derives each delivery's situation
(`AWAITING`/`GRADED`, `GRADED` only when the student can see the result, HI3) and delivery date (HI4), and answers the
page with the list total, the tab counts and the card totals, filtered, searched (case/accent-insensitive, HI6),
ordered newest first and keyset-paged on the server. `GET /me/activities` and the other student routes do not change.
The search value is redacted from the request log. No migration, permission or audit event.

## Technical Context

**Language/Version**: TypeScript 7 on Node.js 24 LTS (API, contracts, web)
**Primary Dependencies**: no new dependency (NestJS + Prisma; Next.js + the Design System's `Tabs`, `Input`,
`NativeSelect`, `Table`, `Status`, `Badge`, `Progress`, `Card`, `Alert`, `EmptyState`; Lucide icons)
**Storage**: PostgreSQL 17 — no migration (reads the 012/013/016/018/023/027 tables through `StudentActivityLoader`)
**Testing**: API Vitest (integration, security, unit for the pure situation/search/order helpers, the log redaction);
web Vitest + RTL + `vitest-axe`; contracts tests; one Playwright E2E
**Target Platform**: the existing API (Hostinger VPS) and the web portal; the mobile app is untouched
**Project Type**: existing web service + web app (monorepo)
**Performance Goals**: one scoped load + one in-memory pass per request; with 500 deliveries a tab/search/class change
shows the result in ≤ 2 s (SC-004); the search box waits 300 ms before asking
**Constraints**: no WebSockets (5 s visible-page poll of the student lists); never a grade before release; the class id
and the search text are untrusted; no horizontal scroll at 360 px
**Scale/Scope**: 1 new route (3 new contract schemas + 1 enum), 1 service method + 1 pure helper module, 1 loader field,
1 logging serializer; 1 rewritten web component (+ hook, API client, date helpers), 1 page touched

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.* — checked against v4.1.0.

- [x] **I. Security**: strict query schema (`tab` enum, `q` ≤ 100 without NUL, `classId` UUID, cursor ≤ 200) → `400`
  before any query; `classId` checked against the session student's ACTIVE enrollments on the server; the search is a
  plain substring on normalized text (no regex or SQL from input); titles rendered as text; `q` redacted from logs
- [x] **II. RBAC**: `atividades.proprias.visualizar` + the student's own context; grades only with
  `notas.proprias.visualizar` (unchanged gate inside `toStudentSummary`)
- [x] **III. Server authority**: situations, counts, order and paging derived by the server with the injected `Clock`
  on every read; the web only chooses tab/search/class
- [x] **IV. Untrusted code**: N/A
- [x] **V. Data integrity**: no schema change
- [x] **VI. Audit & logs**: no event (contracts/audit-events.md); the search value never in audit or logs (HI6)
- [x] **VII. Tests**: tests first — situation rule (every type × release × permission × exercise awaiting), counts
  invariants across pages, order/cursor stability with equal timestamps, search normalization, the three foreign
  classes, malformed input, the no-grade-before-release matrix, the log redaction, the unchanged routes, each UI state,
  axe in both themes, one E2E
- [x] **VIII. Layering**: controller validates only; `MyActivitiesService.history` + pure `student-activities/history.ts`
  (situation, normalize, order, cursor); no rule in React (the web renders what the server derived)
- [x] **IX. Simplicity**: reuse the scoped summaries; no SQL duplicate of derived statuses, no `unaccent`, no counts
  route
- [x] **X–XV, XIX**: N/A (no evidence, decision, AI or automation)
- [x] **XVI. Explicit states**: `AWAITING`/`GRADED` is a derived read-model enum, never stored
- [x] **XVII. Idempotency**: reads only
- [x] **XVIII. Safe interruption**: N/A
- [x] **XX. Pedagogy**: grades only after release with complete grading; exercise points never shown as a grade (013)
- [x] **XXI. Configurable domain**: types, subjects and classes stay data; labels only in the web
- [x] **XXII. Personalization & accessibility**: labelled controls, Radix tabs, native select, text (not colour) for
  situation and grade, both themes, phone width
- [x] **XXIII. Curricular traceability**: N/A
- [x] **XXIV. Academic isolation**: only the session student's deliveries in ACTIVE enrollments; a foreign class is
  `404` without revealing existence; group members only through the 023 participants already in the loader
- [x] **XXV. Privileged provisioning**: N/A
- [x] **XXVI. Shared contracts**: new schemas in `activities/{enums,student}.ts`, `endpoints.ts` entry; texts only in
  the web
- [x] **Frontend stack**: TanStack Query (`useInfiniteQuery`, keys with tab/q/class), Design System components only,
  `features/student-activities`
- [x] **Mobile stack**: N/A

No ❌ — Complexity Tracking is empty.

**Post-design re-check (after Phase 1)**: all gates ✅. One spec point needed a design addition, not a spec change:
"a busca não é registrada … em logs" (spec Security) required redacting `q` in the request serializer (HI6).

## Project Structure

### Documentation (this feature)

```text
specs/028-student-history-redesign/
├── plan.md
├── research.md            # HI1–HI10
├── data-model.md          # no migration; read model
├── quickstart.md
├── contracts/
│   ├── http-api.md        # GET /me/history
│   ├── ui.md              # the Histórico page
│   └── audit-events.md    # none
├── checklists/requirements.md
└── tasks.md               # /speckit-tasks
```

### Source Code (repository root)

```text
packages/contracts/src/
├── activities/enums.ts                 # StudentHistorySituationSchema
├── activities/student.ts               # StudentHistoryQuery/Item/Page schemas, STUDENT_HISTORY_SEARCH_MAX
└── endpoints.ts                        # myActivities.history

apps/api/src/
├── modules/activities/views/student-view.ts         # StudentActivityInput += firstCompletedAt
├── modules/student-activities/
│   ├── student-activity-loader.ts      # toInput fills firstCompletedAt (attempt 1's completedAt)
│   ├── history.ts                      # pure: historySituation, deliveredAt, normalizeSearch, byDelivery, cursor
│   ├── my-activities.service.ts        # history(userId, query)
│   └── my-activities.controller.ts     # GET /me/history
└── platform/logging/logging.module.ts  # serializers.req redacts the `q` query value
apps/api/test/
├── unit/028-history.spec.ts            # pure helpers
├── integration/028-us1-history.spec.ts, 028-us2-tabs.spec.ts, 028-us3-search-class.spec.ts
├── security/028-history-isolation.spec.ts   # foreign classes, malformed input, no grade before release, log redaction
└── traceability.spec.ts                # SPECS += 028

apps/web/
├── app/(student)/historico/page.tsx    # description; reads aba/busca/materia
├── lib/messages/dates.ts               # formatDayMonth, formatWeekdayTime
├── features/student-activities/
│   ├── api/student-activities.ts       # getHistory
│   ├── hooks/use-student-activities.ts # useStudentHistory (infinite, keys with tab/q/class, poll)
│   ├── schemas/student-history.ts      # address ↔ query, texts, labels, grade percent
│   └── components/student-history.tsx  # cards, toolbar, table/cards, footer, states (+ test)
└── e2e/student-history.spec.ts         # one journey

CLAUDE.md                               # 028 summary and rule
```

**Structure Decision**: no new API module; the history belongs to the student's reads in `student-activities` (beside
`list` and `dashboard`, sharing `summaries`). On the web it stays in `features/student-activities`, reusing the 026
class labels from `features/my-classes`.

## Complexity Tracking

No violation.
