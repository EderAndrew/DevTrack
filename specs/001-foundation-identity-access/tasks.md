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

**Já disponível (reutilizar, não recriar)**: tabela `admin_bootstraps` (`AdminBootstrap`:
`email`, `targetUserId`, `status` `PENDING|COMPLETED|CANCELLED`, `tokenHash`, `expiresAt`,
`linkPrinted`, `operatorHost`, `operatorUser`, `completedAt`, `cancelledAt`; índice único parcial
`admin_bootstraps_single_pending_key` "no máximo um `PENDING`"); `LockKey.ADMIN_BOOTSTRAP_LOCK` +
`advisoryXactLock(tx, key)`; `RoleGrantAcceptance.resolveMode/accept` (modos `CREATE_ACCOUNT`,
`SIGN_IN_REQUIRED`, `CLAIM_ACCOUNT`; lança `PASSWORD_REQUIRED`/`WEAK_PASSWORD`/`SIGN_IN_REQUIRED`/
`WRONG_ACCOUNT`; audita `role.granted` e `account.claimed`); `RoleRepository.grant`;
`generateToken`/`hashToken`; `bootstrapAlreadyDone()`/`tokenInvalid()`; `Mailer` (porta) e o template
`admin-activation` (`{link, expiresAt}`); `PublicRateLimit` (US1); `webLinks(webOrigin)` (US1);
eventos `admin.bootstrap.requested|link_printed|cancelled|refused|completed` no catálogo de auditoria;
padrão de CLI de `src/cli/maintenance.command.ts` (`run…Cli(argv, env, io)` → exit code) e o script
`admin:bootstrap` já presente em `apps/api/package.json` e na raiz. "ADMIN ativo" = `user_roles`
`ADMIN` `ACTIVE` de `users.status = ACTIVE` (mesma regra de `assertAnotherActiveAdmin`).

**Decisões desta fase**: a ativação em `CREATE_ACCOUNT` usa como `name` inicial a parte local do
e-mail (o contrato `{token, password?}` não tem nome e o bootstrap não o coleta); o CLI envia o
e-mail de ativação de forma síncrona após o commit (não pelo `MailDispatcher`) para poder devolver
exit `3` quando o envio falha; auditoria da ativação usa ator `ANONYMOUS` (contrato), com
`requestId` da requisição; eventos do CLI usam ator `OPERATOR` e `requestId = null`.

### Tests for User Story 3 ⚠️

> Escrever primeiro; devem falhar (serviço/rotas inexistentes) antes de T072–T074.

- [X] T069 [P] [US3] Testes de integração US3-1…US3-10 em `apps/api/test/integration/us3-admin-bootstrap.spec.ts`, chamando `AdminBootstrapService.run({email, printLink, operator: {host: "host-teste", user: "operador"}})` (via `t.get`, com o `InMemoryMailer` do `createTestApp`) e as rotas `POST /api/admin-activation/preview` e `POST /api/admin-activation`:
  (US3-1) e-mail sem conta → resultado `{outcome: "PENDING", expiresAt}` sem `link`; linha `PENDING` com `tokenHash` (≠ token) e `expiresAt` ≈ +24 h; e-mail `admin-activation` com `${WEB_ORIGIN}/ativar-admin?token=…`; nenhum `User`/`UserRole ADMIN`; preview → `{email, mode: "CREATE_ACCOUNT"}`; ativação com senha → `200 {role: "ADMIN"}`, `User` verificado com `ADMIN` `ACTIVE` (`grantedVia = ADMIN_BOOTSTRAP`), bootstrap `COMPLETED` com `targetUserId`, login funciona e `GET /api/me` lista as 18 permissões do ADMIN; ativação sem senha → `400 PASSWORD_REQUIRED`, senha fraca → `400 WEAK_PASSWORD` (token continua válido);
  (US3-2) `printLink: true` → resultado traz `link`, `linkPrinted = true` e evento `admin.bootstrap.link_printed`; sem a opção nenhum evento `link_printed`;
  (US3-3) `User` verificado (com sessão aberta) → `{outcome: "GRANTED"}`, `ADMIN` no mesmo `User`, `passwordHash` inalterado, sessão continua válida, bootstrap `COMPLETED` sem token, nenhum e-mail;
  (US3-4) `User` não verificado com 2 sessões → `PENDING`; preview `CLAIM_ACCOUNT`; ativação com nova senha → mesmo `id`, senha nova, e-mail verificado, as 2 sessões → `401`, `account.claimed` (`via: ADMIN_BOOTSTRAP`);
  (US3-5) com ADMIN ativo → `{outcome: "REFUSED"}`, nada muda, `admin.bootstrap.refused` (`reason: ADMIN_ALREADY_ACTIVE`, `operatorHost`, `operatorUser`); ADMIN só `SUSPENDED`/`INACTIVE` ou de conta suspensa não conta como ativo;
  (US3-6) `Promise.all` de dois `run` com e-mails diferentes → exatamente um `PENDING`, o outro `CANCELLED` (`SUPERSEDED`), nenhum erro;
  (US3-7) segundo `run` (mesmo ou outro e-mail) → anterior `CANCELLED` com `cancelledAt`, link antigo em preview/ativação → `400 TOKEN_INVALID`, eventos `admin.bootstrap.cancelled` (`reason: SUPERSEDED`) e novo `requested`; também com o pendente anterior já expirado;
  (US3-9) após concluir: `admin.bootstrap.requested` (`email`, `mode: ACTIVATION_LINK|DIRECT_GRANT`, `operatorHost`, `operatorUser`, ator `OPERATOR`, `requestId null`) e `admin.bootstrap.completed` (`bootstrapId`, `mode`); nenhum evento contém o token nem seu hash;
  (409) com o link emitido, conceder ADMIN a outra conta via `createUser({roles: ["ADMIN"]})` → ativação `409 BOOTSTRAP_ALREADY_DONE`, bootstrap `CANCELLED` com `admin.bootstrap.cancelled` (`reason: ADMIN_ALREADY_ACTIVE`, ator `SYSTEM`) persistido apesar do erro;
  (US3-10) e-mail sem conta → link; depois `createUser({email, verified: true})` → preview `SIGN_IN_REQUIRED`; ativação sem sessão → `401 SIGN_IN_REQUIRED`; com sessão de outra conta → `403 WRONG_ACCOUNT`; com sessão da própria conta (e `password` enviado) → `200`, `ADMIN` concedido e `passwordHash` inalterado; repetir a ativação com a mesma sessão → `200` idempotente; repetir sem sessão → `400 TOKEN_INVALID`;
  token expirado (via SQL) ou adulterado → `400 TOKEN_INVALID` em preview e ativação; corpo com campo extra (`role`) → `400 VALIDATION_ERROR`;
  rate limit (FR-022): o mesmo token inválido em `POST /api/admin-activation` 5 vezes → `400 TOKEN_INVALID` e a 6ª → `429 RATE_LIMITED` com `Retry-After` (movido de T061)
- [X] T070 [P] [US3] Teste de segurança US3-8 em `apps/api/test/security/us3-no-public-admin.spec.ts` (FR-030): via `DiscoveryService` (como em `route-declarations.spec.ts`), nenhuma rota contém `bootstrap` e as únicas com `admin` são `POST /admin-activation` e `POST /admin-activation/preview`; nenhum handler `@Public()` além desses dois menciona ADMIN; `POST /api/auth/signup` com `role`/`roles: ["ADMIN"]`/`isAdmin` → `400` e zero `UserRole ADMIN`; `POST /api/admin-activation` sem bootstrap emitido (token aleatório) → `400 TOKEN_INVALID` e zero `ADMIN`; após todos os casos, `user_roles` não tem nenhum `ADMIN`
- [X] T071 [P] [US3] Teste do CLI em `apps/api/test/integration/us3-admin-bootstrap-cli.spec.ts` chamando `runAdminBootstrapCli(argv, env, io, {mailer})` em processo (mesmo padrão de `maintenance.spec.ts`, env de teste, `io` capturando linhas, `mailer` = `InMemoryMailer`/`FailingMailer`): parser (`parseAdminBootstrapArgs`) aceita `--email x`, `--email=x`, `--print-link`, `--` do pnpm; recusa sem `--email`, e-mail inválido, `--password`, `--role`, `--name`, argumento solto → exit `1` com mensagem de uso e nada gravado; e-mail novo → exit `0` e `Link de ativação enviado para <email> (válido até <data>)` sem o link; `--print-link` → também `Link de ativação: <url>`; `User` verificado → `ADMIN concedido a <email>`; pendente anterior → linha `Bootstrap pendente anterior cancelado`; ADMIN ativo → exit `2` e `Bootstrap administrativo já realizado`; `FailingMailer` → exit `3`, aviso e bootstrap continua `PENDING`; env sem `DATABASE_URL` → exit `1` com mensagem genérica; nenhuma linha de saída contém o token quando `--print-link` não é usado; o script `admin:bootstrap` de `apps/api/package.json` aponta para `dist/cli/admin-bootstrap.js`

### Implementation for User Story 3

