# Implementation Plan: 001 — Foundation, Identity & Access

**Branch**: `001-foundation-identity-access` | **Date**: 2026-09-21 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-foundation-identity-access/spec.md`

## Summary

Criar a fundação de identidade e acesso da plataforma: `User` único multi-papel
(`UserRole → Role → RolePermission → Permission`), autocadastro de `STUDENT` com
e-mail verificado, login por e-mail e senha com sessões opacas revogáveis,
recuperação de senha, provisionamento por convite (`ADMIN → MANAGER → TEACHER`) com
aceitação transacional, idempotente e resistente a tomada de conta, bootstrap do
primeiro `ADMIN` por comando operacional, RBAC deny-by-default no backend com a
semântica 401/403/404, auditoria append-only e rate limiting.

Abordagem técnica: nova app `apps/api` (NestJS 11 + Prisma 7 + PostgreSQL 17) com
módulos `identity`, `auth`, `access-control`, `provisioning`, `admin-bootstrap`,
`audit` e `platform` (config, logs, erros, rate limit, e-mail, health); `apps/web`
(Next.js 16) com as telas mínimas, falando com a API pela mesma origem via rewrite.
Integridade garantida no banco (índices únicos, inclusive parciais; advisory locks;
trigger append-only). Sem Redis, filas ou WebSocket.

## Technical Context

**Language/Version**: TypeScript 7 sobre Node.js 24 LTS; `apps/api` compila com SWC e faz type-check com `tsc --noEmit` (R1)
**Primary Dependencies**: NestJS 11 (Express), Prisma 7 + `@prisma/adapter-pg`, `argon2`, `zod`, `nestjs-pino`/`pino`, `nodemailer`, `cookie-parser`; web: Next.js 16, React 19
**Storage**: PostgreSQL 17 (dev, teste e produção); sem cache externo
**Testing**: Vitest (+ `unplugin-swc`), `@nestjs/testing` + `supertest` contra PostgreSQL real; Vitest + Testing Library no web (R17)
**Target Platform**: servidor Linux em contêiner (API), navegador moderno (web)
**Project Type**: web application — monorepo pnpm + Turborepo (`apps/api`, `apps/web`)
**Performance Goals**: 95% dos logins em ≤ 2 s (SC-009); hash Argon2id ≲ 300 ms por verificação
**Constraints**: respostas indistinguíveis para e-mail existente/inexistente (SC-006); revogação de sessão efetiva na requisição seguinte (SC-007); zero segredos em logs/auditoria (SC-005)
**Scale/Scope**: fase inicial — centenas a poucos milhares de usuários, dezenas de professores; 8 user stories, ~30 endpoints, ~12 telas

Nenhum item ficou como NEEDS CLARIFICATION; todas as escolhas estão em
[research.md](./research.md) (R1–R20).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Verificado contra `.specify/memory/constitution.md` v2.0.0 — antes da Fase 0 e
novamente após o design (Fase 1). Resultado: **PASS** nas duas avaliações.

- [x] ✅ **I. Security**: toda entrada validada por schemas Zod estritos na API (R10); OWASP considerado — access control (guard deny-by-default), falhas de autenticação (Argon2id, rate limit, anti-enumeração R16), falhas criptográficas (tokens 256 bits, só hash), CSRF (R6), misconfiguration (config validada no startup), logging (auditoria + redact).
- [x] ✅ **II. RBAC**: cada operação protegida lista sua permissão explícita em [contracts/permissions.md](./contracts/permissions.md) e [contracts/http-api.md](./contracts/http-api.md); nenhuma checagem por nome de papel.
- [x] ✅ **III. Server authority**: estado de sessão, expiração, tokens e transições decididos só no servidor (FR-028); autosave N/A (não há entrada de respostas).
- [x] N/A **IV. Untrusted code**: nenhum código de aluno é executado.
- [x] ✅ **V. Data integrity**: migrations Prisma; `UNIQUE` em e-mail, `(userId, roleId)`, perfis, `tokenHash`; únicos parciais para convite pendente, token vigente e bootstrap pendente; FKs e `NOT NULL` ([data-model.md](./data-model.md)).
- [x] ✅ **VI. Audit & logs**: catálogo de eventos em [contracts/audit-events.md](./contracts/audit-events.md), gravados na mesma transação, tabela append-only; pino estruturado com `requestId` e redact; varredura automatizada (SC-005).
- [x] ✅ **VII. Tests**: testes automatizados para cada regra crítica — autorização (matriz), replay, concorrência, idempotência, transições inválidas, anti-enumeração, rate limit, bootstrap, varredura de segredos; rastreabilidade dos 28 critérios.
- [x] ✅ **VIII. Layering**: controllers finos → services (casos de uso) → repositórios Prisma; nada de Prisma em controllers nem regra em componentes React.
- [x] ✅ **IX. Simplicity**: sem Redis/BullMQ/WebSocket; rate limit e health check próprios sobre o PostgreSQL existente; sem pacote compartilhado web↔API; `apps/docs` removido (R20). Cada dependência nova tem justificativa em research.md.
- [x] N/A **X. Evidence**: não há eventos pedagógicos nesta feature.
- [x] N/A **XI. Human oversight**: sem decisões pedagógicas.
- [x] ✅ **XII. Determinism first**: nenhuma IA; tudo determinístico.
- [x] N/A **XIII. Risk level**: sem operações automatizadas ou de IA.
- [x] N/A **XIV–XV. AI governance**: sem IA.
- [x] ✅ **XVI. Explicit states**: `AccountStatus`, `RoleAssignmentStatus`, `InvitationStatus`, `BootstrapStatus`, estado de e-mail e de sessão com transições explícitas e rejeição de inválidas (`409 INVALID_STATE_TRANSITION`).
- [x] ✅ **XVII. Idempotency**: verificação, aceite de convite, ativação/bootstrap, redefinição, logout, revogação de sessão e logout-all seguros sob repetição e concorrência (row locks, advisory locks, updates condicionais, únicos).
- [x] N/A **XVIII. Safe interruption**: não há operações longas; o bootstrap é transacional (interrupção = rollback).
- [x] N/A **XIX. AI evals**: sem IA.
- [x] N/A **XX. Pedagogy**: sem monitoramento.
- [x] ✅ **XXI. Configurable domain**: nenhuma disciplina/tecnologia modelada; papéis e permissões são dados; enums só para estados de plataforma.
- [x] ✅ **XXII. Personalization & accessibility**: nenhuma necessidade individual tratada; dados pessoais mínimos (nome, e-mail); MANAGER não vê alunos.
- [x] N/A **XXIII. Curricular traceability**: sem conteúdo curricular.
- [x] ✅ **XXIV. Academic isolation**: turmas ainda não existem; o mecanismo de contexto (consultas escopadas → 404) nasce aqui com sessões próprias e `/teachers/:userId`, e a interface `ResourceContextPolicy` fica documentada para a Spec 002.
- [x] ✅ **XXV. Privileged provisioning**: cadastro público cria só `STUDENT` e rejeita campos de papel; `TEACHER` por convite de `MANAGER`/`ADMIN` (uso único, vinculado ao e-mail, 7 dias, hash); `MANAGER` recebe 403 fora de `professores.*`; `UserRole` sem `users.role`; aceite transacional, idempotente e sem reset de credencial de conta verificada; primeiro `ADMIN` só por `pnpm admin:bootstrap` (sem rota, senha padrão ou seed); mudanças de privilégio auditadas; autoconvite bloqueado; desativação preserva histórico; último `ADMIN` protegido.

Nenhum ❌ — *Complexity Tracking* vazio.

## Project Structure

### Documentation (this feature)

```text
specs/001-foundation-identity-access/
├── plan.md                        # este arquivo
├── research.md                    # Fase 0 — decisões R1–R20
├── data-model.md                  # Fase 1 — entidades, índices, estados
├── quickstart.md                  # Fase 1 — roteiro de validação
├── contracts/
│   ├── http-api.md                # endpoints, acesso, erros
│   ├── permissions.md             # seed de papéis/permissões + matriz de autorização
│   ├── audit-events.md            # catálogo de eventos de auditoria
│   └── cli-admin-bootstrap.md     # contrato do comando operacional
├── checklists/requirements.md
└── tasks.md                       # Fase 2 — gerado por /speckit-tasks
```

### Source Code (repository root)

```text
docker-compose.yml                 # postgres, postgres-test, mailpit
package.json                       # + script admin:bootstrap (delegado ao api)

