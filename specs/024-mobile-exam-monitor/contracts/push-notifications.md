# Push notifications: 024

## When an alert is written (research Y5)

In `FocusEventsService.countOccurrences` (018), in the batch's transaction, through `ExamAlertSink`:

| Event of the batch | Alert row |
|---|---|
| A new occurrence that does not open a hold | `OCCURRENCE`, `occurrence_ordinal` = its ordinal |
| The occurrence that opens a hold | `HOLD` with `hold_id` (no `OCCURRENCE` row for it) |
| A grouped signal, a non-countable event, an event while held/paused/after the end, a resent batch | nothing |

After the commit the service calls `sink.kick()`. Nothing about the alert is ever written to `exam_occurrences`,
`exam_attempt_holds` or the audit trail.

## Dispatch (`ExamAlertWorker`, research Y5, Y6)

1. Claim up to 50 `PENDING` alerts by `created_at` (`FOR UPDATE SKIP LOCKED`, lease 30 s).
2. Older than 60 s → `EXPIRED`. Otherwise resolve the recipients now (data-model "Derived"). None → `SKIPPED`.
3. For each eligible device without a delivery row: insert `exam_alert_deliveries` (`SENDING`), then send in
   batches of up to 100 through `ExpoPushClient.send`.
4. A ticket `ok` → `TICKET_OK` with `ticket_id`; a ticket error → `TICKET_ERROR` with `error_code`
   (`DeviceNotRegistered` deletes the device, `mobile_device.removed` `PROVIDER_UNREGISTERED`).
5. Network error, 429 or 5xx: `tries + 1`, retry after 2 s then 5 s while younger than 60 s; then `EXPIRED`.
6. At least one `TICKET_OK` → `SENT`.
7. Every 60 s: receipts of tickets 15 min–24 h old (`getReceipts`, up to 300 ids per call); a
   `DeviceNotRegistered` receipt deletes the device.

`EXAM_ALERT_INTERVAL_MS=0` turns the timer and `kick()` off (tests call `runOnce(now)`); `PUSH_ENABLED=false` is the
kill switch: alerts are still written and end `SKIPPED`.

## Message (built at send time)

| Field | OCCURRENCE | HOLD |
|---|---|---|
| `channelId` | `exam-occurrences` | `exam-holds` |
| `title` | `Ocorrência na prova` | `Prova retida — decisão pendente` |
| `body` | `<aluno> — Aviso <n> de 3 — <título da prova> (<turma>)`; after a return (n > 3) `<aluno> — Nova ocorrência — <título> (<turma>)` | `<aluno> — <título da prova> (<turma>)` |
| `data` | `{ kind, classId, activityId, studentUserId }` | same |
| `priority` / `sound` | `high` / `default` | `high` / `default` |

Never in a message: statements, answers, grades, e-mail, RA, contact data, "fraude", "cola", "violação" (FR-016,
FR-022, SC-005). Names and titles are rendered as plain text. The Android channels set `lockscreenVisibility:
PRIVATE`, so a locked phone shows only the app and "Conteúdo oculto" (Y7, US3-8).

## Opening an alert

Tapping opens `/(app)/provas/[classId]/[activityId]?aluno=<studentUserId>`; the app first validates the session
(`GET /me`) and then reads the room from the API. A room the teacher no longer reaches answers 404 and the app
shows "Esta prova não está mais disponível." (FR-017).
