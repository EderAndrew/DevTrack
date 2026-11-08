# Data Model: Monitoramento de provas no celular (024)

One migration. Nothing of the 018 exam tables changes; the alert outbox only reads ids from them.

## Changed

### `sessions` (001)

| Column | Type | Rule |
|--------|------|------|
| `client` | enum `session_client` (`WEB`, `MOBILE`) NOT NULL DEFAULT `'WEB'` | Fixed at creation (trigger refuses an update). WEB: 8 h idle / 7 d absolute; MOBILE: 30 d idle / 90 d absolute (Y3, FR-004). Existing rows are WEB. |

`absolute_expires_at` is written per kind at creation. The idle rule is applied in `SessionService.validate`.

## New

### `mobile_devices`

| Column | Type | Rule |
|--------|------|------|
| `id` | uuid PK | |
| `session_id` | uuid NOT NULL UNIQUE → `sessions(id)` ON DELETE CASCADE | Only a `client = 'MOBILE'` session (trigger). |
| `user_id` | uuid NOT NULL → `users(id)` | Equal to the session's user (trigger). |
| `platform` | enum `mobile_platform` (`ANDROID`, `IOS`) NOT NULL | |
| `push_token` | text NOT NULL UNIQUE | `^Expo(nent)?PushToken\[[A-Za-z0-9_-]{10,200}\]$` (CHECK). Never in audit or logs. |
| `created_at`, `updated_at` | timestamptz NOT NULL | |

Valid for sending while its session is valid (derived, Y9). Deleted in the same transaction on the app's logout
and on every session revocation (`SessionService.revoke` and `revokeAllForUser`), on `DeviceNotRegistered`, when the
token moves to another session, and by the job `mobile-devices` once the session has expired.

### `exam_alert_mutes`

| Column | Type | Rule |
|--------|------|------|
| `teacher_user_id` | uuid → `users(id)` | PK part |
| `activity_id` | uuid → `class_activities(id)` | PK part; an `EXAM` activity (trigger) |
| `created_at` | timestamptz NOT NULL | |

Muted = the row exists (Y8). States: on (no row) ↔ muted (row).

### `exam_alerts` (outbox)

| Column | Type | Rule |
|--------|------|------|
| `id` | uuid PK | |
| `kind` | enum `exam_alert_kind` (`OCCURRENCE`, `HOLD`) NOT NULL | |
| `activity_id` | uuid NOT NULL → `class_activities(id)` | |
| `attempt_id` | uuid NOT NULL → `activity_attempts(id)` | |
| `student_user_id` | uuid NOT NULL → `users(id)` | |
| `occurrence_ordinal` | int NOT NULL CHECK ≥ 1 | The occurrence (or the one that opened the hold). |
| `hold_id` | uuid NULL → `exam_attempt_holds(id)` | NOT NULL iff `kind = 'HOLD'` (CHECK). |
| `status` | enum `exam_alert_status` (`PENDING`, `SENT`, `SKIPPED`, `EXPIRED`) NOT NULL DEFAULT `'PENDING'` | |
| `tries` | int NOT NULL DEFAULT 0 CHECK 0–3 | |
| `claimed_until` | timestamptz NULL | Lease of the worker's claim. |
| `created_at` | timestamptz NOT NULL | Written with the occurrence's `recorded_at`. |
| `processed_at` | timestamptz NULL | |

UNIQUE `(attempt_id, occurrence_ordinal)`: a resent batch writes nothing (FR-014, idempotency). Index
`(status, created_at)` for the claim. Transitions: `PENDING → SENT` (at least one device got a ticket),
`PENDING → SKIPPED` (no recipient: muted, no device, access lost), `PENDING → EXPIRED` (older than 60 s at
dispatch, or 3 tries spent). Final rows only change by the retention job (trigger).

### `exam_alert_deliveries`

| Column | Type | Rule |
|--------|------|------|
| `alert_id` | uuid → `exam_alerts(id)` ON DELETE CASCADE | PK part |
| `device_id` | uuid | PK part; no FK (the device may be deleted later) |
| `status` | enum `exam_alert_delivery_status` (`SENDING`, `TICKET_OK`, `TICKET_ERROR`, `RECEIPT_OK`, `RECEIPT_ERROR`) | |
| `ticket_id` | text NULL | Expo's ticket id. |
| `error_code` | text NULL | `^[A-Za-z][A-Za-z0-9_]{0,63}$` (e.g. `DeviceNotRegistered`); never a message. |
| `sent_at` | timestamptz NOT NULL | |
| `receipt_checked_at` | timestamptz NULL | |

The PK makes "at most one alert per occurrence and device" structural (SC-001, idempotency).

## Derived (never stored)

- Session validity per kind (`client`, `last_used_at`, `absolute_expires_at`, `revoked_at`).
- A device's eligibility: valid MOBILE session ∧ user ACTIVE ∧ user holds `chamada.registrar` ∧ the user is the
  class's teacher ∧ the class is not archived ∧ no mute row for (teacher, activity).
- The in-progress exam list (published ≤ now < close, not cancelled, server `Clock`).
- The notification text (built at send time from the activity title, class name, student name and ordinal).

## Retention

- `exam_alerts` (+ deliveries in cascade): deleted 7 days after `created_at` (job `exam-alerts`).
- `mobile_devices`: deleted once the session has expired (job `mobile-devices`); revocation deletes them at once.
