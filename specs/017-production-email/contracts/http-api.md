# HTTP API Contract: 017 — E-mail Real em Produção

## New route: provider notices

| Method & path | Access | Body → Response | Errors |
|---|---|---|---|
| `POST /mail/notices/:provider` | `@Public()` + `@ProviderNotice()` (no session, no `Origin`, `application/json` or `text/plain`) | raw provider body (≤ 256 KB) → `200 {}` | `401 NOTICE_REJECTED` (signature, timestamp, topic); `404` (`:provider` not the configured `MAIL_NOTICE_PROVIDER`); `413 NOTICE_TOO_LARGE`; `429 RATE_LIMITED` |

- `:provider` is `resend` or `ses` (research N6). The signature is verified on the raw body before
  any database access; nothing in the answer says why a notice was refused.
- A valid notice answers `200 {}` whether or not it changed something (unknown Message-ID, ignored
  event type, repeated notice id).
- SES `SubscriptionConfirmation` for the configured topic: confirmed, `200 {}`.
- Cataloged in `endpoints.ts` as `mail.notice` with `ProviderNoticeParamsSchema` and response
  `EmptyResponseSchema`; the body is not a contract of the web (it belongs to the provider), so the
  catalog entry has no body schema and the adapter parses it (`ResendNoticeSchema`,
  `SnsEnvelopeSchema`, `SesNotificationSchema`, in `apps/api`, strict on the fields used).

## Changed shapes (`packages/contracts`)

- `classes/class-invitations.ts`:
  - `DeliveryStateSchema` = `SENDING` | `SENT` | `FAILED` | `UNDELIVERED`;
  - new `DeliveryIssueSchema` = `BOUNCED` | `COMPLAINED` | `REJECTED`;
  - `ClassInvitationView` gains `deliveryIssue: DeliveryIssue | null` (non-null iff `delivery =
    UNDELIVERED`).
- `provisioning/invitations.ts`: `InvitationView` gains `delivery: DeliveryState` and
  `deliveryIssue: DeliveryIssue | null` (both imported from `classes`, never redefined).

No other response changes. The public flows (`/auth/*`, verification, reset, acceptance) keep their
exact responses (FR-002, FR-018).
