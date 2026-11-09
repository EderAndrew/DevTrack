---
description: "Task list for 024 — Monitoramento de provas no celular: app Expo (Android, distribuição interna) em que o professor entra com a própria conta, acompanha a sala da prova (018) só para leitura e recebe avisos push (vibra e toca) a cada ocorrência contada e a cada prova retida, com silenciamento por prova"
---

# Tasks: 024 — Monitoramento de provas no celular

**Input**: os documentos de design em `/specs/024-mobile-exam-monitor/`.
**Prerequisites**:

- plan.md, spec.md (US1–US4, FR-001–FR-023, SC-001–SC-007), research.md (Y1–Y13) e data-model.md;
- contracts/: http-api, push-notifications, mobile-ui, audit-events e configuration;
- quickstart.md;
- constituição **v3.7.0** (app mobile, stack oficial do mobile, push admitido por spec).

**Tests**: os testes são obrigatórios (Constituição VII; SC-001–SC-007).

- **Testes primeiro**: os testes de cada história são escritos antes da implementação e devem falhar antes dela.
- **Ids nos títulos**: os títulos de `describe`/`it` levam o id da spec 024 com prefixo (`024/US3-4`, `024/FR-015`,
  `024/SC-006`), um id literal por cenário; onde uma tarefa cita uma faixa (`024/US1-1`…`024/US1-7`), cada cenário
  ganha o seu próprio `it`. Testes do app (`apps/mobile/**/*.test.ts(x)`) também contam (T001).
- **Rota nova ou rota aberta ao app**: exige, na mesma tarefa, a entrada em `packages/contracts/src/endpoints.ts`, as
  linhas no `MATRIX` de `apps/api/test/security/authorization-matrix.ts` (contracts/http-api.md, "Permission matrix",
  incluindo a coluna do bearer) e `route-declarations.spec.ts` verde.
- **Build dos contratos e dos tokens**: mudanças em `packages/contracts` ou `packages/design-tokens` exigem
  `pnpm --filter @repo/contracts build` / `pnpm --filter @repo/design-tokens build` antes dos testes da API e do app.
- **Auditoria**: um tipo novo entra em `apps/api/src/modules/audit/audit-event-types.ts`, em contracts/audit-events.md
  e no `apps/api/test/helpers/journey.ts` na mesma tarefa que o emite (`audit-coverage.spec.ts`); metadados só com ids,
  enums e códigos — nunca token de push, nome de aluno, título de prova ou texto de aviso.
- **A 018 não muda** (FR-015, SC-006): as suítes 018 (`018-*`, `exams-boundary`, `activities-boundary`) continuam
  verdes **sem mudança de asserção**; o único ponto de contato é o hook `ExamAlertSink`.
- **A web não muda** (FR-005): as suítes de sessão, cookie e `OriginGuard` (001/002) continuam verdes sem mudança de
  asserção.
- **Sem SDK de push, WebSocket, Redis ou fila** (IX, research Y6): Expo Push só por `fetch` em
  `apps/api/src/platform/push/expo-push.client.ts`. As dependências novas são só as do app (constituição 3.7.0) e
  nenhuma na API.
- **Fim de fase**: cada fase termina com `pnpm lint && pnpm check-types && pnpm test` verde (a suíte completa leva
  mais de 10 min: rodar em segundo plano e reiniciar o `postgres-test` antes, se já houve duas execuções).

**Organization**: por user story, na ordem das dependências reais.

- **Foundational**: o esquema, o hook de alertas sem efeito, a porta de push com o fake, a configuração, os tokens de
  design e o esqueleto do app (cliente HTTP, sessão segura, tema, componentes base).
- **US1** (entrar, sair, registrar o celular, lista de provas) → **US2** (sala e ocorrências) → **US3** (avisos push):
  todas P1, nessa ordem (US3 abre a sala ao tocar no aviso, por isso vem depois da US2).
- **US4** (silenciar) é P2 e depende da US3 (o worker lê o silenciamento).
- **MVP**: Foundational + US1–US3.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivos diferentes, sem dependência de tarefa incompleta).
- **[Story]**: a história da tarefa (US1…US4).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: a 024 entra na guarda de rastreabilidade; os contratos, o pacote de tokens e o app existem no monorepo.

- [x] T001 Incluir a 024 em `SPECS` de `apps/api/test/traceability.spec.ts`, no formato da entrada da 023:
      `feature: "024"`, `path: "specs/024-mobile-exam-monitor/spec.md"`, `stories: 4`, `scenarios: 29` (7 + 8 + 9 + 5),
      `rows: 0`, `rowsWithoutIds: []`, `successCriteria: sc(1, 7)` e
      `pending: { stories: [1, 2, 3, 4], successCriteria: ["SC-001", …, "SC-007"] }`, com o comentário "Joined in the
      Setup phase (T001); each story leaves `pending` with the task that writes its last test, each SC with the test
      that cites it, so the lists are empty at the end of T038". Acrescentar às fontes de títulos
      `{ dir: join(REPO_ROOT, "apps/mobile"), pattern: /\.test\.tsx?$/ }` (ignorando `node_modules`), e citar a 024 na
      lista de `SPECS` do `CLAUDE.md` raiz.
- [x] T002 [P] Contratos em `packages/contracts/src/mobile/` (novo domínio; contracts/http-api.md), exportados em
      `src/index.ts`:
  - `session.ts`: `MobileLoginRequestSchema` (as mesmas regras de `LoginRequestSchema`, estrito) e
    `MobileSessionSchema` `{ token, expiresAt, user: MeViewSchema }`;
  - `devices.ts`: `MobilePlatformSchema` (`ANDROID`, `IOS`), `RegisterMobileDeviceRequestSchema`
    `{ pushToken, platform }` estrito, com o regex `^Expo(nent)?PushToken\[[A-Za-z0-9_-]{10,200}\]$`, e
    `MobileDeviceSchema` `{ id, platform }`;
  - `exams.ts`: `MobileExamListSchema` `{ items: [{ activityId, classId, className, title, closesAt, muted }], serverNow }`;
  - `alerts.ts`: `ExamAlertPreferenceRequestSchema` `{ muted: boolean }` estrito e `ExamAlertPreferenceSchema`
    `{ muted }`; `ExamAlertKindSchema` (`OCCURRENCE`, `HOLD`) e `ExamAlertPushDataSchema`
    `{ kind, classId, activityId, studentUserId }` (o `data` do push, lido pelo app ao tocar no aviso);
  - os códigos de erro `MOBILE_NOT_ALLOWED` e `MOBILE_ROUTE_NOT_ALLOWED` no catálogo de códigos dos contratos;
  - as entradas de `endpoints.ts` entram nas tarefas que criam cada rota (T017, T018, T019, T024, T035);
  - `pnpm --filter @repo/contracts build && pnpm --filter @repo/contracts test` (boundary: nenhum texto de usuário).
