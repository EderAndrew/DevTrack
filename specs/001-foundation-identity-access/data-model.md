# Data Model: 001 — Foundation, Identity & Access

**Date**: 2026-09-21 | **Spec**: [spec.md](./spec.md) | **Research**: [research.md](./research.md)

PostgreSQL 17, Prisma 7. Nomes de tabela em `snake_case` (via `@@map`), modelos Prisma
em `PascalCase`. Todas as chaves primárias são UUID (`gen_random_uuid()`), salvo onde
indicado. Timestamps em `timestamptz` (UTC).

Nenhuma entidade do domínio acadêmico é criada (FR-080).

## Diagrama

```text
User 1───* UserRole *───1 Role 1───* RolePermission *───1 Permission
 │  1                       │
 │  └─0..1 TeacherProfile   └─1───* Invitation (roleId)
 │  └─0..1 StudentProfile
 │  └─* Session
 │  └─* UserToken
 │
Invitation *───1 User (invitedBy) ; 0..1 User (acceptedBy)
AdminBootstrap 0..1─── User (targetUser, preenchido quando conhecido/concluído)
AuditEvent (append-only; refs lógicas, sem FK obrigatória)
RateLimitCounter (independente)
```

---

## User — `users`

| Campo | Tipo | Regras |
|-------|------|--------|
| `id` | uuid PK | |
| `email` | text NOT NULL **UNIQUE** | normalizado (`trim` + minúsculas) antes de persistir (FR-001); máx. 254 |
| `name` | text NOT NULL | 1–120 caracteres após `trim`; nome da identidade |
| `passwordHash` | text NOT NULL | Argon2id (PHC string) — FR-020 |
| `emailVerifiedAt` | timestamptz NULL | `NULL` = `UNVERIFIED`; preenchido = `VERIFIED` |
| `status` | `AccountStatus` NOT NULL default `ACTIVE` | `ACTIVE` \| `SUSPENDED` (FR-008) |
| `statusChangedAt` | timestamptz NULL | |
| `createdAt` / `updatedAt` | timestamptz NOT NULL | |

- **Sem coluna de papel** (FR-002, Constituição XXV).
- Não há usuário sem senha: toda criação de `User` recebe a senha da própria pessoa
  (cadastro, aceite de convite, ativação de bootstrap).

**Estados**
- E-mail: `UNVERIFIED → VERIFIED` (irreversível nesta feature). Transições: link de
  verificação, aceite de convite/ativação para e-mail não verificado, conclusão de
  redefinição de senha.
- Conta: `ACTIVE ⇄ SUSPENDED` (somente `ADMIN`, `usuarios.suspender` /
  `usuarios.reativar`). `ACTIVE → SUSPENDED` revoga todas as sessões (FR-026).

## Role — `roles`

| Campo | Tipo | Regras |
|-------|------|--------|
| `id` | uuid PK | |
| `key` | text NOT NULL **UNIQUE** | `ADMIN`, `MANAGER`, `TEACHER`, `STUDENT` (dados, não enum — FR-003) |
| `name` | text NOT NULL | rótulo exibível |
| `privileged` | boolean NOT NULL default false | `true` para `ADMIN`, `MANAGER`, `TEACHER` — define quais suspensões revogam sessões (FR-026) |

## Permission — `permissions`

| Campo | Tipo | Regras |
|-------|------|--------|
| `id` | uuid PK | |
| `key` | text NOT NULL **UNIQUE** | formato `recurso.acao` / `recurso.escopo.acao`, regex `^[a-z_]+(\.[a-z_]+)+$` |
| `description` | text NOT NULL | |

## RolePermission — `role_permissions`

PK composta (`roleId`, `permissionId`), ambos FK `ON DELETE RESTRICT`.

Papéis, permissões e associações iniciais são **dados de referência** inseridos por
migration SQL idempotente (`ON CONFLICT DO NOTHING`), conforme
[contracts/permissions.md](./contracts/permissions.md). Não há credencial nem usuário
nesse seed (Constituição XXV).

## UserRole — `user_roles`

