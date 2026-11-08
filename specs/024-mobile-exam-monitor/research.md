# Research: Monitoramento de provas no celular (024)

Decisions carry the prefix **Y** (Y1…). Every decision cites the spec requirement it serves.

## Y1 — The app: Expo, Android first, internal distribution

- **Decision**: `apps/mobile` is an Expo app (managed workflow, TypeScript, Expo Router), the SDK pinned to the
  latest stable release at implementation time (recorded in `apps/mobile/package.json` and in the Active
  Technologies of CLAUDE.md). Android builds come from EAS Build with an `internal` profile (APK for the pilot,
  constitution 3.7.0 stack). iOS stays configured but unbuilt.
- **Rationale**: the constitution's mobile stack (3.7.0). Expo gives push (`expo-notifications`), secure storage,
  haptics and fonts without native code, and EAS builds an APK without a Mac.
- **Alternatives**: bare React Native (native projects to maintain, no gain for a read-only monitor); a PWA (web
  push on a locked Android works only partly and not on iOS without install; no reliable vibration).

## Y2 — pnpm workspace and Metro

- **Decision**: `apps/mobile` joins the pnpm workspace and Turborepo (`lint`, `check-types`, `test`; no `build`
  task: EAS builds outside CI). It consumes `@repo/contracts` (built `dist/`) and `@repo/design-tokens`. The Expo
  SDK in use supports pnpm's isolated `node_modules`; if Metro fails to resolve a hoisted peer, the fallback is
  `node-linker=hoisted` scoped to `apps/mobile` through a package-level `.npmrc` — recorded in Complexity Tracking
  only if needed. Zod comes from the catalog (one version, `zod-version.spec.ts`).
- **Rationale**: XXVI (the mobile consumes the contracts); one Zod version.
- **Alternatives**: a separate repository (duplicates the contracts, forbidden by XXVI).

## Y3 — Mobile credential: a MOBILE kind of the same opaque session

- **Decision**: `sessions` gains `client` (`WEB` | `MOBILE`, default `WEB`). `POST /auth/mobile/sessions` checks
  the credentials through the same `LoginService` path (same Argon2, same generic answer, same rate-limit scopes,
  FR-001), then, before creating anything, requires an ACTIVE account with a verified e-mail and the permission
  `chamada.registrar`; otherwise `403 MOBILE_NOT_ALLOWED` and no session (FR-002). The secret (43 chars, same
  generator) is returned **once in the body** and the database keeps only its hash (FR-003). The app sends it as
  `Authorization: Bearer <secret>`. `SessionService.validate(secret, client)` applies the policy of the kind:
  WEB 8 h idle / 7 d absolute (unchanged), MOBILE **30 d idle / 90 d absolute** (FR-004, clarified 2026-11-07).
  `revokeAllForUser` already covers every session of the user, so password change, suspension, role
  deactivation and "sair de todos os dispositivos" reach the mobile (FR-003). A cookie is accepted only for a
  WEB session and a bearer only for a MOBILE one.
- **Rationale**: Principle II (one identity, no second auth mechanism), constitution 3.7.0 (opaque, revocable,
  never JWT). Reusing `sessions` keeps one revocation path.