- [X] T072 [US3] Implementar `AdminBootstrapService.run({email, printLink, operator: {host, user}})` em `apps/api/src/modules/admin-bootstrap/admin-bootstrap.service.ts` (FR-031–FR-036, R14), devolvendo `{outcome: "REFUSED"} | {outcome: "GRANTED", userId} | {outcome: "PENDING", expiresAt, link?, mailDelivered, cancelledPrevious}`:
  numa `runInTransaction` com `advisoryXactLock(tx, ADMIN_BOOTSTRAP_LOCK)`: (1) ADMIN ativo (helper `hasActiveAdmin(tx)` exportado, usado também em T073) → auditar `admin.bootstrap.refused` e devolver `REFUSED`; (2) `PENDING` existente → `CANCELLED` (`cancelledAt`, `tokenHash` mantido só para lookup falhar) + `admin.bootstrap.cancelled` (`SUPERSEDED`, ator `OPERATOR`); (3) `findByEmail`: verificado → `RoleRepository.grant(tx, id, "ADMIN", null, "ADMIN_BOOTSTRAP")`, linha `COMPLETED` (`targetUserId`, `completedAt`, sem token), `requested` (`DIRECT_GRANT`), `role.granted` (ator `OPERATOR`) e `completed` (`DIRECT_GRANT`); senão → token (`generateToken`), linha `PENDING` (`tokenHash`, `expiresAt` +24 h, `targetUserId` do não verificado se houver, `linkPrinted`), `requested` (`ACTIVATION_LINK`) e, se `printLink`, `link_printed`;
  (4) depois do commit, no caso `PENDING`: `await mailer.send({to, template: "admin-activation", params: {link, expiresAt}})` em `try/catch` → `mailDelivered`; `link` só no resultado quando `printLink`. Criar `apps/api/src/modules/admin-bootstrap/admin-bootstrap.module.ts` e importá-lo no `AppModule`
- [X] T073 [US3] Implementar ativação em `apps/api/src/modules/admin-bootstrap/admin-activation.service.ts` e `admin-activation.controller.ts`:
  `preview(token, ctx)` → `PublicRateLimit.enforce("admin_activation", hashToken(token), ctx)`; linha `PENDING` com `tokenHash` e `expiresAt > now()` senão `tokenInvalid()`; devolve `{email, mode: RoleGrantAcceptance.resolveMode(tx, email)}`;
  `activate(token, password, ctx)` → mesmo rate limit; transação com `ADMIN_BOOTSTRAP_LOCK` e `SELECT … FROM admin_bootstraps WHERE token_hash = $1 FOR UPDATE`; `COMPLETED` cujo `targetUserId` é o usuário da sessão → `{role: "ADMIN"}` sem efeitos; qualquer outro estado, expirado ou inexistente → `tokenInvalid()`; ADMIN já ativo → marcar `CANCELLED` + `admin.bootstrap.cancelled` (`ADMIN_ALREADY_ACTIVE`, ator `SYSTEM`), confirmar a transação e só então lançar `bootstrapAlreadyDone()`; senão `RoleGrantAcceptance.accept(tx, {email, roleKey: "ADMIN", displayName: parte local do e-mail, password, currentUserId: ctx.auth?.userId, issuerUserId: null, via: "ADMIN_BOOTSTRAP", requestId})`, linha → `COMPLETED` (`targetUserId`, `completedAt`) e `admin.bootstrap.completed` (`{bootstrapId, mode}`, ator `ANONYMOUS`); erros de `accept` desfazem tudo e mantêm o token utilizável;
  generalizar `PublicRateLimit.enforce(flow, target, ctx)` (renomear o parâmetro `email` → `target`, flow `"admin_activation"` com escopo de auditoria `admin_activation_origin`|`admin_activation_token`) sem alterar o comportamento de US1;
  controller `@Controller("admin-activation")`, `@Public()`: `POST preview` (`200`, `z.strictObject({token: tokenSchema})`) e `POST /` (`200`, `z.strictObject({token: tokenSchema, password: passwordInputSchema.optional()})`) → `{role: "ADMIN"}`; acrescentar as duas rotas ao `route-declarations.spec.ts`
- [X] T074 [US3] Implementar o CLI (contracts/cli-admin-bootstrap.md) em `apps/api/src/cli/admin-bootstrap.command.ts` (`parseAdminBootstrapArgs(argv)` estrito: só `--email <v>`/`--email=<v>` validado por `emailSchema` e `--print-link`; ignora `--`; e `runAdminBootstrapCli(argv, env, io, {mailer?})`: `loadConfig(env)` (erro → exit 1 genérico), `NestFactory.createApplicationContext(AppModule.forRoot({...config, maintenanceIntervalSeconds: 0}))` com `Mailer` substituível pelo parâmetro (via `overrideProvider`-equivalente: `AppModule.forRoot` aceita `mailer?` em `AppModuleOptions`), operador `os.hostname()` + `os.userInfo().username`, mensagens e exit codes `0/1/2/3` do contrato, nunca lê credenciais de env/arquivo nem imprime o token sem `--print-link`) e `apps/api/src/cli/admin-bootstrap.ts` (entrada que chama `process.exit(code)`, como `maintenance.ts`); o script `admin:bootstrap` já existe
- [X] T075 [P] [US3] Criar `apps/web/app/(public)/ativar-admin/page.tsx` (Server Component, `metadata.referrer = "no-referrer"`, lê `searchParams.token`) + `ativar-admin/admin-activation.tsx` (Client): guarda o token em `sessionStorage` (`devtrack.admin-activation-token`) e remove-o da URL; faz `POST /api/admin-activation/preview` uma vez; por `mode`: `CREATE_ACCOUNT`/`CLAIM_ACCOUNT` → formulário de senha (12–128, `autoComplete="new-password"`, aviso de que sessões antigas serão encerradas no `CLAIM`); `SIGN_IN_REQUIRED` → explicação + link `/entrar?next=/ativar-admin` (o token fica no `sessionStorage`) e botão "Concluir ativação" quando já autenticado; `TOKEN_INVALID` → orientação para pedir novo comando ao operador; `409 BOOTSTRAP_ALREADY_DONE`, `WRONG_ACCOUNT` e `429` com a mensagem da API; sucesso → limpa o `sessionStorage` e mostra link para `/entrar`; `lib/auth-api.ts` ganha `previewAdminActivation` e `activateAdmin`; `Referrer-Policy: no-referrer` para `/ativar-admin` em `apps/web/next.config.js`; teste de componente com `vitest-axe` em `apps/web/app/(public)/ativar-admin/ativar-admin.test.tsx` (por modo, corpo enviado só `{token, password}` ou `{token}`, erros no resumo, sem violações)

**Checkpoint**: P1 completo — plataforma instalável com primeiro ADMIN — `pnpm --filter api test`,
`pnpm --filter web test` e `turbo run lint check-types test` verdes

---

## Phase 6: User Story 4 - ADMIN provisiona MANAGER (Priority: P2)

**Goal**: ADMIN convida, reenvia, revoga, desativa e reativa MANAGERs; infraestrutura
genérica de convites (criação e aceitação) nasce aqui.

**Independent Test**: ADMIN convida MANAGER, pessoa aceita e define senha, MANAGER
tem só `professores.*`; outros papéis → 403; desativação revoga sessões; autoconvite
recusado; último ADMIN protegido.

**Já disponível (reutilizar, não recriar)**: tabela `invitations` (`Invitation`: `email`, `displayName`,
`roleId`, `invitedById`, `tokenHash` UNIQUE, `status` `PENDING|ACCEPTED|EXPIRED|REVOKED`, `expiresAt`,
`sendCount`, `lastSentAt`, `acceptedAt`/`acceptedByUserId`, `revokedAt`/`revokedById`; UNIQUE parcial
`(email, role_id) WHERE status = 'PENDING'`; CHECK de `ACCEPTED`); `RoleGrantAcceptance.resolveMode/accept`
(modos, `SELF_INVITE_FORBIDDEN` quando o aceitante é o emissor, `ensureTeacherProfile` para `TEACHER`,
audita `role.granted`/`account.claimed`); `RoleLifecycleService.changeStatus(tx, userId, roleKey, to, actorId,
{requestId})` (404 sem atribuição, `409 INVALID_STATE_TRANSITION`, revoga sessões `ROLE_DEACTIVATED` ao sair
de `ACTIVE`, audita `role.status_changed`) e `assertAnotherActiveAdmin(tx, excludingUserId)` (`ADMIN_GUARD_LOCK`,
lança `LAST_ADMIN_PROTECTED`); `SessionService.revokeAllForUser`; `UserRepository.setStatus`; `PublicRateLimit`
(US3, alvo genérico); `webLinks` (acrescentar `invitation(token)` → `${WEB_ORIGIN}/convite?token=`);
`MailDispatcher.send` com templates `invitation-manager`/`invitation-teacher` (`{displayName, link, expiresAt}`);
erros `selfInviteForbidden`, `alreadyManager`, `invitationAlreadyPending`, `selfActionForbidden`,
`lastAdminProtected`, `invalidStateTransition`, `notFound`; eventos `invitation.created|resent|revoked|accepted|
acceptance_refused|self_invite_blocked`, `account.suspended|reactivated|last_admin_protected` no catálogo;
`findOwnedOrNotFound`; nos testes `createUser({roles})`, `loginAs`, `api()`. Na web: `components/form`,
`lib/api-client`, `lib/session` (`getMe`, `serverApiBaseUrl`), padrão de `/ativar-admin` (token em
`sessionStorage`, `next` sem token).

