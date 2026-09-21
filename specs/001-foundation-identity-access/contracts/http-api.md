# HTTP API Contract: 001 — Foundation, Identity & Access

Base: `/api` (o navegador acessa pela mesma origem do `apps/web`, via rewrite — R6).
Corpo sempre JSON (`Content-Type: application/json` obrigatório em métodos não
seguros). Métodos não seguros exigem `Origin` na lista permitida (senão
`403 ORIGIN_NOT_ALLOWED`). Todos os schemas de entrada são **estritos**: campo
desconhecido → `400 VALIDATION_ERROR`.

## Convenções

**Autenticação**: cookie `__Host-devtrack_session` (`HttpOnly; Secure; SameSite=Lax;
Path=/`). Nenhum endpoint devolve o segredo da sessão no corpo.

**Níveis de acesso** (coluna *Acesso*):
- `public` — sem sessão (`@Public()`).
- `session` — sessão válida e conta `ACTIVE`; e-mail **pode** estar não verificado
  (`@AllowUnverified()`, FR-016).
- `verified` — sessão válida, conta `ACTIVE`, e-mail verificado.
- `perm:<chave>` — `verified` + permissão explícita (ver [permissions.md](./permissions.md)).

**Ordem de checagem** (FR-060/FR-061): origem/CSRF → sessão (401) → conta suspensa
(401, sessão já revogada) → e-mail verificado (`403 EMAIL_NOT_VERIFIED`) → permissão
(`403 FORBIDDEN`) → validação do corpo (400) → contexto do recurso (404) → regra de
negócio (409/422).

**Formato de erro** (constituição):

```json
{ "statusCode": 403, "code": "FORBIDDEN", "message": "Você não possui permissão para esta operação." }
```

Sem `stack`, SQL, nomes de tabela ou detalhes de infraestrutura. Erros não mapeados →
`500 INTERNAL_ERROR` com mensagem genérica e o `requestId` no cabeçalho `X-Request-Id`.

**Respostas genéricas** (anti-enumeração, SC-006): endpoints marcados com ⚖ devolvem
exatamente o mesmo status e corpo independentemente de o e-mail ter conta.

---

## Health

| Método | Rota | Acesso | Sucesso |
|--------|------|--------|---------|
| GET | `/health/live` | public | `200 {"status":"ok"}` |
| GET | `/health/ready` | public | `200 {"status":"ok"}` / `503 {"status":"unavailable"}` |

## Autenticação e conta

| Método | Rota | Acesso | Corpo | Sucesso | Erros |
|--------|------|--------|-------|---------|-------|
| POST | `/auth/signup` ⚖ | public | `{name, email, password}` | `202 {message}` | 400 `VALIDATION_ERROR`, 400 `WEAK_PASSWORD`, 429 `RATE_LIMITED` |
| POST | `/auth/verify-email` | public | `{token}` | `200 {emailVerified:true}` (idempotente) | 400 `TOKEN_INVALID` |
| POST | `/auth/verify-email/resend` ⚖ | public | `{email}` | `202 {message}` | 429 `RATE_LIMITED` |
| POST | `/auth/login` | public | `{email, password}` | `200 {user: MeView}` + `Set-Cookie` | 401 `INVALID_CREDENTIALS` (mesma resposta para e-mail inexistente e senha errada), 403 `ACCOUNT_SUSPENDED` (só após senha correta), 429 `RATE_LIMITED` |
| POST | `/auth/logout` | session | — | `204` (idempotente) + cookie expirado | 401 |
| POST | `/auth/logout-all` | session | — | `204` + cookie expirado | 401 |
| POST | `/auth/password-reset/request` ⚖ | public | `{email}` | `202 {message}` | 429 `RATE_LIMITED` |
| POST | `/auth/password-reset/confirm` | public | `{token, password}` | `200 {message}` | 400 `TOKEN_INVALID`, 400 `WEAK_PASSWORD`, 429 |
| GET | `/me` | session | — | `200 MeView` | 401 |

Notas:
- `signup` cria somente `User` + `UserRole STUDENT (ACTIVE)` + `StudentProfile` e
  envia verificação. E-mail existente: nada é criado; o titular recebe e-mail
  informativo (FR-012).
