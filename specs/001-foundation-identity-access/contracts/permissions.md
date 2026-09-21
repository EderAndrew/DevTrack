# Permissions Contract: 001 — Foundation, Identity & Access

Papéis e permissões são **dados** (tabelas `roles`, `permissions`,
`role_permissions`), inseridos por migration idempotente. Este documento é a fonte de
verdade desse seed e da matriz de testes de autorização (US7, SC-003).

Nomes em português, `recurso.acao` / `recurso.escopo.acao` (Constituição II).

## Permissões

| Chave | Descrição |
|-------|-----------|
| `sessoes.proprias.listar` | Listar e consultar as próprias sessões ativas |
| `sessoes.proprias.revogar` | Revogar uma sessão própria específica |
| `professores.visualizar` | Ver cadastro docente (nome, e-mail, status do papel TEACHER, convites) |
| `professores.convidar` | Criar convite de professor |
| `professores.reenviar_convite` | Reenviar convite de professor pendente |
| `professores.revogar_convite` | Revogar convite de professor pendente |
| `professores.suspender` | Suspender o papel TEACHER |
| `professores.desativar` | Desativar o papel TEACHER |
| `professores.ativar` | Reativar o papel TEACHER |
| `managers.visualizar` | Ver MANAGERs e convites de MANAGER |
| `managers.convidar` | Criar convite de MANAGER |
| `managers.reenviar_convite` | Reenviar convite de MANAGER pendente |
| `managers.revogar_convite` | Revogar convite de MANAGER pendente |
| `managers.desativar` | Desativar o papel MANAGER |
| `managers.ativar` | Reativar o papel MANAGER |
| `usuarios.visualizar` | Consulta de contas em nível de identidade (FR-056) |
| `usuarios.suspender` | Suspender conta (`User`) |
| `usuarios.reativar` | Reativar conta (`User`) |

Operações **sem permissão** (apenas `session`): `GET /me`, `POST /auth/logout`,
`POST /auth/logout-all` — qualquer pessoa autenticada precisa sempre poder ver quem
é e encerrar suas sessões, mesmo sem papel ativo ou com e-mail não verificado
(FR-016). Isso substitui a permissão ilustrativa `conta.propria.visualizar` da spec.

## Papéis → permissões

| Permissão | ADMIN | MANAGER | TEACHER | STUDENT |
|-----------|:-----:|:-------:|:-------:|:-------:|
| `sessoes.proprias.listar` | ✅ | ✅ | ✅ | ✅ |
| `sessoes.proprias.revogar` | ✅ | ✅ | ✅ | ✅ |
| `professores.*` (7) | ✅ (FR-005) | ✅ | — | — |
| `managers.*` (6) | ✅ | — | — | — |
| `usuarios.visualizar` | ✅ | — | — | — |
| `usuarios.suspender` | ✅ | — | — | — |
| `usuarios.reativar` | ✅ | — | — | — |

`TEACHER` e `STUDENT` recebem permissões pedagógicas nas specs seguintes. Nenhum papel
recebe permissão sobre dados de alunos nesta feature.

Permissões efetivas = união das permissões dos `UserRole` com `status = ACTIVE`
(FR-004), recalculadas a cada requisição (FR-063).

## Matriz de autorização esperada (base dos testes)

`401` sem sessão; `403` sem permissão; ✅ = permitido (sujeito a 404/409 de contexto e
regra).

| Operação | anônimo | STUDENT | TEACHER | MANAGER | ADMIN |
|----------|:-------:|:-------:|:-------:|:-------:|:-----:|
| `GET /me`, logout, logout-all | 401 | ✅ | ✅ | ✅ | ✅ |
| `GET/DELETE /me/sessions…` | 401 | ✅ | ✅ | ✅ | ✅ |
| `GET /teachers`, `/teacher-invitations` | 401 | 403 | 403 | ✅ | ✅ |
| `POST /teacher-invitations` (+ resend/revoke) | 401 | 403 | 403 | ✅ | ✅ |
| `POST /teachers/:id/{suspend,deactivate,reactivate}` | 401 | 403 | 403 | ✅ | ✅ |
| `GET /managers`, `/manager-invitations` | 401 | 403 | 403 | 403 | ✅ |
| `POST /manager-invitations` (+ resend/revoke) | 401 | 403 | 403 | 403 | ✅ |
| `POST /managers/:id/{deactivate,reactivate}` | 401 | 403 | 403 | 403 | ✅ |
| `GET /users`, `GET /users/:id` | 401 | 403 | 403 | **403** | ✅ |
| `POST /users/:id/{suspend,reactivate}` | 401 | 403 | 403 | 403 | ✅ |

Casos adicionais obrigatórios nos testes:
- Usuário `STUDENT + TEACHER` → união (STUDENT e TEACHER, ainda sem `professores.*`).
- `MANAGER` com papel `INACTIVE` → 403 nas rotas de professores na requisição
  seguinte (FR-063), sem novo login (as sessões foram revogadas; com nova sessão
  continua 403).
- E-mail não verificado → `403 EMAIL_NOT_VERIFIED` em toda rota `verified`/`perm:*`.
- `MANAGER` em `GET /teachers/:userId` de um aluno → **404** (contexto), nunca dados.
- `STUDENT` em `DELETE /me/sessions/:id` de outro usuário → **404** (US2-8).
