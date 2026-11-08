# Mobile UI: 024 (`apps/mobile`)

Expo Router routes under `apps/mobile/app/`, code under `apps/mobile/features/<feature>/`, base components in
`apps/mobile/components/ui` built only from `@repo/design-tokens` (research Y11). Every text is pt-BR; no screen
says "fraude", "cola" or "violação"; a situation is always written out, never colour alone (FR-022). Theme from
`GET /me` (`DARK`/`LIGHT`, 022), dark before the session is known.

## Screens

| Route | Feature | Content |
|---|---|---|
| `/entrar` | `features/mobile-auth` | Wordmark "DevTrack", "E-mail", "Senha", "Entrar" (React Hook Form + `MobileLoginRequestSchema`). Errors from the API code: the web's generic credential message; `MOBILE_NOT_ALLOWED` → "Este aplicativo é para professores acompanharem provas."; `429` → the wait. On an expired session: "Sua sessão expirou. Entre novamente para voltar a receber avisos." |
| `/(app)/provas` | `features/exam-list` | "Provas em andamento": one card per exam (title, class, "Encerra às HH:MM", "Avisos silenciados" badge when muted); empty: "Nenhuma prova em andamento nas suas turmas."; the permanent notice when notifications are off ("As notificações estão desligadas neste celular. Você não receberá avisos." + "Abrir configurações"); "Sair" in the header. |
| `/(app)/provas/[classId]/[activityId]` | `features/exam-room` | The exam title and class; "Silenciar avisos desta prova" / "Ligar avisos desta prova" (a `Switch` with its label); the students in the monitor's order, each with name and the web's situation text (`examStatusLabel`), a held student with the warning badge and "Decida no computador"; "Atualizado às HH:MM:SS"; offline: "Sem conexão — os dados podem estar desatualizados"; a closed exam: "Esta prova foi encerrada."; a highlighted student when opened from an alert. Tapping a student opens their occurrences. |
| `/(app)/provas/[classId]/[activityId]/alunos/[attemptId]` | `features/exam-room` | The student's name and situation; the counted occurrences (`occurrenceLabel` of the web, the server time, "Aviso n de 3" or "Prova retida"); empty: "Nenhuma ocorrência registrada." |

No screen has a control that writes to an exam, an attendance, a pause or a decision (FR-010); the only writes
are the login, the logout, the device registration and the mute switch.

## Behaviour

- Polling: the room and the occurrences refetch every 5 s (`EXAM_ROOM_POLL_MS`) only while the screen is focused
  and the app is active (`AppState`); the list refetches on focus.
- Push: after the login the app asks for notification permission, creates the two channels (Y7), gets the Expo
  push token and calls `PUT /mobile/device`; it calls it again when the token changes.
- Logout: `DELETE /auth/mobile/sessions/current`, then clears the secure store and the query cache.
- A `401` anywhere clears the secret and goes to `/entrar` with the expired-session message.
- Accessibility: every control has an accessible name and role, touch targets ≥ 44 pt, text scales with the
  system font size; the RNTL tests query by role and name.

## Words

The situation and occurrence texts are the web's (`apps/web/features/exam-session/schemas/exam-session.ts`), copied
to `apps/mobile/features/exam-room/schemas/exam-room.ts`; `apps/mobile/test/wording-parity.test.ts` compares both
catalogs so they can't drift (Y10).
