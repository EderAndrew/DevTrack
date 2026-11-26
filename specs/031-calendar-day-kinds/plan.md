# Implementation Plan: Calendário com tipos de data e calendário do aluno

**Branch**: `031-calendar-day-kinds` | **Date**: 2026-11-26 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/031-calendar-day-kinds/spec.md`

## Summary

Give each marked day of a disciplina da turma's calendar one of nine kinds and show the calendar to the enrolled student.
`class_meetings` keeps meaning "encontro" and gains `kind` (CLASS/EXAM/ASSIGNMENT/REVIEW/MAKEUP) and `description`; a new
table `class_calendar_days` holds the days that are not encontros (HOLIDAY/RECESS/SPECIAL_EVENT/TEACHER_ABSENCE, the Falta
with a private reason and an optional notice), one mark per date across both (CK1, CK2). Every 004–030 reader of meetings
stays unchanged. The 004 save route gains `set` (kind and texts per date); a meeting leaving the meeting condition reuses
the 004 topic resolutions (CK3). The teacher's calendar opens a modal per day (CK10). The student reads
`GET /me/classes/:classId/calendar` (new permission `calendario.turma.visualizar`, ACTIVE-enrollment check of 026, allowlist
view without topics or reason, `today` from the server clock; CK6, CK7) in a "Seu calendário de aulas" card on the Painel
with a Monday–Sunday week strip (CK8).

## Technical Context

**Language/Version**: TypeScript 7 on Node.js 24 LTS (API, contracts, web)
**Primary Dependencies**: no new dependency — NestJS + Prisma (API), Next.js 16 + React 19 + TanStack Query + shadcn/ui
(`Dialog`, `RadioGroup` via `components/ui/radio`, `Textarea`) + Lucide (web), Zod (contracts)
**Storage**: PostgreSQL 17 — one migration `…_031_calendar_day_kinds`: enums `class_meeting_kind` and
`class_calendar_day_kind`, `class_meetings.kind`/`description`, table `class_calendar_days`, cross-table date triggers,
permission `calendario.turma.visualizar` (STUDENT)
**Testing**: Vitest (API integration on `postgres-test`, security, boundary), contracts tests, web Vitest + RTL +
vitest-axe, Playwright E2E (local)
**Target Platform**: web (desktop and phone), API on Node
**Project Type**: web application (monorepo `apps/api`, `apps/web`, `packages/contracts`)
**Performance Goals**: the student card renders from one request of ≤ ~370 days; week navigation is local (no request)
**Constraints**: Design System tokens only, dark/light, 360 px without horizontal page scroll; 004 bodies without `set`
keep working; no topic, meeting number or reason in any student shape (SC-004)
**Scale/Scope**: ≤ 200 meetings + the other days of one period per class

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] **I. Security**: ✅ strict Zod bodies (discriminated union per kind, trimmed texts with limits, no NUL), the same
  limits as SQL CHECKs; the student route validates the UUID before any query and checks the ACTIVE enrollment first;
  texts render as text (FR-023).
- [x] **II. RBAC**: ✅ `calendario.gerenciar`/`planejamento.visualizar` unchanged for the teacher; new
  `calendario.turma.visualizar` for STUDENT only; context → `404` (own class / ACTIVE enrollment), capability → `403`.
- [x] **III. Server authority**: ✅ `today` from the injected `Clock`; numbering, totals and the student's text derived on
  the server; the web only navigates weeks.
- [x] **IV. Untrusted code**: N/A.
- [x] **V. Data integrity**: ✅ migration only; CHECKs per kind, UNIQUE per class and date, cross-table triggers, the save
  under the class lock and the 004 `planRevision`; existing meetings default to `CLASS` (SC-007).
- [x] **VI. Audit & logs**: ✅ `class_meetings.updated` gains counts (`kinds`, `changed`) and `class.offering_updated`
  `calendarDaysRemoved`; no text (reason, notice, description) in audit or logs (CK11).
- [x] **VII. Tests**: ✅ written first: contracts, API integration per US scenario, security (student allowlist, 404
  equality, 403), boundary (CK12), web per scenario with a11y, contrast tokens, E2E 360 px; traceability `SPECS += 031`.
- [x] **VIII. Layering**: ✅ controllers thin; the save logic stays in `ClassMeetingsService` (pure helper
  `calendar-diff.ts` computes the transitions of CK3); `student-calendar` service + allowlist view; web rules in pure
  `schemas/` helpers, components render.
- [x] **IX. Simplicity**: ✅ no new dependency or infrastructure; one new table instead of teaching every meeting reader a
  filter (CK1); `set` added beside `add`/`remove` (CK3); no polling or WebSockets (FR-020).
- [x] **X. Evidence**: N/A.
- [x] **XI. Human oversight**: N/A (no automation decides; topics are resolved by the teacher, FR-008).
- [x] **XII. Determinism first**: N/A (no AI).
- [x] **XIII. Risk level**: N/A.
- [x] **XIV–XV. AI governance**: N/A; the 007 proposal still counts meetings only.
- [x] **XVI. Explicit states**: ✅ kinds are enums; transitions of a date are listed (data-model) and the only guarded one
  (leaving the meeting condition with topics) answers `409 MEETING_HAS_TOPICS` as in 004.
- [x] **XVII. Idempotency**: ✅ resending the same save after success fails the `planRevision` check (as 004); `add` of an
  existing meeting and `set` with identical values change nothing and audit nothing.
- [x] **XVIII. Safe interruption**: ✅ one transaction per save.
- [x] **XIX. AI evals**: N/A.
- [x] **XX. Pedagogy**: ✅ the planning (topics) stays the teacher's; the student sees only what the teacher publishes.
- [x] **XXI. Configurable domain**: ✅ holidays and events are the teacher's text, never a list in code; the nine kinds are
  the calendar's fixed taxonomy (like the activity types), not subject or institution data.
- [x] **XXII. Personalization & accessibility**: ✅ kind never by color alone, keyboard-operable modal and week strip,
  accessible names with date and kind, both themes; the Falta's reason (possible personal data) never leaves the teacher.
- [x] **XXIII. Curricular traceability**: ✅ topics stay linked only to meetings; no mark changes the syllabus.
- [x] **XXIV. Academic isolation**: ✅ marks belong to one class; the student reads only classes of their ACTIVE
  enrollments; another teacher's class in the same turma stays `404`.
- [x] **XXV. Privileged provisioning**: ✅ the new permission is seeded by migration, STUDENT only.
- [x] **XXVI. Shared contracts**: ✅ kinds, `set`, the extended meeting list and `StudentCalendarSchema` in
  `packages/contracts`; labels and hints only in the web.
- [x] **Frontend stack**: ✅ shadcn/ui + tokens + Lucide, TanStack Query, Vitest + RTL + vitest-axe; code in
  `features/class-calendar` and new `features/student-calendar`.
- [x] **Mobile stack**: N/A (the app does not read calendars).

Post-design re-check: ✅ unchanged — the design adds one table, two columns, one read route and one permission; no
violation to track.

## Project Structure

### Documentation (this feature)

```text
specs/031-calendar-day-kinds/
├── spec.md
├── plan.md              # this file
├── research.md          # CK1–CK13
├── data-model.md        # migration, enums, transitions
├── quickstart.md
├── contracts/
│   ├── http-api.md      # GET/PUT /classes/:id/meetings, period change, GET /me/classes/:classId/calendar
│   ├── audit-events.md
│   ├── permissions.md
│   └── ui.md            # kinds table, teacher modal, student card
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
packages/contracts/
├── src/curriculum/class-meetings.ts      # kinds, texts, CalendarDayInput, set, days, items.kind/description
├── src/me/calendar.ts                    # new: StudentCalendarSchema
├── src/endpoints.ts                      # "me.classCalendar"
└── test/…                                # schema accept/refuse per kind, limits, add/set/remove overlap

