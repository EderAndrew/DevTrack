# Data Model: 003 — Turmas, Convites e Matrículas de Alunos

Extensão do modelo da Fase 001 (`specs/001-foundation-identity-access/data-model.md`).
Uma migração Prisma nova (`classes_invitations_enrollments`) + SQL para índices
parciais, `CHECK`s e permissões (D8). Nenhuma exclusão física nos fluxos desta
feature.

Modelos do schema depois desta feature (fixados por `domain-boundary.spec.ts`, D13):
`User`, `Role`, `Permission`, `RolePermission`, `UserRole`, `TeacherProfile`,
`StudentProfile`, `Invitation`, `UserToken`, `AdminBootstrap`, `Session`,
`AuditEvent`, `AccessRecord`, `RateLimitCounter`, **`SchoolClass`**,
**`ClassInvitation`**, **`ClassInvitationDelivery`**, **`Enrollment`**.

## Enums novos

| Enum (Prisma → SQL) | Valores |
|---------------------|---------|
| `ClassStatus` → `class_status` | `ACTIVE`, `INACTIVE`, `ARCHIVED` |
| `ClassInvitationStatus` → `class_invitation_status` | `PENDING`, `ACCEPTED`, `EXPIRED`, `CANCELLED` |
| `ClassInvitationCancelReason` → `class_invitation_cancel_reason` | `TEACHER`, `CLASS_ARCHIVED`, `ALREADY_ENROLLED` |
| `DeliveryStatus` → `delivery_status` | `PENDING`, `SENT`, `FAILED`, `SUPERSEDED` |
| `StudentStatus` → `student_status` | `ACTIVE`, `INACTIVE` |
| `EnrollmentStatus` → `enrollment_status` | `ACTIVE`, `REMOVED` |

Enum alterado: `GrantSource` ganha `CLASS_INVITATION` (papel `STUDENT` concedido pelo
aceite). `SELF_SIGNUP` permanece para o histórico.

## SchoolClass (`classes`)

| Campo | Tipo | Regras |
|-------|------|--------|
| `id` | uuid PK | `gen_random_uuid()` |
| `teacherId` | uuid FK → `users.id` (Restrict) | vem da sessão; nunca do pedido |
| `name` | text | 1–120 caracteres (`trim`) |
| `code` | text | 1–30: `[A-Za-z0-9._-]`; único por professor sem diferenciar maiúsculas |
| `academicYear` | int | 1900–2100 (validação no contrato; `CHECK` no banco) |
| `period` | text? | até 60 |
| `description` | text? | até 1000 |
| `status` | `ClassStatus` | padrão `ACTIVE` |
| `statusChangedAt` | timestamptz? | |
| `searchKey` | text | nome + código, minúsculas, sem acentos (D10); gravado pela aplicação |
| `createdAt`, `updatedAt` | timestamptz | |

Índices: `UNIQUE (teacher_id, upper(code))` (SQL); `(teacher_id, status, created_at
DESC, id DESC)`; `(teacher_id, academic_year)`.

Transições (`ClassStateMachine`): `ACTIVE → INACTIVE`, `INACTIVE → ACTIVE`,
`ACTIVE → ARCHIVED`, `INACTIVE → ARCHIVED`. `ARCHIVED` é final. Edição proibida em
`ARCHIVED` (409 `INVALID_STATE_TRANSITION`). Arquivar cancela os convites `PENDING` da
turma (`cancel_reason = CLASS_ARCHIVED`) na mesma transação.

## StudentProfile (`student_profiles`) — alterado

| Campo | Tipo | Regras |
|-------|------|--------|
| `userId` | uuid PK/FK → `users.id` | existente |
| `displayName` | text | existente |
| `ra` | text? **novo** | 1–20: `[A-Za-z0-9./-]`, gravado `trim` + maiúsculas; `UNIQUE (upper(ra)) WHERE ra IS NOT NULL`; imutável depois de preenchido nesta feature |
| `status` | `StudentStatus` **novo** | padrão `ACTIVE`; `INACTIVE` reservado |
| `createdAt`, `updatedAt` | timestamptz | existentes |

Contas antigas do autocadastro ficam com `ra = NULL` até o primeiro aceite (US4-5).

## ClassInvitation (`class_invitations`)

| Campo | Tipo | Regras |
|-------|------|--------|
| `id` | uuid PK | |
| `classId` | uuid FK → `classes.id` (Restrict) | |
| `email` | text | normalizado (`normalizeEmail`, Fase 001) |
| `tokenHash` | text UNIQUE | HMAC do token (`hashToken`, R4/R7); token bruto nunca gravado |
| `status` | `ClassInvitationStatus` | |
| `expiresAt` | timestamptz | `lastSentAt + 7 d` |
| `sendCount` | int | padrão 1; +1 a cada reenvio |
| `lastSentAt` | timestamptz | |
| `invitedById` | uuid FK → `users.id` | professor que convidou |
| `acceptedAt` | timestamptz? | só com `ACCEPTED` |
| `acceptedByUserId` | uuid? FK → `users.id` | |
| `cancelledAt` | timestamptz? | só com `CANCELLED` |
| `cancelledById` | uuid? FK → `users.id` | quem cancelou ou arquivou a turma |
| `cancelReason` | `ClassInvitationCancelReason`? | só com `CANCELLED` |
| `createdAt`, `updatedAt` | timestamptz | |