- `login` renova o cookie a cada autenticação (nova sessão; nunca reaproveita
  segredo enviado pelo cliente — sem *session fixation*).
- `password-reset/confirm` revoga todas as sessões (`PASSWORD_RESET`), marca e-mail
  verificado, não reativa conta suspensa nem altera papéis (FR-029c/d). Não cria
  sessão: o usuário faz login em seguida.
- `logout-all` revoga todas as sessões do usuário, inclusive a atual (US2-6).

`MeView`:

```json
{
  "id": "uuid",
  "name": "string",
  "email": "string",
  "emailVerified": true,
  "roles": [{ "key": "STUDENT", "status": "ACTIVE" }],
  "permissions": ["sessoes.proprias.listar", "sessoes.proprias.revogar"]
}
```

`permissions` serve apenas para UX no frontend.

## Sessões próprias

| Método | Rota | Acesso | Sucesso | Erros |
|--------|------|--------|---------|-------|
| GET | `/me/sessions` | perm:`sessoes.proprias.listar` | `200 {items: SessionView[]}` (somente ativas) | 401, 403 |
| GET | `/me/sessions/:id` | perm:`sessoes.proprias.listar` | `200 SessionView` | 404 `NOT_FOUND` se não for do usuário (US2-8) |
| DELETE | `/me/sessions/:id` | perm:`sessoes.proprias.revogar` | `204` (idempotente para sessão própria já revogada) | 404 `NOT_FOUND` se não for do usuário |

`SessionView`: `{id, createdAt, lastUsedAt, expiresAt, current}` — `id` é o
identificador público; `expiresAt = min(lastUsedAt + 8h, absoluteExpiresAt)`.

## Convites — aceitação (portador do token)

| Método | Rota | Acesso | Corpo | Sucesso | Erros |
|--------|------|--------|-------|---------|-------|
| POST | `/invitations/preview` | public | `{token}` | `200 InvitationPreview` | 400 `TOKEN_INVALID` |
| POST | `/invitations/accept` | public (sessão opcional) | `{token, password?}` | `200 {role, mode}` | 400 `TOKEN_INVALID`, 400 `WEAK_PASSWORD`, 400 `PASSWORD_REQUIRED`, 401 `SIGN_IN_REQUIRED`, 403 `WRONG_ACCOUNT`, 403 `SELF_INVITE_FORBIDDEN`, 429 |

`InvitationPreview`: `{role: "TEACHER"|"MANAGER", email, displayName, mode}` onde
`mode` ∈ `CREATE_ACCOUNT` | `SIGN_IN_REQUIRED` | `CLAIM_ACCOUNT` (R15). Só é
respondido a quem tem token válido.

Comportamento de `accept` por `mode` (FR-044–FR-049):
- `CREATE_ACCOUNT`: `password` obrigatório → cria `User` verificado + papel + perfil;
  não cria sessão.
- `SIGN_IN_REQUIRED`: exige sessão da conta do e-mail convidado; sem sessão → 401
  `SIGN_IN_REQUIRED`; outra conta → 403 `WRONG_ACCOUNT` (nada é atribuído); `password`
  presente é ignorado.
- `CLAIM_ACCOUNT`: `password` obrigatório → nova senha, e-mail verificado, todas as
  sessões revogadas (`ACCOUNT_CLAIMED`), papel + perfil.
- Convite `ACCEPTED`, `REVOKED`, `EXPIRED`, substituído ou adulterado → 400
  `TOKEN_INVALID` (genérico). Exceção idempotente: quem já aceitou, autenticado na
  conta aceitante, recebe `200` sem novos efeitos.
- Aceitante == emissor → 403 `SELF_INVITE_FORBIDDEN` + auditoria.

## Ativação do bootstrap de ADMIN