| Campo | Tipo | Regras |
|-------|------|--------|
| `id` | uuid PK | |
| `userId` | uuid FK → users NOT NULL | |
| `roleId` | uuid FK → roles NOT NULL | |
| `status` | `RoleAssignmentStatus` NOT NULL | `ACTIVE` \| `SUSPENDED` \| `INACTIVE` — fonte única (FR-007) |
| `grantedById` | uuid FK → users NULL | `NULL` para `STUDENT` (autocadastro) e `ADMIN` (bootstrap) |
| `grantedVia` | `GrantSource` NOT NULL | `SELF_SIGNUP` \| `INVITATION` \| `ADMIN_BOOTSTRAP` |
| `grantedAt` | timestamptz NOT NULL | |
| `statusChangedAt` | timestamptz NULL | |
| `statusChangedById` | uuid FK → users NULL | |

- **UNIQUE (`userId`, `roleId`)** — nunca duas atribuições do mesmo papel (FR-044).
- Índice (`roleId`, `status`) — contagem de `ADMIN`s ativos e listagem de professores.
- Papéis nunca são apagados: "remoção" = `INACTIVE` (FR-053).

**Máquina de estados** (inválidas → `409 INVALID_STATE_TRANSITION`)

```text
(nenhuma) ──conceder──▶ ACTIVE
ACTIVE ──suspender──▶ SUSPENDED ──reativar──▶ ACTIVE
ACTIVE | SUSPENDED ──desativar──▶ INACTIVE ──reativar──▶ ACTIVE
```

- Sair de `ACTIVE` em papel `privileged` revoga todas as sessões do usuário (FR-026).
- Guarda do último `ADMIN` (FR-054): qualquer transição que tire `ADMIN` de `ACTIVE`
  roda sob `pg_advisory_xact_lock(ADMIN_GUARD)` e é recusada se o resultado deixar
  zero `ADMIN`s `ACTIVE` com conta `ACTIVE`; o mesmo guard vale para suspender a
  conta (`User`) do último `ADMIN`.
- Estado `INVITED` do professor **não é armazenado**: é derivado de convite `PENDING`
  sem `UserRole TEACHER` (FR-007).

## TeacherProfile — `teacher_profiles` / StudentProfile — `student_profiles`

| Campo | Tipo | Regras |
|-------|------|--------|
| `userId` | uuid PK, FK → users | no máximo um por `User` (FR-006) |
| `displayName` | text NOT NULL | 1–120; inicializado a partir de `User.name` ou do nome informado no convite |
| `createdAt` / `updatedAt` | timestamptz NOT NULL | |

Sem status próprio e sem dados acadêmicos (FR-006, FR-007).

## Invitation — `invitations`

Um modelo para convites de `TEACHER` e `MANAGER` (Key Entities: *Invitation*).

| Campo | Tipo | Regras |
|-------|------|--------|
| `id` | uuid PK | |
| `email` | text NOT NULL | normalizado |
| `displayName` | text NOT NULL | nome informado pelo emissor (vira `TeacherProfile.displayName`) |
| `roleId` | uuid FK → roles NOT NULL | somente `TEACHER` ou `MANAGER` (CHECK via aplicação + teste) |
| `invitedById` | uuid FK → users NOT NULL | |
| `tokenHash` | text NOT NULL **UNIQUE** | `SHA-256` do token vigente; trocado a cada reenvio |
| `status` | `InvitationStatus` NOT NULL | `PENDING` \| `ACCEPTED` \| `EXPIRED` \| `REVOKED` |
| `expiresAt` | timestamptz NOT NULL | criação/reenvio + 7 dias |
| `sendCount` | int NOT NULL default 1 | |
| `lastSentAt` | timestamptz NOT NULL | |
| `acceptedAt` / `acceptedByUserId` | timestamptz / uuid FK NULL | |
| `revokedAt` / `revokedById` | timestamptz / uuid FK NULL | |
| `createdAt` / `updatedAt` | timestamptz NOT NULL | |

- **UNIQUE parcial (`email`, `roleId`) WHERE `status = 'PENDING'`** — no máximo um
  convite pendente por e-mail e papel.
