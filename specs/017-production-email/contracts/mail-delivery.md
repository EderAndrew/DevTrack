# Mail Delivery Contract: 017 (replaces 003 `mail-delivery.md`)

## Flow (every kind)

1. The operation that creates the e-mail writes, in its transaction, a `mail_deliveries` row
   (`PENDING`, `attempts = 0`, `next_attempt_at = now() + 1 min`) through
   `MailOutbox.schedule(tx, kind, subject)`; pending deliveries of the same subject and kind become
   `SUPERSEDED`. Password reset for an unknown e-mail schedules nothing (001).
2. After commit, `MailOutbox.attemptNow(deliveryId, token)` makes the first attempt with the token the
   request minted, claiming the row (`FOR UPDATE`, `attempts 0 → 1`, `message_id`, in-flight
   deadline). It takes one unit of the `MAIL_SENDS_PER_MINUTE` budget; with no budget (or `0`) it
   sends nothing and the row stays `PENDING` for the worker. The admin bootstrap CLI does the same
   synchronously and reports the outcome.
3. `MailDeliveryWorker` every `MAIL_RETRY_INTERVAL_SECONDS` (`0` = off; tests call `runOnce(now)`)
   claims up to `min(50, budget of MAIL_SENDS_PER_MINUTE)` due rows (`FOR UPDATE SKIP LOCKED`, order
   `next_attempt_at, created_at`); per row, the kind's `MailSubject.prepare(tx, row)`:
   - `DISCARD(reason)` → `DISCARDED`, audited `mail_delivery.discarded`, nothing sent;
   - a newer delivery of the subject exists → `SUPERSEDED`;
   - otherwise mints a fresh token on the subject (the previous link dies), commits, sends.
4. Sending sets `Message-ID: <{deliveryId}.{attempt}@{MAIL_MESSAGE_ID_DOMAIN}>`, stored in
   `message_id` when the attempt is claimed (before sending). Outcome:
   - accepted → `SENT`, `sent_at`;
   - 5xx (permanent) → `UNDELIVERED (REJECTED)`, audited `mail_delivery.undelivered`;
   - temporary (network, timeout, 4xx, auth) → next wait, or `FAILED` after the 7th, audited
     `mail_delivery.failed`.
   A result is written only while the row is still `PENDING` at that attempt (a stale result, or one
   that a notice already overtook, never wins).
5. A provider notice (`POST /mail/notices/:provider`) is verified, linked by Message-ID (unknown →
   log only, not stored), stored once in `mail_notices` by `(provider, notice_id)` and applied by the
   table of research N7.

## Waits (003, unchanged)

| Failed attempt | Next attempt in |
|---|---|
| 1st | 1 min |
| 2nd | 5 min |
| 3rd | 15 min |
| 4th | 1 h |
| 5th | 3 h |
| 6th | 6 h |
| 7th | — (`FAILED`) |

## Subjects

| Kind | Subject | Discarded when | Fresh token on |
|---|---|---|---|
| `CLASS_INVITATION` | `class_invitations` | not effectively `PENDING` (`ACCEPTED`, `CANCELLED`, expired) | `class_invitations.token_hash` |
| `INVITATION_TEACHER` / `INVITATION_MANAGER` | `invitations` | not `PENDING`, expired | `invitations.token_hash` |
| `VERIFY_EMAIL` | `users` | e-mail already verified, account `SUSPENDED` | new `user_tokens` (`EMAIL_VERIFICATION`) |
| `PASSWORD_RESET` | `users` | account `SUSPENDED` | new `user_tokens` (`PASSWORD_RESET`) |
| `ADMIN_ACTIVATION` | `admin_bootstraps` | not `PENDING`, expired | `admin_bootstraps.token_hash` |

A retry does not change an invitation's `expires_at`, `send_count` or `last_sent_at` (003 FR-015).

## Guarantees tested

- With the mailer failing, every flow answers as before and its delivery stays `PENDING`; when the
  mailer is back, `runOnce()` sends it, the link received works and the previous link does not.
- Two workers never send the same attempt; a restart in the middle loses no delivery.
- A cancelled, accepted, revoked or expired subject sends nothing.
- No row, log or audit event holds the address, a name, the token, its hash or the link; the
  Message-ID lives only in `mail_deliveries.message_id`, never in a log, audit event or response.
