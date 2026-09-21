---

description: "Task list for 001 — Foundation, Identity & Access"
---

# Tasks: 001 — Foundation, Identity & Access

**Input**: Design documents from `/specs/001-foundation-identity-access/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/ (http-api, permissions, audit-events, cli-admin-bootstrap), quickstart.md

**Tests**: OBRIGATÓRIOS. Constituição VII (autenticação, autorização/RBAC, transições
de estado), XVI (transições inválidas), XVII (idempotência) e SC-010 da spec (todos os
critérios de aceite cobertos por testes automatizados, incluindo casos negativos).
Em cada história, os testes são escritos primeiro e devem FALHAR antes da
implementação.

**Organization**: tarefas agrupadas por user story (US1–US8 da spec), na ordem de
prioridade e de dependência técnica.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivos diferentes, sem dependência pendente)
- **[Story]**: user story atendida (US1…US8)

## Path Conventions

Monorepo web (plan.md): API em `apps/api/src/`, testes da API em `apps/api/test/`,
frontend em `apps/web/`. Toda página web usa os componentes acessíveis de
`apps/web/components/form/` e atende FR-075 (WCAG 2.2 AA). Referências entre parênteses (R#, FR-###, US#-#) apontam
para research.md / spec.md.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: criar `apps/api`, ferramentas e infraestrutura local

- [X] T001 Remover o app de template `apps/docs` (R20) e referências a ele no `pnpm-lock.yaml` (rodar `pnpm install` após remover)
- [X] T002 Criar `apps/api/package.json` (nome `api`, CommonJS — sem `"type": "module"` —, scripts `dev`, `build`, `start`, `lint`, `check-types`, `test`, `test:security`, `admin:bootstrap`, `maintenance:run`, `prisma`), com dependências de R2–R13: `@nestjs/common`, `@nestjs/core`, `@nestjs/platform-express` (11), `@prisma/client`, `@prisma/adapter-pg`, `pg`, `argon2`, `zod`, `nestjs-pino`, `pino`, `pino-http`, `nodemailer`, `cookie-parser`, `reflect-metadata`, `rxjs`; dev: `prisma`, `@nestjs/cli`, `@nestjs/testing`, `@swc/core`, `@swc/cli`, `unplugin-swc`, `vitest`, `supertest`, `@types/supertest`, `@types/nodemailer`, `@types/cookie-parser`, `@types/pg`, `@types/node`, `@repo/eslint-config`, `@repo/typescript-config`
- [X] T003 [P] Criar `apps/api/tsconfig.json` (estende `@repo/typescript-config/base.json`, `module`/`moduleResolution` `NodeNext`, `experimentalDecorators`, `emitDecoratorMetadata`, `strict`, `outDir: dist`) e `apps/api/tsconfig.build.json` (exclui `test/`); se `tsc` 7 rejeitar decorators, fixar `typescript@~5.9` só em `apps/api` e anotar em plan.md › Complexity Tracking (R1)
- [X] T004 [P] Criar `apps/api/nest-cli.json` com `compilerOptions.builder: "swc"` e `typeCheck: false` (type-check fica em `check-types`) e `apps/api/.swcrc` com `decorators`, `decoratorMetadata`, `legacyDecorator` habilitados
- [X] T005 [P] Criar `apps/api/eslint.config.js` usando `@repo/eslint-config/base` e regra `no-restricted-imports` proibindo `@prisma/client`/`generated/prisma` em arquivos `*.controller.ts` (Constituição VIII)
- [X] T006 [P] Criar `apps/api/vitest.config.ts` com `unplugin-swc`, `test.include` para `test/**/*.spec.ts` e `src/**/*.spec.ts`, `fileParallelism: false` para `test/integration` e `test/security`, `globalSetup: test/helpers/global-setup.ts`
- [X] T007 [P] Criar `docker-compose.yml` na raiz com `postgres` (postgres:17, porta 5432, volume nomeado), `postgres-test` (postgres:17, porta 5433, `tmpfs` para dados) e `mailpit` (axllent/mailpit, portas 1025/8025) (R19)
- [X] T008 [P] Criar `apps/api/.env.example` com todas as variáveis de R13 (`DATABASE_URL`, `APP_HMAC_SECRET`, `WEB_ORIGIN`, `ALLOWED_ORIGINS`, `SMTP_URL`, `MAIL_FROM`, `TRUST_PROXY_HOPS`, `NODE_ENV`, `LOG_LEVEL`, `PORT`, e os opcionais `RATE_LIMIT_*` com padrões 5/100/300/5/900) sem valores reais, com comentários (inclui como gerar `APP_HMAC_SECRET` e o impacto de `TRUST_PROXY_HOPS`); criar `apps/api/.env.test.example` apontando para `postgres-test` e mailer em memória
- [X] T009 [P] Baixar a lista top-10k de senhas comuns do SecLists (MIT) para `apps/api/assets/common-passwords.txt` e registrar origem/licença em `apps/api/assets/README.md` (R4)
- [X] T010 Adicionar à raiz `package.json` o script `"admin:bootstrap": "pnpm --filter api admin:bootstrap --"` e ajustar `turbo.json` com tarefa `test` (`dependsOn: ["^build"]`, `cache: false`) e `outputs` `dist/**` para `build`
- [X] T011 [P] Criar `apps/api/Dockerfile` multi-stage (Node 24-slim, `pnpm deploy --filter api`, `prisma generate`, usuário não-root, `CMD node dist/main.js`) e `apps/api/.dockerignore`

**Checkpoint**: `pnpm install`, `pnpm --filter api check-types` e `docker compose up -d` funcionam

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: esquema completo, plataforma transversal, sessões, guards de RBAC e o
núcleo de concessão de papel — pré-requisitos de todas as histórias

**⚠️ CRITICAL**: nenhuma user story começa antes desta fase terminar

### Configuração, banco e esquema

- [X] T012 Implementar schema Zod do ambiente e `loadConfig()` com fail-fast (lista variáveis ausentes/inválidas sem ecoar valores; `APP_HMAC_SECRET` ≥ 32 bytes decodificados; `ALLOWED_ORIGINS` lista de URLs; opcionais `RATE_LIMIT_*` e `MAINTENANCE_INTERVAL_SECONDS` com padrões de R13) em `apps/api/src/platform/config/config.schema.ts` e `apps/api/src/platform/config/config.module.ts` (FR-074, R13)
- [X] T013 Criar `apps/api/prisma.config.ts` e `apps/api/prisma/schema.prisma` com generator `prisma-client` (output `src/generated/prisma`) e TODOS os modelos/enums de data-model.md: `User`, `Role`, `Permission`, `RolePermission`, `UserRole`, `TeacherProfile`, `StudentProfile`, `Invitation`, `UserToken`, `AdminBootstrap`, `Session`, `AuditEvent`, `AccessRecord`, `RateLimitCounter`; enums `AccountStatus`, `RoleAssignmentStatus`, `GrantSource`, `InvitationStatus`, `TokenPurpose`, `BootstrapStatus`, `SessionRevokeReason`, `ActorType`; `@@map` snake_case, `UNIQUE`s, FKs e índices listados em data-model.md
- [X] T014 Gerar a migration inicial com `prisma migrate dev --create-only --name init_identity_access` e acrescentar SQL manual em `apps/api/prisma/migrations/*_init_identity_access/migration.sql`: índices únicos parciais (`invitations(email, role_id) WHERE status='PENDING'`; `user_tokens(user_id, purpose) WHERE used_at IS NULL AND invalidated_at IS NULL`; `admin_bootstraps((true)) WHERE status='PENDING'`), CHECK de `ACCEPTED` em `invitations`, trigger `audit_events_append_only` (`BEFORE UPDATE OR DELETE … RAISE EXCEPTION`, exceto `DELETE` quando `current_setting('devtrack.audit_purge', true) = 'on'` e `occurred_at < now() - interval '5 years'` — R23), FK `admin_bootstraps.target_user_id … ON DELETE SET NULL` e `access_records.ip` como `inet`
- [X] T015 Criar a migration `seed_roles_permissions` em `apps/api/prisma/migrations/*_seed_roles_permissions/migration.sql` inserindo os 4 papéis (com `privileged`), as 18 permissões e as associações exatamente como `contracts/permissions.md`, com `ON CONFLICT DO NOTHING` (sem nenhum usuário/credencial)
- [X] T016 Implementar `PrismaService` (adapter `@prisma/adapter-pg`, `onModuleDestroy`) e helpers `runInTransaction(fn)` e `advisoryXactLock(tx, key)` com chaves constantes `ADMIN_BOOTSTRAP_LOCK` e `ADMIN_GUARD_LOCK` em `apps/api/src/platform/database/prisma.service.ts`, `apps/api/src/platform/database/transaction.ts`, `apps/api/src/platform/database/database.module.ts`

### HTTP, erros, logs

- [X] T017 [P] Implementar `AppException` (status + `code` + mensagem pt-BR), exceções nomeadas do catálogo de erros de `contracts/http-api.md` e o `GlobalExceptionFilter` que devolve `{statusCode, code, message}` sem stack/SQL e mapeia erros desconhecidos para `500 INTERNAL_ERROR` em `apps/api/src/platform/http/errors.ts` e `apps/api/src/platform/http/exception.filter.ts` (FR-073)
- [X] T018 [P] Implementar `ZodValidationPipe` + decorator `@Body(schema)` helper que rejeita campos desconhecidos com `400 VALIDATION_ERROR` e schemas reutilizáveis (`emailSchema` com trim+lowercase ≤254, `nameSchema` 1–120 sem caracteres de controle, `tokenSchema` base64url 43, `passwordInputSchema` string ≤ 1024) em `apps/api/src/platform/http/zod-validation.pipe.ts` e `apps/api/src/platform/http/schemas.ts` (R10)
- [X] T019 [P] Configurar `nestjs-pino` com `requestId` (aceita `X-Request-Id` só se UUID; senão gera), cabeçalho `X-Request-Id` na resposta, `redact` de `req.headers.cookie`, `req.headers.authorization`, `res.headers["set-cookie"]`, `*.password`, `*.token`, `*.secret`, e sem log de corpo, em `apps/api/src/platform/logging/logging.module.ts` (FR-072, R12)
- [X] T020 [P] Implementar `OriginGuard` global (métodos não seguros exigem `Origin` ∈ `ALLOWED_ORIGINS` e `Content-Type: application/json`, senão `403 ORIGIN_NOT_ALLOWED`) em `apps/api/src/platform/http/origin.guard.ts` (R6)
- [X] T021 Criar `apps/api/src/main.ts` (carrega config antes do Nest, `app.setGlobalPrefix('api')`, `cookie-parser`, `trust proxy = TRUST_PROXY_HOPS`, `helmet`-equivalente mínimo via cabeçalhos `Referrer-Policy: no-referrer` e `X-Content-Type-Options: nosniff`, filtro global, logger pino) e `apps/api/src/app.module.ts` importando módulos da plataforma
- [X] T022 [P] Implementar `HealthController` com `GET /health/live` e `GET /health/ready` (`SELECT 1`, `503` sem detalhes em falha), ambos `@Public()`, em `apps/api/src/platform/health/health.controller.ts` (R19)

### Criptografia, e-mail, rate limit, auditoria

- [X] T023 [P] Implementar `generateToken()` (32 bytes base64url), `hashToken()` (SHA-256 hex) e `hmacKey(scope, value)` (HMAC-SHA-256 com `APP_HMAC_SECRET`) em `apps/api/src/platform/crypto/tokens.ts` (R7, R8)
- [X] T024 [P] Implementar porta `Mailer` (`send({to, template, params})`), `SmtpMailer` (nodemailer, `SMTP_URL`), `InMemoryMailer` (para testes, expõe `outbox` e `lastLinkFor(email)`), `FailingMailer` (para testes, sempre lança), templates pt-BR em texto (`verify-email`, `signup-existing-account`, `password-reset`, `invitation-teacher`, `invitation-manager`, `admin-activation`) e `MailDispatcher.afterCommit(fn)` que envia fora do caminho da resposta e loga falhas sem o link, em `apps/api/src/platform/mail/` (R11, R16)
- [X] T025 [P] Implementar `RateLimitService.hit(scope, value, {limit, windowSec})` com upsert atômico em `rate_limit_counters` (chave HMAC), `isBlocked(...)`, `progressiveDelayMs(failures)` = `min(250·2^(n−5), 8000)` para n ≥ 5, e limpeza oportunista de expirados em `apps/api/src/platform/rate-limit/rate-limit.service.ts` (FR-022, R8)
- [X] T026 [P] Implementar `AuditService.record(tx, {type, actorType, actorUserId, targetType, targetId, requestId, metadata})` com allowlist de chaves de `metadata` por tipo, conforme `contracts/audit-events.md` (chave fora da lista → erro), em `apps/api/src/modules/audit/audit.service.ts` e `apps/api/src/modules/audit/audit-event-types.ts` (FR-070, FR-071)
- [X] T027 [P] Implementar `RequestContext` (requestId, IP de origem via `req.ip`, sessão/usuário atuais) acessível por decorator `@Ctx()` em `apps/api/src/platform/http/request-context.ts`

### Identidade, senha, sessões

- [X] T028 [P] Implementar `normalizeEmail()` e `PasswordPolicy.validate(pw)` (12–128, fora de `assets/common-passwords.txt` carregado em `Set` na inicialização, comparação case-insensitive → `400 WEAK_PASSWORD`) em `apps/api/src/modules/identity/email.ts` e `apps/api/src/modules/identity/password-policy.ts` (FR-001, FR-011)
- [X] T029 [P] Implementar `PasswordHasher` (Argon2id m=19456, t=2, p=1 via config; `hash`, `verify`, `needsRehash`, `verifyDummy()` contra hash pré-computado para e-mail inexistente) em `apps/api/src/modules/identity/password-hasher.ts` (FR-020, R4, R16)
- [X] T030 Implementar `UserRepository` (`findByEmail`, `findById`, `create`, `markEmailVerified`, `setPassword`, `setStatus`) e `ProfileRepository` (`ensureTeacherProfile`, `ensureStudentProfile` idempotentes por `userId`) em `apps/api/src/modules/identity/user.repository.ts` e `apps/api/src/modules/identity/profile.repository.ts`
- [X] T031 Implementar `SessionService`: `create(tx, userId)` → `{sessionId, secret}` (hash do segredo, `absoluteExpiresAt` +7d), `validate(secret)` (revogada/idle 8h/absoluta → null; atualiza `lastUsedAt` no máx. 1×/min), `revoke(sessionId, reason)`, `revokeAllForUser(tx, userId, reason)` idempotentes, e `SessionCookie.set/clear` (`__Host-devtrack_session`, HttpOnly, Secure, SameSite=Lax, Path=/) em `apps/api/src/modules/auth/session.service.ts` e `apps/api/src/modules/auth/session-cookie.ts` (FR-023–FR-026, R5)

### Autorização (RBAC + contexto)

- [X] T032 Implementar `PermissionResolver.effectivePermissions(userId)` (uma consulta: `user_roles ACTIVE → role_permissions → permissions`) e `RoleRepository` (`findByKey`, `getAssignment`, `grant(tx, userId, roleKey, grantedBy, via)` idempotente via `UNIQUE(userId, roleId)`) em `apps/api/src/modules/access-control/permission-resolver.ts` e `apps/api/src/modules/access-control/role.repository.ts` (FR-004, FR-063)
- [X] T033 Implementar decorators `@Public()`, `@AllowUnverified()`, `@RequirePermissions(...keys)` e os guards globais na ordem `SessionGuard` (401 `UNAUTHENTICATED`; conta `SUSPENDED` → 401) → `VerifiedGuard` (`403 EMAIL_NOT_VERIFIED`) → `PermissionsGuard` (`403 FORBIDDEN`) em `apps/api/src/modules/access-control/decorators.ts` e `apps/api/src/modules/access-control/guards/` (FR-060, FR-061, R9)
- [X] T034 Implementar `RoleAssignmentStateMachine` (transições `ACTIVE⇄SUSPENDED`, `ACTIVE|SUSPENDED→INACTIVE→ACTIVE`; inválida → `409 INVALID_STATE_TRANSITION`) e `RoleLifecycleService.changeStatus(tx, userId, roleKey, to, actorId)` que revoga sessões ao sair de `ACTIVE` em papel `privileged` (`ROLE_DEACTIVATED`), aplica a guarda do último `ADMIN` sob `ADMIN_GUARD_LOCK` e audita `role.status_changed` em `apps/api/src/modules/access-control/role-lifecycle.service.ts` (FR-026, FR-051, FR-054, XVI)
- [X] T035 [P] Definir interface `ResourceContextPolicy<TResource>` (documentação para Spec 002) e helper `findOwnedOrNotFound()` que lança `404 NOT_FOUND` em `apps/api/src/modules/access-control/resource-context.ts` (FR-062)

### Núcleo de concessão de papel (usado por US3, US4, US6)

- [X] T036 Implementar `RoleGrantAcceptance.resolveMode(tx, email, currentUserId?)` → `CREATE_ACCOUNT | SIGN_IN_REQUIRED | CLAIM_ACCOUNT` e `accept(tx, {email, roleKey, displayName, password?, currentUserId?, issuerUserId?, via})` com os três ramos de R15 (criar `User` verificado; exigir sessão da própria conta e ignorar senha; assumir conta não verificada com nova senha + `markEmailVerified` + `revokeAllForUser(ACCOUNT_CLAIMED)`), recusa de emissor == aceitante (`SELF_INVITE_FORBIDDEN`), concessão idempotente do papel, `ensureTeacherProfile` quando o papel for `TEACHER`, auditoria `role.granted`/`account.claimed`, em `apps/api/src/modules/provisioning/role-grant-acceptance.service.ts` (FR-044–FR-048, FR-035)

### Manutenção e retenção (FR-017, FR-076, FR-077)

- [X] T037 Implementar `MaintenanceService` (registro de jobs; `setInterval` de `MAINTENANCE_INTERVAL_SECONDS`, `0` desliga; cada execução só roda com `pg_try_advisory_lock(MAINTENANCE_LOCK)`; remoção em lotes de 1000 por transação; log só com contagens), o job `rate-limit-counters` e o CLI `apps/api/src/cli/maintenance.ts` (`--job <nome>`, exit codes de `contracts/maintenance-jobs.md`) com script `maintenance:run`, em `apps/api/src/platform/maintenance/maintenance.service.ts` (R21)
- [X] T038 Implementar o job `audit-events` (expurgo de `audit_events` com mais de 5 anos sob `SET LOCAL devtrack.audit_purge = 'on'`, evento `audit.purged` com `count`/`olderThan` quando houver remoções) em `apps/api/src/modules/retention/audit-retention.job.ts` (FR-077, R23)

### Base de testes

- [X] T039 Criar `apps/api/test/helpers/global-setup.ts` (aplica `prisma migrate deploy` no `postgres-test`) e `apps/api/test/helpers/test-app.ts` (sobe o Nest com `InMemoryMailer`, config de teste e `ALLOWED_ORIGINS` de teste; `resetDb()` com `TRUNCATE … RESTART IDENTITY CASCADE` preservando `roles`, `permissions`, `role_permissions`; clientes `supertest` com `Origin` e JSON padrão)
- [X] T040 [P] Criar fábricas de teste `createUser({roles, verified, status, password})`, `loginAs(user)` (cria sessão via `SessionService` e devolve cookie) e `captureLogs()` (stream pino em memória) em `apps/api/test/helpers/factories.ts` e `apps/api/test/helpers/log-capture.ts`
- [X] T041 [P] Testes unitários de plataforma: `PasswordPolicy` (11/12/128/129 caracteres, senha comum), `RoleAssignmentStateMachine` (todas as transições válidas e inválidas), `progressiveDelayMs`, `normalizeEmail`, `hashToken` determinístico, allowlist do `AuditService` em `apps/api/src/**/*.spec.ts`
- [X] T042 Teste de integração do núcleo: `RoleGrantAcceptance` nos três ramos + emissor == aceitante + concorrência (`Promise.all` de dois `accept` → um `UserRole`, um perfil) em `apps/api/test/integration/role-grant-acceptance.spec.ts`
- [X] T043 [P] Teste de inicialização: API sem `APP_HMAC_SECRET`/`DATABASE_URL` falha com mensagem listando as variáveis e sem valores; `GET /api/health/live` e `/ready` respondem `200` sem sessão em `apps/api/test/integration/platform.spec.ts` (FR-074)
- [X] T044 [P] Teste de manutenção em `apps/api/test/integration/maintenance.spec.ts`: duas execuções simultâneas → só uma trabalha; job `audit-events` remove só linhas com mais de 5 anos e audita `audit.purged`; `DELETE` em `audit_events` fora do job e qualquer `UPDATE` continuam falhando; `rate-limit-counters` remove só expirados; CLI com `--job` inválido → exit 1
- [X] T045 Teste de cobertura de rotas: percorre todas as rotas registradas no Nest e falha se alguma não tiver `@Public()`, `@AllowUnverified()` ou `@RequirePermissions()` explícitos em `apps/api/test/security/route-declarations.spec.ts`

### Web — base

- [X] T046 [P] Configurar rewrite `/api/:path*` → `API_ORIGIN` em `apps/web/next.config.js`, criar `apps/web/.env.example` (`API_ORIGIN`) e substituir `apps/web/app/page.tsx`/`layout.tsx` do template por layout DevTrack mínimo (título, `lang="pt-BR"`)
- [X] T047 [P] Implementar `apiClient` (fetch com `credentials: 'same-origin'`, JSON, conversão de `{statusCode, code, message}` em `ApiError`) e `getMe()` server-side repassando o cookie em `apps/web/lib/api-client.ts` e `apps/web/lib/session.ts` (R18)
- [X] T048 [P] Criar componentes de formulário acessíveis `Field` (label associado, `aria-invalid`, `aria-describedby` para erro/ajuda), `ErrorSummary` (`aria-live="polite"`, recebe foco após submissão inválida, links para os campos) e `SubmitButton` (estado ocupado anunciado), e estilos globais de foco visível e contraste AA em `apps/web/components/form/` e `apps/web/app/globals.css` (FR-075, R22)
- [X] T049 [P] Configurar Vitest + Testing Library + `vitest-axe` + `@testing-library/user-event` em `apps/web/vitest.config.ts`, helper `expectNoA11yViolations(container)` em `apps/web/test/a11y.ts` (R22) e teste do `apiClient` (mapeamento de erros) em `apps/web/lib/api-client.test.ts`

**Checkpoint**: migrations aplicam, guards bloqueiam por padrão, núcleo de concessão
testado — histórias podem começar

---

## Phase 3: User Story 1 - Aluno cria a própria conta e verifica o e-mail (Priority: P1) 🎯 MVP

**Goal**: autocadastro público cria só `STUDENT` (não verificado) e o e-mail é
verificado por link de uso único.

**Independent Test**: cadastrar pela API, conferir papel único `STUDENT`, acesso
restrito até verificar (sessão criada por fábrica), verificar e ver acesso liberado;
replay, expiração, duplicidade e concorrência sem efeitos extras.

**Já disponível da Fase 2 (reutilizar, não recriar)**: `normalizeEmail`,
`PasswordPolicy.validate`, `PasswordHasher.hash/verifyDummy`, `UserRepository`,
`ProfileRepository.ensureStudentProfile`, `RoleRepository.grant(tx, userId, "STUDENT", null, "SELF_SIGNUP")`,
`PermissionResolver`, `generateToken`/`hashToken`, `RateLimitService.hit` + `rateLimited(retryAfterSec)`,
`AuditService.record`, `MailDispatcher.send` (pós-commit) com templates `verify-email` e
`signup-existing-account`, `runInTransaction`, `@Public()`/`@AllowUnverified()`, `@Ctx()`,
`emailSchema`/`nameSchema`/`tokenSchema`/`passwordInputSchema`, `MaintenanceService.register`;
nos testes: `createTestApp({controllers})`, `api(t, {cookie})`, `createUser`, `loginAs`,
`InMemoryMailer.lastTokenFor(email, template)`, `flushMail()`, `resetDb`.
Links de e-mail: `${config.webOrigin}/verificar-email?token=…`, `${webOrigin}/entrar`,
`${webOrigin}/esqueci-senha`.

### Tests for User Story 1 ⚠️

> Escrever primeiro; devem falhar (rotas inexistentes → 404) antes de T053–T057.

- [X] T050 [P] [US1] Testes de integração US1-1…US1-7 em `apps/api/test/integration/us1-signup.spec.ts` (um `createTestApp` por arquivo, `resetDb` + `mailer.clear()` em `beforeEach`):
  (US1-1) `POST /auth/signup` válido → `202 {message}`; no banco: um `User` com `emailVerifiedAt = null`, exatamente um `UserRole` (`STUDENT`, `ACTIVE`, `grantedVia = SELF_SIGNUP`), `StudentProfile`, um `UserToken` `EMAIL_VERIFICATION` só com hash (valor do link ≠ `tokenHash`), evento `auth.signup`; após `flushMail()` o `InMemoryMailer` tem `verify-email` para o e-mail normalizado;
  (US1-2) corpos com `role: "TEACHER"`, `roles`, `permissions`, `isAdmin` ou campo desconhecido → `400 VALIDATION_ERROR` e zero `User`s; senha de 11 caracteres, de 129 e da lista comum → `400 WEAK_PASSWORD`;
  (US1-3) usuário não verificado (`createUser({verified:false})` + `loginAs`) → `GET /me` `200` com `emailVerified:false`, `roles:[{key:"STUDENT",status:"ACTIVE"}]`; rota de fixture `@RequirePermissions("sessoes.proprias.listar")` (passada em `controllers`) → `403 EMAIL_NOT_VERIFIED`; após verificar → mesma rota `200`; `GET /me` sem cookie → `401 UNAUTHENTICATED`;
  (US1-4) `POST /auth/verify-email {token}` → `200 {emailVerified:true}`, `emailVerifiedAt` preenchido, um `auth.email_verified`; repetir o mesmo token → `200` sem novo evento e `emailVerifiedAt` inalterado;
  (US1-5) token expirado (forçar `expires_at = now() - interval '1 second'` via SQL), adulterado (um caractere trocado), inexistente e o anterior a um `POST /auth/verify-email/resend` → `400 TOKEN_INVALID`; token com formato inválido → `400 VALIDATION_ERROR`; o link novo do reenvio funciona;
  (US1-6) cadastro com e-mail existente em variação `"  Aluno@Exemplo.TEST "` → status e corpo idênticos ao cadastro novo, nenhum `User`/`UserRole`/`UserToken`/`auth.signup` novo, senha e nome do titular inalterados, e-mail `signup-existing-account` para o titular;
  (US1-7) `Promise.all` de dois `POST /auth/signup` com o mesmo e-mail → ambos `202` e exatamente um `User`
- [X] T051 [P] [US1] Testes de segurança em `apps/api/test/security/us1-enumeration.spec.ts` (SC-006, FR-015, FR-022):
  anti-enumeração — `signup` e `verify-email/resend` para e-mail novo × existente (verificado e não verificado) devolvem status, corpo e cabeçalhos relevantes idênticos (exceto `X-Request-Id`); mediana de 5 medições de latência de cada caminho dentro de um fator 3 uma da outra (comprova o hash Argon2 também no caminho existente);
  reenvio — conta existente não verificada recebe `verify-email` e o token anterior passa a `invalidatedAt` preenchido; conta verificada ou inexistente não recebe e-mail; resposta `202` igual nos três casos;
  rate limit — com `testConfig({ rateLimit: { publicTarget: 2, publicOrigin: 4, … } })`, a 3ª solicitação ao mesmo e-mail em cada rota → `429 RATE_LIMITED` com `Retry-After` inteiro ≥ 1, idêntica para e-mail existente e inexistente; limite por origem atinge com e-mails distintos; bloqueio grava `auth.rate_limit.blocked` (`scope`) sem e-mail/IP no `metadata`; nenhum `User` criado depois do bloqueio;
  varredura — logs capturados (`LogCapture`) e `audit_events` do arquivo não contêm senha, token do link nem `tokenHash`
- [X] T052 [P] [US1] Teste do job `unverified-accounts` em `apps/api/test/integration/us1-unverified-purge.spec.ts` (FR-017, contracts/maintenance-jobs.md), chamando `MaintenanceService.run({ job: "unverified-accounts" })`:
  removida — conta não verificada só-`STUDENT` com `createdAt` de 8 dias, com sessão, token, perfil e papel → `User`, `sessions`, `user_tokens`, `student_profiles`, `user_roles` removidos; um `account.unverified_purged` com `targetId` = id removido, `metadata = {}`, ator `SYSTEM`; resultado do job com contagem 1;
  preservadas — não verificada com 6 dias; verificada com 30 dias; não verificada com 30 dias e papel `TEACHER` adicional (qualquer status); não verificada com convite `acceptedByUserId` = ela;
  pós-remoção — o token de verificação antigo → `POST /auth/verify-email` `400 TOKEN_INVALID`; `POST /auth/signup` com o mesmo e-mail cria novo `User` (id diferente); convite `PENDING` para esse e-mail criado antes da remoção continua aceitável por `RoleGrantAcceptanceService.accept` em modo `CREATE_ACCOUNT`;
  lote — 3 contas elegíveis com o job instanciado com `batchSize: 2` → todas removidas; duas execuções concorrentes → soma das remoções = 3 e nenhuma falha

### Implementation for User Story 1

- [X] T053 [P] [US1] Implementar `UserTokenService` em `apps/api/src/modules/auth/user-token.service.ts` (FR-013–FR-015) e registrá-lo em `AuthModule` (providers + exports):
  `issue(tx, userId, purpose): Promise<{token, expiresAt}>` — `UPDATE user_tokens SET invalidated_at = now()` dos tokens vigentes (`used_at IS NULL AND invalidated_at IS NULL`) do mesmo `userId`+`purpose`, depois cria um novo com `generateToken()`, grava só `hashToken(token)`, TTL `EMAIL_VERIFICATION` 24 h / `PASSWORD_RESET` 1 h (constantes exportadas);
  `consume(tx, token, purpose): Promise<{userId} | null>` — um único `UPDATE … SET used_at = now() WHERE token_hash = $1 AND purpose = $2 AND used_at IS NULL AND invalidated_at IS NULL AND expires_at > now() RETURNING user_id` (atômico sob concorrência);
  `findUsed(tx, token, purpose): Promise<{userId} | null>` — token já consumido (para a idempotência de T055);
  testes unitários de TTL/escolha de propósito em `user-token.service.spec.ts` quando houver lógica pura
- [X] T054 [US1] Implementar `SignupService.signup({name, email, password}, ctx: RequestContext)` em `apps/api/src/modules/auth/signup.service.ts` (FR-010–FR-013, FR-022, R16), nesta ordem:
  (1) rate limit — `hit("signup:origin", ctx.ip, publicOrigin)` e `hit("signup:email", email, publicTarget)` com `windowSeconds`; se algum `blocked` → auditar `auth.rate_limit.blocked` (`scope` `signup_origin`|`signup_email`, ator `ANONYMOUS`) em transação própria e lançar `rateLimited(retryAfterSec)`;
  (2) `PasswordPolicy.validate(password)`; (3) `passwordHasher.hash(password)` SEMPRE, antes de consultar o e-mail (tempo igual nos dois caminhos);
  (4) em `runInTransaction`: `userRepository.create` via `createMany skipDuplicates` (ou captura de `P2002`) — se nada foi criado, sair do caminho de criação; senão `roleRepository.grant(tx, userId, "STUDENT", null, "SELF_SIGNUP")`, `ensureStudentProfile`, `userTokenService.issue(tx, userId, "EMAIL_VERIFICATION")`, `audit.record(auth.signup, ANONYMOUS, target USER, requestId)`;
  (5) após o commit: conta nova → `mail.send("verify-email", {name, link})`; e-mail existente (incluindo o perdedor da corrida) → buscar o titular e `mail.send("signup-existing-account", {name: nomeDoTitular, loginLink, resetLink})`, sem emitir token nem alterar a conta;
  (6) retorno único `{message: "Se o e-mail puder ser usado, enviaremos as instruções para ele."}` (constante compartilhada com T055). Registrar o serviço em `AuthModule`
- [X] T055 [US1] Implementar `EmailVerificationService` em `apps/api/src/modules/auth/email-verification.service.ts` (FR-014–FR-016):
  `verify(token)` — em transação: `consume(tx, token, "EMAIL_VERIFICATION")`; se consumido → `markEmailVerified(tx, userId)` e, se mudou, `auth.email_verified` (ator `USER` quando a requisição tem sessão do mesmo usuário, senão `ANONYMOUS`); se não consumido → `findUsed`: usado e o usuário já verificado → sucesso sem efeito; qualquer outro caso (inexistente, expirado, invalidado, usuário removido) → `tokenInvalid()`; retorna `{emailVerified: true}`;
  `resend(email, ctx)` — rate limit com escopos `resend:origin`/`resend:email` (mesmos limites e auditoria de T054); só se a conta existe, está `ACTIVE` e não verificada: `issue` + `mail.send("verify-email")` após commit; sempre a mesma resposta `202` de T054. Registrar em `AuthModule`
- [X] T056 [US1] Controllers finos (sem Prisma; sem regra de negócio) e ligação de módulos:
  `apps/api/src/modules/auth/signup.controller.ts` (`@Controller("auth")`, todos `@Public()`): `POST signup` (`@HttpCode(202)`, schema `z.strictObject({name: nameSchema, email: emailSchema, password: passwordInputSchema})`), `POST verify-email` (`200`, `{token: tokenSchema}`), `POST verify-email/resend` (`202`, `{email: emailSchema}`), todos com `ZodValidationPipe` e `@Ctx()`;
  `apps/api/src/modules/auth/me.controller.ts` (`GET /me`, `@AllowUnverified()`) delegando a `MeService.get(userId)` em `apps/api/src/modules/auth/me.service.ts`, que devolve `MeView` = `{id, name, email, emailVerified, roles: [{key, status}] (todos os papéis, ordenados por key), permissions: [...PermissionResolver] ordenado}`;
  registrar controllers/serviços em `AuthModule` (importando `IdentityModule`/`AccessControlModule` conforme necessário, sem ciclo) e acrescentar `"POST /auth/signup"`, `"POST /auth/verify-email"`, `"POST /auth/verify-email/resend"`, `"GET /me"` ao `arrayContaining` de `apps/api/test/security/route-declarations.spec.ts`
- [X] T057 [US1] Implementar o job `unverified-accounts` em `apps/api/src/modules/retention/unverified-accounts.job.ts` (FR-017, R23) e registrá-lo no `MaintenanceService` a partir de `RetentionModule` (antes de `audit-events`, na ordem de `MAINTENANCE_JOB_NAMES`):
  construtor/fábrica aceita `batchSize` opcional (padrão `MAINTENANCE_BATCH_SIZE`, via `deleteInBatches`); seleção em lote (`LIMIT batchSize`, `FOR UPDATE SKIP LOCKED`) de `users` com `email_verified_at IS NULL`, `created_at < now − 7 days`, todos os `user_roles` sendo `STUDENT` (exatamente um) e nenhum `invitations.accepted_by_user_id = users.id`;
  por lote, numa transação: apagar `sessions`, `user_tokens`, `student_profiles`, `user_roles`, `users` (reverificando o critério no `DELETE … RETURNING id`) e gravar um `account.unverified_purged` por id (ator `SYSTEM`, alvo `USER`, `metadata {}`, `requestId null`); repetir até lote vazio e devolver a contagem
- [X] T058 [P] [US1] Criar as páginas públicas em `apps/web/app/(public)/` usando `components/form` e `lib/api-client` (sem regra de negócio no componente; FR-075):
  `cadastro/page.tsx` (Server Component com `metadata`) + `cadastro/signup-form.tsx` (Client): campos nome, e-mail e senha (`autoComplete` `name`/`email`/`new-password`, dica "12 a 128 caracteres"), validação local só de UX (obrigatórios, 12–128), envia exatamente `{name, email, password}`, trata `VALIDATION_ERROR`/`WEAK_PASSWORD`/`RATE_LIMITED`/`NETWORK_ERROR` no `ErrorSummary`, e após `202` substitui o formulário pela mensagem genérica da API com foco nela;
  `verificar-email/page.tsx` (Server Component, lê `searchParams.token` e o passa como prop) + `verificar-email/verify-email.tsx` (Client): remove o token da URL (`history.replaceState`) e faz um único `POST /api/auth/verify-email` ao montar; estados carregando / sucesso (link para `/entrar`) / `TOKEN_INVALID` ou sem token (formulário de reenvio com e-mail → `POST /api/auth/verify-email/resend` e mensagem genérica); anúncios em região `aria-live`;
  `Referrer-Policy: no-referrer` para `/verificar-email` via `headers()` em `apps/web/next.config.js` e `metadata.referrer = "no-referrer"` na página
- [X] T059 [P] [US1] Testes de componente com Testing Library + `vitest-axe` (mock de `fetch`) em `apps/web/app/(public)/cadastro/cadastro.test.tsx` e `apps/web/app/(public)/verificar-email/verificar-email.test.tsx`:
  cadastro — corpo enviado tem só `name`, `email`, `password`; senha curta bloqueia o envio com erro vinculado por `aria-describedby`; `400 WEAK_PASSWORD` aparece no resumo com foco; `202` mostra a mensagem genérica; sem violações axe;
  verificação — um único POST com o token da URL; sucesso mostra confirmação; `TOKEN_INVALID` mostra o reenvio, que envia `{email}` e exibe a mensagem genérica; sem violações axe

**Checkpoint**: US1 funcional e testada de forma independente (MVP) — `pnpm --filter api test`
e `pnpm --filter web test` verdes, `turbo run lint check-types test` verde

---

## Phase 4: User Story 2 - Usuário autentica e gerencia suas sessões (Priority: P1)

**Goal**: login por e-mail/senha, logout, logout de todos os dispositivos, listagem e
revogação das próprias sessões, rate limit sem bloqueio do dono.

**Independent Test**: login válido/ inválido, uso da sessão, logout, duas sessões +
revogação individual, logout-all, sessão de outro usuário → 404, expiração e conta
suspensa.

**Já disponível (reutilizar, não recriar)**: `SessionService.create/validate/revoke/revokeAllForUser`
e as constantes `SESSION_IDLE_TIMEOUT_MS`/`SESSION_ABSOLUTE_TTL_MS`; `SessionCookie.set/clear/read`;
`PasswordHasher.verify/verifyDummy/needsRehash/hash`; `UserRepository.findByEmail/setPassword`;
`RateLimitService.hit/peek` + `progressiveDelayMs(n)` + `rateLimited(sec)`; `MeService.get` (US1);
`findOwnedOrNotFound`; `AuditService.record`; `@Public()`/`@AllowUnverified()`/`@RequirePermissions()`,
`@Ctx()`, `ZodBody`, `emailSchema`/`passwordInputSchema`/`uuidSchema`; `deleteInBatches` e
`MaintenanceService.register` (padrão de `AuditRetentionJob`); `config.rateLimit.loginEmailOriginFailures`
(5), `loginOriginFailures` (100), `windowSeconds` (900); `trust proxy = TRUST_PROXY_HOPS` (1 nos testes,
então `X-Forwarded-For` simula origens); motivos `LOGOUT`, `LOGOUT_ALL`, `USER_REVOKED`, `ACCOUNT_SUSPENDED`
de `SessionRevokeReason`. Nos testes: `createTestApp`, `api(t, {cookie})`, `createUser({status, verified})`,
`loginAs`, `LogCapture`, `resetDb`. Todos os papéis têm `sessoes.proprias.listar`/`revogar`.

**Fora desta fase**: rate limit de `POST /invitations/accept` e `POST /admin-activation` é testado com
essas rotas (T069, T076).

### Tests for User Story 2 ⚠️

> Escrever primeiro; devem falhar (rotas inexistentes → 404) antes de T063–T066.

- [X] T060 [P] [US2] Testes de integração US2-1, US2-2, US2-5…US2-10 em `apps/api/test/integration/us2-auth-sessions.spec.ts` (um `createTestApp`, `resetDb` em `beforeEach`; cookie extraído de `Set-Cookie`):
  (US2-1) `POST /api/auth/login` com e-mail em caixa/espaços variados → `200 {user: MeView}`; `Set-Cookie` `__Host-devtrack_session=…; Path=/; HttpOnly; Secure; SameSite=Lax` com `Expires` ≈ criação + 7 d; segredo nunca no corpo; banco guarda só `hashToken(segredo)`; o cookie autoriza `GET /api/me/sessions`; evento `auth.login.succeeded` (ator `USER`, alvo `SESSION`, `metadata {sessionId}`); conta não verificada também faz login (acesso restrito, FR-016);
  (US2-2) e-mail inexistente e senha errada → status e corpo idênticos `401 INVALID_CREDENTIALS`, sem `Set-Cookie` e sem nova linha em `sessions`; corpo com campo extra → `400 VALIDATION_ERROR`;
  (fixation) login enviando um cookie de sessão válido de outra conta → novo segredo ≠ enviado, e a sessão enviada continua intacta;
  (US2-5) `POST /api/auth/logout` → `204`, cookie limpo (`Expires` no passado), aquela sessão → `401` e a outra sessão do mesmo usuário continua `200`; repetir logout com o cookie já revogado → `401`; evento `session.revoked` (`reason: LOGOUT`); usuário não verificado consegue fazer logout;
  (US2-6) com 3 sessões, `POST /api/auth/logout-all` → `204` e as 3 → `401`; evento `session.revoked_all` (`reason: LOGOUT_ALL`, `count: 3`);
  (US2-7) `GET /api/me/sessions` → só ativas (exclui revogadas e expiradas), cada item `{id, createdAt, lastUsedAt, expiresAt, current}` com `expiresAt = min(lastUsedAt + 8 h, absoluteExpiresAt)`, `current: true` só na da requisição, sem `tokenHash`/segredo; `GET /api/me/sessions/:id` própria → `200`; `DELETE /api/me/sessions/:id` → `204`, só ela → `401`; repetir o `DELETE` → `204` (idempotente); `DELETE` da própria sessão atual também limpa o cookie; evento `session.revoked` (`reason: USER_REVOKED`); `:id` que não é UUID → `400 VALIDATION_ERROR`;
  (US2-8) id de sessão de outro usuário em `GET` e `DELETE` → `404 NOT_FOUND` idêntico ao de UUID inexistente, e a sessão alheia continua válida;
  (US2-9) sessão com `last_used_at` há 8 h + 1 min ou `absolute_expires_at` no passado (forçados via SQL) → `401 UNAUTHENTICATED`; sessão revogada → `401`;
  (US2-10) conta `SUSPENDED`: senha correta → `403 ACCOUNT_SUSPENDED` sem sessão criada; senha errada → `401 INVALID_CREDENTIALS`; sessão existente de conta suspensa (status alterado via SQL) → `401`;
  (rehash) usuário com hash de parâmetros Argon2 menores (gerado no teste com `argon2.hash(…, {memoryCost: 4096})`) → após login o `password_hash` muda e a senha continua válida
- [X] T061 [P] [US2] Testes de rate limit US2-3/US2-4 em `apps/api/test/security/us2-rate-limit.spec.ts` (FR-022, R8), com o atraso progressivo injetável (T063) substituído por um espião que registra os ms pedidos sem dormir:
  (US2-3) 5 senhas erradas para o e-mail X a partir do IP A (`X-Forwarded-For: 203.0.113.10`) → todas `401`; a 6ª de A, mesmo com a senha correta → `429 RATE_LIMITED` com `Retry-After` ≥ 1 e sem verificação de senha; evento `auth.rate_limit.blocked` com `metadata {scope: "login_email_origin"}` sem e-mail/IP;
  (US2-4) em seguida o dono com a senha correta pelo IP B → `200` e sessão criada;
  (atraso/alerta) falhas do mesmo e-mail vindas de 12 IPs diferentes → nenhuma `429`; o espião recebe `0` até a 5ª tentativa e depois `progressiveDelayMs(n)` crescente (250, 500, 1000…, teto 8000); exatamente um `auth.rate_limit.alert` (ator `SYSTEM`, alvo `USER`, `metadata {failuresAcrossOrigins: 10}`) ao cruzar 10 falhas;
  (origem) com `testConfig({rateLimit: {...base, loginOriginFailures: 6}})` em um segundo app: 6 falhas de e-mails distintos pelo mesmo IP → a 7ª (qualquer e-mail, mesmo senha correta) `429` com `scope: "login_origin"`; outro IP continua livre;
  (NAT) 40 contas distintas com login bem-sucedido e 40 cadastros distintos (`POST /api/auth/signup`) pelo mesmo IP → nenhum `429` (sucessos não contam para a origem);
  (anti-enumeração) latência mediana de 5 logins com e-mail inexistente × senha errada dentro de um fator 3 (`verifyDummy`)
- [X] T062 [P] [US2] Teste de registro de acesso em `apps/api/test/integration/us2-access-records.spec.ts` (FR-076, R23):
  login bem-sucedido com `X-Forwarded-For: 198.51.100.7` grava uma linha em `access_records` com `userId`, `ip = 198.51.100.7` e `occurredAt` ≈ agora; login falho e login bloqueado não gravam; nenhum `audit_events.metadata` contém o IP;
  job `access-records` via `MaintenanceService.run({job: "access-records"})`: registros com 6 meses + 1 dia removidos, com 6 meses − 1 dia preservados; `access_records.purged` (ator `SYSTEM`, `metadata {count, olderThan}`) só quando `count > 0`; lote (`job.run({now, batchSize: 2})` com 3 elegíveis) remove tudo;
  nenhuma rota registrada contém `access` no caminho (via `DiscoveryService`, como em `route-declarations.spec.ts`)

### Implementation for User Story 2

- [X] T063 [US2] Implementar `LoginService.login({email, password}, ctx): Promise<{secret, absoluteExpiresAt, user: MeView}>` em `apps/api/src/modules/auth/login.service.ts` (FR-020–FR-024, R8, R16), nesta ordem:
  (1) `email = normalizeEmail`; `peek("login:email_origin", \`${email}|${ip}\`, loginEmailOriginFailures)` e `peek("login:origin", ip, loginOriginFailures)` — bloqueado → auditar `auth.rate_limit.blocked` (`scope` `login_email_origin`|`login_origin`, ator `ANONYMOUS`) e `rateLimited(retryAfterSec)` sem verificar senha;
  (2) atraso progressivo: `await this.delay(progressiveDelayMs(peek("login:email", email, ∞).count))` via provider injetável `LOGIN_DELAY` (padrão `(ms) => setTimeout` promisificado; testes o substituem);
  (3) `findByEmail`; inexistente → `verifyDummy(password)` e falha; existente → `verify(hash, password)`;
  (4) falha → `hit` nos três contadores (`login:email_origin`, `login:origin`, `login:email`, todos com `windowSeconds`); se o de `login:email` chegou exatamente a 10 → `auth.rate_limit.alert` (ator `SYSTEM`, alvo `USER` quando a conta existe, `{failuresAcrossOrigins: 10}`); lançar `invalidCredentials()`;
  (5) senha correta e conta `SUSPENDED` → `accountSuspended()` (sem contar falha, sem sessão);
  (6) em `runInTransaction`: `needsRehash` → `setPassword(hash novo)`; `SessionService.create`; `tx.accessRecord.create({userId, ip})`; auditar `auth.login.succeeded` (ator `USER`, alvo `SESSION`, `{sessionId}`, sem IP);
  (7) devolver o segredo e `MeService.get(userId)`. Sucesso não conta em nenhum contador. Registrar em `AuthModule` com o provider `LOGIN_DELAY`; em `apps/api/test/helpers/test-app.ts` acrescentar `TestAppOptions.overrides?: {provide, useValue}[]` aplicados com `overrideProvider`
- [X] T064 [US2] Implementar `AuthController` em `apps/api/src/modules/auth/auth.controller.ts` (FR-025), controller fino com `@Res({passthrough: true})` só para o cookie:
  `POST /auth/login` (`@Public()`, `@HttpCode(200)`, `z.strictObject({email: emailSchema, password: passwordInputSchema})`) → `SessionCookie.set(res, secret, absoluteExpiresAt)` e `{user}`;
  `POST /auth/logout` e `POST /auth/logout-all` (`@AllowUnverified()`, `@HttpCode(204)`) delegando a `SessionEndService` em `apps/api/src/modules/auth/session-end.service.ts`: `logout(ctx)` → `revoke(sessionId, "LOGOUT")` + `session.revoked` (`{reason: "LOGOUT"}`) quando revogou; `logoutAll(ctx)` → em transação `revokeAllForUser(userId, "LOGOUT_ALL")` + `session.revoked_all` (`{reason, count}`); ambos com `SessionCookie.clear(res)`;
  registrar em `AuthModule` e acrescentar `POST /auth/login`, `POST /auth/logout`, `POST /auth/logout-all` ao `arrayContaining` de `apps/api/test/security/route-declarations.spec.ts`
- [X] T065 [US2] Implementar sessões próprias (FR-027, FR-062):
  `OwnSessionsService` em `apps/api/src/modules/auth/own-sessions.service.ts` — `list(userId, currentSessionId, now)` com consulta já filtrada por `userId`, `revokedAt IS NULL`, `lastUsedAt > now − 8 h`, `absoluteExpiresAt > now`, ordenada por `lastUsedAt desc`; `get(userId, currentSessionId, id)` via `findOwnedOrNotFound` (mesmos filtros + `userId` → 404 para alheia, inexistente ou inativa); `revoke(userId, id, ctx)` → `findOwnedOrNotFound` só por `{id, userId}` (sessão própria já revogada é aceita → idempotente), `SessionService.revoke(id, "USER_REVOKED")` e `session.revoked` (`{reason}`) quando revogou; devolve se era a sessão atual; mapper `toSessionView` com `expiresAt = min(lastUsedAt + SESSION_IDLE_TIMEOUT_MS, absoluteExpiresAt)`;
  `OwnSessionsController` em `apps/api/src/modules/auth/own-sessions.controller.ts` — `@Controller("me/sessions")`: `GET` → `{items}` e `GET :id` com `@RequirePermissions("sessoes.proprias.listar")`; `DELETE :id` com `@RequirePermissions("sessoes.proprias.revogar")`, `204`, limpando o cookie se revogou a sessão atual; `:id` validado com `uuidSchema`;
  registrar em `AuthModule` e acrescentar as três rotas ao `route-declarations.spec.ts`
- [X] T066 [US2] Implementar o job `access-records` em `apps/api/src/modules/retention/access-records.job.ts` (FR-076, R23) seguindo o padrão de `AuditRetentionJob`: `accessRecordsCutoff(now)` = `now` menos 6 meses de calendário (UTC); `deleteInBatches` com `DELETE … WHERE id IN (SELECT id FROM access_records WHERE occurred_at < cutoff ORDER BY id LIMIT batchSize)`; por lote com remoções, `access_records.purged` (ator `SYSTEM`, `{count, olderThan: cutoff.toISOString()}`); registrar em `RetentionModule` (providers)
- [X] T067 [P] [US2] Web de login e sessões (usa `components/form`, `lib/api-client`; sem regra de negócio no componente; FR-075):
  `apps/web/lib/auth-api.ts` — acrescentar `login`, `logout`, `logoutAll`, `listSessions`, `revokeSession` e o tipo `SessionView`;
  `apps/web/app/(public)/entrar/page.tsx` + `entrar/login-form.tsx` (Client) — e-mail/senha (`autoComplete` `email`/`current-password`), erro genérico da API no `ErrorSummary` (nunca aponta qual campo), `429` com minutos de espera, `ACCOUNT_SUSPENDED` com a mensagem da API; em sucesso `router.replace(next ?? "/conta/sessoes")` aceitando só `next` relativo começando com `/` (sem `//`), e `router.refresh()`; links para `/cadastro` e `/esqueci-senha`;
  `apps/web/app/conta/sessoes/page.tsx` (Server Component: `getMe()`; sem sessão → `redirect("/entrar?next=/conta/sessoes")`; e-mail não verificado → aviso com link de reenvio) + `conta/sessoes/sessions-list.tsx` (Client) — tabela com criação, último uso, expiração (`Intl.DateTimeFormat("pt-BR")`), "Esta sessão" na atual, botão "Encerrar" por linha com nome acessível que inclui a data, e "Sair de todos os dispositivos"; após encerrar a atual ou todas → `/entrar`; anúncios em `aria-live`;
  `apps/web/components/logout-button.tsx` (Client, `POST /api/auth/logout` → `/entrar`) e `apps/web/app/layout.tsx` mostrando "Minhas sessões" + sair quando `getMe()` devolve usuário, ou "Entrar"/"Criar conta" quando não;
  testes de componente com `vitest-axe` e `fetch` simulado em `apps/web/app/(public)/entrar/entrar.test.tsx` (só envia `{email, password}`; `401` mostra mensagem genérica focada; `next` absoluto é ignorado) e `apps/web/app/conta/sessoes/sessoes.test.tsx` (renderiza itens, encerrar chama `DELETE /api/me/sessions/:id` e remove a linha, sem violações axe)
- [X] T068 [P] [US2] Criar `apps/web/proxy.ts` (convenção `proxy` do Next.js 16) com `matcher: ["/conta/:path*"]`: sem cookie `__Host-devtrack_session` → redireciona para `/entrar?next=<caminho>`; com cookie, segue (a validade é decidida pela API; somente UX, nunca autoriza); teste unitário da função em `apps/web/proxy.test.ts` (sem cookie → 307 para `/entrar?next=%2Fconta%2Fsessoes`; com cookie → `NextResponse.next()`)

**Checkpoint**: US1 + US2 funcionando; sessões revogáveis — `pnpm --filter api test`,
`pnpm --filter web test` e `turbo run lint check-types test` verdes

---

## Phase 5: User Story 3 - Bootstrap seguro do primeiro ADMIN (Priority: P1)

**Goal**: `pnpm admin:bootstrap --email … [--print-link]` cria o primeiro `ADMIN` sem
rota pública, senha padrão ou seed.

**Independent Test**: base sem ADMIN → bootstrap → ativação → acesso administrativo;
rodar de novo → recusa; concorrência, cancelamento de pendente, usuário verificado e
não verificado; nenhuma rota pública produz ADMIN.

### Tests for User Story 3 ⚠️

- [ ] T069 [P] [US3] Testes de integração US3-1…US3-9 chamando `AdminBootstrapService` e `POST /admin-activation*` em `apps/api/test/integration/us3-admin-bootstrap.spec.ts`: e-mail novo → `PENDING` + e-mail de ativação + nenhum `User`/`UserRole` até ativar; `--print-link` → link retornado e evento `admin.bootstrap.link_printed`; sem a opção o link não aparece na saída; `User` verificado → `ADMIN` direto, senha inalterada; `User` não verificado → só após ativação, com nova senha, e-mail verificado e sessões revogadas; ADMIN ativo → recusa "Bootstrap administrativo já realizado"; duas execuções concorrentes → no máximo um `PENDING`; nova execução cancela o pendente (link antigo → `TOKEN_INVALID`); ativação com ADMIN já ativo → `409 BOOTSTRAP_ALREADY_DONE`; auditoria com e-mail, data e origem, sem token; US3-10: conta verificada após a emissão do link → preview `SIGN_IN_REQUIRED`, ativação sem sessão `401 SIGN_IN_REQUIRED`, com outra conta `403 WRONG_ACCOUNT`, com a própria conta concede `ADMIN` e a senha não muda; rate limit (FR-022): o mesmo token inválido em `POST /admin-activation` 5 vezes → `400 TOKEN_INVALID` genérico e a 6ª → `429 RATE_LIMITED` (movido de T061)
- [ ] T070 [P] [US3] Teste de segurança US3-8: nenhuma rota registrada contém `bootstrap` além de `admin-activation`, e cadastro/verificação/convite/ativação com campos de papel nunca resultam em `ADMIN` em `apps/api/test/security/us3-no-public-admin.spec.ts` (FR-030)
- [ ] T071 [P] [US3] Teste do CLI (processo real via `node:child_process` contra `postgres-test`): exit codes 0/1/2/3 e mensagens de `contracts/cli-admin-bootstrap.md`; argumentos desconhecidos (`--password`, `--role`) → exit 1 em `apps/api/test/integration/us3-admin-bootstrap-cli.spec.ts`

### Implementation for User Story 3

- [ ] T072 [US3] Implementar `AdminBootstrapService.run({email, printLink, operator})` sob `ADMIN_BOOTSTRAP_LOCK`: recusa com ADMIN `ACTIVE` (audita `refused`), cancela `PENDING` anterior (`cancelled`, `SUPERSEDED`), concede direto a `User` verificado (`completed`, `DIRECT_GRANT`) ou cria `PENDING` com token 24 h e envia `admin-activation` após commit; retorna link só quando `printLink` em `apps/api/src/modules/admin-bootstrap/admin-bootstrap.service.ts` (FR-031–FR-036, R14)
- [ ] T073 [US3] Implementar `AdminActivationService.preview(token, currentUserId?)` e `activate(token, password?, currentUserId?)` (lock na linha do bootstrap, token válido/não expirado, ADMIN já ativo → cancela e `409`, `RoleGrantAcceptance` com `via: ADMIN_BOOTSTRAP` nos três modos, inclusive `SIGN_IN_REQUIRED`, marca `COMPLETED`) e `AdminActivationController` (`POST /admin-activation/preview`, `POST /admin-activation`, `@Public()` com sessão opcional, rate limit) em `apps/api/src/modules/admin-bootstrap/admin-activation.service.ts` e `admin-activation.controller.ts`
- [ ] T074 [US3] Implementar o CLI `apps/api/src/cli/admin-bootstrap.ts` (`NestFactory.createApplicationContext`, parser estrito de `--email`/`--print-link`, operador = `os.hostname()` + `os.userInfo().username`, exit codes do contrato, sem ler credenciais de env/arquivo) e script `admin:bootstrap` em `apps/api/package.json`
- [ ] T075 [P] [US3] Criar `apps/web/app/(public)/ativar-admin/page.tsx` (preview do modo; `CREATE_ACCOUNT`/`CLAIM_ACCOUNT` com definição de senha; `SIGN_IN_REQUIRED` com link para `/entrar?next=`; sucesso → link para `/entrar`)

**Checkpoint**: P1 completo — plataforma instalável com primeiro ADMIN

---

## Phase 6: User Story 4 - ADMIN provisiona MANAGER (Priority: P2)

**Goal**: ADMIN convida, reenvia, revoga, desativa e reativa MANAGERs; infraestrutura
genérica de convites (criação e aceitação) nasce aqui.

**Independent Test**: ADMIN convida MANAGER, pessoa aceita e define senha, MANAGER
tem só `professores.*`; outros papéis → 403; desativação revoga sessões; autoconvite
recusado; último ADMIN protegido.

### Tests for User Story 4 ⚠️

- [ ] T076 [P] [US4] Testes de integração US4-1…US4-6 em `apps/api/test/integration/us4-manager-provisioning.spec.ts`: convite `PENDING` + auditoria; aceite cria MANAGER com permissões de `contracts/permissions.md`; MANAGER/TEACHER/STUDENT em `POST /manager-invitations` → `403`; desativar MANAGER revoga sessões, remove capacidades, preserva convites emitidos e auditoria; reativar; suspender a conta do último ADMIN (inclusive a própria) → `409 LAST_ADMIN_PROTECTED`/`403 SELF_ACTION_FORBIDDEN`; autoconvite → `403 SELF_INVITE_FORBIDDEN` + `invitation.self_invite_blocked`; `INVITATION_ALREADY_PENDING`; `ALREADY_MANAGER`; rate limit (FR-022): o mesmo token inválido em `POST /invitations/accept` 5 vezes → `400 TOKEN_INVALID` genérico e a 6ª → `429 RATE_LIMITED` (movido de T061)
- [ ] T077 [P] [US4] Teste de ciclo de convite genérico: reenvio troca token (antigo → `TOKEN_INVALID`), renova validade e incrementa `sendCount`; revogação; expiração preguiçosa vira `EXPIRED`; transições inválidas (reenviar/revogar `ACCEPTED`) → `409` em `apps/api/test/integration/invitation-lifecycle.spec.ts`

### Implementation for User Story 4

- [ ] T078 [US4] Implementar `InvitationService` genérico (`create(tx, {email, displayName, roleKey, issuer})` com bloqueio de autoconvite, `resend`, `revoke`, `expireIfDue`, `findPendingByToken` com `FOR UPDATE`, `InvitationStateMachine`) e envio após commit (`invitation-teacher`/`invitation-manager`, link `${WEB_ORIGIN}/convite?token=`) em `apps/api/src/modules/provisioning/invitation.service.ts` (FR-040–FR-042, FR-049)
- [ ] T079 [US4] Implementar `InvitationAcceptanceService.preview(token, currentUserId?)` e `accept(token, password?, currentUserId?)` delegando a `RoleGrantAcceptance` (replay idempotente para o próprio aceitante; demais estados → `TOKEN_INVALID`; audita `invitation.accepted`/`invitation.acceptance_refused`) e `InvitationAcceptanceController` (`POST /invitations/preview`, `POST /invitations/accept`, `@Public()` com sessão opcional, rate limit) em `apps/api/src/modules/provisioning/invitation-acceptance.service.ts` e `invitation-acceptance.controller.ts` (FR-044–FR-049)
- [ ] T080 [US4] Implementar `ManagersService` e `ManagersController` (`GET /managers`, `GET/POST /manager-invitations`, `POST /manager-invitations/:id/resend|revoke`, `POST /managers/:userId/deactivate|reactivate` via `RoleLifecycleService`; `ALREADY_MANAGER`) com permissões `managers.*` em `apps/api/src/modules/provisioning/managers.service.ts` e `managers.controller.ts`
- [ ] T081 [US4] Implementar `AccountsService` (`list(query, cursor)` com paginação por cursor e filtro por nome/e-mail, `get(id)` → `UserAccountView` sem dados acadêmicos; `suspend/reactivate` da conta `User` `ACTIVE⇄SUSPENDED` com revogação de sessões `ACCOUNT_SUSPENDED`, guarda do último ADMIN, bloqueio de autoação e auditoria `account.suspended/reactivated`) e `AccountsController` (`GET /users`, `GET /users/:id` com `usuarios.visualizar`; `POST /users/:id/suspend|reactivate` com `usuarios.suspender`/`usuarios.reativar`) em `apps/api/src/modules/accounts/accounts.service.ts` e `accounts.controller.ts` (FR-052, FR-054, FR-056)
- [ ] T082 [P] [US4] Criar `apps/web/app/admin/managers/page.tsx` (lista, convidar, reenviar, revogar, desativar/reativar) e `apps/web/app/(public)/convite/page.tsx` (preview; modos `CREATE_ACCOUNT`/`CLAIM_ACCOUNT` com senha, `SIGN_IN_REQUIRED` com link para `/entrar?next=`; erros genéricos)

**Checkpoint**: ADMIN consegue colocar MANAGERs em operação

---

## Phase 7: User Story 5 - MANAGER convida professor (Priority: P2)

**Goal**: MANAGER (e ADMIN) gerencia o cadastro docente — convites e ciclo de vida do
papel `TEACHER` — sem enxergar alunos.

**Independent Test**: MANAGER cria, reenvia, revoga convite, consulta status, suspende,
desativa, reativa professor; qualquer operação sobre contas de alunos → 403; aluno
existente não é revelado.

### Tests for User Story 5 ⚠️

- [ ] T083 [P] [US5] Testes de integração US5-1…US5-12 em `apps/api/test/integration/us5-teacher-invitations.spec.ts`: convite `PENDING` e status `INVITED` derivado; reenvio invalida link anterior; revogação; e-mail de aluno → resposta idêntica à de e-mail sem conta (mesmo status/corpo exceto `id`/datas); MANAGER em `GET /users` e `GET /users/:id` → `403` (nunca lista vazia); `GET /teachers/:userId` de um aluno → `404`; desativar professor que também é STUDENT → sessões revogadas, `TEACHER` `INACTIVE`, `STUDENT` intacto, perfil preservado; reativar sem novo perfil/identidade; MANAGER suspendendo conta/alterando senha/atribuindo outro papel → `403`; autoconvite e aceite pelo próprio emissor → `403`; `TeacherView` sem outros papéis; banco sem token em claro (varre `invitations`, `user_tokens`, `sessions`, `admin_bootstraps` pelo token gerado); `ALREADY_TEACHER` e `TEACHER_REACTIVATION_REQUIRED`

### Implementation for User Story 5

- [ ] T084 [US5] Implementar `TeachersService` (`list(status?)` → `TeacherListItem[]` unindo `UserRole TEACHER` + perfis e convites `PENDING` de `TEACHER` sem `UserRole TEACHER` como itens `INVITED` com `userId: null`; `get(userId)` escopado a quem tem `UserRole TEACHER` → senão 404; `suspend/deactivate/reactivate` via `RoleLifecycleService`; `TeacherView` apenas com dados docentes) em `apps/api/src/modules/provisioning/teachers.service.ts` (FR-050, FR-051)
- [ ] T085 [US5] Implementar `TeacherInvitationsService.create` sobre `InvitationService` com regras FR-043 (TEACHER ativo → `ALREADY_TEACHER`; suspenso/inativo → `TEACHER_REACTIVATION_REQUIRED`; demais contas não reveladas) em `apps/api/src/modules/provisioning/teacher-invitations.service.ts`
- [ ] T086 [US5] Implementar `TeachersController` (`GET /teachers`, `GET /teachers/:userId`, `POST /teachers/:userId/suspend|deactivate|reactivate`) e `TeacherInvitationsController` (`GET/POST /teacher-invitations`, `POST /teacher-invitations/:id/resend|revoke`) com permissões `professores.*` em `apps/api/src/modules/provisioning/teachers.controller.ts` e `teacher-invitations.controller.ts`
- [ ] T087 [P] [US5] Criar `apps/web/app/professores/page.tsx` (lista com status `INVITED/ACTIVE/SUSPENDED/INACTIVE`, convidar, reenviar, revogar, suspender, desativar, reativar; mensagens para `ALREADY_TEACHER`/`TEACHER_REACTIVATION_REQUIRED`)

**Checkpoint**: MANAGER opera o cadastro docente de ponta a ponta

---

## Phase 8: User Story 6 - Pessoa aceita convite de professor com identidade única (Priority: P2)

**Goal**: aceitação de convite de `TEACHER` nos três ramos, sem duplicação, replay ou
tomada de conta.

**Independent Test**: três ramos, replay, concorrência, conta errada, senha ignorada,
pré-registro por atacante.

### Tests for User Story 6 ⚠️

- [ ] T088 [P] [US6] Testes de integração US6-1…US6-10 via HTTP em `apps/api/test/integration/us6-teacher-acceptance.spec.ts`: e-mail novo → `User` verificado + `TEACHER` + `TeacherProfile`, convite `ACCEPTED`; STUDENT verificado autenticado → mesmo `User` com `STUDENT`+`TEACHER`, senha inalterada; sem sessão → `401 SIGN_IN_REQUIRED`, outra conta → `403 WRONG_ACCOUNT`, nada atribuído; não verificado → mesmo `User`, verificado, sessões anteriores revogadas, senha antiga inválida; replay → sem novos registros; aceitação concorrente (`Promise.all`) → um `User`, um perfil, um `UserRole`; expirado/revogado/reenviado/adulterado → `TOKEN_INVALID`; corpo com `email` diferente → `400 VALIDATION_ERROR` e papel só na identidade convidada; campo `password` com conta verificada → ignorado (login só com a senha antiga); atacante pré-registrado com sessão aberta → sessão do atacante `401`, senha dele inválida, `account.claimed` auditado
- [ ] T089 [P] [US6] Teste agregado SC-011 (pré-registro, aceite com outra conta, replay, autoconvite) verificando que nenhum papel/acesso é obtido pelo atacante em `apps/api/test/security/us6-account-takeover.spec.ts`

### Implementation for User Story 6

- [ ] T090 [US6] Ajustar `InvitationAcceptanceService`/`RoleGrantAcceptance` para o que os testes T088/T089 exigirem além do núcleo (ex.: `displayName` do convite em `TeacherProfile`, mensagem/`mode` na resposta, auditoria `invitation.acceptance_refused` com `reason`) em `apps/api/src/modules/provisioning/invitation-acceptance.service.ts`
- [ ] T091 [P] [US6] Completar `apps/web/app/(public)/convite/page.tsx` para `TEACHER`: retorno de `/entrar?next=/convite?token=…`, confirmação de aceite autenticado, aviso de que a sessão será encerrada no modo `CLAIM_ACCOUNT`

**Checkpoint**: provisionamento de professores seguro e idempotente

---

## Phase 9: User Story 7 - Autorização por capacidade e contexto no backend (Priority: P2)

**Goal**: garantir 401/403/404 em toda rota, por chamada direta à API.

**Independent Test**: matriz rota × papel da `contracts/permissions.md` executada
integralmente.

### Tests for User Story 7 ⚠️

- [ ] T092 [P] [US7] Teste de matriz gerado a partir de uma tabela (rota, método, corpo mínimo válido, status esperado por anônimo/STUDENT/TEACHER/MANAGER/ADMIN) espelhando `contracts/permissions.md` em `apps/api/test/security/us7-authorization-matrix.spec.ts` (US7-1, US7-2, SC-003)
- [ ] T093 [P] [US7] Testes US7-3…US7-5 em `apps/api/test/security/us7-context-and-roles.spec.ts`: contexto → 404 (sessões de outro usuário; `/teachers/:userId` de não-professor); `STUDENT+TEACHER` → união; conceder/desativar papel reflete na requisição seguinte sem novo login (reativar MANAGER → nova sessão ganha `professores.*`); e-mail não verificado → `EMAIL_NOT_VERIFIED` em todas as rotas `perm:*`; `Origin` ausente/estranho em `POST` → `403 ORIGIN_NOT_ALLOWED`
- [ ] T094 [P] [US7] Teste de forma de `UserAccountView`: as chaves devolvidas por `GET /users` e `GET /users/:id` são exatamente `{id, name, email, emailVerified, status, roles, createdAt}`, sem perfis nem dados de outros domínios, e a paginação por cursor não repete nem pula contas, em `apps/api/test/security/us7-account-view.spec.ts` (FR-056)

### Implementation for User Story 7

- [ ] T095 [P] [US7] Criar `apps/web/app/admin/usuarios/page.tsx` (busca, lista, suspender/reativar conta) e ocultar links de navegação conforme `MeView.permissions` (somente UX)

**Checkpoint**: nenhuma rota contornável por chamada direta

---

## Phase 10: User Story 8 - Usuário recupera o acesso com "esqueci minha senha" (Priority: P2)

**Goal**: recuperação de senha por link de uso único, com revogação de sessões.

**Independent Test**: pedir para e-mail existente e inexistente (respostas iguais),
redefinir, sessões antigas revogadas, nova senha funciona, replay recusado.

### Tests for User Story 8 ⚠️

- [ ] T096 [P] [US8] Testes US8-1…US8-6 em `apps/api/test/integration/us8-password-reset.spec.ts`: resposta idêntica para existente/inexistente; redefinição troca senha, revoga todas as sessões (`PASSWORD_RESET`) e audita; conta não verificada passa a verificada; link usado/expirado (1 h)/adulterado/substituído → `TOKEN_INVALID`; conta suspensa continua sem acesso e papéis inalterados; rate limit com mesma resposta pública

### Implementation for User Story 8

- [ ] T097 [US8] Implementar `PasswordResetService.request(email, ctx)` (rate limit, resposta genérica, `UserTokenService.issue(PASSWORD_RESET)` e e-mail após commit só se a conta existir, auditoria `password_reset.requested`) e `confirm(token, password)` (consome token, `PasswordPolicy`, `setPassword`, `markEmailVerified`, `revokeAllForUser(PASSWORD_RESET)`, auditoria `password_reset.completed`; não altera status nem papéis) em `apps/api/src/modules/auth/password-reset.service.ts` (FR-029a–e)
- [ ] T098 [US8] Adicionar `POST /auth/password-reset/request` e `POST /auth/password-reset/confirm` (`@Public()`) ao `apps/api/src/modules/auth/auth.controller.ts`
- [ ] T099 [P] [US8] Criar `apps/web/app/(public)/esqueci-senha/page.tsx` e `apps/web/app/(public)/redefinir-senha/page.tsx`

**Checkpoint**: todas as user stories funcionais e testadas

---

## Phase 11: Polish & Cross-Cutting Concerns

**Purpose**: garantias transversais, rastreabilidade e documentação

- [ ] T100 [P] Teste de varredura de segredos SC-005: executa os fluxos de US1–US8 com `captureLogs()` e, ao fim, procura cada senha, token e segredo de sessão gerados nos logs capturados e em `audit_events` (inclusive `metadata`) em `apps/api/test/security/secret-leak-scan.spec.ts`
- [ ] T101 [P] Teste de auditoria SC-008: para cada tipo de `contracts/audit-events.md` acionado nos fluxos, verifica existência com ator, alvo, `occurredAt` e `requestId` (exceto eventos do CLI) e que `UPDATE`/`DELETE` em `audit_events` falha (trigger) em `apps/api/test/security/audit-coverage.spec.ts`
- [ ] T102 [P] Teste de guarda de escopo FR-080: falha se `schema.prisma` contiver modelos fora da lista de data-model.md em `apps/api/test/security/no-academic-domain.spec.ts`
- [ ] T103 Criar `apps/api/test/traceability.spec.ts` que mapeia os 28 critérios de aceite da spec (tabela de rastreabilidade) aos arquivos/nomes de teste e falha se algum critério não tiver teste correspondente (SC-010)
- [ ] T104 [P] Teste de desempenho leve SC-009: 20 logins sequenciais no ambiente de teste com p95 ≤ 2 s em `apps/api/test/security/login-latency.spec.ts`
- [ ] T105 [P] Testes de acessibilidade SC-012: para cada página com formulário (`cadastro`, `verificar-email`, `entrar`, `esqueci-senha`, `redefinir-senha`, `convite`, `ativar-admin`, `conta/sessoes`, `professores`, `admin/managers`, `admin/usuarios`), `expectNoA11yViolations` em estado inicial e com erros de validação, e fluxo completo só com teclado (`user.tab()`, `{Enter}`) verificando foco no `ErrorSummary`, em `apps/web/app/**/*.a11y.test.tsx` (FR-075)
- [ ] T106 [P] Substituir `README.md` da raiz (template create-turbo) por visão geral do DevTrack, pré-requisitos (Node 24, pnpm, Docker), comandos de `quickstart.md` e link para a constituição e specs
- [ ] T107 Revisar `apps/api/src/**/*.controller.ts` garantindo ausência de Prisma e de regra de negócio (Constituição VIII) e rodar `pnpm lint`, `pnpm check-types`, `pnpm --filter api test`, `pnpm --filter web test`
- [ ] T108 Executar o roteiro completo de `specs/001-foundation-identity-access/quickstart.md` em ambiente limpo (docker compose + migrations + bootstrap + convites + sessões) e corrigir divergências no próprio quickstart
- [ ] T109 [P] Teste de falha de e-mail: com `FailingMailer`, cadastro, criação de convite, reenvio de verificação e pedido de recuperação respondem como no caso normal, o estado permanece consistente (token vigente, convite `PENDING`) e o reenvio posterior com o mailer normal entrega link válido, em `apps/api/test/integration/mail-failure.spec.ts` (edge case "Falha no envio de e-mail")
- [ ] T110 Auditar dependências (Constituição I — Supply Chain — e seção Dependências): `pnpm audit --prod --audit-level high` sem achados high/critical; `pnpm licenses list --prod` conferido contra allowlist (MIT, ISC, Apache-2.0, BSD-2-Clause, BSD-3-Clause, 0BSD, BlueOak-1.0.0); registrar resultado e justificativa de cada dependência direta em `apps/api/DEPENDENCIES.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sem dependências
- **Foundational (Phase 2)**: depende do Setup — BLOQUEIA todas as histórias
- **US1, US2, US3 (P1)**: dependem só da Foundational; podem ser feitas em paralelo
- **US4**: depende da Foundational (usa `RoleGrantAcceptance`); cria a infraestrutura genérica de convites
- **US5**: depende de US4 (`InvitationService`, rota de aceitação)
- **US6**: depende de US5 (convites de professor) — foca nos ramos e na segurança da aceitação
- **US7**: depende de todas as rotas existirem para a matriz completa (US1–US6, US8); T095 depende de T081 (US4), que cria `GET /users`
- **US8**: depende da Foundational e de `UserTokenService` (T053, US1)
- **Jobs de retenção**: `unverified-accounts` (US1) e `access-records` (US2) se registram no `MaintenanceService` (T037, Foundational)
- **Polish**: depende de todas as histórias

### User Story Dependencies

```text
Setup → Foundational ─┬─ US1 (MVP) ── US8
                      ├─ US2
                      ├─ US3
                      └─ US4 ── US5 ── US6
                                   └────────── US7 (matriz final)
```

### Within Each User Story

- Testes escritos primeiro e falhando
- Serviços antes de controllers; controllers antes das páginas web
- Cada história fecha com seu checkpoint antes da próxima prioridade

### Parallel Opportunities

- Setup: T003–T009, T011 em paralelo após T002
- Foundational: T017–T020, T022–T029, T035, T040, T041, T043, T044, T046–T049 em paralelo (arquivos distintos); T013→T014→T015→T016 em sequência; T030→T031→T032→T033→T034→T036 em sequência; T037→T038 após T016 e T026
- Após a Foundational: US1, US2, US3 e US4 em paralelo por pessoas diferentes
- Em cada história, os testes [P] e as páginas web [P] em paralelo com os serviços

---

## Parallel Example: User Story 1

```bash
# Testes primeiro (em paralelo):
Task: "T050 Testes de integração US1-1…US1-7 em apps/api/test/integration/us1-signup.spec.ts"
Task: "T051 Anti-enumeração e rate limit em apps/api/test/security/us1-enumeration.spec.ts"

# Em seguida, em paralelo:
Task: "T053 UserTokenService em apps/api/src/modules/auth/user-token.service.ts"
Task: "T058 Páginas de cadastro e verificação em apps/web/app/(public)/"
```

## Parallel Example: User Story 3

```bash
Task: "T069 Testes US3-1…US3-9 em apps/api/test/integration/us3-admin-bootstrap.spec.ts"
Task: "T070 Nenhuma rota pública produz ADMIN em apps/api/test/security/us3-no-public-admin.spec.ts"
Task: "T071 Teste do CLI em apps/api/test/integration/us3-admin-bootstrap-cli.spec.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1)

1. Phase 1 (Setup) → Phase 2 (Foundational)
2. Phase 3 (US1) → validar cadastro + verificação isoladamente
3. Na prática, o primeiro incremento utilizável é **US1 + US2 + US3** (todas P1): alunos
   se cadastram e entram, e a instalação tem um ADMIN

### Incremental Delivery

1. Setup + Foundational → base pronta
2. US1 → US2 → US3 → demo (P1 completo)
3. US4 → US5 → US6 → provisionamento docente completo
4. US8 → recuperação de senha
5. US7 → matriz de autorização completa
6. Polish → varreduras, rastreabilidade, README, quickstart

### Parallel Team Strategy

1. Todos juntos em Setup + Foundational
2. Depois: Dev A US1→US8; Dev B US2; Dev C US3; Dev D US4→US5→US6
3. US7 e Polish ao final, com todas as rotas prontas

---

## Notes

- [P] = arquivos diferentes, sem dependência pendente
- `apps/api/prisma/schema.prisma` é editado só na Foundational (T013) para evitar conflitos entre histórias
- Commit por tarefa ou grupo lógico; parar em qualquer checkpoint para validar
- Mudança de comportamento durante a implementação → atualizar spec.md primeiro (constituição)