**Decisões desta fase**: convite de `MANAGER` para e-mail que já tem atribuição `MANAGER` (qualquer status)
→ `409 ALREADY_MANAGER` (inativo se resolve com reativação); recusas que precisam ser auditadas
(`invitation.self_invite_blocked`, `invitation.acceptance_refused`, `account.last_admin_protected`) e a
expiração preguiçosa (`EXPIRED`) são gravadas em transação própria, confirmada antes da resposta de erro;
`GET /users` pagina por cursor opaco (`base64url` de `{createdAt, id}`, ordem `createdAt desc, id desc`,
50 por página; cursor inválido → `400 VALIDATION_ERROR`); suspender a própria conta → `403
SELF_ACTION_FORBIDDEN` antes de qualquer outra regra.

### Tests for User Story 4 ⚠️

> Escrever primeiro; devem falhar (rotas inexistentes → 404) antes de T078–T081.

- [X] T076 [P] [US4] Testes de integração US4-1…US4-6 em `apps/api/test/integration/us4-manager-provisioning.spec.ts` (ADMIN via `createUser({roles: ["ADMIN"]})` + `loginAs`):
  (US4-1) `POST /api/manager-invitations {email, displayName}` → `201 InvitationView` (`{id, email, displayName, role: "MANAGER", status: "PENDING", expiresAt ≈ +7 d, sendCount: 1, lastSentAt, invitedBy: {id, name}}`, sem `token`/`tokenHash`); e-mail `invitation-manager` com `${WEB_ORIGIN}/convite?token=…`; evento `invitation.created` (`{role, email}`, ator `USER`); `GET /api/manager-invitations?status=PENDING` lista o convite; campo extra ou e-mail inválido → `400`;
  (US4-2) `POST /api/invitations/preview {token}` → `{role: "MANAGER", email, displayName, mode: "CREATE_ACCOUNT"}`; `POST /api/invitations/accept {token, password}` → `200 {role: "MANAGER", mode}`; `User` verificado com `MANAGER` `ACTIVE` (`grantedVia INVITATION`, `grantedById` = ADMIN), convite `ACCEPTED` com `acceptedByUserId`, evento `invitation.accepted` (`{role, userId, mode}`); após login, `GET /api/me` traz exatamente as permissões do MANAGER em `contracts/permissions.md` (`professores.*` + `sessoes.proprias.*`); os modos `CLAIM_ACCOUNT` (sessões antigas revogadas) e `SIGN_IN_REQUIRED` (sem sessão `401`, outra conta `403 WRONG_ACCOUNT`, própria conta `200` sem trocar senha) também concedem `MANAGER`; cada recusa grava `invitation.acceptance_refused` (`reason`); replay sem sessão → `400 TOKEN_INVALID`; replay pela conta aceitante autenticada → `200` sem novos efeitos; duas aceitações concorrentes (`Promise.all`) → uma atribuição e um `User`;
  (US4-3) MANAGER, TEACHER e STUDENT em `POST /api/manager-invitations`, `GET /api/managers`, `POST /api/managers/:id/deactivate`, `GET /api/users` → `403 FORBIDDEN`; sem sessão → `401`;
  (US4-4) `POST /api/managers/:userId/deactivate` → `200 ManagerView` (`status: "INACTIVE"`), sessões do MANAGER → `401`, depois de novo login `GET /api/me` sem `professores.*`; convites emitidos por ele e eventos de auditoria preservados; `reactivate` → `ACTIVE` e capacidades de volta sem novo convite; desativar de novo um inativo → `409 INVALID_STATE_TRANSITION`; `userId` sem papel MANAGER (ex.: um aluno) → `404`;
  (US4-5) `POST /api/users/:id/suspend` na própria conta → `403 SELF_ACTION_FORBIDDEN`; com dois ADMINs, A suspende B → `200`, sessões de B revogadas (`ACCOUNT_SUSPENDED`), `account.suspended`; com B suspenso, uma chamada que tentasse suspender o único ADMIN ativo restante (A, por um segundo ADMIN criado com papel `SUSPENDED` não conta) → `409 LAST_ADMIN_PROTECTED` + `account.last_admin_protected` (`{operation: "SUSPEND"}`) persistido; `reactivate` → `ACTIVE`; reativar conta ativa → `409 INVALID_STATE_TRANSITION`;
  (US4-6) ADMIN convidando o próprio e-mail (com variação de caixa) → `403 SELF_INVITE_FORBIDDEN`, nenhum convite, `invitation.self_invite_blocked` (`{role: "MANAGER"}`) persistido; convite a quem já tem `MANAGER` → `409 ALREADY_MANAGER`; segundo convite `PENDING` para o mesmo e-mail → `409 INVITATION_ALREADY_PENDING` (também sob `Promise.all`); aceite pelo próprio emissor (convite inserido via Prisma com `invitedById` = aceitante) → `403 SELF_INVITE_FORBIDDEN` + `acceptance_refused` (`SELF_INVITE`);
  `GET /api/users?query=` (ADMIN) → `UserAccountView[]` (`{id, name, email, emailVerified, status, roles, createdAt}`, sem perfis ou dados acadêmicos) filtrando por nome/e-mail, com `nextCursor` que percorre 120 contas em 3 páginas sem repetir; `GET /api/users/:id` inexistente → `404`;
  rate limit (FR-022): o mesmo token inválido em `POST /api/invitations/accept` 5 vezes → `400 TOKEN_INVALID` genérico e a 6ª → `429 RATE_LIMITED` (movido de T061)
- [X] T077 [P] [US4] Testes do ciclo de convite genérico em `apps/api/test/integration/invitation-lifecycle.spec.ts` e unitário `apps/api/src/modules/provisioning/invitation.state-machine.spec.ts`: máquina de estados (`PENDING → ACCEPTED|REVOKED|EXPIRED`, `PENDING → PENDING` no reenvio; qualquer transição a partir de terminal → `409 INVALID_STATE_TRANSITION`); `POST /api/manager-invitations/:id/resend` → novo token (antigo em preview/accept → `TOKEN_INVALID`), `expiresAt` renovado, `sendCount` + 1, `lastSentAt` atualizado, novo e-mail, `invitation.resent` (`{sendCount}`); `revoke` → `REVOKED` com `revokedAt`/`revokedById`, token → `TOKEN_INVALID`, `invitation.revoked`; reenviar/revogar `ACCEPTED`, `REVOKED` ou `EXPIRED` → `409 INVALID_STATE_TRANSITION`; id inexistente → `404`; convite com `expires_at` no passado (via SQL): preview/accept → `400 TOKEN_INVALID` e a linha fica `EXPIRED`; listagem com `?status=EXPIRED` o inclui (e trata `PENDING` vencido como `EXPIRED`) e permite criar novo convite para o mesmo e-mail; `?status=` inválido → `400`

### Implementation for User Story 4

- [X] T078 [US4] Implementar o núcleo de convites em `apps/api/src/modules/provisioning/` (FR-040–FR-043, FR-049):
  `invitation.state-machine.ts` (`InvitationStateMachine.assertTransition(from, to)` no mesmo estilo de `RoleAssignmentStateMachine`); `invitation.view.ts` (`toInvitationView(row)` → `InvitationView` do contrato, nunca token/hash);
  `invitation.service.ts` — `INVITATION_TTL_MS` (7 d); `create(tx, {email, displayName, roleKey: "MANAGER"|"TEACHER", issuer: {id, email}, requestId})`: normaliza e-mail; e-mail == do emissor → `selfInviteForbidden()` (o chamador audita `invitation.self_invite_blocked` em transação própria); `expireDue(tx, {email, roleKey})` antes de inserir; `INSERT` via `createManyAndReturn({skipDuplicates: true})` e, se nada inserido, `invitationAlreadyPending()`; token `generateToken()`, só `hashToken` no banco; audita `invitation.created`; devolve `{invitation, token}`; `resend(tx, id, scope, actor)` / `revoke(tx, id, scope, actor)` com `SELECT … FOR UPDATE`, expiração preguiçosa, `InvitationStateMachine`, auditoria (`invitation.resent` com `sendCount` / `invitation.revoked`); `list(scope, status?)` com `PENDING` vencido exibido como `EXPIRED`; `scope = {roleKey, issuerId?}` (para MANAGER, `issuerId` fica `undefined` = todos os de `MANAGER`); `sendInvitationMail(invitation, token)` via `MailDispatcher.send` (`invitation-manager`/`invitation-teacher`) chamado após o commit;
  `findForAcceptance(tx, token)` → `SELECT … FROM invitations WHERE token_hash = $1 FOR UPDATE` com o papel; `PENDING` vencido → marcar `EXPIRED` e sinalizar ao chamador para confirmar antes de responder `TOKEN_INVALID`
