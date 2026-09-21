# Audit Events Contract: 001 — Foundation, Identity & Access

Tabela `audit_events` (append-only). Cada evento: `type`, `actorType`, `actorUserId`,
`targetType`, `targetId`, `requestId`, `occurredAt`, `metadata` (FR-071).

**`metadata` só aceita as chaves listadas por tipo** (allowlist no `AuditService`;
chave fora da lista → erro em teste). Nunca: senha, token, `tokenHash`, segredo ou id
de cookie de sessão, cabeçalhos, secrets. O `id` público de sessão pode aparecer
(não é segredo, FR-027).

| `type` | Ator | Alvo | `metadata` permitido | Origem |
|--------|------|------|----------------------|--------|
| `admin.bootstrap.requested` | OPERATOR | ADMIN_BOOTSTRAP | `email`, `mode` (`DIRECT_GRANT`\|`ACTIVATION_LINK`), `operatorHost`, `operatorUser` | FR-036 |
| `admin.bootstrap.link_printed` | OPERATOR | ADMIN_BOOTSTRAP | `operatorHost`, `operatorUser` | FR-034 |
| `admin.bootstrap.cancelled` | OPERATOR \| SYSTEM | ADMIN_BOOTSTRAP | `reason` (`SUPERSEDED`\|`ADMIN_ALREADY_ACTIVE`) | FR-032 |
| `admin.bootstrap.refused` | OPERATOR | — | `reason` (`ADMIN_ALREADY_ACTIVE`), `operatorHost`, `operatorUser` | US3-5 |
| `admin.bootstrap.completed` | OPERATOR \| ANONYMOUS | USER | `bootstrapId`, `mode` (`DIRECT_GRANT`\|`CREATE_ACCOUNT`\|`CLAIM_ACCOUNT`) | FR-036 |
| `invitation.created` | USER | INVITATION | `role`, `email` | FR-070 |
| `invitation.resent` | USER | INVITATION | `sendCount` | |
| `invitation.revoked` | USER | INVITATION | — | |
| `invitation.accepted` | USER \| ANONYMOUS | INVITATION | `role`, `userId`, `mode` | |
| `invitation.acceptance_refused` | USER \| ANONYMOUS | INVITATION | `reason` (`WRONG_ACCOUNT`\|`SELF_INVITE`\|`SIGN_IN_REQUIRED`) | FR-070 "recusa" |
| `invitation.self_invite_blocked` | USER | — | `role` | FR-040a |
| `role.granted` | USER \| OPERATOR \| ANONYMOUS \| SYSTEM | USER_ROLE | `userId`, `role`, `via` | |
| `role.status_changed` | USER | USER_ROLE | `userId`, `role`, `from`, `to` | ativação/desativação/suspensão |
| `account.suspended` / `account.reactivated` | USER | USER | — | FR-052 |
| `account.claimed` | ANONYMOUS | USER | `via` (`INVITATION`\|`ADMIN_BOOTSTRAP`), `revokedSessions` | FR-048 |
| `account.last_admin_protected` | USER | USER | `operation` | FR-054 |
| `auth.signup` | ANONYMOUS | USER | — (só quando conta nova é criada) | |
| `auth.email_verified` | ANONYMOUS \| USER | USER | — | |
| `auth.login.succeeded` | USER | SESSION | `sessionId` | |
| `auth.rate_limit.blocked` | ANONYMOUS | — | `scope` (`login_email_origin`\|`origin`\|…) | FR-022 |
| `auth.rate_limit.alert` | SYSTEM | USER | `failuresAcrossOrigins` | FR-022 (várias origens) |
| `session.revoked` | USER | SESSION | `reason` | revogação individual |
| `session.revoked_all` | USER \| SYSTEM | USER | `reason`, `count` | logout-all e revogações por evento |
| `password_reset.requested` | ANONYMOUS | USER | — (só quando a conta existe; resposta pública não muda) | |
| `password_reset.completed` | ANONYMOUS | USER | `revokedSessions` | FR-029c |

Notas:
- `auth.login.succeeded` é registrado; falhas individuais de login **não** (volume) —
  são refletidas pelos eventos de rate limit.
- Eventos do comando operacional usam `requestId = NULL` e identificam a origem em
  `metadata` (`operatorHost`, `operatorUser`).
- O evento é gravado na mesma transação da operação; se a transação falhar, não há
  evento (e não há efeito).