- [x] T003 [P] Pacote `packages/design-tokens` (`@repo/design-tokens`, research Y11): `package.json` (build `tsc` →
      `dist/`, test Vitest, `lint`, `check-types`, sem dependência de runtime), `tsconfig.json`,
      `scripts/generate.ts` que lê `apps/web/design-system/tokens.css` (`:root` e `:root[data-theme="light"]`) e
      escreve `src/generated.ts` (cores por tema, escala tipográfica rem → px a 16, raios, espaçamentos, famílias),
      `src/index.ts` (`tokens`, `type ThemeName = "dark" | "light"`, `colorsFor(theme)`), script
      `pnpm --filter @repo/design-tokens generate`. O `src/generated.ts` gerado é commitado.
- [x] T004 [P] Esqueleto do app `apps/mobile` (research Y1, Y2; constituição 3.7.0): Expo SDK estável mais recente,
      fixado; `package.json` com `start`, `lint`, `check-types`, `test` (sem `build`), dependências da stack oficial
      (Expo Router, `expo-notifications`, `expo-secure-store`, `expo-haptics`, `expo-font`, `expo-device`,
      `expo-constants`, TanStack Query, React Hook Form + `@hookform/resolvers`, `zod: "catalog:"`,
      `lucide-react-native` + `react-native-svg`, `@repo/contracts`, `@repo/design-tokens`; dev `jest-expo`,
      `@testing-library/react-native`); `app.config.ts` (nome "DevTrack", `scheme: "devtrack"`, Android
      `package`, `EXPO_PUBLIC_API_ORIGIN` por perfil, plugins `expo-router`, `expo-notifications`, `expo-secure-store`,
      `expo-font`), `eas.json` (perfis `development` e `internal` APK, contracts/configuration.md), `babel.config.js`,
      `jest.config.js` (preset `jest-expo`), `tsconfig.json` (TS que o SDK aceita; `typescript@~5.9` só aqui se o TS 7
      for recusado, como o R1), `eslint.config.mjs` (camadas: componentes não importam `lib/api`; telas só por hooks),
      `assets/fonts/` (Inter, Fredoka, JetBrains Mono TTF, OFL, com as licenças). Se o Metro não resolver o
      `node_modules` isolado do pnpm, `.npmrc` local com `node-linker=hoisted` e a linha em *Complexity Tracking* do
      plan.md. `pnpm install`; `zod-version.spec.ts` verde (uma versão de Zod); o Active Technologies do `CLAUDE.md`
      registra a versão do SDK fixada.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: o banco conhece sessões MOBILE, celulares, silenciamentos e o outbox; a 018 tem o hook sem efeito; a API
tem a porta de push e a configuração; o app tem o cliente, a sessão segura, o tema e os componentes base.

**⚠️ CRITICAL**: nenhuma história começa antes desta fase.

### Tests for Foundational ⚠️

- [x] T005 [P] `apps/api/test/integration/024-schema.spec.ts` (data-model.md), escrito antes da migração:
  - `sessions.client` com default `WEB` nas linhas existentes; UPDATE de `client` recusado (trigger);
  - `mobile_devices`: só com sessão `MOBILE` (trigger), `user_id` igual ao da sessão (trigger), `session_id` e
    `push_token` UNIQUE, CHECK do regex do token (recusa `abc`, aceita `ExponentPushToken[xxxxxxxxxx]`), apagado em
    cascata com a sessão;
  - `exam_alert_mutes`: PK (professor, atividade), só atividade `EXAM` (trigger);
  - `exam_alerts`: UNIQUE `(attempt_id, occurrence_ordinal)`, `hold_id` NOT NULL sse `kind = 'HOLD'`, `tries` 0–3,
    `occurrence_ordinal ≥ 1`; linha final (`SENT`/`SKIPPED`/`EXPIRED`) não muda (trigger), só o job apaga;
  - `exam_alert_deliveries`: PK (alerta, celular), CHECK de `error_code`, apagada em cascata com o alerta.
- [x] T006 [P] `apps/api/test/exam-alerts-boundary.spec.ts` (research Y13), que deve falhar antes da T009:
      `modules/exam-alerts` não importa `exam-sessions`, `activities/submission`, `attendance`, as rotas de decisão
      nem nada que escreva em `exam_occurrences`, `exam_attempt_holds`, `activity_attempts` ou `activity_submissions`;
      `attempt-integrity` só conhece `exam-alert-sink.ts` (nunca importa `exam-alerts`); só
      `platform/push/expo-push.client.ts` cita `exp.host`; nenhum SDK de push (`expo-server-sdk`,
      `firebase-admin`, `@expo/*`) no `package.json` da API; nas chamadas de auditoria e de log de `exam-alerts`,
      `platform/push` e `auth/mobile-session*`, nenhum campo `pushToken`, `title`, `body`, `name` ou `token`;
      nenhum texto de `exam-alerts/message.ts` diz "fraude", "cola" ou "violação".
- [x] T007 [P] `packages/design-tokens/test/in-sync.test.ts` (regenera em memória e compara com `src/generated.ts`;
      falha se `tokens.css` mudou sem regenerar) e `packages/design-tokens/test/contrast.test.ts` (os pares de
      contraste da 022, AA, recalculados nos valores gerados dos dois temas), `024/FR-023` no título.

### Implementation for Foundational