- [X] T079 [US4] Implementar a aceitação (FR-044–FR-049) em `apps/api/src/modules/provisioning/invitation-acceptance.service.ts` e `invitation-acceptance.controller.ts`:
  `preview(token, ctx)` → `PublicRateLimit.enforce("invitation_preview", hashToken(token), ctx)`; convite `PENDING` válido senão `tokenInvalid()` (persistindo `EXPIRED` quando for o caso); devolve `{role, email, displayName, mode: RoleGrantAcceptance.resolveMode(tx, email)}`;
  `accept(token, password, ctx)` → rate limit `"invitation_accept"` por `hashToken(token)`; transação: `findForAcceptance`; `ACCEPTED` com `acceptedByUserId` = usuário da sessão → `{role, mode}` sem efeitos; qualquer outro estado → `tokenInvalid()`; senão `RoleGrantAcceptance.accept(tx, {email, roleKey, displayName, password, currentUserId, issuerUserId: invitedById, via: "INVITATION", requestId})`, convite → `ACCEPTED` (`acceptedAt`, `acceptedByUserId`), `invitation.accepted` (`{role, userId, mode}`, ator `USER` com sessão ou `ANONYMOUS`); `SELF_INVITE_FORBIDDEN`/`SIGN_IN_REQUIRED`/`WRONG_ACCOUNT` → auditar `invitation.acceptance_refused` (`reason`) em transação própria e relançar; demais erros (`PASSWORD_REQUIRED`, `WEAK_PASSWORD`) só relançam, token continua válido;
  estender `PublicFlow`/`TARGET_KIND` de `apps/api/src/modules/auth/public-rate-limit.ts` com `invitation_preview` e `invitation_accept` (alvo `token`); controller `@Controller("invitations")`, `@Public()`: `POST preview` (`200`, `{token}`) e `POST accept` (`200`, `{token, password?}`), schemas estritos; registrar em `ProvisioningModule` (controllers + providers) e acrescentar as rotas ao `route-declarations.spec.ts`
- [X] T080 [US4] Implementar `ManagersService` e `ManagersController` em `apps/api/src/modules/provisioning/managers.service.ts` e `managers.controller.ts`:
  `list()` → `ManagerView[]` (`{userId, name, email, status}` de todos com atribuição `MANAGER`, qualquer status, ordenados por nome); `invite({email, displayName}, auth, ctx)` → em transação: e-mail já com atribuição `MANAGER` → `alreadyManager()`; `InvitationService.create(... roleKey: "MANAGER")`; após commit `sendInvitationMail`; `SELF_INVITE_FORBIDDEN` → auditar `invitation.self_invite_blocked` (`{role: "MANAGER"}`) em transação própria e relançar; `listInvitations(status?)`, `resend(id)`, `revoke(id)` (escopo `roleKey MANAGER`: convite de outro papel → `404`); `deactivate(userId)`/`reactivate(userId)` → `RoleLifecycleService.changeStatus(tx, userId, "MANAGER", "INACTIVE"|"ACTIVE", actorId, {requestId})` e `ManagerView`;
  rotas do contrato com `@RequirePermissions` `managers.visualizar|convidar|reenviar_convite|revogar_convite|desativar|ativar`, `:id`/`:userId` validados como UUID, `POST /manager-invitations` → `201`; registrar no `ProvisioningModule` e no `route-declarations.spec.ts`
- [X] T081 [US4] Implementar contas de usuário (FR-052, FR-054, FR-056) em `apps/api/src/modules/accounts/accounts.service.ts`, `accounts.controller.ts` e `accounts.module.ts` (importado no `AppModule`):
  `list({query?, cursor?})` → `{items: UserAccountView[], nextCursor: string | null}` com filtro `ILIKE` em nome/e-mail (escapando `%`/`_`), ordem e cursor conforme as decisões desta fase; `get(id)` → `UserAccountView` ou `404`;
  `suspend(id, auth, ctx)`: `id === auth.userId` → `selfActionForbidden()`; transação: `SELECT … FROM users WHERE id FOR UPDATE` (inexistente → `404`); já `SUSPENDED` → `invalidStateTransition()`; se tem `ADMIN` `ACTIVE` → `RoleLifecycleService.assertAnotherActiveAdmin(tx, id)` (em `LAST_ADMIN_PROTECTED`, auditar `account.last_admin_protected` (`{operation: "SUSPEND"}`) em transação própria e relançar); `UserRepository.setStatus(tx, id, "SUSPENDED")`, `revokeAllForUser(tx, id, "ACCOUNT_SUSPENDED")`, `session.revoked_all` quando `count > 0`, `account.suspended`;
  `reactivate(id, auth, ctx)`: `SUSPENDED → ACTIVE` (outro estado → `409`), `account.reactivated`, sem restaurar sessões;
  controller: `GET /users` e `GET /users/:id` com `usuarios.visualizar`; `POST /users/:id/suspend` com `usuarios.suspender`; `POST /users/:id/reactivate` com `usuarios.reativar`; `query` ≤ 120 caracteres, `cursor` string opcional, schemas estritos; registrar no `route-declarations.spec.ts`
- [X] T082 [P] [US4] Web (FR-075; sem regra de negócio nos componentes; `permissions` de `getMe()` só decidem o que mostrar, a API autoriza):
  `apps/web/lib/server-api.ts` — `serverGet<T>(path)` que encaminha o cookie (generalizando `getOwnSessions` de `lib/session.ts`); `lib/admin-api.ts` — chamadas de managers, convites e contas + tipos `ManagerView`, `InvitationView`, `UserAccountView`, `InvitationPreview`;
  `apps/web/app/admin/managers/page.tsx` + `managers-admin.tsx` (Client) — sem sessão → `/entrar?next=/admin/managers`; sem `managers.visualizar` → aviso "Você não tem acesso a esta área."; tabela de MANAGERs com "Desativar"/"Reativar"; formulário "Convidar MANAGER" (`displayName`, `email`) com `SELF_INVITE_FORBIDDEN`/`ALREADY_MANAGER`/`INVITATION_ALREADY_PENDING` no `ErrorSummary`; tabela de convites com "Reenviar"/"Revogar" por linha (nomes acessíveis com o e-mail);
  `apps/web/app/admin/usuarios/page.tsx` + `users-admin.tsx` — busca por nome/e-mail, "Carregar mais" com `nextCursor`, "Suspender"/"Reativar" por conta, erros `SELF_ACTION_FORBIDDEN`/`LAST_ADMIN_PROTECTED` visíveis;
  `apps/web/app/(public)/convite/page.tsx` + `invitation-acceptance.tsx` — mesmo padrão de `/ativar-admin` (token em `sessionStorage` `devtrack.invitation-token`, `Referrer-Policy: no-referrer` em `next.config.js` e `metadata`), mostra papel e `displayName` do convite, senha para `CREATE_ACCOUNT`/`CLAIM_ACCOUNT`, `/entrar?next=%2Fconvite` + "Aceitar convite" para `SIGN_IN_REQUIRED`, erros genéricos;
  `proxy.ts` passa a cobrir também `/admin/:path*`; cabeçalho de `app/layout.tsx` mostra "Managers"/"Usuários" quando `me.permissions` tem `managers.visualizar`/`usuarios.visualizar`;
  testes com `vitest-axe` e `fetch` simulado em `app/admin/managers/managers.test.tsx`, `app/admin/usuarios/usuarios.test.tsx` e `app/(public)/convite/convite.test.tsx` (corpos enviados, erros no resumo com foco, sem violações) e atualização de `proxy.test.ts`

**Checkpoint**: ADMIN consegue colocar MANAGERs em operação — `pnpm --filter api test`,
`pnpm --filter web test` e `turbo run lint check-types test` verdes

---

## Phase 7: User Story 5 - MANAGER convida professor (Priority: P2)

**Goal**: MANAGER (e ADMIN) gerencia o cadastro docente — convites e ciclo de vida do
papel `TEACHER` — sem enxergar alunos.

**Independent Test**: MANAGER cria, reenvia, revoga convite, consulta status, suspende,
desativa, reativa professor; qualquer operação sobre contas de alunos → 403; aluno
existente não é revelado.

**Já disponível (reutilizar, não recriar)**: `InvitationService` (US4) — `create(tx, {email, displayName,
roleKey: "TEACHER", issuer, requestId})` (autoconvite → `SELF_INVITE_FORBIDDEN`, expiração preguiçosa,
`INVITATION_ALREADY_PENDING`, auditoria `invitation.created`), `resend/revoke(tx, id, scope, actor)`,
`list(scope, status?)` (status efetivo), `sendInvitationMail` (template `invitation-teacher`); `toInvitationView`,
`effectiveStatus`, `INVITATION_INCLUDE`, `invitationStatusQuerySchema` (exportado de `managers.controller.ts`);
`InvitationAcceptanceService` + rotas `/invitations/preview|accept` (já concedem `TEACHER` e criam
`TeacherProfile` via `RoleGrantAcceptance`); `RoleLifecycleService.changeStatus(tx, userId, "TEACHER", to,
actorId, {requestId})` (`ACTIVE ⇄ SUSPENDED`, `→ INACTIVE → ACTIVE`, revoga sessões `ROLE_DEACTIVATED` ao
sair de `ACTIVE`, `409 INVALID_STATE_TRANSITION`, `404` sem atribuição); padrão de `ManagersService`
(auditoria de `invitation.self_invite_blocked` em transação própria); erros `alreadyTeacher()` e
`teacherReactivationRequired()`; nos testes `createUser({roles: [..., {key: "TEACHER", status}]})` (cria
`TeacherProfile`), `loginAs`, `api()`. Web: padrão de `/admin/managers` (`serverGet`, `NoAccess`,
`aria-label` nos botões de linha, `ErrorSummary`), `lib/admin-api.ts`.

