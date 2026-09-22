# Audit Events Contract: 003 — Turmas, Convites e Matrículas

Acrescenta tipos ao catálogo da Fase 001
(`specs/001-foundation-identity-access/contracts/audit-events.md`), com as mesmas regras:
gravados na mesma transação da operação, tabela append-only, `metadata` só com as
chaves listadas (allowlist em `audit-event-types.ts`), nunca senha, token, hash,
segredo ou cookie. `audit-coverage.spec.ts` lê os dois catálogos (D13).

| `type` | Ator | Alvo | `metadata` permitido | Origem |
|--------|------|------|----------------------|--------|
| `class.created` | USER | CLASS | `code`, `academicYear` | FR-061 |
| `class.updated` | USER | CLASS | `fields` (nomes dos campos alterados, sem valores) | FR-061 |
| `class.status_changed` | USER | CLASS | `from`, `to`, `cancelledInvitations` | FR-004, FR-005 |
| `class_invitation.created` | USER | CLASS_INVITATION | `classId`, `email` | FR-010 |
| `class_invitation.resent` | USER | CLASS_INVITATION | `classId`, `sendCount` | FR-020 |
| `class_invitation.cancelled` | USER | CLASS_INVITATION | `classId`, `reason` (`TEACHER`\|`CLASS_ARCHIVED`\|`ALREADY_ENROLLED`) | FR-022 |
| `class_invitation.accepted` | USER \| ANONYMOUS | CLASS_INVITATION | `classId`, `userId`, `mode`, `alreadyEnrolled` | FR-031, FR-034 |
| `class_invitation.acceptance_refused` | USER \| ANONYMOUS | CLASS_INVITATION | `reason` (`WRONG_ACCOUNT`\|`SIGN_IN_REQUIRED`\|`CLASS_NOT_OPEN`\|`TEACHER_INACTIVE`\|`ACCOUNT_SUSPENDED`) | FR-036 |
| `student.registered` | USER \| ANONYMOUS | STUDENT_PROFILE | `userId`, `via` (`CLASS_INVITATION`) | FR-031, FR-034 |
| `enrollment.created` | USER \| ANONYMOUS | ENROLLMENT | `classId`, `userId`, `invitationId` | FR-031, FR-034 |
| `enrollment.removed` | USER | ENROLLMENT | `classId`, `userId` | FR-044 |

Tipos da Fase 001 reutilizados pelo aceite: `role.granted` (papel `STUDENT`,
`via = CLASS_INVITATION`) e `account.claimed` (`via = CLASS_INVITATION`), com as chaves
já definidas; o valor `CLASS_INVITATION` entra na lista de `via`.

`student.registered` é gravado quando o aceite cria o perfil de aluno ou preenche o RA
pela primeira vez.

## Tipos aposentados

| `type` | Motivo |
|--------|--------|
| `auth.signup` | autocadastro público removido (FR-048); eventos antigos continuam na tabela, nenhum novo é gravado |

## Não auditado (só log estruturado, FR-062)

Falha e esgotamento de entrega de e-mail (`class_invitation.delivery_failed`,
`class_invitation.delivery_exhausted`: `invitationId`, `deliveryId`, `attempt`,
`errorName`), uso de token inválido ou expirado (`class_invitation.token_rejected`:
`reason`, sem token nem hash) e recusas de autorização (já registradas pela Fase 001).