- **Alternatives**: JWT/refresh tokens (forbidden); a separate `mobile_tokens` table (a second revocation path to
  keep in sync); the web cookie inside the app (the `__Host-` cookie and the Origin check are browser defenses
  that a native client can't meet without weakening them).

## Y4 — Mobile routes are an allowlist; the web defenses stay as they are

- **Decision**: a MOBILE session reaches only routes marked `@MobileAccess()`: `GET /me`, `GET /mobile/exams`,
  `PUT /mobile/device`, `DELETE /auth/mobile/sessions/current`, `GET …/exam-monitor`,
  `GET …/attempts/:attemptId/integrity`, `PUT …/exam-alerts`. Any other route with a bearer answers `403
  MOBILE_ROUTE_NOT_ALLOWED` (decision routes `…/exam-holds/*` included: FR-010). `OriginGuard` keeps refusing
  unsafe methods without an allowed `Origin`, except (a) `@MobileEntry()` (`POST /auth/mobile/sessions`), which
  accepts a request **without** `Origin` (an `Origin` present must still be allowed), and (b) a request
  authenticated by a bearer and carrying no session cookie, on a `@MobileAccess()` route. Both still require
  `Content-Type: application/json`. A browser never attaches the bearer on its own, so these requests can't be
  forged cross-site; the web routes and the cookie path are untouched (FR-005).
- **Rationale**: least privilege (ADR-0006 spirit, Principle I): a leaked mobile secret reads the exam room and
  nothing else, and can't decide.
- **Alternatives**: full API access for mobile sessions (wider blast radius for no feature need).

## Y5 — Alerts: a transactional outbox fed by a hook of attempt-integrity

- **Decision**: `attempt-integrity` declares an `ExamAlertSink` hook (no-op by default, like `AnswerSaveGuard`);
  the new `modules/exam-alerts` registers on it. In `FocusEventsService.countOccurrences`, inside the batch's
  transaction under the attempt's `FOR UPDATE`, each new occurrence that does not open a hold writes one
  `exam_alerts` row `OCCURRENCE` (ordinal 1–3, or a later one after a return that stays below the hold), and the
  occurrence that opens the hold writes one `HOLD` row instead (FR-012, FR-013). Grouped signals already produce
  one occurrence and events that don't count produce none, so FR-014 holds by construction. UNIQUE
  `(attempt_id, occurrence_ordinal)` makes a resent batch write nothing new. After the commit the service calls
  `sink.kick()`; `ExamAlertWorker` (API process, own timer, `EXAM_ALERT_INTERVAL_MS`, 0 = off) claims PENDING rows
  `FOR UPDATE SKIP LOCKED`, resolves the recipients **at send time** (the class's teacher still holding
  `chamada.registrar`, the class not archived, the exam not muted by that teacher, devices whose MOBILE session is
  valid now) and sends. A failure never touches the student's transaction (FR-015).
- **Rationale**: the 017 outbox pattern (rolled back with the occurrence, never sent for an uncommitted fact);
  resolving recipients late honours mutes, revocations and lost access (FR-018, FR-021, SC-004).
- **Alternatives**: a scanner over `exam_occurrences` by timestamp (misses rows committed out of order);
  sending inside the student's request (latency and failure coupling, forbidden by FR-015).

## Y6 — Delivery: Expo Push over `fetch`, no SDK

- **Decision**: `platform/push/expo-push.client.ts` is the only file that knows `exp.host`: `POST
  /--/api/v2/push/send` with up to 100 messages per request and `Authorization: Bearer EXPO_ACCESS_TOKEN`
  (Expo's enhanced push security, so a leaked device token alone can't be pushed to), and `POST
  /--/api/v2/push/getReceipts`. One `exam_alert_deliveries` row per alert and device (PK), written before the
  request, so no device gets the same alert twice. A ticket error `DeviceNotRegistered` (or the same receipt
  error, read 15 min–24 h later) removes the device (`mobile_device.removed`, `PROVIDER_UNREGISTERED`). Transient
  errors (network, 429, 5xx) retry up to 3 times while the alert is younger than **60 s**; after that the alert
  ends `EXPIRED` and is never sent late (FR-019). Expo forwards to FCM with the project's FCM credentials kept in
  EAS, never in the repository.
- **Rationale**: like 017 (no provider SDK, `fetch` only, one adapter); `expo-server-sdk` would add a dependency for
  two HTTP calls.
- **Alternatives**: FCM HTTP v1 directly (service-account key handling on the VPS and a separate path for iOS);
  self-hosted push (impossible on Android without FCM).

## Y7 — Lock screen, channels, vibration and sound

- **Decision**: the app creates two Android channels on first launch: `exam-occurrences` (importance HIGH,
  default sound, vibration `[0, 250, 150, 250]`) and `exam-holds` (importance MAX, default sound, vibration
  `[0, 600, 200, 600, 200, 600]`), both with **`lockscreenVisibility: PRIVATE`**. The push names its channel. With
  PRIVATE, Android shows on a secure lock screen only the app and "Conteúdo oculto"; unlocked, it shows the
  title "Ocorrência na prova" / "Prova retida — decisão pendente" and the body with the student's name, the
  warning and the exam (FR-016). Expo push can't carry a custom public version of the text, so the locked screen
  shows **less** than the spec's first wording (no exam title either); the spec's US3-8 is amended to match
  (stricter, same intent: no name while locked). Android bundles the app's notifications on its own; there is no
  per-exam grouping key in Expo push, so the spec's edge case says "se agrupam no celular".
- **Rationale**: the clarification of 2026-11-07 (Q1: A) — no name visible on a locked phone in a room full of
  students.
- **Alternatives**: a data-only push building a local notification with a public version (needs a native module,
  outside the official stack); no name at all (rejected by the user, Q1).

## Y8 — Muting per exam

- **Decision**: `exam_alert_mutes (teacher_user_id, activity_id)`; muted = the row exists. `PUT
  /classes/:classId/activities/:activityId/exam-alerts { muted }` inserts `ON CONFLICT DO NOTHING` or deletes —
  idempotent (FR-020). The worker reads it at send time; alerts created while muted end `SKIPPED` and are never
  sent after unmuting (FR-021). No audit (a preference, like 022's theme).
- **Alternatives**: a mute per device (the spec says per teacher, all devices).

## Y9 — Devices

- **Decision**: `mobile_devices` has one row per MOBILE session (`session_id` UNIQUE) with the push token (UNIQUE)
  and the platform. `PUT /mobile/device { pushToken, platform }` upserts the current session's row; a token
  already linked to another session moves to the current one (another account on the same phone: the old link
  ends, `REPLACED`) (FR-018, edge case). Every revocation deletes the row in its own transaction (constitution
  3.7.0, "tokens removidos no logout e em toda revogação de sessão"): the app's logout (`LOGOUT`) and every path
  of `SessionService` — `revoke` (one session: "Minhas sessões", the web logout) and `revokeAllForUser` (password
  change, suspension, role removal, "sair de todos os dispositivos") — delete the devices of the sessions they
  revoke and write `mobile_device.removed` `SESSION_REVOKED` (SYSTEM) in the same transaction. Expiry has no
  write of its own, so the worker still joins the session and sends only while it is valid (an expired session
  gets nothing at once), and the maintenance job `mobile-devices` deletes the rows of expired sessions (no audit,
  a technical purge). The token is never written to audit or logs (only `deviceId`).
- **Rationale**: FR-018 and the constitution's removal rule, with the session as the one source of validity.

## Y10 — Reading the room: the same routes and the same words

- **Decision**: the app reads the room with the 018 routes (`GET …/exam-monitor`, `GET
  …/attempts/:attemptId/integrity`, whose events already carry `occurrenceOrdinal`), polled every 5 s while the
  screen is focused and the app is in the foreground (TanStack Query `refetchInterval` + `AppState`, FR-008). The
  situation, occurrence and time texts are a copy of the web catalog (`features/exam-session/schemas/exam-session.ts`)
  in `apps/mobile/features/exam-room/schemas/`; a test compares both catalogs key by key so they can't drift
  (FR-007). Times come from `serverNow` (FR-011). The list `GET /mobile/exams` is new: the teacher's EXAM activities
  in classes not archived, published, not closed and not cancelled by the server clock, with `muted` (FR-006).
- **Alternatives**: a mobile-specific monitor endpoint (two shapes of the same room to keep equal).

## Y11 — Design tokens for React Native

- **Decision**: `packages/design-tokens` holds `scripts/generate.ts`, which parses `apps/web/design-system/tokens.css`
  (`:root` and `:root[data-theme="light"]`) into `src/generated.ts`: colors per theme, the type scale (rem → px at
  16), radii, spacing and font families. The generated file is committed; a test regenerates it and fails on any
  difference, and the 022 contrast pairs are re-checked on the generated values (FR-023). The app ships the TTF
  files of Inter, Fredoka and JetBrains Mono (the web's families, OFL) through `expo-font`. The theme follows
  `GET /me` (`theme`, 022). `apps/mobile/components/ui` holds the base components (Text, Button, Badge, Card,
  Screen, Notice) built only from the tokens; a scan test forbids literal colors, sizes and fonts outside
  `components/ui` and the generated file (the mobile counterpart of `token-usage.test.ts`).
- **Alternatives**: NativeWind (a second styling system, not in the stack); hand-copied values (drift).

## Y12 — Retention

- **Decision**: job `exam-alerts` deletes `exam_alerts` and their deliveries 7 days after creation (no content is
  stored: ids, enums, ordinals, ticket ids, error codes). Job `mobile-devices` (Y9). Both in the
  `maintenance:run` registry.

## Y13 — Guards and tests

- **Decision**: `apps/api/test/exam-alerts-boundary.spec.ts` keeps `exam-alerts` away from grading, decisions,
  pauses and exam writes (it only reads), lets only `platform/push/expo-push.client.ts` name `exp.host`, and
  keeps names, titles and tokens out of its audit and log calls; `attempt-integrity` reaches it only through
  `ExamAlertSink`. `apps/mobile` tests (Jest + RNTL) cover screens, polling, theme, wording ("fraude", "cola",
  "violação" scanned in `apps/mobile` and in the push texts) and the absence of decision routes in
  `apps/mobile/features/*/api`. `traceability.spec.ts` adds 024 and also scans `apps/mobile` test titles.
  The API suites follow the project shape (`024-us1-…`, `024-schema`, security: isolation, mobile allowlist,
  origin, concurrency, rate limits, audit marker `MARCADOR-ALERTA-024` in student names, retention). A
  `FakePushClient` replaces Expo in tests.