- [x] T008 Migração `apps/api/prisma/migrations/<ts>_024_mobile_exam_monitor/migration.sql` + `schema.prisma`
      (data-model.md): enums `session_client`, `mobile_platform`, `exam_alert_kind`, `exam_alert_status`,
      `exam_alert_delivery_status`; `sessions.client` com o trigger de imutabilidade; tabelas `mobile_devices`,
      `exam_alert_mutes`, `exam_alerts` (índice `(status, created_at)`) e `exam_alert_deliveries` com as CHECKs e os
      triggers. `resetDb` (`apps/api/test/helpers/test-app.ts`) esvazia as tabelas novas. Bloco da 024 em
      `apps/api/test/security/domain-boundary.spec.ts` (`MobileDevice`, `ExamAlertMute`, `ExamAlert`,
      `ExamAlertDelivery`, comentário "024 (specs/024-mobile-exam-monitor/data-model.md) — mobile devices, mutes and the
      exam alert outbox"). T005 fica verde.
- [x] T009 Hook sem efeito na 018 (research Y5): `apps/api/src/modules/attempt-integrity/exam-alert-sink.ts` com a
      interface `ExamAlertSink { record(tx, alerts: ExamAlertDraft[]): Promise<void>; kick(): void }`
      (`ExamAlertDraft = { kind, activityId, attemptId, studentUserId, occurrenceOrdinal, holdId, recordedAt }`), o token
      de injeção e a implementação no-op registrada por padrão em `attempt-integrity.module.ts` (como
      `AnswerSaveGuard`). `FocusEventsService.countOccurrences` monta os rascunhos a partir do resultado de
      `countBatch` (uma linha por ocorrência nova que não abre retenção; a que abre retenção vira `HOLD` com o
      `hold_id`), chama `sink.record(tx, …)` dentro da transação e `sink.kick()` depois do commit. As suítes 018
      continuam verdes sem mudança de asserção; T006 fica verde quanto à 018.
- [x] T010 [P] Porta de push e configuração (contracts/configuration.md, research Y6):
      `apps/api/src/platform/push/push-client.ts` (porta `PushClient`: `send(messages) → tickets`,
      `getReceipts(ids) → receipts`, erros transitórios tipados), `apps/api/src/platform/push/expo-push.client.ts`
      (`fetch` para `${EXPO_PUSH_BASE_URL}/--/api/v2/push/send` em lotes de até 100 e `/getReceipts` até 300 ids,
      `Authorization: Bearer EXPO_ACCESS_TOKEN`, timeout, nenhum token ou corpo em log), o fake
      `apps/api/test/fixtures/push/fake-push-client.ts` (grava as mensagens, programa tickets/recibos/erros 429/5xx/
      rede). Config Zod em `src/platform/config`: `PUSH_ENABLED` (default `false`), `EXPO_ACCESS_TOKEN` (obrigatório
      com `PUSH_ENABLED=true`; a guarda de produção recusa subir sem ele), `EXPO_PUSH_BASE_URL`,
      `EXAM_ALERT_INTERVAL_MS` (default `1000`, `0` desliga), `EXAM_ALERT_MAX_AGE_SECONDS` (default `60`),
      `RATE_LIMIT_MOBILE_WRITES_PER_MINUTE` (default `30`); `.env.example`, `.env.test.example`
      (`EXAM_ALERT_INTERVAL_MS=0`) e o teste da configuração (variáveis inválidas, guarda de produção).
- [x] T011 [P] Esqueleto do app (contracts/mobile-ui.md): `apps/mobile/lib/api/client.ts` (fetch com
      `EXPO_PUBLIC_API_ORIGIN`, `Authorization: Bearer`, `Content-Type: application/json` e `{}` em métodos
      inseguros, nunca cookie, parse do erro `{statusCode, code, message}`, resposta validada pelo schema do
      contrato, um `401` dispara `onUnauthorized`), `apps/mobile/lib/session/secure-session.ts` (`expo-secure-store`:
      ler, gravar e apagar o segredo; nada em AsyncStorage), `apps/mobile/lib/theme/` (`ThemeProvider` a partir de
      `@repo/design-tokens`, escuro antes de conhecer a sessão, `useTheme()`), `apps/mobile/components/ui/` (Text,
      Button, Badge, Card, Screen, Notice, Switch — só tokens, papel e nome acessíveis, alvo ≥ 44 pt, fonte escala
      com o sistema), `apps/mobile/app/_layout.tsx` (QueryClient, tema, fontes com `expo-font`, Stack). Testes
      `apps/mobile/lib/api/client.test.ts` (bearer, `{}` no corpo, erro tipado, `401`) e
      `apps/mobile/test/token-usage.test.ts` (varre `apps/mobile/{app,features,components}`: nenhuma cor hex/rgb,
      tamanho de fonte, família ou raio literal fora de `components/ui`, a contrapartida do `token-usage.test.ts` da
      web, `024/FR-023` no título) e `apps/mobile/lib/theme/theme-provider.test.tsx` (`024/FR-023`: sem sessão o tema
      é escuro; com `GET /me` trazendo `theme: "LIGHT"` as cores passam às de `colorsFor("light")`, e voltam às
      escuras com `"DARK"`).

**Checkpoint**: o banco tem as tabelas, a 018 chama um hook que não faz nada, a API sobe com push desligado e o app
abre uma tela vazia com o tema.

---

## Phase 3: User Story 1 — Professor entra no aplicativo com a própria conta (Priority: P1) 🎯 MVP

**Goal**: o professor entra com e-mail e senha, recebe uma sessão MOBILE opaca, registra o celular para avisos, vê a
lista das suas provas em andamento e sai; a revogação da web derruba o celular; quem não acompanha provas é recusado.

**Independent Test**: entrar com um professor e ver "Provas em andamento"; entrar com um aluno e ver a recusa; sair e
conferir que a sessão e o celular foram removidos; "Sair de todos os dispositivos" na web e conferir o `401` no app.

### Tests for User Story 1 ⚠️

- [x] T012 [P] [US1] `apps/api/test/integration/024-us1-mobile-session.spec.ts`:
  - `024/US1-1` login de professor → `201` com `token` de 43 caracteres, `expiresAt` e `user`; o banco guarda só o
    hash, com `client = MOBILE` e `absolute_expires_at` = agora + 90 d; `GET /me` e `GET /mobile/exams` com o bearer →
    `200`; `mobile_session.created` na mesma transação;
  - `024/US1-2` senha errada e e-mail inexistente → o mesmo `401 INVALID_CREDENTIALS` da web (mesmo corpo); as
    tentativas contam nos escopos `login:*` da web (o 6º pedido da web depois de 5 do app → `429`);
  - `024/US1-3` aluno, gestor e ADMIN sem `chamada.registrar`, e-mail não verificado e conta não ACTIVE → `403
    MOBILE_NOT_ALLOWED`, nenhuma linha em `sessions`, `mobile_session.refused`; ADMIN que também é professor → `201`;
    conta suspensa → `403 ACCOUNT_SUSPENDED` como na web;
  - `024/US1-4` `DELETE /auth/mobile/sessions/current` → `204`, sessão revogada (`LOGOUT`), celular apagado,
    `mobile_session.ended` + `mobile_device.removed` (`LOGOUT`) na mesma transação; repetir → `401`;
  - `024/US1-5` troca de senha, suspensão, remoção do papel, "sair de todos os dispositivos" e o encerramento da
    sessão do celular em "Minhas sessões" → o bearer passa a `401` e, na mesma transação, a linha de
    `mobile_devices` dessa sessão é apagada com `mobile_device.removed` `SESSION_REVOKED` (SYSTEM); um rollback da
    revogação mantém o celular (`024/FR-003`, `024/FR-018`, constituição 3.7.0);
  - `024/US1-6` com o `Clock` injetado: 30 d sem uso → `401`; 90 d desde a criação → `401` mesmo com uso; a política
    da web (8 h / 7 d) continua igual (`024/FR-004`);
  - `024/FR-004` o que é uso: `GET /me`, `GET /mobile/exams` e `GET …/exam-monitor` com o bearer aos 29 d renovam
    `last_used_at` (a sessão vale mais 30 d); rodar o worker e entregar avisos ao celular aos 29 d **não** renova (aos
    30 d sem pedido do app, `401`);
  - `PUT /mobile/device`: cria (`mobile_device.registered`), repete o mesmo token na mesma sessão sem evento novo, um
    token de outra sessão muda para esta (`REPLACED` na antiga + `registered` na nova), corpo com campo extra, token
    fora do regex ou `platform` inválida → `400` (`024/FR-018`);
  - `GET /mobile/exams` (`024/FR-006`): só EXAM das turmas do professor, publicada, antes de `closesAt`, não cancelada,
    turma não arquivada, ordenada por `closesAt`, `muted: false`, com `serverNow`; agendada não aparece.
- [x] T013 [P] [US1] `apps/api/test/security/024-mobile-allowlist.spec.ts` e `024-origin.spec.ts` (research Y4,
      `024/FR-005`):
  - com um bearer MOBILE: cada rota da tabela de `routes.ts` sem `@MobileAccess()` → `403 MOBILE_ROUTE_NOT_ALLOWED`
    (geradas a partir do catálogo, não à mão), incluindo `…/exam-holds/:holdId/{cancel,return,keep}`, a chamada e as
    pausas;
  - um bearer de sessão WEB (o segredo do cookie no cabeçalho) → `401`; o cookie de uma sessão MOBILE → `401`;
  - `POST /auth/mobile/sessions` sem `Origin` → aceito; com `Origin` não permitido → `403 ORIGIN_NOT_ALLOWED`; sem
    `Content-Type: application/json` → `403`;
  - bearer sem cookie numa rota `@MobileAccess()` insegura sem `Origin` → aceito; bearer **com** cookie de sessão sem
    `Origin` → `403 ORIGIN_NOT_ALLOWED`; toda rota da web sem `Origin` continua `403` (sem mudança de asserção nas
    suítes 001/002).
- [x] T014 [P] [US1] Testes do app (RNTL, por papel e nome):
  - `apps/mobile/features/mobile-auth/components/login-form.test.tsx`: `024/US1-1` entra e navega para
    `/(app)/provas`, grava o segredo no secure store; `024/US1-2` mostra a mensagem genérica da web; `024/US1-3` mostra
    "Este aplicativo é para professores acompanharem provas."; `429` mostra a espera; campos vazios validados pelo
    schema;
  - `apps/mobile/features/mobile-auth/hooks/use-logout.test.tsx`: `024/US1-4` chama o `DELETE`, apaga o segredo e o
    cache e volta a `/entrar`;
  - `apps/mobile/test/screens/entrar.test.tsx` (fora de `app/`, onde o Expo Router trata todo arquivo como rota; o mesmo
    vale para `test/screens/provas.test.tsx`): `024/US1-5` e `024/US1-6` um `401` em qualquer pedido apaga o segredo e mostra
    "Sua sessão expirou. Entre novamente para voltar a receber avisos.";
  - `apps/mobile/features/push/hooks/use-push-registration.test.tsx`: depois do login pede a permissão, cria os dois
    canais e chama `PUT /mobile/device` com o token Expo; chama de novo quando o token muda; `024/US1-7` com a
    permissão negada, "Provas em andamento" mostra o aviso permanente "As notificações estão desligadas neste
    celular. Você não receberá avisos." e "Abrir configurações";
  - `apps/mobile/features/exam-list/components/exam-list.test.tsx`: cards com título, turma e "Encerra às HH:MM"
    (horário do `closesAt`), vazio "Nenhuma prova em andamento nas suas turmas.", "Sair" no cabeçalho.

### Implementation for User Story 1

- [x] T015 [US1] Sessão por tipo: `apps/api/src/modules/auth/session.service.ts` — `create(userId, client, tx)` grava
      `client` e `absolute_expires_at` pelo tipo (WEB 7 d, MOBILE 90 d); `validate(secret, client)` aplica o ocioso
      do tipo (WEB 8 h, MOBILE 30 d), renova `last_used_at` só em pedidos do app (o worker nunca chama `validate`) e
      recusa o tipo errado; constantes no arquivo (contracts/configuration.md). `revoke` e `revokeAllForUser` apagam,
      na transação recebida, as linhas de `mobile_devices` das sessões que revogam e gravam `mobile_device.removed`
      `SESSION_REVOKED` (SYSTEM) para cada uma (research Y9; `AuditService` injetado; o motivo novo em
      `audit-event-types.ts`, contracts/audit-events.md e `journey.ts`). Os chamadores da web passam `WEB`
      explicitamente; as suítes de sessão da 001/002 continuam verdes sem mudança de asserção.
- [x] T016 [US1] Decoradores e guardas (research Y4): `@MobileAccess()` e `@MobileEntry()` em
      `apps/api/src/modules/access-control/decorators.ts`; `guards/session.guard.ts` lê o cookie → WEB, ou o
      `Authorization: Bearer` → MOBILE só em rota `@MobileAccess()` (senão `403 MOBILE_ROUTE_NOT_ALLOWED`; com os dois,
      o cookie manda e o bearer é ignorado); `apps/api/src/platform/http/origin.guard.ts` com as duas exceções;
      códigos novos em `apps/api/src/platform/http/errors.ts`. `@MobileAccess()` em `GET /me`
      (`auth/me.controller.ts`).
- [x] T017 [US1] Login e logout do app: `apps/api/src/modules/auth/mobile-session.service.ts` (reusa o caminho de
      `login.service.ts` para credenciais, Argon2, mensagem genérica e escopos de limite; depois exige ACTIVE,
      e-mail verificado e `chamada.registrar` pelo `permission-resolver`, senão `mobile_session.refused` numa transação
      própria e `403 MOBILE_NOT_ALLOWED`; cria a sessão MOBILE + registro de acesso + `mobile_session.created` na mesma
      transação; logout revoga com `LOGOUT`, apaga o celular e audita na mesma transação) e
      `mobile-session.controller.ts` (`POST /auth/mobile/sessions` `@Public() @MobileEntry()`, `DELETE
      /auth/mobile/sessions/current` `@MobileAccess()`), registrados em `auth.module.ts`. Tipos `mobile_session.*` em
      `audit-event-types.ts`, contracts/audit-events.md e `journey.ts`. Entradas em `endpoints.ts`, `MATRIX` e
      `routes.ts`.
- [x] T018 [US1] Módulo `apps/api/src/modules/exam-alerts/exam-alerts.module.ts` (importado pelo `AppModule`) com
      `mobile-devices.service.ts` + `mobile-devices.controller.ts` (`PUT /mobile/device` `@MobileAccess()`: upsert da
      sessão atual sob `SELECT … FOR UPDATE` do token, `REPLACED` quando o token muda de sessão, nada novo na repetição;
      limite `mobile-writes` em `platform/rate-limit` com `RATE_LIMIT_MOBILE_WRITES_PER_MINUTE`). Tipos
      `mobile_device.registered`/`removed` em `audit-event-types.ts`, contracts e `journey.ts`. Entradas em
      `endpoints.ts`, `MATRIX` e `routes.ts`.
- [x] T019 [US1] `apps/api/src/modules/exam-alerts/mobile-exams.service.ts` + `mobile-exams.controller.ts`
      (`GET /mobile/exams`, `@RequirePermissions("chamada.registrar") @MobileAccess()`): consulta escopada às turmas
      do professor, pelo `Clock` injetado, com `muted` pela existência da linha em `exam_alert_mutes` (sempre `false`
      até a US4). Entradas em `endpoints.ts`, `MATRIX` e `routes.ts`. T012 e T013 ficam verdes.
- [x] T020 [US1] App — entrada e sessão: `apps/mobile/features/mobile-auth/{api,hooks,schemas,components}`
      (`login`, `logout`, `useLogin`, `useLogout`, `LoginForm` com React Hook Form + `MobileLoginRequestSchema`,
      mensagens por código), `apps/mobile/app/entrar.tsx`, guarda de rota em `apps/mobile/app/(app)/_layout.tsx` (sem
      segredo → `/entrar`; `GET /me` define o tema, 022), `onUnauthorized` do cliente apaga o segredo e o cache e
      leva a `/entrar` com a mensagem de sessão expirada.
- [x] T021 [US1] App — push e lista: `apps/mobile/features/push/channels.ts` (os dois canais da research Y7, com
      `lockscreenVisibility: PRIVATE`), `apps/mobile/features/push/hooks/use-push-registration.ts` (permissão,
      canais, `getExpoPushTokenAsync` com o project id do EAS, `PUT /mobile/device`, listener de troca de token,
      estado da permissão relido ao voltar para o primeiro plano), `apps/mobile/features/exam-list/{api,hooks,components}`
      e `apps/mobile/app/(app)/provas/index.tsx` (lista, aviso de notificações desligadas com `Linking.openSettings()`,
      "Sair"). T014 fica verde; US1 sai de `pending`.

**Checkpoint**: o professor entra, o celular fica registrado e a lista aparece; a web segue igual.

---

## Phase 4: User Story 2 — Professor acompanha a sala da prova no celular (Priority: P1)

**Goal**: a sala da prova no app, com as mesmas rotas e as mesmas palavras da web, atualizada a cada 5 s, e as
ocorrências de cada aluno; nenhuma ação de escrita.

**Independent Test**: com alunos em situações diferentes, a sala no app mostra o mesmo texto, contagem e ordem da
web; uma ocorrência aparece em até 10 s; um aluno retido mostra "Decida no computador" sem botão.

### Tests for User Story 2 ⚠️

- [x] T022 [P] [US2] `apps/api/test/integration/024-us2-room.spec.ts`: com o bearer MOBILE, `GET …/exam-monitor` e
      `GET …/attempts/:attemptId/integrity` devolvem **exatamente** o mesmo corpo que a sessão WEB do mesmo professor no
      mesmo instante (`024/SC-003`, `024/FR-007`); `024/US2-1` professor B (bearer) → `404` nas duas rotas e a prova de B
      fora de `GET /mobile/exams`; `024/US2-6` a prova encerrada ou cancelada sai de `GET /mobile/exams`;
      `024/FR-010` as rotas de decisão, chamada e pausa com o bearer → `403 MOBILE_ROUTE_NOT_ALLOWED`.
- [x] T023 [P] [US2] Testes do app:
  - `apps/mobile/features/exam-room/components/exam-room.test.tsx`: `024/US2-2` com timers falsos, um novo corpo do
    monitor em 5 s muda a contagem do aluno; `024/US2-3` retido primeiro, com o selo do aviso, "Encerrada por avisos
    — aguardando decisão" e "Decida no computador", sem botão; `024/US2-5` o tempo restante vem de `serverNow` (o
    relógio do aparelho adiantado 1 h não muda o texto); `024/US2-6` "Esta prova foi encerrada."; `024/US2-7` com o
    pedido falhando por rede, "Sem conexão — os dados podem estar desatualizados" e "Atualizado às HH:MM:SS" do último
    sucesso, e volta a atualizar quando o pedido passa; o polling para fora de foco e com o app em segundo plano
    (`AppState`); destaque do aluno vindo de `?aluno=`;
  - `apps/mobile/features/exam-room/components/student-occurrences.test.tsx`: `024/US2-4` "Saiu da tela", "Saiu da
    tela cheia", "Tentou copiar/colar", "Sem interação por 45 s", o horário do servidor e "Aviso n de 3" / "Prova
    retida"; vazio "Nenhuma ocorrência registrada.";
  - `apps/mobile/test/wording-parity.test.ts` (`024/FR-007`, `024/FR-009`): cada chave e texto de
    `apps/web/features/exam-session/schemas/exam-session.ts` existe igual em
    `apps/mobile/features/exam-room/schemas/exam-room.ts`;
  - `apps/mobile/test/exam-wording.test.ts` (`024/US2-8`, `024/FR-022`): nenhum arquivo de `apps/mobile/{app,features,components}`
    diz "fraude", "cola" ou "violação"; cada situação tem texto (nenhum `Badge` só com cor);
  - `apps/mobile/test/no-decision-routes.test.ts` (`024/FR-010`): `apps/mobile/features/*/api` só chama as rotas da
    allowlist (nenhum `exam-holds`, `attendance`, `pauses`, `release`).

