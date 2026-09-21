# Research: 001 — Foundation, Identity & Access

**Date**: 2026-09-21 | **Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

Cada decisão resolve uma incógnita do *Technical Context* ou uma escolha deixada pela
spec para o plano. Formato: **Decision / Rationale / Alternatives considered**.

---

## R1. Runtime e toolchain TypeScript

- **Decision**: Node.js 24 LTS (já exigido por `engines` no `package.json` raiz);
  TypeScript 7 (versão do monorepo). `apps/api` compila com **SWC** (builder do Nest
  CLI) e faz *type-check* separado com `tsc --noEmit`, usando `experimentalDecorators`.
- **Rationale**: NestJS depende de decorators legados e de `emitDecoratorMetadata`;
  delegar a emissão ao SWC isola a API de diferenças do compilador nativo do TS 7, e o
  `tsc` continua sendo a porta de tipos. SWC também acelera testes.
- **Alternatives considered**: `tsc` como emissor (acopla a emissão de metadata ao
  TS 7); `ts-node`/`tsx` em produção (sem build reproduzível).
- **Risco / fallback**: se o `tsc` 7 recusar alguma opção de decorators em
  `check-types`, fixar `typescript@~5.9` apenas em `apps/api` (devDependency local)
  e registrar em Complexity Tracking. O ambiente local atual está em Node 22 —
  a quickstart exige Node 24.

## R2. Framework HTTP da API

- **Decision**: NestJS 11 sobre Express (`@nestjs/platform-express`), prefixo global
  `/api`, sem versionamento de URL nesta fase.
- **Rationale**: stack mandatória (constituição); Express é o adapter padrão, com
  ecossistema de cookies e `trust proxy` conhecido.
- **Alternatives considered**: Fastify adapter (ganho de desempenho irrelevante para a
  escala da fase; mais fricção com middlewares); `/api/v1` (YAGNI — não há cliente
  externo).

## R3. Persistência

- **Decision**: PostgreSQL 17 + Prisma ORM 7 (generator `prisma-client`, driver
  adapter `@prisma/adapter-pg`, `prisma.config.ts`). Regras que o Prisma não expressa
  (índices únicos parciais, trigger append-only de auditoria, seed de papéis e
  permissões) entram como SQL nas migrations (`prisma migrate dev --create-only` +
  edição).
- **Rationale**: stack mandatória; integridade garantida no banco (Princípio V) —
  unicidade de e-mail, de `UserRole` por par, de perfil por usuário, de convite
  pendente e de bootstrap pendente não depende só da aplicação.
- **Alternatives considered**: extensão `citext` para e-mail (desnecessária: o e-mail
  é normalizado na aplicação e guardado já em minúsculas, com `UNIQUE`); validações
  só na aplicação (violam V e falham sob concorrência).

## R4. Hash de senha e política de senha

- **Decision**: **Argon2id** (pacote `argon2`) com parâmetros OWASP mínimos
  (m = 19 MiB, t = 2, p = 1), centralizados em configuração e com *rehash* no login
  quando os parâmetros mudarem. Senha 12–128 caracteres (FR-011), sem regras de
  composição, e rejeitada se constar da lista das 10 000 senhas mais comuns
  (SecLists, licença MIT) empacotada com a API.
- **Rationale**: Argon2id é a recomendação primária do OWASP Password Storage Cheat
  Sheet; lista local evita dependência de rede (HIBP) no caminho do cadastro.
- **Alternatives considered**: bcrypt (limite de 72 bytes conflita com senhas de até
  128 caracteres); scrypt (válido, porém menos recomendado); consulta HIBP k-anonymity
  (adiciona dependência externa e ponto de falha — reavaliar futuramente).

## R5. Sessões

- **Decision**: sessões **opacas no servidor**. Segredo de 32 bytes aleatórios
  (`crypto.randomBytes`), enviado em cookie `__Host-devtrack_session` (`HttpOnly`,
  `Secure`, `SameSite=Lax`, `Path=/`); o banco guarda apenas `SHA-256(segredo)`. O
  `id` (UUID) da linha é o identificador público não secreto (FR-027). Expiração:
  8 h de inatividade (via `lastUsedAt`) e 7 dias absolutos (FR-024). `lastUsedAt` é
  atualizado no máximo uma vez por minuto por sessão para evitar escrita a cada
  requisição.