- Índice (`invitedById`, `status`).
- `CHECK (status <> 'ACCEPTED' OR (acceptedAt IS NOT NULL AND acceptedByUserId IS NOT NULL))`.

**Máquina de estados**

```text
PENDING ──aceitar──▶ ACCEPTED   (terminal)
PENDING ──revogar──▶ REVOKED    (terminal)
PENDING ──expirar──▶ EXPIRED    (terminal)
PENDING ──reenviar─▶ PENDING    (novo tokenHash, expiresAt renovado, token anterior inválido)
```

- A expiração é materializada de forma preguiçosa: qualquer leitura/uso de convite
  `PENDING` com `expiresAt < now()` o grava como `EXPIRED` antes de responder; listagens
  tratam `expiresAt < now()` como expirado.
- Um convite `EXPIRED` ou `REVOKED` não é reaberto: o emissor cria outro.

## UserToken — `user_tokens`

Tokens de uso único ligados a um `User` existente: verificação de e-mail e
redefinição de senha.

| Campo | Tipo | Regras |
|-------|------|--------|
| `id` | uuid PK | |
| `userId` | uuid FK → users NOT NULL | |
| `purpose` | `TokenPurpose` NOT NULL | `EMAIL_VERIFICATION` (24 h) \| `PASSWORD_RESET` (1 h) |
| `tokenHash` | text NOT NULL **UNIQUE** | |
| `expiresAt` | timestamptz NOT NULL | |
| `usedAt` | timestamptz NULL | |
| `invalidatedAt` | timestamptz NULL | preenchido quando substituído por nova emissão |
| `createdAt` | timestamptz NOT NULL | |

- **UNIQUE parcial (`userId`, `purpose`) WHERE `usedAt IS NULL AND invalidatedAt IS NULL`**
  — um único token vigente por finalidade; emitir novo invalida o anterior na mesma
  transação (FR-015, FR-029b).
- Consumo: `UPDATE … SET usedAt = now() WHERE tokenHash = $1 AND usedAt IS NULL AND
  invalidatedAt IS NULL AND expiresAt > now() RETURNING …` — atômico, uso único.
- Verificação reutilizada após sucesso → sem efeito (idempotente, FR-014).

## AdminBootstrap — `admin_bootstraps`

| Campo | Tipo | Regras |
|-------|------|--------|
| `id` | uuid PK | |
| `email` | text NOT NULL | normalizado |
| `targetUserId` | uuid FK → users NULL | preenchido quando o `User` já existia ou na conclusão |
| `status` | `BootstrapStatus` NOT NULL | `PENDING` \| `COMPLETED` \| `CANCELLED` |
| `tokenHash` | text NULL **UNIQUE** | `NULL` quando concluído direto (usuário verificado, FR-035) |
| `expiresAt` | timestamptz NULL | criação + 24 h quando há token |
| `linkPrinted` | boolean NOT NULL default false | `--print-link` usado (também auditado) |
| `operatorHost` / `operatorUser` | text NOT NULL | origem operacional (US3-9) |
| `createdAt` / `completedAt` / `cancelledAt` | timestamptz | |

- **UNIQUE parcial sobre expressão constante `((true))` WHERE `status = 'PENDING'`** —
  no máximo um bootstrap pendente em todo o sistema (FR-032).
- Um `PENDING` expirado continua `PENDING` até ser cancelado por nova execução (US3-7);
  a ativação recusa tokens expirados.

```text
PENDING ──ativar (token válido)──▶ COMPLETED
PENDING ──nova execução──────────▶ CANCELLED
(criado já COMPLETED quando o e-mail é de User verificado)
```

## Session — `sessions`