### Implementation for User Story 2

- [x] T024 [US2] `@MobileAccess()` em `GET …/exam-monitor` e `GET …/attempts/:attemptId/integrity` (controllers da
      018/015, nada mais muda); `MATRIX` atualizado (coluna do bearer). T022 fica verde.
- [x] T025 [US2] App — sala: `apps/mobile/features/exam-room/schemas/exam-room.ts` (cópia do catálogo da web:
      `examStatusLabel`, `occurrenceLabel`, formatação de tempo), `api/` (monitor e linha do tempo, validados pelos
      schemas de `@repo/contracts`), `hooks/use-exam-room.ts` e `hooks/use-student-occurrences.ts` (TanStack Query,
      `refetchInterval: EXAM_ROOM_POLL_MS = 5000` só com a tela em foco e o app ativo, `onlineManager`/estado de rede
      para o aviso de sem conexão), `components/` (lista na ordem do servidor, linha do aluno, selo, aviso de
      encerrada) e as telas `apps/mobile/app/(app)/provas/[classId]/[activityId]/index.tsx` e
      `…/alunos/[attemptId].tsx`; `404` → "Esta prova não está mais disponível.". T023 fica verde; US2 sai de
      `pending`.

**Checkpoint**: o professor abre a sala no celular e lê o mesmo que a web.

