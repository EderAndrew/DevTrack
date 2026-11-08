# Audit Events: 024

Metadata holds only ids, enums and codes. It never holds the push token, a student's name, an exam title or a
notification text (`exam-alerts-boundary.spec.ts`, SC-005).

| Type | Actor | Target | Metadata |
|---|---|---|---|
| `mobile_session.created` | USER | SESSION | `sessionId` |
| `mobile_session.refused` | USER | USER | `code` (always `"MOBILE_NOT_ALLOWED"`) |
| `mobile_session.ended` | USER | SESSION | `sessionId` |
| `mobile_device.registered` | USER | MOBILE_DEVICE | `sessionId`, `platform` |
| `mobile_device.removed` | USER \| SYSTEM | MOBILE_DEVICE | `reason` (`LOGOUT`, `REPLACED`, `SESSION_REVOKED`, `PROVIDER_UNREGISTERED`) |

`mobile_session.created` is written in the transaction that creates the session, with the access record, like
`auth.login.succeeded` for the web. `mobile_session.refused` is written on its own when the password was right but
the account can't use the app; wrong credentials write nothing new (the web login's rate-limit events apply).
`mobile_session.ended` and `mobile_device.removed` (`LOGOUT`) are written in the logout's transaction.
`mobile_device.registered` is written when a device row is created or moves to this session (then the previous
link writes `mobile_device.removed` `REPLACED`); re-registering the same token for the same session writes
nothing. `SESSION_REVOKED` is SYSTEM, written by `SessionService.revoke`/`revokeAllForUser` in the transaction
that revokes the session (password change, suspension, role removal, "Minhas sessões", "sair de todos os
dispositivos"), one event per deleted device, next to the revocation's own events. `PROVIDER_UNREGISTERED` is
SYSTEM, written by the worker.

Muting, the alert rows, the sends and the receipts write no audit event (Y5, Y8). The job `mobile-devices`
writes none either (a technical purge; the run logs the job name and the count).