apps/api/
├── prisma/schema.prisma + migrations/…_031_calendar_day_kinds/migration.sql
├── src/modules/class-plans/
│   ├── calendar-diff.ts (+ .spec.ts)     # new pure: from saved marks + add/set/remove → creates/updates/deletes/leaving meetings
│   ├── class-meetings.service.ts         # set, days, kinds in audit
│   └── class-plan.view.ts                # meetingViews + kind/description; dayViews
├── src/modules/classes/classes.service.ts # period change deletes days outside (calendarDaysRemoved)
├── src/modules/student-calendar/         # new module: controller, service (enrollment check + scoped select), views/student-calendar.view.ts
├── src/modules/audit/audit-event-types.ts
├── test/integration/031-us1-day-kinds.spec.ts, 031-us2-topics.spec.ts, 031-us3-student-calendar.spec.ts
├── test/security/031-student-calendar.spec.ts   # allowlist, 404 equality, 403, no reason/topics (SC-004/SC-005)
├── test/student-calendar-boundary.spec.ts       # CK12
└── test/traceability.spec.ts                    # SPECS += 031

apps/web/
├── features/class-calendar/
│   ├── schemas/day-kinds.ts (+ test)     # labels, hints, encontro set, dot tokens, pending → request
│   ├── components/day-kind-dialog.tsx (+ test)
│   ├── components/meeting-calendar.tsx   # modal, labels per day, legend, totals, resolution on leaving
│   └── components/meeting-list.tsx       # kind/description; "Dias sem aula"
├── features/student-calendar/            # new: api, hooks/use-student-calendar.ts, schemas/week.ts (+ test), components/student-calendar-card.tsx (+ test)
├── features/student-activities/components/student-dashboard.tsx  # mounts the card
├── test/contrast.test.ts                 # dot tokens in both themes
└── e2e/calendar-day-kinds.spec.ts        # teacher marks, student sees, 360 px
```

**Structure Decision**: the existing monorepo layout; the teacher side extends the 004 calendar slice
(`class-plans`, `features/class-calendar`), the student side is a new read slice (`student-calendar` API module and web
feature) mounted in the 026 Painel.

## Complexity Tracking

No violations.