- **Rationale**: revogação imediata (FR-025, FR-026, SC-007) exige estado no servidor;
  segredo de alta entropia dispensa hash lento. Cookie `__Host-` impede injeção por
  subdomínio.
- **Alternatives considered**: JWT de acesso + refresh (revogação imediata exigiria
  denylist — o mesmo estado, com mais complexidade); `express-session` (armazena o id
  em claro e acopla ao middleware); Redis como store (constituição IX: sem requisito
  concreto).

## R6. Topologia web ↔ API e CSRF

- **Decision**: o Next.js (`apps/web`) faz *rewrite* de `/api/:path*` para a API, de
  modo que o navegador fala com uma única origem e o cookie é first-party. Proteção
  CSRF: `SameSite=Lax` + verificação do cabeçalho `Origin` (lista permitida por
  configuração) em todo método não seguro + exigência de `Content-Type:
  application/json`.
- **Rationale**: elimina CORS com credenciais; as três barreiras juntas cobrem CSRF
  clássico sem token sincronizador.
- **Alternatives considered**: API em outra origem com CORS `credentials: true`
  (superfície maior, cookies `SameSite=None`); double-submit token (redundante com a
  checagem de `Origin` nesta topologia).

## R7. Tokens de uso único (verificação, redefinição, convite, ativação)

- **Decision**: 32 bytes aleatórios em base64url; armazenado `SHA-256(token)` com
  `UNIQUE`. Verificação e redefinição ficam em `UserToken` (coluna `purpose`), com
  índice único parcial garantindo no máximo um token ativo por usuário e finalidade —
  emitir um novo invalida o anterior na mesma transação. Convites e bootstrap guardam
  o hash na própria linha. O token vai na URL da página web (`?token=`), com
  `Referrer-Policy: no-referrer`, e é enviado à API no corpo do `POST`. Comparação por
  lookup do hash (sem comparação de strings em tempo variável).
- **Rationale**: atende FR-013, FR-029b, FR-041, FR-034 e US5-11 (nenhum token
  recuperável no banco).
- **Alternatives considered**: tokens assinados sem estado (JWT) — não permitem uso
  único nem invalidação por reenvio sem estado; HMAC com pepper — sem ganho real para
  tokens de 256 bits.

## R8. Rate limiting

- **Decision**: implementação própria sobre PostgreSQL (tabela `RateLimitCounter`,
  janela fixa, *upsert* atômico `INSERT … ON CONFLICT … DO UPDATE`). Chaves são
  `HMAC-SHA-256(APP_HMAC_SECRET, escopo:valor)` — nunca e-mail ou IP em claro. Limites
  (FR-022):
  - `login:email+ip` — 5 falhas / 15 min → bloqueio dessa combinação;
  - `login:ip` e demais endpoints sensíveis por IP — 20 tentativas / 15 min;
  - `login:email` (todas as origens) — a partir da 5ª falha, atraso progressivo
    (`min(250 ms · 2^(n−5), 8 s)`) antes de responder, e evento de auditoria
    `auth.rate_limit.alert` ao cruzar 10 falhas; **nunca bloqueia**, garantindo US2-4.
  - Cadastro, reenvio de verificação, recuperação, aceite de convite e ativação: por
    IP (20/15 min) e por e-mail alvo (5/15 min), sempre com a mesma resposta pública.
  A origem é o IP do cliente com `trust proxy` configurado explicitamente
  (`TRUST_PROXY_HOPS`). Contadores expirados são removidos oportunisticamente.
- **Rationale**: dispensa Redis (IX); o banco já é dependência; contadores por
  e-mail+origem evitam que um atacante bloqueie o dono da conta.