**Decisões desta fase**: o escopo docente é compartilhado — qualquer portador de `professores.*` (MANAGER
ou ADMIN, FR-005) vê todos os professores e reenvia/revoga qualquer convite de `TEACHER`, não só os que
emitiu (a permissão é a barreira; o emissor fica em `invitedBy`); a checagem de autoconvite vem antes de
`ALREADY_TEACHER`/`TEACHER_REACTIVATION_REQUIRED`; convite para e-mail de aluno ou de qualquer conta sem
atribuição `TEACHER` segue exatamente o caminho de e-mail sem conta (FR-043) — no aceite a pessoa cai no
modo `SIGN_IN_REQUIRED` ou `CLAIM_ACCOUNT`; `displayName` de `TeacherView`/`TeacherListItem` vem de
`TeacherProfile` (ou do convite, para `INVITED`), nunca de `User.name`.

### Tests for User Story 5 ⚠️

> Escrever primeiro; devem falhar (rotas inexistentes → 404) antes de T084–T086.

- [X] T083 [P] [US5] Testes de integração US5-1…US5-12 em `apps/api/test/integration/us5-teacher-invitations.spec.ts` (MANAGER via `createUser({roles: ["MANAGER"]})` + `loginAs`; também repetir o caminho feliz com ADMIN, FR-005):
  (US5-1) `POST /api/teacher-invitations {email, displayName}` → `201 InvitationView` (`role: "TEACHER"`, `expiresAt` ≈ +7 d), e-mail `invitation-teacher`; `GET /api/teachers` traz `{userId: null, invitationId, displayName, email, status: "INVITED"}`; `?status=INVITED` filtra; após o aceite (`POST /api/invitations/accept`) o item vira `{userId, invitationId: null, status: "ACTIVE"}` com `displayName` do convite (também em `TeacherProfile`);
  (US5-2) `POST /api/teacher-invitations/:id/resend` → token antigo `TOKEN_INVALID` em preview, novo funciona, `sendCount: 2`; (US5-3) `revoke` → `REVOKED` e o item `INVITED` some da lista;
  (US5-4) e-mail de aluno existente × e-mail sem conta → mesmo status e mesmo corpo exceto `id`, `email`, `expiresAt`, `lastSentAt`; nenhum dos dois revela conta; aceite do aluno exige a sessão dele (`SIGN_IN_REQUIRED`) e depois ele tem `STUDENT` e `TEACHER` ativos;
  (US5-5) MANAGER em `GET /api/users` e `GET /api/users/:id` de um aluno → `403 FORBIDDEN` (nunca `200` com lista vazia); `GET /api/teachers/:userId` de um aluno → `404 NOT_FOUND` idêntico ao de UUID inexistente;
  (US5-6) professor que também é `STUDENT`, com sessão aberta: `POST /api/teachers/:userId/deactivate` → `200 TeacherView` `INACTIVE`, sessão → `401`, `STUDENT` continua `ACTIVE`, `TeacherProfile` preservado, `role.status_changed`; `suspend` de ativo → `SUSPENDED` com sessões revogadas;
  (US5-7) `reactivate` de `SUSPENDED` e de `INACTIVE` → `ACTIVE`, mesma identidade e mesmo `TeacherProfile` (contagem de perfis e usuários inalterada); transições inválidas (`suspend` de `INACTIVE`, `reactivate` de `ACTIVE`) → `409 INVALID_STATE_TRANSITION`;
  (US5-8) MANAGER em `POST /api/users/:id/suspend`, `POST /api/manager-invitations`, `POST /api/managers/:id/deactivate` → `403`; nenhuma rota registrada permite alterar a senha de outra pessoa (via `DiscoveryService`, nenhuma rota autenticada com `password` no caminho);
  (US5-9) MANAGER convidando o próprio e-mail → `403 SELF_INVITE_FORBIDDEN` + `invitation.self_invite_blocked` (`{role: "TEACHER"}`); convite de `TEACHER` inserido via Prisma com o e-mail do MANAGER e `invitedById` = MANAGER → aceite pelo próprio MANAGER → `403 SELF_INVITE_FORBIDDEN`, nenhum `TEACHER`;
  (US5-10) `GET /api/teachers/:userId` de professor que também é `STUDENT` e `MANAGER` → exatamente as chaves `{userId, displayName, email, status, invitations}`, sem `roles`, sem `STUDENT`/`MANAGER` em lugar algum do corpo; `invitations` traz os convites de `TEACHER` daquele e-mail;
  (US5-11) após criar convite, cadastro, login e bootstrap, nenhuma coluna de texto de `invitations`, `user_tokens`, `sessions` e `admin_bootstraps` contém algum dos tokens/segredos emitidos (consulta `row_to_json(t)::text LIKE '%'||token||'%'`), só seus hashes;
  (US5-12) e-mail com `TEACHER` `ACTIVE` → `409 ALREADY_TEACHER`; `SUSPENDED` ou `INACTIVE` → `409 TEACHER_REACTIVATION_REQUIRED`; nenhum convite criado;
  STUDENT e TEACHER em `GET /api/teachers` e `POST /api/teacher-invitations` → `403`; `?status=` inválido → `400`

### Implementation for User Story 5

- [X] T084 [US5] Implementar `TeachersService` em `apps/api/src/modules/provisioning/teachers.service.ts` (FR-050, FR-051, FR-007):
  tipos `TeacherView` (`{userId, displayName, email, status, invitations: InvitationView[]}`) e `TeacherListItem` (`{userId: string|null, invitationId: string|null, displayName, email, status: "INVITED"|"ACTIVE"|"SUSPENDED"|"INACTIVE"}`) exportados;
  `list(status?)`: atribuições `TEACHER` (qualquer status) com `TeacherProfile.displayName` e `User.email` + convites `TEACHER` com status efetivo `PENDING` cujo e-mail não tem atribuição `TEACHER` (itens `INVITED`, `userId: null`); filtro por `status`; ordenação por `displayName` e depois e-mail;
  `get(userId)`: consulta já escopada a quem tem atribuição `TEACHER` (senão `findOwnedOrNotFound` → `404`), com os convites `TEACHER` do e-mail (mais recentes primeiro) via `toInvitationView`;
  `setStatus(userId, "SUSPENDED"|"INACTIVE"|"ACTIVE", auth, requestId)` → `RoleLifecycleService.changeStatus(tx, userId, "TEACHER", to, auth.userId, {requestId})` e devolve `get(userId)`
- [X] T085 [US5] Implementar `TeacherInvitationsService` em `apps/api/src/modules/provisioning/teacher-invitations.service.ts` (FR-040, FR-040a, FR-042, FR-043):
  `invite({email, displayName}, auth, requestId)` → busca e-mail do emissor; transação: e-mail ≠ do emissor e com atribuição `TEACHER` `ACTIVE` → `alreadyTeacher()`, `SUSPENDED`/`INACTIVE` → `teacherReactivationRequired()`; qualquer outra conta (aluno, MANAGER, sem papel) segue sem consulta adicional para `InvitationService.create(tx, {..., roleKey: "TEACHER"})`; após commit `sendInvitationMail`; `SELF_INVITE_FORBIDDEN` → `invitation.self_invite_blocked` (`{role: "TEACHER"}`) em transação própria e relança;
  `list(status?)`, `resend(id)`, `revoke(id)` com escopo `{roleKey: "TEACHER"}` (convite de outro papel → `404`), `resend` reenviando o e-mail após o commit
