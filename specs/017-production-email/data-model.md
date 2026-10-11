# Data Model: 017 — E-mail Real em Produção

One migration (`<ts>_production_email`): two enums, one changed enum, two tables, the 003 rows moved,
`class_invitation_deliveries` dropped. No other table changes.

## Enums

- `mail_kind` (new): `VERIFY_EMAIL`, `PASSWORD_RESET`, `INVITATION_TEACHER`, `INVITATION_MANAGER`,
  `ADMIN_ACTIVATION`, `CLASS_INVITATION`.
- `delivery_status` (003, extended): `PENDING`, `SENT`, `FAILED`, `SUPERSEDED` (kept) + `DELIVERED`,
  `UNDELIVERED`, `DISCARDED`.
- `undelivered_reason` (new): `BOUNCED`, `COMPLAINED`, `REJECTED`.
- `discard_reason` (new): `EXPIRED`, `REVOKED`, `ACCEPTED`, `NOT_NEEDED`.
- `mail_notice_provider` (new): `RESEND`, `SES`.
- `mail_notice_kind` (new): `DELIVERED`, `BOUNCED`, `TEMPORARY`, `COMPLAINED`, `REJECTED`.

## `mail_deliveries` (new, replaces `class_invitation_deliveries`)

| Column | Type | Rules |
|---|---|---|
| `id` | uuid PK | `gen_random_uuid()` |
| `kind` | `mail_kind` NOT NULL | immutable (trigger) |
| `class_invitation_id` | uuid NULL FK `class_invitations` | only for `CLASS_INVITATION` |
| `invitation_id` | uuid NULL FK `invitations` | only for `INVITATION_TEACHER` / `INVITATION_MANAGER` |
| `user_id` | uuid NULL FK `users` | only for `VERIFY_EMAIL` / `PASSWORD_RESET` |
| `admin_bootstrap_id` | uuid NULL FK `admin_bootstraps` | only for `ADMIN_ACTIVATION` |
| `status` | `delivery_status` NOT NULL | transitions in research N7 (trigger) |
| `attempts` | int NOT NULL DEFAULT 0 | 0–7 (CHECK) |
| `next_attempt_at` | timestamptz NULL | NOT NULL iff `PENDING` (CHECK) |
| `last_error_code` | text NULL | `^[A-Za-z][A-Za-z0-9_]{0,63}$` (CHECK); never a message |
| `message_id` | text NULL UNIQUE | our Message-ID of the last attempt (N5) |
| `sent_at` | timestamptz NULL | set with `SENT` |
| `delivered_at` | timestamptz NULL | set with `DELIVERED` |
| `undelivered_at` | timestamptz NULL | set with `UNDELIVERED`, with `undelivered_reason` (CHECK) |
| `undelivered_reason` | `undelivered_reason` NULL | |
| `discard_reason` | `discard_reason` NULL | NOT NULL iff `DISCARDED` (CHECK) |
| `created_at`, `updated_at` | timestamptz | |

- CHECK: exactly one subject column is set, and it is the one of `kind`.
- Indexes: `(status, next_attempt_at)` (worker), `(class_invitation_id, created_at DESC)`,
  `(invitation_id, created_at DESC)` (latest delivery of an invitation), `(user_id, kind)`,
  `(admin_bootstrap_id)`.
- Never stored: the recipient address, names, the subject line, the link, the token or its hash
  (N2, FR-009).
- The migration inserts every `class_invitation_deliveries` row as a `CLASS_INVITATION` delivery
  with the same `id`, `status`, `attempts`, `next_attempt_at`, `last_error_code`, `sent_at` and
  timestamps, then drops the old table.

### Transitions (trigger `mail_deliveries_transition`)

```text
PENDING ──► SENT ──► DELIVERED
   │          │          │
   │          └──────────┴──► UNDELIVERED (BOUNCED | COMPLAINED)
   ├──► UNDELIVERED (REJECTED)
   ├──► FAILED
   ├──► DISCARDED
   └──► SUPERSEDED
```

`UNDELIVERED`, `FAILED`, `DISCARDED` and `SUPERSEDED` are final. `DELIVERED → UNDELIVERED` is only
allowed with `COMPLAINED`, or with `BOUNCED` when the bounce notice is older than the delivery
notice (out of order). Any other change → error `INVALID_STATE_TRANSITION`.

### Derived (never stored)

- **Invitation's delivery situation** (contracts): from its latest delivery row — `PENDING` →
  `SENDING`; `SENT` / `DELIVERED` → `SENT`; `FAILED` → `FAILED`; `UNDELIVERED` → `UNDELIVERED` with
  `deliveryIssue`; `DISCARDED` / `SUPERSEDED` → the previous row's situation.

## `mail_notices` (new)

| Column | Type | Rules |
|---|---|---|
| `id` | uuid PK | |
| `provider` | `mail_notice_provider` NOT NULL | |
| `notice_id` | text NOT NULL | the provider's id (`svix-id`, SNS `MessageId`), ≤ 200 chars |
| `kind` | `mail_notice_kind` NOT NULL | |
| `delivery_id` | uuid NULL FK `mail_deliveries` ON DELETE SET NULL | null when the Message-ID is unknown |
| `attempt` | int NULL | the `.{n}` of the Message-ID |
| `occurred_at` | timestamptz NOT NULL | the provider's time of the event |
| `received_at` | timestamptz NOT NULL | server clock |

- UNIQUE `(provider, notice_id)`: a repeated notice is a no-op (FR-012).
- Append-only (trigger), except the retention job.
- Never stored: the raw body, the address, the subject, the bounce message.

## Retention (`mail-records`, research N13)

- `mail_notices` older than 90 days → deleted.
- `mail_deliveries` in a final state older than `MAIL_RECORDS_RETENTION_DAYS` (180) → deleted,
  except the latest delivery of an invitation that is still `PENDING`.