---

## Phase 5: User Story 3 — O celular vibra e toca a cada ocorrência e a cada prova retida (Priority: P1)

**Goal**: cada ocorrência contada e cada retenção grava um alerta no outbox, na transação do aluno; o worker escolhe
os destinatários na hora do envio e manda pelo Expo Push; tocar no aviso abre a sala com o aluno em destaque.

**Independent Test**: com o `FakePushClient`, provocar ocorrências 1–4 e conferir três avisos de ocorrência e um de
retida, um por celular, nenhum para outro professor, nenhum depois do logout, e a prova igual com o envio falhando.

### Tests for User Story 3 ⚠️

- [x] T026 [P] [US3] `apps/api/test/integration/024-us3-alerts.spec.ts` (com `EXAM_ALERT_INTERVAL_MS=0` e
      `runOnce(now)`; helper `apps/api/test/helpers/exam-alerts.ts`: `signInMobile`, `registerDevice`, `runAlertWorker`,
      `pushedMessages`):
  - `024/US3-1` ocorrência contada → uma linha `OCCURRENCE` com o ordinal; o fake recebe a mensagem no canal
    `exam-occurrences`, título "Ocorrência na prova", corpo "<aluno> — Aviso 1 de 3 — <título> (<turma>)", `priority:
    high`, `sound: default`, `data` `{ kind, classId, activityId, studentUserId }`;
  - `024/US3-2` `024/SC-002` a 4ª ocorrência → uma linha `HOLD` com `hold_id` e nenhuma `OCCURRENCE` para ela; canal
    `exam-holds`, título "Prova retida — decisão pendente";
  - `024/US3-3` sinais agrupados em 2 s → um alerta; `024/US3-4` evento com a prova retida, pausada ou depois do fim →
    nenhum alerta; o mesmo lote reenviado → nenhum alerta novo (UNIQUE);
  - devolução pelo computador e nova ocorrência (ordinal > 3) → "Nova ocorrência"; nova retenção → novo `HOLD`;
  - `024/US3-6` dois celulares do professor → dois envios; `024/US3-7` professor de outra turma com celular → nada;
  - `024/SC-004` depois do logout, da revogação, da sessão expirada, da turma arquivada ou do papel removido → o alerta
    termina `SKIPPED` e nada é enviado;
  - `024/US3-8` `024/FR-016` nenhuma mensagem tem enunciado, resposta, nota, e-mail ou RA (alunos com e-mail e RA
    marcados) nem "fraude", "cola" ou "violação";
  - `024/US3-9` `024/SC-006` `024/FR-015` com o fake falhando (rede, 500, 429, exceção) e com `PUSH_ENABLED=false`, as
    ocorrências, a retenção, a resposta do lote do aluno e o monitor são idênticos aos de uma execução sem alertas
    (comparação campo a campo); `PUSH_ENABLED=false` → `SKIPPED`;
  - `024/SC-001` do commit ao `send` do fake com o worker ativo (intervalo 1000 ms e `kick()`) em ≤ 2 s em 95% de 40
    ocorrências.
