# Implementation Plan: Monitoramento de provas no celular

**Branch**: `024-mobile-exam-monitor` | **Date**: 2026-11-07 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/024-mobile-exam-monitor/spec.md`

## Summary

A read-only Expo app (`apps/mobile`, Android first, EAS internal builds) lets a teacher sign in with their own
account, list their exams in progress, watch the 018 room (the same routes and words as the web, polled every 5 s)
and read each student's occurrences. Each counted occurrence and each hold writes an alert row into a
transactional outbox, through a hook of `attempt-integrity` inside the student's batch transaction; an API worker
resolves the recipients at send time (the class's teacher, not muted, with a valid mobile session) and sends Expo
push messages over `fetch` on two Android channels whose locked-screen content is hidden. The mobile credential
is a `MOBILE` kind of the existing opaque session (30 d idle / 90 d absolute), sent as a bearer and accepted only
on an allowlist of routes, so the web's cookie and `Origin` defenses stay as they are. Design tokens are generated
from `tokens.css` into `packages/design-tokens`. Constitution 3.7.0 (amended for this feature) admits the app,
its stack and push.

## Technical Context

**Language/Version**: TypeScript 7 on Node.js 24 LTS (API, contracts, tokens); TypeScript in the Expo app (the
TS version the pinned Expo SDK supports; if it rejects TS 7, `typescript@~5.9` in `apps/mobile` only, like R1)
**Primary Dependencies**: API: NestJS, Prisma (no new npm dependency; Expo Push over `fetch`). Mobile (new, per
constitution 3.7.0): Expo SDK (latest stable, pinned), Expo Router, `expo-notifications`, `expo-secure-store`,
`expo-haptics`, `expo-font`, `expo-device`, TanStack Query, React Hook Form + `@hookform/resolvers`, Zod (catalog),
`lucide-react-native` + `react-native-svg`; dev: `jest-expo`, `@testing-library/react-native`
**Storage**: PostgreSQL 17 — one migration: `sessions.client`, tables `mobile_devices`, `exam_alert_mutes`,
`exam_alerts`, `exam_alert_deliveries` (data-model.md)
**Testing**: API Vitest (integration + security suites, `FakePushClient`); contracts and tokens Vitest; mobile Jest +
React Native Testing Library; no mobile E2E (constitution 3.7.0: only when a spec asks)
**Target Platform**: Android 10+ phones (EAS internal APK); API on the existing Hostinger VPS
**Project Type**: mobile app + existing web service (monorepo)
**Performance Goals**: alert dispatched ≤ 2 s after the commit in 95% of cases (SC-001 allows 10 s end to end);
`GET /mobile/exams` p95 < 150 ms; the room route is unchanged (018 targets)
**Constraints**: read-only app; no WebSockets (5 s polling); no notification content beyond FR-016; failures of
push never touch the exam (FR-015); no alert older than 60 s
**Scale/Scope**: pilot of a few teachers; a 40-student room with up to 4 alerts per student cycle; 4 screens

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.* — checked against v3.7.0.

- [x] **I. Security**: every body is a strict contract schema (token regex, platform enum, `muted` boolean); a
  bearer only for MOBILE sessions on an allowlist; cookie/Origin defenses of the web untouched (Y4); push token
  never logged; Expo access token required in production
- [x] **II. RBAC**: `chamada.registrar` for the list, the room, the occurrences and mute; login refused without it
  (`403 MOBILE_NOT_ALLOWED`); `ClassContextPolicy` on class routes; recipients re-checked at send time
- [x] **III. Server authority**: times from `serverNow`; the app writes nothing to an exam; alerts derive from the
  server's occurrence count
- [x] **IV. Untrusted code**: N/A (no code execution)
- [x] **V. Data integrity**: one Prisma migration; PKs, FKs, UNIQUE `(attempt_id, occurrence_ordinal)`, PK
  `(alert_id, device_id)`, CHECKs and triggers (data-model.md)
- [x] **VI. Audit & logs**: `mobile_session.*`, `mobile_device.*` with ids/enums only; no names, titles or tokens in
  audit or logs (boundary spec)
- [x] **VII. Tests**: tests first for the mobile session, the allowlist, the outbox, the worker, mute, retention and
  each screen
- [x] **VIII. Layering**: thin controllers; `ExamAlertWorker`/services hold the rules; React Native components only
  render (hooks → `features/*/api` → `lib/api`)
- [x] **IX. Simplicity**: push and the mobile app are admitted by 3.7.0 and required by this spec; no SDK (Expo over
  `fetch`); the outbox reuses the 017 pattern; no WebSockets
- [x] **X. Evidence**: an alert is a notice of a recorded fact, never a conclusion; the room stays the source
- [x] **XI. Human oversight**: decisions stay on the computer; the app has no decision route (`403` by allowlist)
- [x] **XII. Determinism first**: no AI
- [x] **XIII. Risk level**: N/A (no automation beyond deterministic dispatch)
- [x] **XIV–XV. AI governance**: N/A
- [x] **XVI. Explicit states**: `exam_alert_status`, `exam_alert_delivery_status`, `session_client`; mute is a row
- [x] **XVII. Idempotency**: resent batches write no alert (UNIQUE); one delivery per alert/device (PK); device upsert;
  mute idempotent; logout idempotent
- [x] **XVIII. Safe interruption**: `PUSH_ENABLED` kill switch; `EXAM_ALERT_INTERVAL_MS=0`; leases on claims; 60 s cap
- [x] **XIX. AI evals**: N/A
- [x] **XX. Pedagogy**: no new monitoring of students; the teacher is told of what 018 already records; texts never
  say fraud; the locked screen hides the student (Y7)
- [x] **XXI. Configurable domain**: nothing subject-specific
- [x] **XXII. Personalization & accessibility**: no adaptation data; accessible names, roles and font scaling in the app
- [x] **XXIII. Curricular traceability**: N/A
- [x] **XXIV. Academic isolation**: list, room, occurrences, mute and every alert scoped to the class's teacher (404
  outside); recipients resolved at send time
- [x] **XXV. Privileged provisioning**: no new account path; the mobile login is the same identity
- [x] **XXVI. Shared contracts**: `packages/contracts/src/mobile/` (login, session, device, exam list, alert
  preference), consumed by API and mobile; texts live in the app
- [x] **Frontend stack**: web change limited to none (the mute route is also callable from the web, no web UI in this
  feature)
- [x] **Mobile stack**: exactly the 3.7.0 stack; `StyleSheet` + `@repo/design-tokens`; `apps/mobile/features/<feature>/`;
  opaque revocable session in `expo-secure-store`; push with minimum content; devices deleted in the transaction of the logout and of every session revocation
  (`SessionService.revoke`/`revokeAllForUser`, Y9); expired sessions purged by the job `mobile-devices`

**Post-design re-check (after Phase 1)**: all gates still ✅. The only deviation from the spec's first wording (the
locked screen shows "Conteúdo oculto" instead of the exam title, Y7) is stricter and the spec was amended first.

## Project Structure

### Documentation (this feature)

```text
specs/024-mobile-exam-monitor/
├── plan.md
├── research.md            # Y1–Y13
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── http-api.md        # routes, auth of the app, rate limits, permission matrix
│   ├── push-notifications.md
│   ├── mobile-ui.md
│   ├── audit-events.md
│   └── configuration.md   # env, app config, maintenance jobs
├── checklists/requirements.md
└── tasks.md               # /speckit-tasks
```

### Source Code (repository root)

```text
apps/api/
├── prisma/migrations/<ts>_024_mobile_exam_monitor/   # sessions.client, mobile_devices, exam_alert_*
├── src/modules/auth/
│   ├── session.service.ts            # validate(secret, client), MOBILE lifetimes
│   ├── mobile-session.controller.ts  # POST /auth/mobile/sessions, DELETE …/current
│   └── mobile-session.service.ts
├── src/modules/access-control/
│   ├── decorators.ts                 # @MobileAccess(), @MobileEntry()
│   └── guards/session.guard.ts       # cookie → WEB, bearer → MOBILE on @MobileAccess() routes
├── src/platform/http/origin.guard.ts # the two mobile exceptions (Y4)
├── src/modules/attempt-integrity/
│   ├── exam-alert-sink.ts            # hook interface + no-op
│   └── focus-events.service.ts       # writes through the sink in countOccurrences, kick() after commit
├── src/modules/exam-alerts/          # new
│   ├── exam-alerts.module.ts
│   ├── exam-alert-outbox.ts          # ExamAlertSink implementation (insert rows in tx)
│   ├── exam-alert.worker.ts          # claim, recipients, send, receipts
│   ├── recipients.ts                 # eligible devices query
│   ├── message.ts                    # pure: title/body/data/channel
│   ├── mobile-devices.{controller,service}.ts
│   ├── mobile-exams.{controller,service}.ts
│   ├── exam-alert-preferences.{controller,service}.ts
│   ├── exam-alerts.job.ts
│   └── mobile-devices.job.ts
├── src/platform/push/
│   ├── push-client.ts                # PushClient port
│   └── expo-push.client.ts           # the only file that knows exp.host
└── test/
    ├── helpers/{mobile,exam-alerts}.ts, fixtures/push/fake-push-client.ts
    ├── integration/024-us1-mobile-session.spec.ts … 024-us4-mute.spec.ts, 024-schema.spec.ts, 024-worker.spec.ts
    ├── security/024-{isolation,mobile-allowlist,origin,concurrency,rate-limits,audit,retention}.spec.ts
    └── exam-alerts-boundary.spec.ts

packages/contracts/src/mobile/        # session.ts, devices.ts, exams.ts, alerts.ts (+ endpoints.ts entries)

packages/design-tokens/               # new
├── scripts/generate.ts               # tokens.css → src/generated.ts
├── src/{generated.ts,index.ts}
└── test/{in-sync,contrast}.test.ts

apps/mobile/                          # new (Expo)
├── app.config.ts, eas.json, babel.config.js, jest.config.js, tsconfig.json
├── app/
│   ├── _layout.tsx                   # QueryClient, theme, fonts, notification handler
│   ├── entrar.tsx
│   └── (app)/provas/{index.tsx,[classId]/[activityId]/index.tsx,[classId]/[activityId]/alunos/[attemptId].tsx}
├── components/ui/                    # Text, Button, Badge, Card, Screen, Notice, Switch (tokens only)
├── features/
│   ├── mobile-auth/{api,hooks,schemas,components}
│   ├── exam-list/{api,hooks,components}
│   ├── exam-room/{api,hooks,schemas,components}
│   └── push/{hooks,channels.ts}
├── lib/{api/client.ts,session/secure-session.ts,theme/}
├── assets/fonts/                     # Inter, Fredoka, JetBrains Mono (TTF, OFL)
└── test/{wording-parity,token-usage,no-decision-routes,exam-wording}.test.ts(x)

apps/api/test/traceability.spec.ts    # SPECS += 024; also scans apps/mobile test titles
```

**Structure Decision**: a third app in the monorepo (`apps/mobile`) and a new shared package
(`packages/design-tokens`), both named by constitution 3.7.0. The API change stays inside the existing modules
plus `modules/exam-alerts` and `platform/push`; `attempt-integrity` reaches alerts only through its hook.

## Complexity Tracking

No violation. (If Metro can't resolve pnpm's isolated `node_modules` with the pinned SDK, a package-level
`node-linker=hoisted` for `apps/mobile` is recorded here, research Y2.)
