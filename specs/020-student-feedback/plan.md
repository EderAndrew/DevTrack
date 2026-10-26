# Implementation Plan: 020 — Feedback dos Alunos

**Branch**: `020-student-feedback` | **Date**: 2026-10-25 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/020-student-feedback/spec.md`

## Summary

A direct channel from the student to the platform's ADMIN:

- **Send** (J1–J4, J9): an "Enviar feedback" dialog in the student layout (never on the focus page of
  exams and CONTROLLED works) posts a category, a 10–2 000 character message, the current pathname and
  a client `submissionId`. One row per `submissionId` (UNIQUE), at most 5 per student in a rolling
  24 h, counted on the table under an advisory lock (`429` + `Retry-After`).
- **Treat** (J5–J7): the ADMIN lists feedbacks (keyset pages, filters by status and category, a
  `received` badge in the menu), opens one (student's name and e-mail, origin, history) and moves it
  `RECEIVED → IN_REVIEW → RESOLVED | ARCHIVED`, reopening a closed one as `IN_REVIEW`. Transitions are
  pure + conditional under a row lock, enforced by a trigger too, with an append-only history.
- **Follow** (J6): "Meus feedbacks" shows the student's own feedbacks and status, by allowlist.
- **Keep apart** (J8, J10): no AI, no mail, no grades; audit with ids and enums only; RESOLVED and
  ARCHIVED feedbacks purged 24 months after their last change (job `student-feedback`).

Alongside, on the same branch: the version label fix of the deploy (`APP_COMMIT` in turbo's build
env, `deploy/hostinger/update.sh`), already done before planning.

## Technical Context

**Language/Version**: TypeScript 7 on Node.js 24 LTS (`apps/api` with SWC; `tsc` type-check)
**Primary Dependencies**:
- NestJS 11, Prisma 7, Zod 4 (`@repo/contracts`);
- web: Next.js 16, React 19, TanStack Query 5, React Hook Form 7, shadcn/ui, Lucide;
- **no new dependency**.

**Storage**: PostgreSQL 17. One migration (`<ts>_student_feedback`):
- enums `student_feedback_category`, `student_feedback_status`;
- tables `student_feedbacks` (UNIQUE `(student_id, submission_id)`, CHECKs, 3 indexes) and
  `student_feedback_status_changes` (append-only);
- triggers: update guard (only status by an allowed transition), delete guard and append-only history
  (both open only under `devtrack.feedback_purge`);
- the permission seed (2 → STUDENT, 2 → ADMIN).

**Testing**:
- Vitest (API):
  - pure: `feedback-state` (every transition), the excerpt; contract: origin path and message length
    in code points;
  - integration per story (`020-us1-send`, `020-us2-admin`, `020-us3-own`), `020-schema` (CHECKs,
    triggers, append-only, purge flag);
  - security: isolation (teacher/manager `403`, student on ADMIN routes `403`, another student's
    feedback never in a list — SC-003), concurrency (10 simultaneous creates with one `submissionId`
    → 1 row; 6 simultaneous new creates → 5 rows; two ADMINs on one feedback → one history row per
    applied change — SC-005), the 24 h limit per student, audit and log scan without text (SC-004),
    retention;
  - `feedback-boundary.spec.ts` (new, J10); `traceability.spec.ts` (`SPECS += 020` at the first
    phase).
- Web: Testing Library + `vitest-axe` + keyboard helpers on the dialog, "Meus feedbacks", the ADMIN
  list and detail (SC-007); the XSS guard with an HTML/URL message; the student layout test (button
  present, also on a NORMAL activity page) and the focus layout test (button absent — SC-006).
- Playwright E2E `student-feedback.spec.ts`: student sends from the dashboard, sees it in "Meus
  feedbacks"; ADMIN filters, opens, resolves; student sees "Resolvido"; the attempt page of a
  CONTROLLED work has no button.

**Target Platform**: Linux server (API); browser for the student and the ADMIN (desktop, phone).
**Project Type**: web service + web app (pnpm/Turborepo monorepo)
**Performance Goals**: create p95 < 150 ms; lists and detail p95 < 100 ms (API only); SC-001 (send in
under 1 minute, ≤ 3 interactions after typing) is a UX target checked by the E2E.

**Constraints**:
- no AI, no e-mail, no Redis/queues/WebSockets/polling (FR-014, IX);
- the message and the origin never in audit, logs or e-mails (SC-004);
- the student never sees the history, the ADMIN or the origin; teachers and managers see nothing
  (FR-010, FR-011);
- a feedback is immutable except its status (FR-012).

**Scale/Scope**:
- 6 routes, 1 migration, 1 new API module (`student-feedback`), 1 maintenance job;
- 4 permissions, 3 audit types;
- 1 web feature (`feedback`), 3 pages (`/meus-feedbacks`, `/admin/feedbacks`,
  `/admin/feedbacks/[id]`), changes in the student layout, the sidebar and `lib/navigation.ts`;
- 1 E2E, 1 boundary test.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] **I. Security**: strict bodies (student, status and time from the server); invalid input refused,
  including the origin path (J2); OWASP A01: own-only lists, ADMIN-only routes; A03: message rendered
  as text, origin path whitelisted (J2, J9); A04:
  5/24 h per student, size limits, idempotent create.
- [x] **II. RBAC**: four explicit permissions (`feedbacks.*`); matrix rows; no role-name check.
- [x] **III. Server authority**: time, status, the 24 h window and the student from the server.
- [x] **IV. Untrusted code**: N/A (no code execution).
- [x] **V. Data integrity**: one migration; UNIQUE per submission; CHECKs on length, origin and
  transitions; update/delete guards and an append-only history.
- [x] **VI. Audit & logs**: submitted, rate-limited, status changed — same transaction (except the
  rate-limit refusal, after the rollback); ids and enums only.
- [x] **VII. Tests**: isolation, concurrency, the limit, audit scan and boundaries are written first
  (tasks).
- [x] **VIII. Layering**: thin controllers; service with scoped queries; pure `feedback-state` and
  excerpt; allowlist views; no rule in React components.
- [x] **IX. Simplicity**: two tables, no new dependency, no polling; the existing keyset, audit and
  maintenance patterns.
- [x] **X. Evidence**: the feedback is the student's FACT; the status is the ADMIN's decision.
- [x] **XI. Human oversight**: every status change is the ADMIN's; nothing is automatic except the
  retention purge of closed feedbacks.
- [x] **XII–XV, XIX. AI**: no AI anywhere in 020 (FR-014, J10).
- [x] **XIII. Risk level**: N/A (no automation).
- [x] **XVI. Explicit states**: `student_feedback_status` with pure + trigger-enforced transitions;
  invalid → `409 INVALID_STATE_TRANSITION`.
- [x] **XVII. Idempotency**: `submissionId` UNIQUE (J3); status changes under `FOR UPDATE` (J5).
- [x] **XVIII. Safe interruption**: every write is one transaction; a crash leaves no partial
  feedback or history row.
- [x] **XX. Pedagogy**: no effect on grades, points, the ranking or enrollment.
- [x] **XXI. Configurable domain**: categories are a closed platform list, not subject data; no
  subject, language or technology in code.
- [x] **XXII. Accessibility**: keyboard and screen reader flows, words for statuses (SC-007).
- [x] **XXIII. Curricular traceability**: N/A.
- [x] **XXIV. Academic isolation**: a feedback belongs to the platform, not to a class, so it has no
  class context by design (spec Resource context); horizontal access between students is closed
  (own-only routes) and teachers get nothing. Feedbacks are not academic records, so the retention
  purge does not touch the "desativar, não apagar" rule.
- [x] **XXV. Privileged provisioning**: N/A; permissions granted by migration.
- [x] **XXVI. Shared contracts**: `packages/contracts/src/feedback/*`, endpoint catalog; user-facing
  text stays in the web.
- [x] **Frontend stack**: `features/feedback`, TanStack Query, React Hook Form + Zod, DS components
  only (`Dialog`, `Radio`, `Textarea`, `Badge`, `Toast`, `SidebarMenuBadge`).

**Post-design re-check**: all ✅ against constitution v3.5.0, no amendment needed.

The analysis (2026-10-25) corrected two points, recorded in the spec's Clarifications: the entry point
is absent only from the focus page of exams and CONTROLLED works (a planning amendment that excluded
every answering page was based on a wrong reading of the routes and was undone, J1); and an invalid
origin path is refused with `400` instead of dropped (constitution I, J2).

Touches outside the new code:
- the permission seed, `access-control/permissions.ts`, `authorization-matrix.ts`, audit types,
  endpoint catalog;
- `platform/maintenance`: job `student-feedback`;
- web: `components/layout/student-layout.tsx`, `components/shared/app-sidebar.tsx`,
  `lib/navigation.ts` (`AREAS`, `STAFF_AREA_PERMISSIONS`, the ADMIN item);
- `traceability.spec.ts` (`SPECS += 020`); `CLAUDE.md` (feature list, rules, the boundary guard).

## Project Structure

### Documentation (this feature)

```text
specs/020-student-feedback/
├── plan.md
├── research.md                     # J1–J10
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── http-api.md
│   ├── permissions.md
│   ├── audit-events.md
│   ├── maintenance-jobs.md
│   └── web-ui.md
├── checklists/requirements.md
└── tasks.md                        # /speckit-tasks
```

### Source Code (repository root)

```text
apps/api/
├── prisma/{schema.prisma, migrations/<ts>_student_feedback/}       # enums, 2 tables, triggers, permission seed
├── src/modules/student-feedback/
│   ├── student-feedback.module.ts
│   ├── student-feedback.controller.ts                              # /me/feedbacks
│   ├── admin-feedback.controller.ts                                # /feedbacks
│   ├── student-feedback.service.ts                                 # create (idempotent, limit), own list
│   ├── admin-feedback.service.ts                                   # list, summary, detail, change status
│   ├── feedback-state.ts                                           # pure transitions (J5)
│   ├── excerpt.ts                                                  # pure, 140 code points
│   ├── views/{student-feedback-view,admin-feedback-view}.ts        # allowlists (J6)
│   └── feedback-retention.job.ts                                   # job student-feedback (J8)
├── src/modules/access-control/permissions.ts
├── src/modules/audit/audit-event-types.ts
├── src/platform/maintenance/                                       # registers the job
└── test/
    ├── helpers/feedback.ts
    ├── integration/020-us1-send … 020-us3-own.spec.ts, 020-schema.spec.ts
    ├── security/020-{isolation,concurrency,rate-limit,audit,retention}.spec.ts
    ├── feedback-boundary.spec.ts (new)
    └── traceability.spec.ts                                         # SPECS += 020
packages/contracts/src/{feedback/*, endpoints.ts, index.ts}
apps/web/
├── features/feedback/{api,components,hooks,schemas}/…               # FeedbackDialog, MyFeedbacks, AdminFeedbackList, AdminFeedbackDetail
├── app/(student)/meus-feedbacks/page.tsx
├── app/(app)/admin/feedbacks/{page.tsx,[id]/page.tsx}
├── components/layout/student-layout.tsx                             # button + menu item
├── components/shared/app-sidebar.tsx                                # ADMIN item + badge
├── lib/navigation.ts
└── e2e/student-feedback.spec.ts
CLAUDE.md, README.md
```

**Structure Decision**: the existing monorepo. One API module (`student-feedback`) with a student
controller and an ADMIN controller sharing pure rules and views; one web feature (`feedback`) mounted
by the student layout and two ADMIN pages.

## Complexity Tracking

No constitution violation. Nothing to justify.