apps/api/
├── Dockerfile
├── .env.example
├── nest-cli.json                  # builder: swc
├── prisma.config.ts
├── prisma/
│   ├── schema.prisma
│   └── migrations/                # inclui SQL de índices parciais, trigger e seed de papéis
├── assets/common-passwords.txt    # top 10k (SecLists, MIT)
├── src/
│   ├── main.ts                    # bootstrap HTTP (config validada antes)
│   ├── app.module.ts
│   ├── cli/admin-bootstrap.ts     # comando operacional (application context, sem HTTP)
│   ├── platform/                  # infraestrutura transversal
│   │   ├── config/                # schema Zod do env, fail fast
│   │   ├── database/              # PrismaService, helpers de transação e advisory lock
│   │   ├── http/                  # filtro de erros, ZodValidationPipe, origin guard, requestId
│   │   ├── logging/               # nestjs-pino + redact
│   │   ├── mail/                  # porta Mailer, SmtpMailer, InMemoryMailer, templates
│   │   ├── rate-limit/            # RateLimitService (PostgreSQL)
│   │   ├── crypto/                # geração/hash de tokens, HMAC
│   │   └── health/
│   └── modules/
│       ├── identity/              # User, perfis, PasswordPolicy/Hasher, normalização de e-mail
│       ├── auth/                  # signup, verificação, login, sessões, recuperação de senha
│       ├── access-control/        # Role/Permission, UserRole + máquina de estados, guards e decorators
│       ├── provisioning/          # convites TEACHER/MANAGER, RoleGrantAcceptance, teachers/managers
│       ├── admin-bootstrap/       # AdminBootstrapService + ativação
│       ├── accounts/              # consulta/suspensão de contas (ADMIN)
│       └── audit/                 # AuditService + allowlist de metadata
└── test/
    ├── helpers/                   # app de teste, fábrica de usuários/sessões, captura de logs
    ├── integration/               # por user story (us1-signup.spec.ts … us8-password-reset.spec.ts)
    ├── security/                  # matriz de autorização, replay, concorrência, varredura de segredos
    └── traceability.spec.ts       # mapeia os 28 critérios → testes

