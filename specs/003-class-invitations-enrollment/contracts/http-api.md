# HTTP API Contract: 003 — Turmas, Convites e Matrículas

Mesmas convenções da Fase 001 (`specs/001-foundation-identity-access/contracts/http-api.md`):
base `/api`, JSON, `Origin` permitido e `Content-Type: application/json` em métodos não
seguros, schemas **estritos** (campo desconhecido → `400 VALIDATION_ERROR`), ordem de
checagem origem → sessão (401) → e-mail verificado (403) → permissão (403) → validação
(400) → contexto do recurso (404) → regra de negócio (409/422), erro
`{statusCode, code, message}`.

Todo pedido e resposta abaixo é um schema de `@repo/contracts` (XXVI) e entra no
catálogo `endpoints.ts`; a guarda `endpoint-catalog.spec.ts` e o interceptor de
conformidade (002) valem para todas as rotas.

## Tipos compartilhados (novos em `packages/contracts/src/classes/`)

| Schema | Forma |
|--------|-------|
| `ClassStatusSchema` | `"ACTIVE" \| "INACTIVE" \| "ARCHIVED"` |
| `ClassCodeSchema` | string `trim`, 1–30, `/^[A-Za-z0-9._-]+$/` |
| `AcademicYearSchema` | int 1900–2100 |
| `CreateClassRequestSchema` | `{name: NameSchema(120), code, academicYear, period?: string(60)\|null, description?: string(1000)\|null}` |
| `UpdateClassRequestSchema` | os mesmos campos, todos opcionais, pelo menos um presente |
| `ChangeClassStatusRequestSchema` | `{status: "ACTIVE" \| "INACTIVE" \| "ARCHIVED"}` |
| `ClassViewSchema` | `{id, name, code, academicYear, period: string\|null, description: string\|null, status, activeStudentCount: int, createdAt, updatedAt}` |
| `ClassListQuerySchema` | `{query?: string(120), year?: AcademicYear, status?: ClassStatus, cursor?: string(200)}` |
| `ClassPageSchema` | `{items: ClassView[], nextCursor: string\|null}` |
| `ClassInvitationStatusSchema` | `"PENDING" \| "ACCEPTED" \| "EXPIRED" \| "CANCELLED"` |
| `DeliveryStateSchema` | `"SENDING" \| "SENT" \| "FAILED"` (situação da última entrega) |
| `InviteStudentRequestSchema` | `{email: EmailSchema}` |
| `ClassInvitationViewSchema` | `{id, email, status, expiresAt, sendCount, lastSentAt, delivery: DeliveryState, createdAt}` — nunca token nem hash |
| `ClassInvitationListQuerySchema` | `{query?: string(254), status?: ClassInvitationStatus, cursor?}` |
| `ClassInvitationPageSchema` | `{items: ClassInvitationView[], nextCursor}` |
| `StudentRaSchema` | string `trim`, 1–20, `/^[A-Za-z0-9./-]+$/` |
| `EnrollmentStatusSchema` | `"ACTIVE" \| "REMOVED"` |
| `EnrollmentViewSchema` | `{id, student: {userId, name, email, ra: string\|null}, status, enrolledAt, removedAt: string\|null}` |
| `EnrollmentListQuerySchema` | `{query?: string(120), status?: EnrollmentStatus, cursor?}` |
| `EnrollmentPageSchema` | `{items: EnrollmentView[], nextCursor}` |
| `ClassInvitationPreviewSchema` | `{class: {name, code, academicYear, period}, teacherName, email, mode: AcceptanceMode, raRequired: boolean}` |
| `AcceptClassInvitationRequestSchema` | `{token, name?: NameSchema, ra?: StudentRaSchema, password?: PasswordInput}` |
| `ClassInvitationAcceptedSchema` | `{classId, mode: AcceptanceMode, alreadyEnrolled: boolean}` |
| `MyClassViewSchema` | `{id, name, code, academicYear, period, teacherName, enrolledAt}` |
| `MyClassListSchema` | `{items: MyClassView[]}` |

Novos códigos de erro em `ErrorCodeSchema` (com textos no catálogo do web, 002 S8):
`CLASS_CODE_TAKEN`, `CLASS_NOT_OPEN`, `ALREADY_ENROLLED`, `RA_TAKEN`, `RA_REQUIRED`,
`TOKEN_EXPIRED`. `INVITATION_ALREADY_PENDING`, `TOKEN_INVALID`, `SIGN_IN_REQUIRED`,
`WRONG_ACCOUNT`, `PASSWORD_REQUIRED`, `WEAK_PASSWORD`, `INVALID_STATE_TRANSITION` e
`RATE_LIMITED` são reutilizados.

## Turmas (professor)

Contexto: toda rota com `:id` só enxerga turmas com `teacher_id` = usuário da sessão;
fora disso → `404 NOT_FOUND` (D7).

| Método | Rota | Acesso | Entrada | Sucesso | Erros |
|--------|------|--------|---------|---------|-------|
| GET | `/classes` | perm:`turmas.visualizar` | query `ClassListQuery` | `200 ClassPage` (padrão: `ACTIVE`+`INACTIVE`, mais recentes primeiro, 20 por página) | 400 |
| POST | `/classes` | perm:`turmas.criar` | `CreateClassRequest` | `201 ClassView` | 400, 409 `CLASS_CODE_TAKEN` |
| GET | `/classes/:id` | perm:`turmas.visualizar` | — | `200 ClassView` | 404 |
| PATCH | `/classes/:id` | perm:`turmas.editar` | `UpdateClassRequest` | `200 ClassView` | 400, 404, 409 `CLASS_CODE_TAKEN`, 409 `INVALID_STATE_TRANSITION` (arquivada) |
| POST | `/classes/:id/status` | perm:`turmas.alterar_situacao` | `ChangeClassStatusRequest` | `200 ClassView` (mesma situação → 200 sem efeito) | 404, 409 `INVALID_STATE_TRANSITION` |