| Campo | Tipo | Regras |
|-------|------|--------|
| `id` | uuid PK | **identificador público** não secreto (FR-027) |
| `userId` | uuid FK → users NOT NULL | |
| `tokenHash` | text NOT NULL **UNIQUE** | `SHA-256` do segredo do cookie (FR-023) |
| `createdAt` | timestamptz NOT NULL | |
| `lastUsedAt` | timestamptz NOT NULL | atualizado no máximo 1×/min |
| `absoluteExpiresAt` | timestamptz NOT NULL | `createdAt + 7 d` |
| `revokedAt` | timestamptz NULL | |
| `revokeReason` | `SessionRevokeReason` NULL | `LOGOUT` \| `LOGOUT_ALL` \| `USER_REVOKED` \| `PASSWORD_RESET` \| `ACCOUNT_CLAIMED` \| `ACCOUNT_SUSPENDED` \| `ROLE_DEACTIVATED` |

- Índice (`userId`, `revokedAt`).
- Válida ⇔ `revokedAt IS NULL AND lastUsedAt > now() - 8h AND absoluteExpiresAt > now()`.
- Revogação é idempotente (`UPDATE … WHERE revokedAt IS NULL`).
- Sessões expiradas/revogadas há mais de 30 dias podem ser removidas por limpeza
  futura; nesta feature permanecem (histórico).

## AuditEvent — `audit_events`

| Campo | Tipo | Regras |
|-------|------|--------|
| `id` | bigint identity PK | ordenação estável |
| `occurredAt` | timestamptz NOT NULL default now() | |
| `type` | text NOT NULL | catálogo em [contracts/audit-events.md](./contracts/audit-events.md) |
| `actorType` | `ActorType` NOT NULL | `USER` \| `OPERATOR` \| `ANONYMOUS` \| `SYSTEM` |
| `actorUserId` | uuid NULL | sem FK (histórico sobrevive a qualquer mudança futura) |
| `targetType` | text NULL | `USER`, `INVITATION`, `SESSION`, `ADMIN_BOOTSTRAP`, `USER_ROLE` |
| `targetId` | text NULL | |
| `requestId` | text NULL | `NULL` para eventos do comando operacional (usa `operatorHost`/`operatorUser` em `metadata`) |
| `metadata` | jsonb NOT NULL default `{}` | somente chaves permitidas por tipo de evento |

- **Append-only**: trigger `BEFORE UPDATE OR DELETE` que lança exceção.
- Índices: (`type`, `occurredAt`), (`targetType`, `targetId`), (`actorUserId`,
  `occurredAt`).
- Nunca contém senha, token, `tokenHash`, segredo de sessão, cookie ou secret
  (FR-071). E-mail aparece apenas quando é o próprio alvo (convite, bootstrap).

## RateLimitCounter — `rate_limit_counters`

| Campo | Tipo | Regras |
|-------|------|--------|
| `key` | text PK | `HMAC-SHA-256(APP_HMAC_SECRET, "<escopo>:<valor>")` — sem e-mail/IP em claro |
| `windowStart` | timestamptz NOT NULL | |
| `count` | int NOT NULL | |
| `expiresAt` | timestamptz NOT NULL | índice para limpeza |

Operação atômica: `INSERT … ON CONFLICT (key) DO UPDATE SET count = CASE WHEN
rate_limit_counters.expiresAt <= now() THEN 1 ELSE rate_limit_counters.count + 1 END,
…  RETURNING count`.

## Enums de plataforma

`AccountStatus`, `RoleAssignmentStatus`, `GrantSource`, `InvitationStatus`,
`TokenPurpose`, `BootstrapStatus`, `SessionRevokeReason`, `ActorType` são conceitos da
plataforma (estados de workflow), permitidos como tipos fixos pela Constituição XXI.
Papéis e permissões **não** são enums: são linhas em `roles`/`permissions`.

## Regras de validação (origem → campo)

| Regra | Onde |
|-------|------|
| E-mail: formato RFC 5322 simplificado, ≤ 254, normalizado | schemas Zod de cadastro, login, recuperação, convite |
| Senha: 12–128, fora da lista comum (FR-011) | `PasswordPolicy` (backend) |
| Nome: 1–120 após `trim`, sem caracteres de controle | cadastro, convite |
| Token: base64url de 43 caracteres | schemas de verificação, redefinição, convite, ativação |
| Campos desconhecidos → `400 VALIDATION_ERROR` | todos os schemas (`.strict()`) |