- [X] T086 [US5] Implementar os controllers em `apps/api/src/modules/provisioning/teachers.controller.ts` (`GET /teachers?status=` e `GET /teachers/:userId` com `professores.visualizar`; `POST /teachers/:userId/suspend|deactivate|reactivate` com `professores.suspender|desativar|ativar`, `200 TeacherView`) e `teacher-invitations.controller.ts` (`GET /teacher-invitations?status=` com `professores.visualizar`; `POST /teacher-invitations` `201` com `professores.convidar` e `z.strictObject({email: emailSchema, displayName: nameSchema})`; `POST /teacher-invitations/:id/resend|revoke` `200` com `professores.reenviar_convite|revogar_convite`); `:userId`/`:id` validados como UUID; `?status=` de `/teachers` aceita `INVITED|ACTIVE|SUSPENDED|INACTIVE`; registrar serviços e controllers em `ProvisioningModule` e as 9 rotas em `route-declarations.spec.ts`
- [X] T087 [P] [US5] Web do cadastro docente (FR-075; sem regra de negócio no componente):
  `apps/web/lib/admin-api.ts` ganha `TeacherListItem`, `TeacherView` e as chamadas de `/teachers` e `/teacher-invitations`;
  `apps/web/app/professores/page.tsx` (Server Component: sem sessão → `/entrar?next=%2Fprofessores`; sem `professores.visualizar` → `NoAccess`; carrega `GET /teachers` via `serverGet`) + `professores/teachers-admin.tsx` (Client): filtro por situação (`Todos`, `Convidado`, `Ativo`, `Suspenso`, `Inativo`) que refaz a consulta; tabela com nome, e-mail, situação e ações por linha — `INVITED`: "Reenviar convite"/"Revogar convite" (pelo `invitationId`); `ACTIVE`: "Suspender"/"Desativar"; `SUSPENDED`: "Reativar"/"Desativar"; `INACTIVE`: "Reativar" (todas com `aria-label` incluindo o nome); formulário "Convidar professor" (`displayName`, `email`) com `ALREADY_TEACHER`, `TEACHER_REACTIVATION_REQUIRED`, `SELF_INVITE_FORBIDDEN` e `INVITATION_ALREADY_PENDING` ligados ao campo e-mail no `ErrorSummary`; após convidar/agir, recarrega a lista; anúncios em `aria-live`;
  `proxy.ts` cobre `/professores/:path*` (e `proxy.test.ts`); cabeçalho mostra "Professores" quando `me.permissions` tem `professores.visualizar`;
  teste de componente com `vitest-axe` e `fetch` simulado em `apps/web/app/professores/professores.test.tsx` (ações por status, corpo do convite só `{email, displayName}`, erros com foco, sem violações)

**Checkpoint**: MANAGER opera o cadastro docente de ponta a ponta — `pnpm --filter api test`,
`pnpm --filter web test` e `turbo run lint check-types test` verdes

---

## Phase 8: User Story 6 - Pessoa aceita convite de professor com identidade única (Priority: P2)

**Goal**: aceitação de convite de `TEACHER` nos três ramos, sem duplicação, replay ou
tomada de conta.

**Independent Test**: três ramos, replay, concorrência, conta errada, senha ignorada,
pré-registro por atacante.

**Já disponível (entregue na US4/US5; esta fase comprova e fecha lacunas)**: `POST /api/invitations/preview|accept`
(`InvitationAcceptanceService`: linha do convite `FOR UPDATE`, replay idempotente só para a conta aceitante
autenticada, `TOKEN_INVALID` genérico para expirado/revogado/substituído/adulterado, expiração preguiçosa persistida,
recusas `SELF_INVITE`/`SIGN_IN_REQUIRED`/`WRONG_ACCOUNT` auditadas em transação própria, rate limit por token);
`RoleGrantAcceptance` (modos `CREATE_ACCOUNT` — `User` verificado com `name = displayName`; `SIGN_IN_REQUIRED` —
senha enviada ignorada; `CLAIM_ACCOUNT` — nova senha, e-mail verificado, sessões revogadas `ACCOUNT_CLAIMED`,
`account.claimed`; `ensureTeacherProfile(tx, userId, displayName)` com `createMany skipDuplicates`);
`TeacherInvitationsService` (`POST /api/teacher-invitations`); schemas estritos (campo extra → `400`); tela
`/convite` (token em `sessionStorage`, `next=%2Fconvite`, modos, erros genéricos). Nos testes: `createUser`,
`loginAs`, `api()`, `uniqueEmail`, `InMemoryMailer.lastTokenFor(email, "invitation-teacher")`, cadastro real via
`POST /api/auth/signup` para simular o atacante.

**Lacunas conhecidas que esta fase fecha (T090)**: no ramo `CLAIM_ACCOUNT`, os tokens pendentes da conta
(`user_tokens` `EMAIL_VERIFICATION`/`PASSWORD_RESET` não usados) continuam válidos e o `User.name` continua sendo o
escolhido por quem pré-registrou a conta.

**Decisões desta fase**: ao assumir a conta (`CLAIM_ACCOUNT`, convites e ativação de ADMIN), todos os tokens pendentes
da conta são invalidados e `User.name` passa a ser o `displayName` do convite (na ativação de ADMIN, a parte local do
e-mail, como em US3); o papel `STUDENT` e o `StudentProfile` criados pelo pré-registro são mantidos (não há como
distinguir um cadastro legítimo, e `STUDENT` não dá acesso privilegiado), com o `displayName` do perfil de aluno
também substituído; a tela `/convite` não usa `?next=/convite?token=…` (o token nunca vai para a URL de login) — o
retorno do login recupera o token do `sessionStorage`.

### Tests for User Story 6 ⚠️

> Escrever primeiro. Os cenários já cobertos pela US4 devem passar de imediato; os de T090 (tokens pendentes, nome
> e perfil do pré-registro) devem falhar até a implementação.

- [X] T088 [P] [US6] Testes de integração US6-1…US6-10 via HTTP em `apps/api/test/integration/us6-teacher-acceptance.spec.ts` (convites emitidos por um MANAGER com `POST /api/teacher-invitations`; token lido do `InMemoryMailer`):
  (US6-1) e-mail novo → `POST /api/invitations/accept {token, password}` → `200 {role: "TEACHER", mode: "CREATE_ACCOUNT"}`; `User` verificado com `name` = `displayName` do convite, `TEACHER` `ACTIVE` (`grantedVia INVITATION`, `grantedById` = MANAGER), `TeacherProfile.displayName` = do convite, convite `ACCEPTED` com `acceptedByUserId`; nenhuma sessão criada (sem `Set-Cookie`); login com a senha escolhida funciona;
  (US6-2) aluno verificado autenticado → mesmo `id`, papéis `STUDENT` + `TEACHER` `ACTIVE`, `StudentProfile` intacto, `TeacherProfile` criado com o `displayName` do convite, `passwordHash` inalterado, sessão atual continua válida;
  (US6-3) sem sessão → `401 SIGN_IN_REQUIRED`; autenticado em outra conta → `403 WRONG_ACCOUNT`; em ambos nenhuma atribuição `TEACHER` em conta alguma e o convite continua `PENDING` e aceitável pelo dono;
  (US6-4) conta não verificada com 2 sessões → `CLAIM_ACCOUNT` com nova senha: mesmo `id`, `emailVerifiedAt` preenchido, as 2 sessões → `401`, senha antiga → `401 INVALID_CREDENTIALS`, nova → `200`; `TEACHER` + `TeacherProfile`; `account.claimed` (`{via: "INVITATION", revokedSessions: 2}`); sem senha → `400 PASSWORD_REQUIRED` e senha fraca → `400 WEAK_PASSWORD` sem efeito algum (convite segue `PENDING`, sessões intactas);
  (US6-5) replay: com a conta aceitante autenticada → `200` sem novos registros; sem sessão ou com outra conta → `400 TOKEN_INVALID`; contagens de `users`, `teacher_profiles`, `user_roles` e eventos `invitation.accepted` inalteradas;
  (US6-6) `Promise.all` de 5 aceites `CREATE_ACCOUNT` do mesmo token → exatamente um `200`, os demais `400 TOKEN_INVALID`; um `User`, um `TeacherProfile`, uma atribuição `TEACHER`, um `invitation.accepted`; também com 2 aceites `SIGN_IN_REQUIRED` concorrentes da mesma conta → uma atribuição;
  (US6-7) expirado (via SQL), revogado, substituído por reenvio e adulterado → `400 TOKEN_INVALID` com corpo idêntico entre si e sem e-mail/nome no corpo; o expirado fica `EXPIRED` no banco;
  (US6-8) corpo com `email` de outra pessoa (ou `userId`/`role`) → `400 VALIDATION_ERROR`, nada atribuído; aceite válido só atribui à identidade do e-mail convidado mesmo quando a sessão enviada é de outra conta (→ `WRONG_ACCOUNT`);
  (US6-9) conta verificada autenticada enviando `password` nova → `200`, login com a senha nova → `401`, com a antiga → `200`;
  (US6-10) atacante faz `POST /api/auth/signup` com o e-mail do professor (nome "Atacante") e `POST /api/auth/login` (sessão aberta); o dono aceita com nova senha → sessão do atacante `401`, senha do atacante `401 INVALID_CREDENTIALS`, `account.claimed` auditado; token de verificação enviado ao cadastro do atacante → `400 TOKEN_INVALID`; `User.name` e `StudentProfile.displayName` passam a ser o `displayName` do convite (sem "Atacante" em `GET /api/me` do dono)
- [X] T089 [P] [US6] Teste agregado SC-011 em `apps/api/test/security/us6-account-takeover.spec.ts`: para cada vetor — (a) pré-registro não verificado com sessão, (b) aceite com a própria sessão de outra conta, (c) replay do link já aceito por um terceiro que o interceptou depois, (d) autoconvite do MANAGER e aceite pelo emissor, (e) reenvio de verificação disparado pelo atacante antes do aceite (tokens de redefinição de senha entram na US8, T096) — o atacante termina sem sessão válida, sem `TEACHER` em conta alguma sob seu controle, sem conseguir entrar com a senha que escolheu e sem token utilizável; relatório ao final de cada caso por meio de asserções sobre `sessions`, `user_roles`, `user_tokens` (não usados e não invalidados = 0 para a conta assumida) e `audit_events`