- [x] T027 [P] [US3] `apps/api/test/integration/024-worker.spec.ts`: claim de até 50 por `created_at` com `FOR UPDATE
      SKIP LOCKED` (dois workers em paralelo nunca enviam o mesmo alerta, `exam_alert_deliveries` PK); lease de 30 s
      retomada depois de um worker morto; alerta com mais de 60 s → `EXPIRED` sem envio (`024/FR-019`); 429/5xx/rede
      → `tries + 1`, nova tentativa em 2 s e 5 s, depois `EXPIRED`; ticket `DeviceNotRegistered` → celular apagado e
      `mobile_device.removed` `PROVIDER_UNREGISTERED` (SYSTEM); recibos de 15 min–24 h em lotes de até 300, recibo
      `DeviceNotRegistered` apaga o celular; nenhum token, título ou nome nos logs capturados.
- [x] T028 [P] [US3] Testes do app: `apps/mobile/features/push/hooks/use-notification-response.test.tsx` — `024/US3-5`
      tocar num aviso (app fechado, em segundo plano e aberto) abre
      `/(app)/provas/[classId]/[activityId]?aluno=<studentUserId>` depois de `GET /me` validar a sessão; sem sessão,
      `/entrar` primeiro e a sala depois do login; `data` fora do `ExamAlertPushDataSchema` é ignorado;
      `apps/mobile/features/push/channels.test.ts` — os dois canais com importância, vibração e
      `lockscreenVisibility: PRIVATE` da research Y7; aviso recebido com o app aberto vibra com `expo-haptics`
      (pesado no `HOLD`) e não duplica o som.