- **Alternatives considered**: `@nestjs/throttler` (não modela e-mail+origem nem atraso
  progressivo sem storage customizado — acabaria sendo o mesmo código); Redis
  (infraestrutura nova sem necessidade).

## R9. Autorização (RBAC + contexto)

- **Decision**:
  - Guard global **deny-by-default**: toda rota exige sessão válida, conta `ACTIVE` e
    e-mail verificado, salvo decorators explícitos `@Public()` e
    `@AllowUnverified()` (FR-016, FR-060).
  - `@RequirePermissions('professores.convidar', …)` + `PermissionsGuard`: permissões
    efetivas = união das permissões dos `UserRole` `ACTIVE`, carregadas do banco a
    cada requisição (uma consulta com join; sem cache → FR-063).
  - Contexto de recurso: serviços carregam recursos por meio de consultas *escopadas*
    (ex.: `sessions.findOwned(userId, sessionId)`), e ausência vira
    `ResourceNotFoundException` (404). Uma interface `ResourceContextPolicy` fica
    documentada para a Spec 002 (turma/matrícula), sem implementações antecipadas.
  - Nomes de permissão em português, `recurso.acao`, alinhados à constituição.
- **Rationale**: FR-060–FR-063; o 403 × 404 fica decidido em camadas distintas
  (guard → 403; serviço escopado → 404).
- **Alternatives considered**: CASL/bibliotecas de policy (dependência sem necessidade);
  checagem por nome de papel (proibido pelo Princípio II); cache de permissões na
  sessão (quebraria FR-063).

## R10. Validação de entrada