| Método | Rota | Acesso | Corpo | Sucesso | Erros |
|--------|------|--------|-------|---------|-------|
| POST | `/admin-activation/preview` | public | `{token}` | `200 {email, mode}` (`CREATE_ACCOUNT` \| `CLAIM_ACCOUNT`) | 400 `TOKEN_INVALID` |
| POST | `/admin-activation` | public | `{token, password}` | `200 {role:"ADMIN"}` | 400 `TOKEN_INVALID`, 400 `WEAK_PASSWORD`, 409 `BOOTSTRAP_ALREADY_DONE`, 429 |

Esta rota **não cria bootstrap**: só conclui um `AdminBootstrap PENDING` emitido pelo
comando operacional ([cli-admin-bootstrap.md](./cli-admin-bootstrap.md)). Se já existir
`ADMIN` ativo no momento da ativação → 409 `BOOTSTRAP_ALREADY_DONE` e o pendente é
cancelado. Usuários verificados nunca passam por aqui (o comando conclui direto).

## Professores (escopo do MANAGER; ADMIN também, FR-005)

Contexto: rotas `/teachers/:userId` só enxergam identidades que possuem `UserRole
TEACHER` (qualquer status). Outro `userId` → 404 `NOT_FOUND` — nunca revela alunos.

| Método | Rota | Acesso | Corpo | Sucesso | Erros |
|--------|------|--------|-------|---------|-------|
| GET | `/teachers?status=` | perm:`professores.visualizar` | — | `200 {items: TeacherView[]}` | 401, 403 |
| GET | `/teachers/:userId` | perm:`professores.visualizar` | — | `200 TeacherView` | 404 |
| POST | `/teachers/:userId/suspend` | perm:`professores.suspender` | — | `200 TeacherView` | 404, 409 `INVALID_STATE_TRANSITION` |
| POST | `/teachers/:userId/deactivate` | perm:`professores.desativar` | — | `200 TeacherView` | 404, 409 |
| POST | `/teachers/:userId/reactivate` | perm:`professores.ativar` | — | `200 TeacherView` | 404, 409 |
| GET | `/teacher-invitations?status=` | perm:`professores.visualizar` | — | `200 {items: InvitationView[]}` | 401, 403 |
| POST | `/teacher-invitations` | perm:`professores.convidar` | `{email, displayName}` | `201 InvitationView` | 403 `SELF_INVITE_FORBIDDEN`, 409 `ALREADY_TEACHER`, 409 `TEACHER_REACTIVATION_REQUIRED`, 409 `INVITATION_ALREADY_PENDING` |
| POST | `/teacher-invitations/:id/resend` | perm:`professores.reenviar_convite` | — | `200 InvitationView` | 404, 409 `INVALID_STATE_TRANSITION` |
| POST | `/teacher-invitations/:id/revoke` | perm:`professores.revogar_convite` | — | `200 InvitationView` | 404, 409 |

`TeacherView` (somente dados docentes, FR-050, US5-10):
`{userId, displayName, email, status: "ACTIVE"|"SUSPENDED"|"INACTIVE", invitations: InvitationView[]}`.
Convites pendentes de quem ainda não é professor aparecem em `/teacher-invitations`
com status derivado `INVITED` na UI (FR-007).

`InvitationView`: `{id, email, displayName, role, status, expiresAt, sendCount,
lastSentAt, invitedBy: {id, name}}` — nunca token nem `tokenHash`.

`POST /teacher-invitations` com e-mail de aluno ou de conta não docente responde
**exatamente** como para e-mail sem conta (`201`, US5-4, FR-043).

`suspend`/`deactivate` revogam as sessões do professor (`ROLE_DEACTIVATED`) e não
alteram outros papéis (US5-6).

## Managers (ADMIN)

| Método | Rota | Acesso | Corpo | Sucesso | Erros |
|--------|------|--------|-------|---------|-------|
| GET | `/managers` | perm:`managers.visualizar` | — | `200 {items: ManagerView[]}` | 401, 403 |
| POST | `/manager-invitations` | perm:`managers.convidar` | `{email, displayName}` | `201 InvitationView` | 403 `SELF_INVITE_FORBIDDEN`, 409 `ALREADY_MANAGER`, 409 `INVITATION_ALREADY_PENDING` |
| GET | `/manager-invitations?status=` | perm:`managers.visualizar` | — | `200 {items}` | |
| POST | `/manager-invitations/:id/resend` | perm:`managers.reenviar_convite` | — | `200` | 404, 409 |
| POST | `/manager-invitations/:id/revoke` | perm:`managers.revogar_convite` | — | `200` | 404, 409 |
| POST | `/managers/:userId/deactivate` | perm:`managers.desativar` | — | `200 ManagerView` | 404, 409 |
| POST | `/managers/:userId/reactivate` | perm:`managers.ativar` | — | `200 ManagerView` | 404, 409 |