apps/web/
├── .env.example
├── next.config.js                 # rewrite /api/* → API
├── proxy.ts                       # redireciona para /entrar por UX (não autoriza nada)
├── lib/                           # api-client (fetch + erros), sessão server-side via /api/me
└── app/
    ├── (public)/cadastro, verificar-email, entrar, esqueci-senha, redefinir-senha,
    │            convite, ativar-admin
    ├── conta/sessoes
    ├── professores/               # MANAGER/ADMIN
    └── admin/managers, admin/usuarios

apps/docs/                         # REMOVIDO (R20)
```

**Structure Decision**: aplicação web no monorepo existente. `apps/api` é criado do
zero seguindo a estrutura acima (módulos por capacidade, `platform/` para
infraestrutura transversal, `test/` separado por tipo); `apps/web` reaproveita o
scaffold do create-turbo, substituindo a página inicial. Nenhum pacote novo em
`packages/*` — não há reuso real entre web e API nesta fase (IX). `apps/docs` e o
README do template são removidos/substituídos.

## Design Notes

**Fluxo de requisição protegida**
`OriginGuard → SessionGuard (401) → VerifiedGuard (403 EMAIL_NOT_VERIFIED, salvo
@AllowUnverified) → PermissionsGuard (403) → ZodValidationPipe (400) → controller →
service (consultas escopadas → 404; regras → 409/422) → AuditService (mesma
transação)`. Os guards são globais; rotas públicas precisam de `@Public()` explícito,
e um teste percorre todas as rotas registradas conferindo que cada uma tem
`@Public()` ou `@RequirePermissions()`/`@AllowUnverified()` declarado.

**Concorrência e idempotência** (FR-001, FR-032, FR-044)
- Cadastro: `INSERT` com `UNIQUE(email)`; conflito → caminho "e-mail existente"
  (mesma resposta).
- Aceite de convite / ativação: `SELECT … FOR UPDATE` na linha do convite/bootstrap;
  únicos de `UserRole` e perfis como última barreira.
- Bootstrap e guarda do último `ADMIN`: `pg_advisory_xact_lock` com chaves fixas.
- Tokens: consumo por `UPDATE` condicional com `RETURNING`.

**Revogação de sessões** (FR-026): função única `SessionService.revokeAllForUser(userId,
reason, tx)` chamada por redefinição de senha, tomada de conta, suspensão de conta e
saída de `ACTIVE` de papel privilegiado — sempre dentro da transação do evento.

**Anti-enumeração** (SC-006): respostas fixas em `202`; hash dummy no login; hash
Argon2 também no caminho de e-mail existente do cadastro; e-mails enviados após o
commit e fora do caminho da resposta.

**Riscos**
- TS 7 × decorators do Nest (R1) — fallback documentado.
- Precisão do "mesmo tempo de resposta" depende de o envio de e-mail não bloquear a
  resposta; coberto por teste que compara latências (ordem de grandeza).
- IP de origem atrás de proxy: `TRUST_PROXY_HOPS` explícito; valor errado enfraquece o
  rate limit — validado no startup e documentado no `.env.example`.

## Complexity Tracking

Nenhuma violação da constituição a justificar.
