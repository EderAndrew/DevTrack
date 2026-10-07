# Implementation Plan: 015 — Trabalho em Modo Controlado com Ajuda da IA

**Branch**: `015-controlled-work-ai-help` | **Date**: 2026-10-07 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/015-controlled-work-ai-help/spec.md`

## Summary

Two options a teacher turns on, separately, when applying a work (012) to a class, both fixed
once a student starts (F2):

- **CONTROLLED mode** — the `activity_execution_mode` reserved by 012 becomes real for works. The
  student answers on a menu-less page in fullscreen when the device allows (F14); tab switches,
  other windows, minimizing, fullscreen exits and page-leave attempts are detected by a pure
  reducer (F5) and sent as idempotent, server-timed events (F4) that the teacher sees as a
  timeline with derived durations. Copy, cut, paste and drop are blocked in the page and in the
  code editor (F6), each attempt recorded; the server refuses an answer that grows faster than
  typing allows (F7). Nothing ever blocks, submits or grades the attempt; nothing is called fraud.
- **AI help** — 3 orientations per student in the whole work. A new L2 agent, `work-helper`
  (DISABLED until its release gate passes, F16), sees exactly what the student sees — never the
  answer key (F8) — and answers as a tutor. A deterministic leak check, run where the answer key
  lives, blocks any orientation that names or quotes an alternative or overlaps the expected
  answer or solution (F10). One pending request per attempt and a DB-enforced maximum of 3
  delivered make the limit exact under any concurrency; out-of-scope refusals, blocked
  orientations and AI failures cost nothing (F11). The proposal is settled by that rule in the
  runner's transaction (a small 006 extension, F9). The teacher sees every question and
  orientation in the review.

The next feature (attendance list → release to present students) is out of scope; nothing here
prevents restricting an activity to part of the class.

## Technical Context

**Language/Version**: TypeScript 7 on Node.js 24 LTS (`apps/api` with SWC; `tsc` type-check)
**Primary Dependencies**: NestJS 11, Prisma 7, Zod 4 (`@repo/contracts`); web: Next.js 16, React 19, TanStack Query 5, React Hook Form 7, shadcn/ui, Lucide, CodeMirror 6 (014); no new dependency
**Storage**: PostgreSQL 17 — one migration: enum value `CONTROLLED`, `class_activities.ai_help_allowance`, tables `attempt_integrity_events` (append-only) and `work_help_requests`, 2 enums, CHECKs, partial UNIQUE and (deferred) triggers; browser `localStorage` for unsent events
**Testing**: Vitest (pure reducer, timeline, typing allowance and leak check exhaustively; integration per story with the fake provider; security suites for isolation, provider-request scan for the answer key, injection, concurrency of help and events, rate limits; golden-set replay), Testing Library + `vitest-axe` + keyboard helpers, Playwright E2E with the OpenRouter mock
**Target Platform**: Linux server (API), browser (student on phone and desktop, teacher)
**Project Type**: web service + web app (pnpm/Turborepo monorepo)
**Performance Goals**: event batch p95 < 200 ms; help request answered (202) < 500 ms; orientation delivered in ≤ 15 s p95 (SC-007, model-bound); integrity summary for 60 students < 1 s
**Constraints**: no answer key in any model input or student response; server clock only; ≤ 3 delivered helps per attempt; no blocking, auto-submit or grade change from events or helps; no camera, screen capture or clipboard reading; agent DISABLED until its evidence is committed
**Scale/Scope**: 7 new routes + 2 changed, 1 migration, 2 new API modules, 1 permission, 7 audit types (+2 changed), 1 agent + 1 tool + 1 task, 1 new route group and page, 2 Exam Mode components, 1 golden set, 1 E2E

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] **I. Security**: strict bodies (no server fields: `recordedAt`, `status`, `used`, `message`, durations); question 1–500, events 1–50 per batch; guidance rendered as text; OWASP A01 (context → 404), A03 (no raw SQL from input), A04 (rate limits per student and per agent), prompt injection handled as data + output schema + leak check
- [x] **II. RBAC**: `ia.ajuda.pedir` (new, STUDENT); `atividades.aplicar`, `entregas.visualizar` (TEACHER), `atividades.proprias.responder/visualizar` (STUDENT) reused; matrix rows for every route; no role-name check
- [x] **III. Server authority**: event times, durations, help status and counts from the server; the deadline rule of 012 gates help; the typing allowance is checked on save (F7); offline events buffered and flagged
- [x] **IV. Untrusted code**: student code is text sent to the model as data and never executed; no runner
- [x] **V. Data integrity**: one migration; composite FKs to the attempt and the question; UNIQUEs (event id, idempotency key, execution), partial UNIQUE (one pending help), CHECKs (allowance, type rules, text sizes, status ↔ fields), triggers (settings before first start, append-only events, terminal help status, ≤ 3 delivered)
- [x] **VI. Audit & logs**: focus loss, fullscreen exit and copy/paste attempts audited (VI names them); help requested/delivered/out of scope/blocked/failed; settings change; metadata ids/enums/codes only; secret scan with help markers
- [x] **VII. Tests**: the limit of 3, the leak check, the typing allowance, event idempotency and authorization written first, with concurrency tests
- [x] **VIII. Layering**: pure `timeline`, `typing-allowance`, `focus-reducer`, `leak-check`; services with scoped queries and row locks; hooks keep `activities` free of AI and monitoring code (F1)
- [x] **IX. Simplicity**: no new dependency, WebSocket or queue (polling of one row while pending, F11); the existing AI worker runs the agent
- [x] **X. Evidence**: events are FACT with durations derived; "Uma saída não significa, sozinha, uso indevido" on the teacher view; no rule concludes anything from events
- [x] **XI. Human oversight**: grades and any interpretation of events stay HUMAN_DECISION; the guidance is SUGGESTION; consumption and blocking are RULE_RESULT
- [x] **XII. Determinism first**: limit, leak check, typing allowance and timeline are deterministic; AI only for the orientation itself
- [x] **XIII. Risk level** (v3.4.0, `constitution-amendment-3.4.0.md`, F17): `work-helper` is L2 and its orientation reaches the student under the bounded exception added to XIII by the 3.4.0 amendment (spec + teacher opt-in, no answer key to the model, deterministic leak check, no state change, fixed limit of 3, teacher visibility); no L3 operation
- [x] **XIV–XV. AI governance**: non-authoritative; one L1 tool scoped to the execution's request, strict schemas, 20 s timeout, input minimized to the student view (no names, ids or answer key); agent DISABLED by default; kill switches of 006 apply
- [x] **XVI. Explicit states**: `work_help_status`; execution mode enum; allowance as a value, not a flag; events typed by enum
- [x] **XVII. Idempotency**: events by client id; help by idempotency key and one pending per attempt; settings change no-op when equal
- [x] **XVIII. Safe interruption**: AI timeout/cancel/kill switch leave the request FAILED and the help unconsumed; the attempt never depends on the AI
- [x] **XIX. AI evals**: golden set (≥ 24 cases) with `leakFree`, `injectionClean`, `scopeAccuracy`, `relevance`; CI replay + release gate evidence (F16)
- [x] **XX. Pedagogy**: both controls are per-activity teacher choices, off by default; facts only, no blocking of the attempt, no camera/screen/clipboard content; NORMAL mode unchanged (no monitoring)
- [x] **XXI. Configurable domain**: no subject or language in code; the language reaches the model as snapshot data
- [x] **XXII. Personalization & accessibility**: no adaptation data touched or sent; warnings and dialogs keyboard-operable with axe tests; statuses by text
- [x] **XXIII. Curricular traceability**: no generation of activities; help tied to the snapshot question; topics untouched
- [x] **XXIV. Academic isolation**: student routes start at the ACTIVE enrollment and the own attempt; teacher routes at `ClassContextPolicy`; the tool reads only the execution's own request (ownership = student)
- [x] **XXV. Privileged provisioning**: N/A (one permission granted to STUDENT by migration)
- [x] **XXVI. Shared contracts**: `packages/contracts/src/{attempt-integrity,work-help}/*` and changes in `activities/`; endpoints catalog
- [x] **Frontend stack**: `features/{controlled-attempt,work-help}`, TanStack Query (polling), React Hook Form for the help form, design-system components; no Redux (event buffer is page-local + `localStorage`)

**Post-design re-check**: all ✅ (constitution v3.4.0, applied 2026-10-07). Touches outside the new
modules: the 012 activity trigger (mode/allowance editable before the first start), the 006
runner and `AgentDefinition` (`proposal.settle`, `hourlyLimit`, F9/F12), `CodeEditor`
(`blockClipboard`), the activities apply/edit forms, roster, attempt review and answering page,
`activities-boundary.spec.ts` (amended, F18), the permission seed, audit types, endpoints
catalog, config and `exam-mode.md`. The spec needed no behavioural change during planning; the
limits it left to the plan are in `contracts/configuration.md`.

## Project Structure

### Documentation (this feature)

```text
specs/015-controlled-work-ai-help/
├── plan.md
├── research.md                     # F1–F18
├── data-model.md
├── quickstart.md
├── constitution-amendment-3.4.0.md # applied 2026-10-07 (v3.4.0)
├── contracts/
│   ├── http-api.md
│   ├── work-helper.md
│   ├── permissions.md
│   ├── audit-events.md
│   ├── configuration.md
│   └── web-ui.md
├── checklists/requirements.md
└── tasks.md                        # /speckit-tasks
```

### Source Code (repository root)

```text
apps/api/
├── prisma/{schema.prisma, migrations/<ts>_controlled_work_ai_help/}   # enum, column, 2 tables, triggers, permission seed
├── src/platform/config/config.schema.ts                              # 5 settings (contracts/configuration.md)
├── src/modules/ai/definitions/types.ts                               # proposal.settle, hourlyLimit (F9, F12)
├── src/modules/ai/execution/{ai-execution.runner,ai-executions.service}.ts
├── src/modules/activities/                                           # create/edit settings, roster aiHelpUsed, HelpAvailability hook
├── src/modules/student-activities/                                   # executionMode/aiHelp in views, AnswerSaveGuard hook on save/submit
├── src/modules/attempt-integrity/
│   ├── focus-events.{controller,service}.ts                          # student events, own events
│   ├── integrity-review.{controller,service}.ts                      # teacher summary + timeline
│   ├── timeline.ts, typing-allowance.ts                              # pure (F4, F7)
│   ├── controlled-answer-guard.ts                                    # AnswerSaveGuard implementation
│   └── attempt-integrity.module.ts
├── src/modules/work-help/
│   ├── work-help.{controller,service}.ts                             # student request/read
│   ├── work-help-availability.controller.ts                          # GET /work-help/availability
│   ├── work-help-review.controller.ts                                # teacher read
│   ├── definitions/{work-helper,work-help.prompt,read-work-help-request.tool,request.ownership}.ts
│   ├── help/{leak-check,materialize,reconcile,views}.ts              # F10, F11, F13
│   └── work-help.module.ts
├── src/modules/audit/audit-event-types.ts
└── test/
    ├── helpers/{work-help,integrity}.ts
    ├── fixtures/work-help/                                           # golden set, score.ts
    ├── eval/work-help.eval.ts                                        # eval:help
    ├── integration/015-us1-settings … 015-us5-history.spec.ts, 015-schema.spec.ts, 015-evaluation.spec.ts
    ├── security/015-{isolation,answer-key-scan,injection,concurrency,rate-limits,boundaries,performance}.spec.ts
    ├── activities-boundary.spec.ts (amended), work-help-boundary.spec.ts (new)
    └── traceability.spec.ts                                          # SPECS += 015
packages/contracts/src/{activities/*, attempt-integrity/*, work-help/*, endpoints.ts}
apps/web/
├── components/ui/assessment/{focus-violation-warning,exam-alert}.tsx
├── components/ui/code/code-editor.tsx                                # blockClipboard
├── features/controlled-attempt/{api,components,hooks,store}/…       # monitor, reducer, clipboard block, event queue
├── features/work-help/{api,components,hooks,schemas}/…              # HelpDialog, HelpGuidance, HelpCounter, polling
├── features/activities/components/{new-activity,activity-detail,attempt-review}.tsx
├── features/student-activities/components/{activity-answering,student-history}.tsx
├── app/(focus)/{layout.tsx, minhas-atividades/[id]/responder/page.tsx}
├── features/design-system/registry.ts, design-system/{components,exam-mode}.md
└── e2e/controlled-work.spec.ts
README.md, CLAUDE.md, apps/api/CLAUDE.md, apps/web/CLAUDE.md, apps/api/.env.example
```

**Structure Decision**: the existing monorepo; settings in `activities`, the controlled mode in
`attempt-integrity` and the AI help in `work-help`, joined to the 012 modules only through two
startup-registered hooks (F1). Web mirrors it with two features, one route group and the Exam
Mode components of the 005 contract.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| XIII v3.3.0 (AI never publishes to students) — resolved by amendment 3.4.0 (applied), not by a deviation | The user asked for AI help the student reads during the work; the value is in getting it without waiting for the teacher | Teacher approval of each orientation defeats the feature (the student is mid-work); deviating silently from a MUST is not allowed, so the plan proposes the bounded amendment (F17) |
| 006 foundation change (`proposal.settle`, `hourlyLimit`) | A delivered orientation must be recorded as decided, and a classroom needs more than 100 executions per hour of this agent | Leaving proposals to expire misreports them; raising the global agent limit weakens the cost guard of the teacher generators (F9, F12) |