`ManagerView`: `{userId, name, email, status}`.

## Contas de usuário (ADMIN — nível de identidade, FR-056)

| Método | Rota | Acesso | Sucesso | Erros |
|--------|------|--------|---------|-------|
| GET | `/users?query=&cursor=` | perm:`usuarios.visualizar` | `200 {items: UserAccountView[], nextCursor}` | 401, **403 para MANAGER/TEACHER/STUDENT** (US5-5) |
| GET | `/users/:id` | perm:`usuarios.visualizar` | `200 UserAccountView` | 404 |
| POST | `/users/:id/suspend` | perm:`usuarios.suspender` | `200 UserAccountView` | 404, 409 `LAST_ADMIN_PROTECTED`, 409 `INVALID_STATE_TRANSITION`, 403 `SELF_ACTION_FORBIDDEN` |
| POST | `/users/:id/reactivate` | perm:`usuarios.reativar` | `200 UserAccountView` | 404, 409 |

`UserAccountView`: `{id, name, email, emailVerified, status, roles: [{key, status}],
createdAt}` — sem qualquer dado acadêmico.

Esta é a rota-alvo do critério 8 ("MANAGER sem acesso a dados de aluno → 403"): na
Spec 001 não existe recurso de aluno além da conta; as rotas acadêmicas de alunos
(`/students`, matrículas) nascem na Spec 002 exigindo permissões que o `MANAGER` nunca
recebe.

## Catálogo de códigos de erro

| Status | `code` | Uso |
|--------|--------|-----|
| 400 | `VALIDATION_ERROR` | schema inválido ou campo desconhecido |
| 400 | `WEAK_PASSWORD` | FR-011 |
| 400 | `PASSWORD_REQUIRED` | aceite `CREATE_ACCOUNT`/`CLAIM_ACCOUNT` sem senha |
| 400 | `TOKEN_INVALID` | token inexistente, expirado, usado, substituído, adulterado |
| 401 | `UNAUTHENTICATED` | sem sessão válida |
| 401 | `INVALID_CREDENTIALS` | login |
| 401 | `SIGN_IN_REQUIRED` | aceite de convite para conta verificada |
| 403 | `FORBIDDEN` | falta de permissão |
| 403 | `EMAIL_NOT_VERIFIED` | FR-016 |
| 403 | `ACCOUNT_SUSPENDED` | login com senha correta em conta suspensa |
| 403 | `WRONG_ACCOUNT` | aceite autenticado em outra conta |
| 403 | `SELF_INVITE_FORBIDDEN` | FR-040a |
| 403 | `SELF_ACTION_FORBIDDEN` | ADMIN suspendendo a própria conta |
| 403 | `ORIGIN_NOT_ALLOWED` | CSRF |
| 404 | `NOT_FOUND` | recurso inexistente ou fora do contexto |
| 409 | `INVALID_STATE_TRANSITION` | FR-016 / XVI |
| 409 | `ALREADY_TEACHER` / `ALREADY_MANAGER` | FR-043 |
| 409 | `TEACHER_REACTIVATION_REQUIRED` | US5-12 |
| 409 | `INVITATION_ALREADY_PENDING` | sugere reenviar |
| 409 | `LAST_ADMIN_PROTECTED` | FR-054 |
| 409 | `BOOTSTRAP_ALREADY_DONE` | ativação com ADMIN já ativo |
| 429 | `RATE_LIMITED` | FR-022 (cabeçalho `Retry-After`) |
| 500 | `INTERNAL_ERROR` | genérico |

Mensagens (`message`) em português, sem dados do alvo.
