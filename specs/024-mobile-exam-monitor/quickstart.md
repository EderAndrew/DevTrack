# Quickstart: Monitoramento de provas no celular (024)

Validates the feature end to end on a development machine. Commands from the repository root.

## 1. API with alerts

```bash
docker compose up -d postgres postgres-test mailpit
pnpm build
pnpm --filter api prisma migrate deploy
# apps/api/.env: PUSH_ENABLED=true, EXPO_ACCESS_TOKEN=<token of the Expo project>
pnpm dev
```

Without an Expo token, keep `PUSH_ENABLED=false`: alerts are written and end `SKIPPED` (check `exam_alerts`).

## 2. The app on an Android device or emulator

```bash
pnpm --filter mobile start            # Expo dev server; development build on the device (push needs a dev/EAS build, not Expo Go)
# EXPO_PUBLIC_API_ORIGIN=http://10.0.2.2:4000 for the emulator, the LAN address for a device
```

Pilot build: `pnpm --filter mobile exec eas build --profile internal --platform android` (FCM credentials uploaded
once with `eas credentials`).

## 3. Walk-through

1. In the web, as a teacher, apply an exam (018) to a class with two students, mark both present.
2. In the app, sign in with the teacher's account → the notification permission prompt → "Provas em andamento"
   lists the exam (US1-1, US2-1).
3. Sign in with a student's account → "Este aplicativo é para professores acompanharem provas." (US1-3).
4. Open the exam: both students "Presente — pode iniciar até …" as in the web (US2).
5. Lock the phone. As student A, start the exam and leave the tab → the phone vibrates and sounds; the locked
   screen shows only "DevTrack" and "Conteúdo oculto"; unlocked: "Ocorrência na prova — <A> — Aviso 1 de 3 — …"
   (US3-1, US3-8). Tap it → the room with A highlighted (US3-5).
6. Provoke occurrences 2, 3 and 4 → three alerts, the 4th "Prova retida — decisão pendente" with the stronger
   vibration; the room shows A first with "Decida no computador" (US2-3, US3-2). The app has no decision button.
7. "Silenciar avisos desta prova"; as student B, leave the tab → no alert; the room still updates (US4).
8. In the web, "Sair de todos os dispositivos" (or change the password) → the app returns to "Entrar" on its next
   request and no alert arrives anymore (US1-5, SC-004).
9. With `PUSH_ENABLED=false` repeat step 5 → no alert, the exam behaves exactly the same (SC-006).

## 4. Tests

```bash
pnpm --filter api test -t "024/"
pnpm --filter @repo/design-tokens test
pnpm --filter mobile test
pnpm --filter api test test/traceability.spec.ts
```