### Implementation for User Story 3

- [x] T029 [US3] Outbox: `apps/api/src/modules/exam-alerts/exam-alert-outbox.ts` implementa `ExamAlertSink` (INSERT
      `ON CONFLICT (attempt_id, occurrence_ordinal) DO NOTHING` na transação recebida, `created_at` = `recordedAt`;
      `kick()` acorda o worker se o intervalo for > 0) e substitui o no-op no `exam-alerts.module.ts`.
- [x] T030 [US3] Mensagem e destinatários: `apps/api/src/modules/exam-alerts/message.ts` (puro: canal, título, corpo
      e `data` por tipo e ordinal, contracts/push-notifications.md, nomes e títulos como texto) com
      `message.spec.ts`; `recipients.ts` (consulta dos celulares elegíveis no momento do envio, data-model "Derived":
      sessão MOBILE válida pelo `Clock`, usuário ACTIVE com `chamada.registrar`, professor da turma, turma não
      arquivada, sem silenciamento).
- [x] T031 [US3] Worker: `apps/api/src/modules/exam-alerts/exam-alert.worker.ts` (timer `EXAM_ALERT_INTERVAL_MS`,
      `runOnce(now)`, claim/lease, `EXPIRED`/`SKIPPED`/`SENT`, entregas gravadas antes do envio, retentativas,
      `DeviceNotRegistered`, recibos a cada 60 s, parada limpa no `onModuleDestroy`; `PUSH_ENABLED=false` termina
      `SKIPPED`); o `PushClient` injetado é o `ExpoPushClient` (o fake nos testes via `createTestApp`). T026 e T027
      ficam verdes; T006 inteiro verde.
- [x] T032 [US3] App — receber e abrir: `apps/mobile/features/push/hooks/use-notification-response.ts`
      (`addNotificationResponseReceivedListener` e `getLastNotificationResponseAsync`, `data` validado pelo schema,
      navegação depois da sessão), `setNotificationHandler` em `apps/mobile/app/_layout.tsx` (com o app aberto mostra
      o aviso e vibra pelo tipo), destaque do aluno na sala. T028 fica verde; US3 sai de `pending`.

**Checkpoint**: o MVP está completo — o celular avisa a cada ocorrência e retenção e abre a sala certa.

---

## Phase 6: User Story 4 — Professor desliga os avisos de uma prova (Priority: P2)

**Goal**: "Silenciar avisos desta prova" por professor e prova, para todos os celulares dele; idempotente; alertas
criados enquanto silenciada nunca são enviados.

**Independent Test**: silenciar uma de duas provas, provocar ocorrências nas duas e conferir que só a outra avisa;
religar e conferir que a próxima volta a avisar, sem aviso atrasado.

### Tests for User Story 4 ⚠️

- [x] T033 [P] [US4] `apps/api/test/integration/024-us4-mute.spec.ts`: `024/US4-1` silenciar A → ocorrências de A
      terminam `SKIPPED`, as de B são enviadas; `024/US4-2` religar → a próxima de A é enviada e as anteriores continuam
      `SKIPPED` (`024/FR-021`); `024/US4-3` `GET /mobile/exams` mostra `muted: true` e o monitor continua igual;
      `024/US4-4` dois celulares do professor deixam de receber; `024/US4-5` silenciar/religar duas vezes → `200` com
      o mesmo estado, uma linha no máximo; a mesma rota pela sessão WEB funciona; `404` para turma de outro professor,
      atividade que não é EXAM e turma arquivada; corpo com campo extra ou `muted` não booleano → `400`; nenhum evento
      de auditoria.
- [x] T034 [P] [US4] Teste do app `apps/mobile/features/exam-room/components/mute-switch.test.tsx`: o `Switch`
      "Silenciar avisos desta prova" / "Ligar avisos desta prova" com papel `switch` e estado acessível, otimista com
      desfazer em erro, selo "Avisos silenciados" na sala e no card da lista (`024/US4-3`).

### Implementation for User Story 4

- [x] T035 [US4] `apps/api/src/modules/exam-alerts/exam-alert-preferences.service.ts` + `.controller.ts`
      (`PUT /classes/:classId/activities/:activityId/exam-alerts`, `@RequirePermissions("chamada.registrar")
      @MobileAccess()`, `ClassContextPolicy`, `INSERT … ON CONFLICT DO NOTHING` / `DELETE`, limite `mobile-writes`);
      `recipients.ts` já respeita a linha (T030). Entradas em `endpoints.ts`, `MATRIX` e `routes.ts`. T033 fica verde.
- [x] T036 [US4] App: `apps/mobile/features/exam-room/{api,hooks}/` (`setExamAlerts`, `useExamAlertsMute` com
      invalidação da lista), `components/mute-switch.tsx` na sala e o selo no card da lista. T034 fica verde; US4 sai
      de `pending`.

