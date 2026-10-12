# Audit Events: 017

Actor `SYSTEM`, target `MAIL_DELIVERY`. Metadata holds only enums, counts and codes: never the
address, a name, the subject line, the link, the token or the Message-ID.

| Type | Actor | Target | Metadata |
|---|---|---|---|
| `mail_delivery.failed` | SYSTEM | MAIL_DELIVERY | `kind`, `attempts`, `errorCode` |
| `mail_delivery.undelivered` | SYSTEM | MAIL_DELIVERY | `kind`, `reason`, `source` |
| `mail_delivery.discarded` | SYSTEM | MAIL_DELIVERY | `kind`, `reason` |

- `reason` of `undelivered` is `BOUNCED`, `COMPLAINED` or `REJECTED`; `source` is `SMTP` or
  `NOTICE`.
- `reason` of `discarded` is `EXPIRED`, `REVOKED`, `ACCEPTED` or `NOT_NEEDED`.
- `SENT` and `DELIVERED` are not audited (volume; they live in the row).

## Logs only (not audited)

- `mail.notice_rejected` (`provider`, `reason`: `SIGNATURE`, `TIMESTAMP`, `TOPIC`, `FORMAT`).
- `mail.notice_unmatched` (`provider`, `kind`): valid notice, unknown Message-ID.
- `mail.delivery_failed` / `mail.delivery_exhausted` (`kind`, `deliveryId`, `attempt`,
  `errorName`), replacing 003's `class_invitation.delivery_*`.
- `mail.auth_failed` (once per worker cycle): the SMTP credentials were refused.
