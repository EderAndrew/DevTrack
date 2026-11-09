# apps/mobile — the teacher's exam monitor (024)

Expo app, read-only except the 025 nudge, for a teacher to watch the 018 exam room on the phone and get push alerts on each counted
occurrence and each hold (`specs/024-mobile-exam-monitor/`). Android first, internal distribution through EAS
(`docs/deploy/mobile.md`); iOS later.

## Stack (constitution 3.7.0, "Stack oficial do mobile")

One solution per responsibility, enforced by `eslint.config.mjs` (`no-restricted-imports`):

- Expo SDK 58, React Native 0.88, React 19.3, TypeScript; Expo Router (file routes in `app/`); `expo-dev-client` for
  the `development` EAS build (push needs a development build, never Expo Go).
- TanStack Query for every API read and write; `fetch` through `lib/api` (no axios).
- Zod from `@repo/contracts`: every response is parsed with its contract schema (`lib/api/client.ts`).
- `expo-secure-store` for the session secret only (`lib/session/secure-session.ts`); no AsyncStorage/MMKV.
- `expo-notifications` for push (Expo Push → FCM), `expo-haptics` for the vibration; no Firebase SDK.
- Style only with `StyleSheet` and `@repo/design-tokens` (generated from the web's `tokens.css`, both themes);
  icons only from `lucide-react-native`. `test/token-usage.test.ts` refuses literal colors and sizes.
- Jest (`jest-expo`) + React Native Testing Library 14: `render`, `fireEvent` and friends are async (`await`).

## Layers

`app/` (routes) and `features/*/components` only render; `features/*/hooks` hold the queries and mutations;
only `features/*/api` calls `lib/api` (ESLint). Features: `mobile-auth` (Entrar, logout, `GET /me`),
`exam-list` ("Provas em andamento"), `exam-room` (the room, a student's occurrences, the mute switch), `push`
(registration, Android channels `exam-occurrences`/`exam-holds`, foreground alerts, opening a room from a
notification). Shared UI is `components/ui` (Text, Button, Card, Badge, Dialog, Notice, Switch, TextField, Screen).

## Rules

- Read-only (024/FR-010): no decision (cancel, return, "Não cancelar"), attendance or pause anywhere in the app;
  `test/no-decision-routes.test.ts` scans for those routes and texts. The API refuses them to the bearer anyway
  (`403 MOBILE_ROUTE_NOT_ALLOWED`).
- The one write (025): the bell of a student in the room (`features/exam-room/components/nudge-bell.tsx`, shown only
  when the monitor's `nudge.canSend` says so) opens a confirmation in `components/ui/dialog.tsx` and posts `{}` to
  `…/attempts/:attemptId/exam-nudges` (`use-send-nudge.ts`), then re-reads the room; nothing typed, no text sent. The
  student's occurrences list the warnings between them, marked "Não é uma ocorrência".
- The bearer is the MOBILE session's secret: in memory and in the secure store, never logged or in the query
  cache; a `401` clears it with the cache and returns to "Entrar" with the expired message.
- Ids from a route or a notification are checked as UUIDs before any request path (`assertIds`); a push's
  `data` carries ids only, and the app re-reads the room from the API before showing anything.
- The room polls every 5 s (`EXAM_ROOM_POLL_MS`) only while focused and in the foreground; never WebSockets.
  Times and statuses come from the server (`serverNow`), never the phone's clock.
- Texts are the web's (`test/wording-parity.test.ts`) and never say "fraude", "cola" or "violação"
  (`test/exam-wording.test.ts`).
- `EXPO_PUBLIC_API_ORIGIN` comes from the EAS profile; every profile but `development` must be `https://`
  (`app.config.ts` refuses otherwise).

## Commands

```bash
pnpm --filter mobile start                 # Expo dev server (push needs a development build, not Expo Go)
pnpm --filter mobile android               # opens on an emulator/device
pnpm --filter mobile test                  # Jest + RNTL (the fake API client: test/render.tsx `fakeApi`)
pnpm --filter mobile lint | check-types
pnpm --filter @repo/design-tokens generate # tokens.css → packages/design-tokens/src/generated.ts (committed)
```

Tests render inside `renderApp` (`test/render.tsx`: query client without retries, a memory session store, the
theme) and program the API with `fakeApi({ "GET /path": body | ApiError | (body) => answer })`; a function may
return a promise to see a screen while a request is in flight. Screens that use `useFocusEffect` mock
`expo-router` (see `features/exam-room/components/exam-room-screen.test.tsx`).