## Convites da turma (professor)

| Método | Rota | Acesso | Entrada | Sucesso | Erros |
|--------|------|--------|---------|---------|-------|
| GET | `/classes/:id/invitations` | perm:`turmas.visualizar` | query `ClassInvitationListQuery` | `200 ClassInvitationPage` (padrão `PENDING`) | 404 |
| POST | `/classes/:id/invitations` | perm:`turmas.convidar_aluno` | `InviteStudentRequest` | `201 ClassInvitationView` | 400, 404, 409 `CLASS_NOT_OPEN`, 409 `ALREADY_ENROLLED`, 409 `INVITATION_ALREADY_PENDING`, 429 `RATE_LIMITED` |
| POST | `/classes/:id/invitations/:invitationId/resend` | perm:`turmas.reenviar_convite` | `{}` | `200 ClassInvitationView` | 404, 409 `CLASS_NOT_OPEN`, 409 `ALREADY_ENROLLED` (convite cancelado na mesma operação), 409 `INVALID_STATE_TRANSITION`, 429 `RATE_LIMITED` |
| POST | `/classes/:id/invitations/:invitationId/cancel` | perm:`turmas.cancelar_convite` | `{}` | `200 ClassInvitationView` | 404, 409 `INVALID_STATE_TRANSITION` |

`ClassInvitationView.delivery`: `SENDING` enquanto a última entrega está `PENDING`,
`SENT` depois de enviada, `FAILED` depois de esgotar as tentativas (D5).

## Alunos da turma (professor)

| Método | Rota | Acesso | Entrada | Sucesso | Erros |
|--------|------|--------|---------|---------|-------|
| GET | `/classes/:id/enrollments` | perm:`turmas.visualizar_alunos` | query `EnrollmentListQuery` | `200 EnrollmentPage` (padrão `ACTIVE`, por nome) | 404 |
| POST | `/classes/:id/enrollments/:enrollmentId/remove` | perm:`turmas.remover_aluno` | `{}` | `200 EnrollmentView` (já removida → 200 sem efeito) | 404, 409 `INVALID_STATE_TRANSITION` (turma arquivada) |

## Aceite do convite (público)

Tokens no corpo, nunca na URL da API. Rate limit por origem e por hash do token
(`PublicRateLimit`, fluxos `class_invitation_preview` e `class_invitation_accept`).

| Método | Rota | Acesso | Entrada | Sucesso | Erros |
|--------|------|--------|---------|---------|-------|
| POST | `/class-invitations/preview` | public (sessão opcional) | `TokenRequest` | `200 ClassInvitationPreview` | 400 `TOKEN_EXPIRED`, 400 `TOKEN_INVALID`, 429 |
| POST | `/class-invitations/accept` | public (sessão opcional) | `AcceptClassInvitationRequest` | `200 ClassInvitationAccepted` + `Set-Cookie` de sessão nos modos `CREATE_ACCOUNT` e `CLAIM_ACCOUNT` | 400 `VALIDATION_ERROR`, 400 `WEAK_PASSWORD`, 400 `PASSWORD_REQUIRED`, 400 `RA_REQUIRED`, 400 `TOKEN_EXPIRED`, 400 `TOKEN_INVALID`, 401 `SIGN_IN_REQUIRED`, 403 `WRONG_ACCOUNT`, 409 `RA_TAKEN`, 429 |

Regras do aceite:

- `CREATE_ACCOUNT`: exige `name`, `ra`, `password`; e-mail, papel e turma vêm do
  convite. Cria `User` (e-mail verificado), `STUDENT`, `StudentProfile` com RA,
  matrícula e aceite numa transação; inicia sessão depois do commit.
- `CLAIM_ACCOUNT` (conta existente nunca verificada): exige `name` e `password`, e `ra`
  se o perfil não tiver; nova senha, sessões anteriores revogadas, e-mail verificado.
- `SIGN_IN_REQUIRED`: exige sessão da conta do e-mail convidado; `password` e `name`
  enviados são ignorados; `ra` obrigatório só se o perfil não tiver.
- Turma não `ACTIVE`, professor responsável sem `TEACHER` ativo ou conta suspensa →
  `400 TOKEN_INVALID` (mesma resposta de convite não mais válido).
- Aceite repetido pela conta que já aceitou → `200` com `alreadyEnrolled: true`, sem
  efeito. Pessoa já matriculada por outro convite da mesma turma → convite `ACCEPTED`,
  sem matrícula nova, `alreadyEnrolled: true`.
- Nenhuma resposta contém senha, hash ou token.

## Minhas turmas (aluno)

| Método | Rota | Acesso | Sucesso |
|--------|------|--------|---------|
| GET | `/me/classes` | perm:`turmas.proprias.listar` | `200 MyClassList` (só matrículas `ACTIVE`, mais recentes primeiro) |

## Rota removida (FR-048)

| Método | Rota | Antes | Agora |
|--------|------|-------|-------|
| POST | `/auth/signup` | autocadastro de aluno (001 FR-010) | não registrada → `404 NOT_FOUND`; sem conta criada |