Índices: `UNIQUE (class_id, email) WHERE status = 'PENDING'` (SQL);
`(class_id, status, created_at DESC, id DESC)`; `(email)`.
`CHECK`: `(status = 'ACCEPTED') = (accepted_at IS NOT NULL)`;
`(status = 'CANCELLED') = (cancelled_at IS NOT NULL AND cancel_reason IS NOT NULL)`.

Situação efetiva (leituras): `PENDING` com `expires_at <= now()` aparece como `EXPIRED`;
usar o token grava `EXPIRED` (preguiçoso, como R15).

Transições (`ClassInvitationStateMachine`): `PENDING → ACCEPTED` (aceite),
`PENDING → CANCELLED` (professor; arquivamento; reenvio para e-mail já matriculado),
`PENDING → EXPIRED` (prazo). Reenviar exige `PENDING` efetivo.

## ClassInvitationDelivery (`class_invitation_deliveries`)

Uma linha por envio pedido (criação ou reenvio). Observabilidade e novas tentativas
(D5). Nunca guarda token, link nem corpo do e-mail.

| Campo | Tipo | Regras |
|-------|------|--------|
| `id` | uuid PK | |
| `invitationId` | uuid FK → `class_invitations.id` (Restrict) | |
| `status` | `DeliveryStatus` | `PENDING` → `SENT` \| `FAILED` \| `SUPERSEDED` |
| `attempts` | int | padrão 0 |
| `nextAttemptAt` | timestamptz? | nulo fora de `PENDING` |
| `lastErrorCode` | text? | nome do erro (ex.: `ECONNREFUSED`), sem mensagem nem dados |
| `sentAt` | timestamptz? | só com `SENT` |
| `createdAt`, `updatedAt` | timestamptz | |

Índices: `(status, next_attempt_at)` para o worker; `(invitation_id, created_at DESC)`.
Esperas entre tentativas: 1 min, 5 min, 15 min, 1 h, 3 h, 6 h; na 7ª falha → `FAILED`.
Criar um reenvio marca entregas `PENDING` anteriores do mesmo convite como
`SUPERSEDED`. Se o convite deixar de estar `PENDING`, a entrega pendente vira
`SUPERSEDED` sem enviar.

## Enrollment (`enrollments`)

| Campo | Tipo | Regras |
|-------|------|--------|
| `id` | uuid PK | |
| `classId` | uuid FK → `classes.id` (Restrict) | |
| `studentUserId` | uuid FK → `student_profiles.user_id` (Restrict) | |
| `status` | `EnrollmentStatus` | |
| `enrolledAt` | timestamptz | |
| `invitationId` | uuid? FK → `class_invitations.id` | convite de origem |
| `removedAt` | timestamptz? | só com `REMOVED` |
| `removedById` | uuid? FK → `users.id` | professor que removeu |
| `createdAt`, `updatedAt` | timestamptz | |

Índices: `UNIQUE (class_id, student_user_id) WHERE status = 'ACTIVE'` (SQL);
`(class_id, status)`; `(student_user_id, status)`.
`CHECK`: `(status = 'REMOVED') = (removed_at IS NOT NULL)`.

Transições (`EnrollmentStateMachine`): `ACTIVE → REMOVED`. Remover de novo não tem
efeito. Nova matrícula ativa é uma linha nova (histórico preservado).

## Permissões (migração de dados)

Novas permissões e associações — fonte de verdade em
[contracts/permissions.md](./contracts/permissions.md). `TEACHER`: `turmas.criar`,
`turmas.visualizar`, `turmas.editar`, `turmas.alterar_situacao`,
`turmas.convidar_aluno`, `turmas.reenviar_convite`, `turmas.cancelar_convite`,
`turmas.visualizar_alunos`, `turmas.remover_aluno`. `STUDENT`:
`turmas.proprias.listar`. Nenhuma para `MANAGER` ou `ADMIN`.

## Relações

```text
User 1───0..1 StudentProfile 1───* Enrollment *───1 SchoolClass *───1 User (teacher)
                                                     │
                                                     1
                                                     │
                                                     * ClassInvitation 1───* ClassInvitationDelivery
```

Uma pessoa com vários papéis continua sendo um `User`; `teacher_id` e
`student_user_id` apontam para a mesma tabela quando o professor se convida como aluno.

## Retenção

Nada é removido por esta feature. O job `unverified-accounts` (Fase 001) continua
valendo para contas antigas não verificadas; contas criadas por convite de turma já
nascem verificadas. Por segurança, o job passa a ignorar também qualquer conta com
matrícula (nunca remove quem tem histórico acadêmico).