### Implementation for User Story 6

- [X] T090 [US6] Fechar as lacunas do ramo `CLAIM_ACCOUNT` em `apps/api/src/modules/provisioning/role-grant-acceptance.service.ts` (vale para convites e ativação de ADMIN):
  invalidar os tokens pendentes da conta (`tx.userToken.updateMany({where: {userId, usedAt: null, invalidatedAt: null}, data: {invalidatedAt: now}})`) na mesma transação; `tx.user.update({where: {id}, data: {name: input.displayName}})`; se existir `StudentProfile`, `displayName` ← `input.displayName`; acrescentar `invalidatedTokens` ao retorno (`AcceptResult`) sem mudar os metadados de `account.claimed` (catálogo fechado);
  ajustar `RoleGrantAcceptance`/`InvitationAcceptanceService` para qualquer outro comportamento que T088/T089 revelarem, sem alterar o contrato HTTP; atualizar `apps/api/test/integration/role-grant-acceptance.spec.ts` com os casos novos do `CLAIM_ACCOUNT`
- [X] T091 [P] [US6] Completar a tela `/convite` para `TEACHER` em `apps/web/app/(public)/convite/page.tsx` e `invitation-acceptance.tsx`:
  `page.tsx` chama `getMe()` (tolerando falha → `null`) e passa `signedInAs: {name, email} | null` ao componente; no modo `SIGN_IN_REQUIRED` o componente mostra "Você está conectado como {email}" — se for o e-mail convidado, só o botão "Aceitar convite"; se for outro, aviso de que é preciso entrar com a conta do convite, botão "Sair e entrar com outra conta" (`POST /api/auth/logout` → `/entrar?next=%2Fconvite`) e nenhum botão de aceite; sem sessão, link "Entrar para aceitar"; no modo `CLAIM_ACCOUNT`, aviso explícito de que a senha anterior deixará de funcionar e todas as sessões serão encerradas; após o aceite de `TEACHER`, mensagem de boas-vindas ao papel e link para `/entrar` (ou para `/` quando já autenticado);
  atualizar `apps/web/app/(public)/convite/convite.test.tsx` (conectado com a conta certa, com outra conta, sem sessão; aviso do `CLAIM_ACCOUNT`; sem violações axe)

**Checkpoint**: provisionamento de professores seguro e idempotente — `pnpm --filter api test`,
`pnpm --filter web test` e `turbo run lint check-types test` verdes

---

## Phase 9: User Story 7 - Autorização por capacidade e contexto no backend (Priority: P2)

**Goal**: garantir 401/403/404 em toda rota, por chamada direta à API.

**Independent Test**: matriz rota × papel da `contracts/permissions.md` executada
integralmente.

**Já disponível (reutilizar, não recriar)**: guards globais `OriginGuard → SessionGuard (401) → VerifiedGuard
(403 EMAIL_NOT_VERIFIED) → PermissionsGuard (403 FORBIDDEN)` antes de qualquer `ZodValidationPipe` (400), então um
corpo vazio `{}` e um UUID aleatório isolam a decisão dos guards sem efeitos colaterais; `PermissionResolver`
(permissões lidas do banco a cada requisição); `findOwnedOrNotFound`/`ResourceContextPolicy`; `registeredRoutes()`
(`test/helpers/routes.ts`, com `isPublic`); `route-declarations.spec.ts` (toda rota declara acesso); `createUser({roles,
verified, status})`, `loginAs`, `api(t, {cookie, origin})` (envia `Origin` permitido por padrão; `origin: null` omite,
string troca). Já cobertos em outras fases e **não repetir**: formato de `UserAccountView` e cursor (US4, T076), sessão
de outro usuário → 404 (US2, T060), `/teachers/:userId` de aluno → 404 (US5, T083). Web: `/admin/usuarios` e os links
do cabeçalho por permissão já existem (US4/US5).

**Decisões desta fase**: a matriz de teste é uma tabela escrita à mão a partir de `contracts/permissions.md` (não
derivada do seed), para que um desvio do seed quebre o teste; "permitido" significa status fora de `{401, 403}` (o
corpo `{}`/UUID aleatório leva a `400`/`404`, que vêm depois dos guards); rotas públicas ficam fora da matriz de papéis,
mas entram nas checagens de completude e de `Origin`.

### Tests for User Story 7 ⚠️

> Escrever primeiro. Espera-se que passem com a implementação atual; qualquer falha revela um furo de autorização e
> deve ser corrigida no módulo da rota, no mesmo commit.

- [X] T092 [P] [US7] Matriz de autorização em `apps/api/test/security/us7-authorization-matrix.spec.ts` (US7-1, US7-2, SC-003):
  tabela `MATRIX: {method, path, access: "session" | Permission}[]` cobrindo todas as rotas não públicas (`GET /me`, `POST /auth/logout`, `POST /auth/logout-all`, `GET /me/sessions`, `GET|DELETE /me/sessions/:id`, as 9 de professores, as 7 de managers, as 4 de `/users`), com `:id`/`:userId` = UUID aleatório e corpo `{}`; `ROLE_PERMISSIONS` escrito a partir da tabela "Papéis → permissões" do contrato;
  principais criados uma vez por arquivo: anônimo, STUDENT, TEACHER, MANAGER, ADMIN (verificados) e STUDENT não verificado; `it.each` por (rota × principal): anônimo → `401 UNAUTHENTICATED`; não verificado → `access: "session"` permitido, `perm:*` → `403 EMAIL_NOT_VERIFIED`; demais → `403 FORBIDDEN` quando o papel não tem a permissão, senão status ∉ `{401, 403}`;
  `logout`/`logout-all` executados por último para cada principal (ou com sessão descartável criada por `loginAs` a cada caso), para não derrubar as demais chamadas
- [X] T093 [P] [US7] Contexto, papéis e origem em `apps/api/test/security/us7-context-and-roles.spec.ts` (US7-3…US7-5, FR-060–FR-063):
  (US7-4) `STUDENT + TEACHER` → `GET /api/me` com a união (`sessoes.proprias.*`, sem `professores.*`); `STUDENT + MANAGER` → `professores.*` e `GET /api/teachers` `200`; papel `SUSPENDED`/`INACTIVE` não contribui;
  (US7-5, sem novo login) aluno verificado com sessão aceita convite de `MANAGER` no modo `SIGN_IN_REQUIRED` → com o **mesmo cookie**, `GET /api/teachers` passa de `403` para `200`; atribuição `MANAGER` marcada `INACTIVE` direto no banco (sem revogar sessões) → mesmo cookie volta a `403`; `ADMIN` desativando o MANAGER pela API → sessões `401` e, com nova sessão, `403` (caso obrigatório do contrato);
  (US7-3) política de contexto reutilizável: um `ResourceContextPolicy` de teste (fixture controller com `@RequirePermissions("sessoes.proprias.listar")` que usa `findOwnedOrNotFound`) → recurso alheio e inexistente dão o mesmo `404`, sem permissão → `403` antes do contexto (ordem 401 → 403 → 404);
  (CSRF) para cada rota `POST`/`DELETE` de `registeredRoutes()` (públicas incluídas), `Origin` ausente ou `https://evil.example` → `403 ORIGIN_NOT_ALLOWED` com cookie válido de ADMIN e nenhum efeito (contagens de `invitations`, `sessions` revogadas e `audit_events` inalteradas); `GET` sem `Origin` continua aceito
- [X] T094 [P] [US7] Guardas de regressão em `apps/api/test/security/us7-matrix-completeness.spec.ts`:
  toda rota não pública de `registeredRoutes()` aparece exatamente uma vez em `MATRIX` e toda entrada de `MATRIX` existe (exportar `MATRIX` e `ROLE_PERMISSIONS` de `apps/api/test/security/authorization-matrix.ts`, usado também por T092), para que uma rota nova não escape da matriz;
  para cada papel, as permissões de uma conta com só aquele papel `ACTIVE` (`GET /api/me`) são exatamente `ROLE_PERMISSIONS[papel]` (desvio do seed → falha); nenhuma permissão do seed fica sem uso: cada chave de `PERMISSIONS` é exigida por pelo menos uma rota de `MATRIX`
- [X] T095 [P] [US7] Web — navegação só por UX (a API continua autorizando):
  extrair o cabeçalho de `apps/web/app/layout.tsx` para `apps/web/components/site-nav.tsx` (`SiteNav({me})`, sem `fetch`), mantendo os links "Professores" (`professores.visualizar`), "Gestores" (`managers.visualizar`), "Usuários" (`usuarios.visualizar`), "Minhas sessões" + "Sair" para quem tem sessão e "Entrar"/"Criar conta" para anônimos; teste `apps/web/components/site-nav.test.tsx` com `vitest-axe` para anônimo, STUDENT, TEACHER, MANAGER e ADMIN (conjunto exato de links de cada um, conforme `ROLE_PERMISSIONS` do contrato) e para e-mail não verificado (sem links administrativos mesmo com permissões — `emailVerified: false` esconde tudo que exige `perm:*`)