**Checkpoint**: todas as histórias funcionam de forma independente.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [x] T037 [P] Jobs de retenção (contracts/configuration.md, research Y12): `apps/api/src/modules/exam-alerts/exam-alerts.job.ts`
      (alertas e entregas com `created_at` > 7 dias, lotes de 1 000, `SET LOCAL` que o trigger de linha final aceita)
      e `mobile-devices.job.ts` (celulares de sessões expiradas; a revogação já os apagou, T015), registrados no
      `platform/maintenance/maintenance.service.ts`; sem auditoria (o run loga o nome e a contagem).
- [x] T038 Suítes de segurança em `apps/api/test/security/` (os SC restantes saem de `pending`, que fica vazio):
  - `024-isolation.spec.ts` `024/SC-004`: professor B, aluno, gestor e ADMIN → `404`/`403` em lista, sala,
    ocorrências e silenciar; nenhum alerta de uma turma alheia chega a um celular;
  - `024-concurrency.spec.ts`: dois lotes simultâneos da 4ª ocorrência → um `HOLD` e um envio por celular; dois
    `PUT /mobile/device` com o mesmo token em sessões diferentes → um dono; dois workers → nenhuma entrega duplicada;
  - `024-rate-limits.spec.ts`: o 31º `PUT /mobile/device`/`…/exam-alerts` no minuto → `429`; o login do app conta nos
    escopos da web;
  - `024-audit.spec.ts` `024/SC-005`: alunos e prova com `MARCADOR-ALERTA-024` no nome e no título — o marcador e o
    token de push nunca aparecem em `audit_events` nem nos logs capturados; o journey (`test/helpers/journey.ts`)
    entra pelo app, registra o celular, recebe um alerta e sai;
  - `024-retention.spec.ts`: os dois jobs da T037 apagam só o que devem (o `mobile-devices` só celulares de sessões
    expiradas, já que a revogação apaga na hora);
  - `024-performance.spec.ts` (plan "Performance Goals"): `GET /mobile/exams` de um professor com 10 turmas e 10
    provas em andamento p95 < 150 ms; o monitor com o bearer no mesmo alvo da 018; do commit da ocorrência ao `send`
    do `FakePushClient` com o worker ativo ≤ 2 s em 95% de 40 ocorrências (o mesmo número citado por `024/SC-001` na
    T026);
  - `024/SC-007` fica no roteiro do piloto (T040), registrado no título de `apps/mobile/test/pilot-flow.test.tsx`
    (entrar → lista → sala com o cliente mockado, em menos de três toques depois do login).
- [x] T039 [P] Documentação: `apps/api/CLAUDE.md` (sessão MOBILE, `@MobileAccess()`/`@MobileEntry()`, outbox e worker,
      `FakePushClient`, helpers e suítes da 024, guarda `exam-alerts-boundary`), `apps/mobile/CLAUDE.md` (novo: stack,
      camadas, tokens, polling, regra de só leitura, comandos), `CLAUDE.md` raiz (024 em "Project state", regra
      "Mobile exam monitor (024)" em "Rules that are easy to get wrong", o guard novo, comandos do app e dos tokens; a
      linha "(planned)" do Recent Changes vira a definitiva), `docs/deploy/mobile.md` (projeto EAS, `eas credentials`
      do FCM, `EXPO_ACCESS_TOKEN` e `PUSH_ENABLED` no VPS, build `internal`, instalação do APK no piloto) e
      `DEPENDENCIES.md` se houver override novo.
- [x] T040 Piloto manual: o quickstart passos 1–9 num aparelho Android com um build `development` (push exige dev/EAS
      build): celular bloqueado mostra só "DevTrack" e "Conteúdo oculto"; vibração mais forte na retida; cronometrar
      `024/SC-001` (aviso em ≤ 10 s) e `024/SC-007` (entrar e abrir a sala em < 1 min). Anotar os resultados no
      plan.md.
- [x] T041 Verificação final: `pnpm lint && pnpm check-types && pnpm test` verde (inclui `@repo/design-tokens` e
      `apps/mobile`); `pending` da 024 vazio em `traceability.spec.ts`; Semgrep sem achados nos arquivos novos.

---

## Dependencies & Execution Order

- **Ordem das fases**: Setup (T001–T004) → Foundational (T005–T011) → US1 → US2 → US3 → US4 → Polish.
- **Setup**: T001–T004 independentes entre si.
- **Foundational**: T005–T007 (testes) antes de T008–T011; T008 antes de T009; T010 e T011 independentes de T008.
- **US1 (T012–T021)**: depende da Foundational; T015 → T016 → T017 → T018 → T019 na API; T020 → T021 no app.
- **US2 (T022–T025)**: depende da US1 (bearer, allowlist e app autenticado).
- **US3 (T026–T032)**: depende da US1 (celulares registrados) e da US2 (abrir a sala ao tocar); T029 → T030 → T031.
- **US4 (T033–T036)**: depende da US3 (o worker lê o silenciamento).
- **Polish**: T037 depois da US3; T038–T041 depois de todas as histórias.

## Parallel Opportunities

- Setup: T001 ∥ T002 ∥ T003 ∥ T004.
- Foundational: T005 ∥ T006 ∥ T007; depois T008 → T009, com T010 ∥ T011 em paralelo.
- Em cada história, os testes da API ∥ os testes do app (T012 ∥ T013 ∥ T014, T022 ∥ T023, T026 ∥ T027 ∥ T028,
  T033 ∥ T034); a implementação da API ∥ a do app depois dos testes (T015–T019 ∥ T020–T021, T024 ∥ T025,
  T029–T031 ∥ T032, T035 ∥ T036).
- Polish: T037 ∥ T039.

## Implementation Strategy

1. **MVP** (Foundational + US1–US3): o professor entra, vê a sala e o celular avisa a cada ocorrência e retenção;
   validar com o quickstart passos 1–6 num build `development`.
2. **Incremento 1** (US4): silenciar por prova; quickstart passo 7.
3. **Polish**: retenção, segurança, documentação e o piloto (quickstart passos 8–9, build `internal`).