- **Decision**: **Zod** com um `ZodValidationPipe` próprio; schemas `.strict()` —
  campos desconhecidos (`role`, `roles`, `permissions`, `isAdmin` …) fazem a requisição
  ser **rejeitada** com `400 VALIDATION_ERROR` (US1-2 permite "ignorados ou
  rejeitados"; rejeitar é mais explícito e testável). Normalização de e-mail
  (`trim` + `toLowerCase`) acontece no schema.
- **Rationale**: tipos inferidos a partir do schema, sem decorators de classe; o mesmo
  mecanismo valida a configuração (R13).
- **Alternatives considered**: `class-validator` (com `whitelist` só ignora campos,
  exige DTOs em classe); pacote compartilhado de schemas web+API (IX — o web faz
  apenas validação de UX; a API é a autoridade).

## R11. E-mail transacional

- **Decision**: porta `Mailer` na aplicação; implementação SMTP com `nodemailer`.
  Desenvolvimento usa **Mailpit** (docker compose) — e-mails capturados localmente;
  testes usam `InMemoryMailer`. Envio acontece **após o commit** da transação; falha no
  envio é logada (sem o link) e o usuário/emissor pode reenviar (edge case "falha no
  envio de e-mail").
- **Rationale**: atende a Assumption da spec sem acoplar a um provedor; SMTP é
  suportado por qualquer provedor de produção.
- **Alternatives considered**: outbox transacional com worker (YAGNI nesta fase — o
  estado já é consistente e há reenvio); SDK de provedor específico.

## R12. Logs e auditoria

- **Decision**:
  - Logs técnicos: `pino` via `nestjs-pino`, JSON estruturado, `requestId` por
    requisição (aceita `X-Request-Id` apenas se for UUID válido), `redact` de
    `req.headers.cookie`, `req.headers.authorization`, `res.headers["set-cookie"]` e de
    qualquer campo `password`, `token`, `secret`. Corpo de requisição nunca é logado.
  - Auditoria: tabela `AuditEvent` separada, escrita pelo `AuditService` **na mesma
    transação** da operação auditada (quando há transação); trigger de banco impede
    `UPDATE` e `DELETE` (append-only). Metadados passam por *allowlist* de chaves por
    tipo de evento.
  - SC-005: helper de teste captura o stream do pino e as linhas de `AuditEvent` de
    cada teste e procura os segredos gerados (senha, tokens, segredo de sessão).
- **Rationale**: FR-070–FR-072; auditoria transacional evita operação sem registro.
- **Alternatives considered**: auditoria no log técnico (constituição exige
  separação); `winston` (pino é mais simples e rápido com redact nativo).

## R13. Configuração

- **Decision**: schema Zod para `process.env`, avaliado antes de o Nest subir; falha
  lista as variáveis ausentes/invalidas sem ecoar valores. Variáveis: `DATABASE_URL`,
  `APP_HMAC_SECRET` (≥ 32 bytes), `WEB_ORIGIN`, `ALLOWED_ORIGINS`, `SMTP_URL`,
  `MAIL_FROM`, `TRUST_PROXY_HOPS`, `NODE_ENV`, `LOG_LEVEL`. `.env.example` sem valores
  reais.
- **Rationale**: FR-074 e constituição (fail fast).
- **Alternatives considered**: `@nestjs/config` + Joi (duas bibliotecas de validação
  no mesmo projeto).

## R14. Bootstrap do primeiro ADMIN

- **Decision**: script `pnpm admin:bootstrap --email <e-mail> [--print-link]` que
  inicia um `NestFactory.createApplicationContext` (sem servidor HTTP) e chama
  `AdminBootstrapService`. Concorrência: transação com
  `pg_advisory_xact_lock(<chave fixa de bootstrap>)` + índice único parcial "no máximo
  um `PENDING`". Dentro do lock: se existir `ADMIN` `ACTIVE` → recusa; se houver
  `PENDING` → `CANCELLED` (+ auditoria); então:
  - e-mail de `User` verificado → concede `ADMIN` imediatamente (`COMPLETED`), sem
    link, sem alterar a senha (FR-035);
  - caso contrário → novo `PENDING` com token de ativação (24 h), enviado por e-mail;
    `--print-link` também imprime o link e gera `admin.bootstrap.link_printed`.
  A **ativação** (`POST /api/admin-activation`) reutiliza a mesma lógica de aceitação
  de convite (R15): cria o `User` se não existir, ou assume com segurança o `User` não
  verificado (nova senha + revogação de sessões). O "ADMIN pendente" é representado
  pelo `AdminBootstrap PENDING`; o `UserRole ADMIN` só nasce na ativação — assim
  cancelar um pendente nunca deixa papel órfão e nunca há dois `ADMIN`s pendentes.
  A origem operacional auditada é `OPERATOR` + hostname + usuário do SO.
- **Rationale**: FR-030–FR-036; nenhuma rota HTTP cria `ADMIN` — a rota de ativação
  só conclui um bootstrap já emitido pelo comando, com token de posse do e-mail.
- **Alternatives considered**: criar o `User` já no comando (deixa identidades órfãs
  quando o bootstrap é cancelado); senha digitada no terminal (a credencial deixaria de
  pertencer à pessoa e passaria pelo operador).

## R15. Aceitação de convite (identidade única e anti-takeover)

- **Decision**: serviço único `RoleGrantAcceptance` usado por convite de `TEACHER`,
  convite de `MANAGER` e ativação de bootstrap. Transação com
  `SELECT … FOR UPDATE` na linha do convite/bootstrap; `UNIQUE(userId, roleId)` em
  `UserRole` e `UNIQUE(userId)` nos perfis cobrem a concorrência residual (conflito →
  releitura → resultado idempotente). Ramos:
  1. **e-mail sem `User`** → cria `User` verificado com a senha informada, papel e
     perfil (FR-046);
  2. **`User` verificado** → exige sessão dessa mesma conta; campo `password` é
     ignorado (o schema aceita mas descarta); outra conta autenticada → recusa
     (FR-047);
  3. **`User` não verificado** → exige nova senha, marca verificado, revoga todas as
     sessões e concede papel + perfil (FR-048).
  Antes dos ramos: emissor == aceitante → recusa (FR-040a). Replay de convite
  `ACCEPTED` → resposta genérica sem efeitos (FR-049), exceto quando o próprio
  aceitante autenticado repete → `200` idempotente.
  A pré-visualização (`POST /api/invitations/preview`) informa ao portador do token
  qual ramo se aplica (`CREATE_ACCOUNT`, `SIGN_IN_REQUIRED`, `CLAIM_ACCOUNT`) — o
  portador comprovou posse do e-mail, então isso não é enumeração.
- **Rationale**: FR-044–FR-049, US6-1…US6-10, SC-011.
- **Alternatives considered**: três endpoints distintos por ramo (o cliente escolheria
  o ramo — risco de confiança no cliente).

## R16. Anti-enumeração e tempo de resposta

- **Decision**: cadastro, reenvio, recuperação respondem `202` com corpo fixo; o
  trabalho variável (hash de senha no cadastro, envio de e-mail) é feito de modo que o
  caminho "e-mail existente" também execute um hash Argon2 equivalente; login com
  e-mail inexistente verifica contra um hash dummy pré-computado. E-mails são enviados
  após a resposta (`setImmediate` pós-commit), evitando diferença de latência de SMTP.
- **Rationale**: SC-006 (mesmo conteúdo e mesma ordem de grandeza de tempo).
- **Alternatives considered**: atraso aleatório fixo (mascara mal e piora UX).

## R17. Testes

- **Decision**: **Vitest** (+ `unplugin-swc` para decorators) em `apps/api`:
  - unitários para regras puras (política de senha, máquinas de estado, cálculo de
    rate limit, permissões efetivas);
  - integração/HTTP com `@nestjs/testing` + `supertest` contra **PostgreSQL real**
    (serviço `postgres-test` do docker compose; migrations aplicadas uma vez; `TRUNCATE`
    entre testes; arquivos executados em série);
  - testes de concorrência disparando `Promise.all` de requisições reais (cadastro,
    aceite de convite, bootstrap);
  - matriz de autorização gerada a partir de uma tabela `rota × papel → status`
    (US7, SC-003);
  - varredura de segredos em logs/auditoria (SC-005).
  `apps/web`: Vitest + Testing Library para formulários e para o cliente da API.
  E2E em navegador (Playwright) fica adiado — os critérios são verificáveis na API.
- **Rationale**: Princípio VII; banco real é indispensável para testar unicidade,
  locks e índices parciais.
- **Alternatives considered**: Jest (padrão Nest, mas mais lento e com pior suporte a
  ESM); Testcontainers (dependência extra quando o compose já provê o banco); SQLite
  em memória (não testa os recursos do PostgreSQL usados).

## R18. Frontend

- **Decision**: Next.js 16 App Router em `apps/web`, com as telas da Assumption da
  spec. Chamadas à API por um cliente `fetch` fino (`lib/api-client.ts`) que traduz o
  formato de erro `{statusCode, code, message}`. Server Components leem a sessão
  chamando `GET /api/me` repassando o cookie; `proxy.ts` (ex-middleware) só
  redireciona para login por UX — nunca decide autorização. Sem biblioteca de
  formulário ou de estado global.
- **Rationale**: constituição (frontend não é barreira de segurança; separação UI /
  comunicação com a API); IX (sem dependências triviais).
- **Alternatives considered**: NextAuth/Auth.js (duplicaria a autoridade de sessão
  fora do backend).

## R19. Infraestrutura local e health check

- **Decision**: `docker-compose.yml` na raiz com `postgres` (dev), `postgres-test` e
  `mailpit`. `Dockerfile` multi-stage para `apps/api`. Health check próprio:
  `GET /api/health/live` (processo) e `GET /api/health/ready` (`SELECT 1`), ambos
  `@Public()` e sem dados internos.
- **Rationale**: roadmap da Fase 001 inclui Docker e health check; `@nestjs/terminus`
  seria dependência para duas rotas triviais.
- **Alternatives considered**: `@nestjs/terminus`.

## R20. Limpeza do scaffold

- **Decision**: remover `apps/docs` (template do create-turbo, sem spec que o
  justifique) e substituir o README do template. `packages/ui` permanece enquanto
  `apps/web` o usar.
- **Rationale**: IX — nada existe sem necessidade explícita.
- **Alternatives considered**: manter `apps/docs` para documentação futura (não há
  spec pedindo).