**Checkpoint**: nenhuma rota contornável por chamada direta — `pnpm --filter api test`,
`pnpm --filter web test` e `turbo run lint check-types test` verdes

---

## Phase 10: User Story 8 - Usuário recupera o acesso com "esqueci minha senha" (Priority: P2)

**Goal**: recuperação de senha por link de uso único, com revogação de sessões.

**Independent Test**: pedir para e-mail existente e inexistente (respostas iguais),
redefinir, sessões antigas revogadas, nova senha funciona, replay recusado.

**Já disponível (reutilizar, não recriar)**: `UserTokenService.issue(tx, userId, "PASSWORD_RESET")` (invalida o
anterior, TTL 1 h em `USER_TOKEN_TTL_MS`) e `consume(tx, token, "PASSWORD_RESET")` (UPDATE condicional atômico);
`PublicRateLimit.enforce(flow, target, ctx)` (acrescentar flows); `PasswordPolicy.validate`, `PasswordHasher.hash`;
`UserRepository.findByEmail/setPassword/markEmailVerified`; `SessionService.revokeAllForUser(tx, userId,
"PASSWORD_RESET")`; `MailDispatcher.send` com o template `password-reset` (`{name, link}`); `PUBLIC_ACCEPTED_MESSAGE`
e `webLinks` de `signup.service.ts`; eventos `password_reset.requested` (só quando a conta existe) e
`password_reset.completed` (`{revokedSessions}`) no catálogo; `AuthController` (US2); na web `lib/auth-api.ts`,
`components/form`, o padrão de `/verificar-email` e `/ativar-admin` (token tirado da URL, `Referrer-Policy`), e o link
"Esqueci minha senha" em `/entrar` (já aponta para `/esqueci-senha`).

**Decisões desta fase**: o link de redefinição é `${WEB_ORIGIN}/redefinir-senha?token=…` (novo `webLinks.passwordResetConfirm`;
`webLinks.passwordReset` continua apontando para `/esqueci-senha` no e-mail de cadastro duplicado); conta suspensa recebe o
link e pode trocar a senha, mas continua `SUSPENDED` (login → `403 ACCOUNT_SUSPENDED`); a política de senha é validada
**antes** de consumir o token, então senha fraca não queima o link; ao concluir, os demais tokens pendentes da conta
(ex.: verificação de e-mail) também são invalidados; a revogação fica registrada em `password_reset.completed`
(`revokedSessions`), sem `session.revoked_all` duplicado; `confirm` responde `200 {message}` e não cria sessão.

### Tests for User Story 8 ⚠️

> Escrever primeiro; devem falhar (rotas inexistentes → 404) antes de T097–T098.

- [X] T096 [P] [US8] Testes US8-1…US8-6 em `apps/api/test/integration/us8-password-reset.spec.ts` e anti-enumeração/rate limit em `apps/api/test/security/us8-password-reset-security.spec.ts`:
  (US8-1) `POST /api/auth/password-reset/request {email}` para e-mail existente (com variação de caixa/espaços) e inexistente → status `202`, corpo e cabeçalhos idênticos (exceto `X-Request-Id`); só o existente recebe `password-reset` com `${WEB_ORIGIN}/redefinir-senha?token=…`; `UserToken PASSWORD_RESET` só com hash, `expiresAt` ≈ +1 h; `password_reset.requested` só para o existente, sem e-mail no `metadata`; mediana de latência dos dois caminhos dentro de um fator 3; corpo com campo extra → `400`;
  (US8-2) `POST /api/auth/password-reset/confirm {token, password}` → `200 {message}`, sem `Set-Cookie`; todas as sessões → `401` (`revokeReason = PASSWORD_RESET`); senha antiga → `401 INVALID_CREDENTIALS`, nova → `200`; `password_reset.completed` (`{revokedSessions: n}`, ator `ANONYMOUS`, alvo `USER`); senha fraca → `400 WEAK_PASSWORD` e o mesmo token continua funcionando depois;
  (US8-3) conta não verificada → após a redefinição `emailVerified: true` e o token de verificação pendente fica invalidado;
  (US8-4) replay do token usado, token expirado (via SQL, e também `expires_at` = criação + 1 h − 1 s ainda válido), adulterado e substituído por nova solicitação → `400 TOKEN_INVALID` com corpo idêntico; formato inválido → `400 VALIDATION_ERROR`; duas confirmações simultâneas do mesmo token → exatamente uma `200`;
  (US8-5) conta `SUSPENDED` com papéis `TEACHER`/`MANAGER` → redefinição `200`, conta continua `SUSPENDED`, login com a nova senha → `403 ACCOUNT_SUSPENDED`, `user_roles` inalterados (status e quantidade);
  (US8-6) com `testConfig({rateLimit: {...base, publicTarget: 2}})`: a 3ª solicitação para o mesmo e-mail → `429 RATE_LIMITED` + `Retry-After`, idêntica para e-mail existente e inexistente, e nenhum e-mail a mais enviado; a 3ª confirmação com o mesmo token inválido → `429`; bloqueios auditados em `auth.rate_limit.blocked` (`scope` `password_reset_email`/`password_reset_confirm_token`) sem e-mail/IP; logs e `audit_events` sem senha, token ou hash do token

### Implementation for User Story 8

- [X] T097 [US8] Implementar `PasswordResetService` em `apps/api/src/modules/auth/password-reset.service.ts` (FR-029a–e):
  `request(email, ctx)` → `normalizeEmail`; `PublicRateLimit.enforce("password_reset", email, ctx)`; transação: `findByEmail`; se existir → `UserTokenService.issue(tx, id, "PASSWORD_RESET")` + `password_reset.requested` (ator `ANONYMOUS`, alvo `USER`); após o commit `MailDispatcher.send({template: "password-reset", params: {name, link: webLinks.passwordResetConfirm(token)}})`; sempre devolve `{message: PUBLIC_ACCEPTED_MESSAGE}`;
  `confirm(token, password, ctx)` → `PublicRateLimit.enforce("password_reset_confirm", hashToken(token), ctx)`; `PasswordPolicy.validate(password)` e `hash` **antes** da transação; transação: `consume(tx, token, "PASSWORD_RESET")` (nulo → `tokenInvalid()`), `setPassword`, `markEmailVerified`, invalidar os demais `user_tokens` pendentes da conta, `revokeAllForUser(tx, userId, "PASSWORD_RESET")`, `password_reset.completed` (`{revokedSessions}`); não toca `status` nem `user_roles`; devolve `{message: "Senha redefinida. Entre com a nova senha."}`;
  acrescentar `password_reset` (alvo `email`) e `password_reset_confirm` (alvo `token`) a `PublicFlow`/`TARGET_KIND` em `apps/api/src/modules/auth/public-rate-limit.ts`, `passwordResetConfirm(token)` a `webLinks` em `signup.service.ts`, e registrar o serviço em `AuthModule`
- [X] T098 [US8] Adicionar ao `apps/api/src/modules/auth/auth.controller.ts` (controller fino, `@Public()`): `POST /auth/password-reset/request` (`@HttpCode(202)`, `z.strictObject({email: emailSchema})`) e `POST /auth/password-reset/confirm` (`@HttpCode(200)`, `z.strictObject({token: tokenSchema, password: passwordInputSchema})`), ambos com `@Ctx()`; acrescentar as duas rotas ao `route-declarations.spec.ts`; a completude da matriz (US7) continua verde por serem públicas
- [X] T099 [P] [US8] Web (FR-075; sem regra de negócio no componente):
  `apps/web/lib/auth-api.ts` ganha `requestPasswordReset(email)` e `confirmPasswordReset(token, password)`;
  `apps/web/app/(public)/esqueci-senha/page.tsx` + `forgot-password-form.tsx` (Client) — campo e-mail, após `202` substitui o formulário pela mensagem genérica da API com foco nela (validade de 1 hora), `429` com minutos de espera;
  `apps/web/app/(public)/redefinir-senha/page.tsx` (Server Component, `metadata.referrer = "no-referrer"`, lê `searchParams.token`) + `reset-password-form.tsx` (Client) — tira o token da URL (`history.replaceState`), campos "Nova senha" e "Confirme a nova senha" (12–128 e iguais, só UX), aviso de que todas as sessões serão encerradas, envia só `{token, password}`; sucesso → mensagem com link para `/entrar`; `TOKEN_INVALID` → orientação com link para `/esqueci-senha`; `WEAK_PASSWORD` ligado ao campo; sem token → mesma orientação;
  `Referrer-Policy: no-referrer` para `/redefinir-senha` em `apps/web/next.config.js`;
  testes com `vitest-axe` e `fetch` simulado em `apps/web/app/(public)/esqueci-senha/esqueci-senha.test.tsx` e `apps/web/app/(public)/redefinir-senha/redefinir-senha.test.tsx` (corpos enviados, confirmação divergente não envia, erros com foco, sem violações)

**Checkpoint**: todas as user stories funcionais e testadas — `pnpm --filter api test`,
`pnpm --filter web test` e `turbo run lint check-types test` verdes

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
