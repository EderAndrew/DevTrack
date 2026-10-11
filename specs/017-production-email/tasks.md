---

description: "Task list for 017 — E-mail Real em Produção: fila única com novas tentativas para os seis e-mails, aviso de não entregue pelo provedor, modelos HTML + texto, guarda de produção e guia (Resend → SES)"
---

# Tasks: 017 — E-mail Real em Produção

**Input**: os documentos de design em `/specs/017-production-email/`.
**Prerequisites**:
- plan.md, spec.md, research.md (N1–N15) e data-model.md;
- contracts/: http-api, mail-delivery, audit-events, configuration, maintenance-jobs e web-ui;
- quickstart.md;
- constituição v3.4.0.

**Tests**: os testes são obrigatórios (Constituição VII; SC-001–SC-008).
- **Testes primeiro**: os testes de cada história são escritos antes da implementação e devem
  falhar antes dela.
- **Ids nos títulos**: os títulos de `describe`/`it` levam o id da spec 017 com prefixo
  (`017/US2-5`, `017/FR-011`, `017/SC-004`), um id literal por cenário. Onde uma tarefa cita uma
  faixa (`017/US1-1`…`017/US1-7`), cada cenário ganha o seu próprio `it`.
- **Relógio**: é injetado (`FixedClock`) onde esperas, janelas de assinatura e retenção importam;
  o worker é exercitado por `runOnce(now)`, nunca pelo timer.
- **Sem provedor real**: nenhum teste fala com o Resend ou a AWS. Os testes usam `InMemoryMailer`,
  `FailingMailer` (`temporary` | `permanent` | `auth`) e avisos assinados por
  `apps/api/test/helpers/mail-notices.ts` (research N14).
- **O que a 003 garante continua garantido**: as suítes 003 do envio do convite de turma
  (`003-class-invitation-delivery`, `003-us2`, `003-us5`, `003-concurrency`) são migradas para a
  fila nova sem perder nenhum caso; nenhuma é apagada sem que o seu caso exista na suíte 017.
- **Tipo de auditoria novo**: exige, na mesma tarefa, `src/modules/audit/audit-event-types.ts`,
  `contracts/audit-events.md` e a emissão em `test/helpers/journey.ts`.
- **Rota nova**: exige, na mesma tarefa, `packages/contracts/src/endpoints.ts`, uma linha no
  `MATRIX` de `apps/api/test/security/authorization-matrix.ts` e `route-declarations.spec.ts`
  (com o motivo do `@ProviderNotice()`).
- **Build dos contratos**: mudanças em `packages/contracts` exigem
  `pnpm --filter @repo/contracts build` antes dos testes da API e do web.
- **Isolamento de módulo**: `platform/mail` nunca importa um módulo de domínio; cada módulo dono
  de um assunto registra o seu `MailSubject` (plan, Structure Decision).
- **Fim de fase**: cada fase termina com `pnpm lint && pnpm check-types && pnpm test` verde.

**Organization**: por user story, na ordem das dependências reais.
- **Foundational**: entrega a migração, o `Mailer` com Message-ID e erros classificados, e o
  contrato do assunto (`MailSubject`).
- **US1** (fila para os seis e-mails): é o primeiro elo; a US2 depende do `message_id` que ela
  grava.
- **US2** (avisos e "Não entregue"): rota pública, adaptadores e telas dos convites.
- **US3** (modelos HTML + texto): só depende da Foundational; pode andar em paralelo com a US2.
- **US4** (guarda de produção, segredos, guia): depende da configuração da US2 (provedor de aviso).
- **MVP**: US1 + US2.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivos diferentes, sem dependência de tarefa incompleta).
- **[Story]**: a história da tarefa (US1…US4).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: configuração, códigos de erro e contratos compartilhados.

- [X] T001 [P] Variáveis de `contracts/configuration.md` em
  `apps/api/src/platform/config/config.schema.ts`, `apps/api/.env.example`,
  `apps/api/.env.test.example` e `apps/web/e2e/.env.e2e`:
  - `MAIL_REPLY_TO` (opcional, e-mail), `MAIL_MESSAGE_ID_DOMAIN` (padrão: domínio de `MAIL_FROM`),
    `MAIL_SENDS_PER_MINUTE` (120, `0` aceito), `MAIL_SEND_TIMEOUT_SECONDS` (20),
    `MAIL_NOTICE_PROVIDER` (`resend` | `ses` | `none`, padrão `none`), `MAIL_NOTICE_SECRET`
    (obrigatória com `resend`, formato `whsec_<base64>`), `MAIL_SES_TOPIC_ARN` (obrigatória com
    `ses`), `RATE_LIMIT_MAIL_NOTICES_PER_MINUTE` (600), `MAIL_RECORDS_RETENTION_DAYS` (180);
  - testes e E2E: `MAIL_NOTICE_PROVIDER=resend` com um segredo fixo de teste;
  - testes de padrão, de recusa (negativos, provedor sem segredo/ARN, segredo malformado) e de
    `MAIL_MESSAGE_ID_DOMAIN` derivado em `apps/api/test/integration/platform.spec.ts`
    (`017/FR-023`).
  - A guarda de produção (FR-025) fica na T038 (US4).
- [X] T002 [P] Código de erro `NOTICE_REJECTED` em `packages/contracts/src/common/errors.ts` e
  `apps/api/src/platform/http/errors.ts` (sem mensagem no web: o provedor é o único cliente).
- [X] T003 [P] Contratos (`contracts/http-api.md`) com testes em `packages/contracts/test/`:
  - `packages/contracts/src/classes/class-invitations.ts`: `DeliveryStateSchema` +=
    `UNDELIVERED`; novo `DeliveryIssueSchema` (`BOUNCED` | `COMPLAINED` | `REJECTED`);
    `ClassInvitationView.deliveryIssue` (não nulo sse `delivery = UNDELIVERED`, por `superRefine`);
  - `packages/contracts/src/mail/notices.ts`: `ProviderNoticeParamsSchema` (`resend` | `ses`) e,
    em `common/primitives.ts`, `EmptyResponseSchema` (`{}`). A entrada `mail.notice` de
    `endpoints.ts` (`POST /mail/notices/:provider`, sem corpo) entra na T027, com a rota: o guarda
    `endpoint-catalog.spec.ts` exige que toda entrada do catálogo seja uma rota registrada;
  - `pnpm --filter @repo/contracts build`. A API responde `deliveryIssue: null` até a US2; o
    `delivery` dos convites de professor e gestor entra no contrato na T016, junto com o serviço
    que o preenche.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: migração, `Mailer` com Message-ID e erros classificados, contrato do assunto e o
guarda de rastreabilidade. ⚠️ Nenhuma história começa antes desta fase.

- [ ] T004 Teste primeiro: `apps/api/test/integration/017-schema.spec.ts`, com as regras de
  `data-model.md`:
  - `mail_deliveries`: CHECK de exatamente um assunto e o do `kind`; `kind` imutável; `attempts`
    0–7; `next_attempt_at` NOT NULL sse `PENDING`; `last_error_code` no padrão; `undelivered_*`
    juntos; `discard_reason` sse `DISCARDED`; `message_id` UNIQUE;
  - o gatilho `mail_deliveries_transition`: todas as transições de `data-model.md` aceitas e as
    demais recusadas com `INVALID_STATE_TRANSITION` (finais imóveis; `DELIVERED → UNDELIVERED` só
    com `COMPLAINED` ou `BOUNCED`; `UNDELIVERED → UNDELIVERED` com outro motivo recusado;
    `PENDING → DELIVERED` e `PENDING → UNDELIVERED (BOUNCED | COMPLAINED)` aceitos);
  - `mail_notices`: UNIQUE `(provider, notice_id)`, `notice_id` ≤ 200, append-only (UPDATE
    recusado; DELETE recusado sem `SET LOCAL devtrack.mail_purge = 'on'`),
    `delivery_id ON DELETE SET NULL`.
- [ ] T005 Teste primeiro: `apps/api/test/integration/017-migration.spec.ts`: as linhas de
  `class_invitation_deliveries` (uma por estado da 003) viram `CLASS_INVITATION` em
  `mail_deliveries` com os mesmos `id`, `status`, `attempts`, `next_attempt_at`, `last_error_code`,
  `sent_at` e datas; a tabela antiga deixa de existir. O teste aplica a migração sobre um banco
  na migração anterior (o padrão de teste de migração de `apps/api/CLAUDE.md`; se não houver, um
  script SQL equivalente que roda o `INSERT … SELECT` da migração sobre linhas semeadas).
- [ ] T006 Migração `apps/api/prisma/migrations/<ts>_production_email/migration.sql` e
  `apps/api/prisma/schema.prisma`, com T004 e T005 verdes ao final:
  - enums `mail_kind`, `undelivered_reason`, `discard_reason`, `mail_notice_provider`,
    `mail_notice_kind`; `delivery_status` += `DELIVERED`, `UNDELIVERED`, `DISCARDED`;
  - tabelas `mail_deliveries` e `mail_notices` com FKs, CHECKs, índices e gatilhos;
  - cópia das linhas da 003 e `DROP TABLE class_invitation_deliveries`.

  Também na mesma tarefa:
  - `resetDb` (`apps/api/test/helpers/`) apaga as tabelas novas na ordem certa;
  - `domain-boundary.spec.ts` fixa `MailDelivery` e `MailNotice` e tira
    `ClassInvitationDelivery`;
  - o código que usava `classInvitationDelivery` compila contra `mailDelivery` com
    `kind: CLASS_INVITATION` (troca mecânica em `class-invitations/delivery.service.ts` e
    `delivery.worker.ts`; a substituição real é a T014), e as suítes 003 seguem verdes.
- [ ] T007 [P] `Mailer` (research N5, N8) em `apps/api/src/platform/mail/`:
  - `mailer.ts`: a mensagem ganha `messageId` e `replyTo`; o resultado é `SENT` ou um erro
    tipado `MailSendError` com `permanent: boolean` e `code` (`EENVELOPE`, `ETIMEDOUT`, `EAUTH`,
    `ECONNECTION`, `SMTP_4XX`, `SMTP_5XX`);
  - `smtp.mailer.ts`: `Message-ID` próprio, `replyTo` de `MAIL_REPLY_TO`, timeout de
    `MAIL_SEND_TIMEOUT_SECONDS` (conexão, saudação e socket) e a classificação (5xx em
    `RCPT`/`DATA` → permanente; rede, timeout, 4xx e `EAUTH` → temporário);
  - `in-memory.mailer.ts`: guarda o Message-ID recebido; `FailingMailer` com modos `temporary`,
    `permanent` e `auth`;
  - teste unitário `smtp.mailer.spec.ts` da classificação com respostas SMTP simuladas
    (`017/FR-004`).
- [ ] T008 [P] Contrato do assunto em `apps/api/src/platform/mail/outbox/mail-subject.ts`:
  `MailSubject { kind; prepare(tx, delivery) → { to, template, params, link } | { discard:
  reason } }` e o registro `MailSubjectRegistry` (cada módulo registra o seu no `onModuleInit`,
  como os ganchos da 015). Mover `delivery-schedule.ts` e o seu teste de `class-invitations` para
  `apps/api/src/platform/mail/outbox/` sem mudar a tabela de esperas.
  - `apps/api/test/mail-boundary.spec.ts`: `src/platform/mail/**` não importa `src/modules/**`
    nem pacote de provedor (`resend`, `@aws-sdk/*`, `svix`); `nodemailer` só em
    `smtp.mailer.ts` (`017/FR-024`).
- [ ] T009 Acrescentar `017` ao `SPECS` de `apps/api/test/traceability.spec.ts` (regra do
  CLAUDE.md), com `stories: 4`, `scenarios: 25`, `rows: 0`, `successCriteria: sc(1, 8)` e
  `pending: { stories: [1, 2, 3, 4], successCriteria: ["SC-001", …, "SC-008"] }`.
  - Cada história sai de `pending` na tarefa que escreve o último teste dela.
  - Cada SC sai de `pending` quando o teste que o cita entra.
  - Ao fim da T045, `pending` está vazio.

**Checkpoint**: migração aplicada, `Mailer` classificando erros, guardas verdes.

---

## Phase 3: User Story 1 — Todo e-mail sobrevive a uma falha de envio (Priority: P1) 🎯 MVP

**Goal**: os seis e-mails passam pela fila `mail_deliveries`, com a primeira tentativa logo depois
do commit, novas tentativas com as esperas da 003, link novo a cada tentativa, descarte de links
mortos e um envio por tentativa, no máximo.

**Independent Test**: com o `FailingMailer`, pedir uma redefinição de senha e convidar um
professor; a resposta é a de sempre e os envios ficam `PENDING`. Trocar pelo `InMemoryMailer` e
chamar `runOnce()`: os dois e-mails saem uma vez, o link recebido funciona e o anterior não.

### Tests for User Story 1 ⚠️

- [ ] T010 [P] [US1] `apps/api/test/integration/017-us1-outbox.spec.ts`, cobrindo:
  - os cenários `017/US1-1`, `017/US1-2`, `017/US1-3`, `017/US1-4`, `017/US1-5`, `017/US1-6` e
    `017/US1-7`;
  - `017/FR-001` (operação desfeita → nenhum envio), `017/FR-003` (as 7 tentativas e as esperas
    pelo `FixedClock`), `017/FR-004` (5xx → `UNDELIVERED (REJECTED)` sem nova tentativa),
    `017/FR-006`, `017/FR-007`, `017/FR-008` (limite por minuto e `0` pausa sem perda: 200
    convites de turma criados num minuto com limite 120 → no máximo 120 envios no minuto, o
    restante sai no worker; com `0`, nem a primeira tentativa sai) e
    `017/FR-009` (nenhuma coluna guarda endereço, nome, link, token ou hash);
  - `017/SC-001`: com o mailer fora por 6 h de relógio, todos os e-mails pedidos saem depois, um
    por envio.

  Por tipo (os seis), o teste verifica: a linha nasce na transação, a primeira tentativa sai
  depois do commit, a nova tentativa gera link novo e mata o anterior, e o descarte da tabela
  "Subjects" de `contracts/mail-delivery.md` (convite aceito/cancelado/expirado, e-mail já
  verificado, conta `SUSPENDED`, bootstrap concluído; com `--print-link` e o mailer falhando, o
  envio fica `DISCARDED` e o link impresso continua funcionando depois de um `runOnce`). A redefinição de senha de um e-mail
  inexistente não agenda nada. Uma nova tentativa não muda `expires_at`, `send_count` nem
  `last_sent_at` do convite (003 FR-015).
- [ ] T011 [P] [US1] `apps/api/test/security/017-concurrency.spec.ts` (`017/FR-005`):
  - dois `runOnce` simultâneos nunca enviam a mesma tentativa;
  - a primeira tentativa (`attemptNow`) concorrendo com o worker sai uma vez;
  - um resultado atrasado de uma tentativa antiga não sobrescreve a atual;
  - uma tentativa em voo que passa do `inFlightDeadline` (reinício simulado) volta à fila sem
    duplicar;
  - dois pedidos seguidos do mesmo tipo e assunto: o primeiro fica `SUPERSEDED` e só o link do
    segundo chega.
- [ ] T012 [P] [US1] `apps/api/test/security/017-performance.spec.ts` (`017/SC-002`, `017/FR-002`):
  confirmação e redefinição de senha respondem com o mesmo corpo e a mesma distribuição de tempo
  (a tolerância de `us1-enumeration.spec.ts`) com o mailer no ar, fora (`temporary`) e lento
  (atraso de 5 s), para e-mail existente e inexistente; o fluxo grava um INSERT e não espera o
  SMTP.

### Implementation for User Story 1

- [ ] T013 [US1] `apps/api/src/platform/mail/outbox/mail-outbox.ts` (`MailOutbox`):
  - `schedule(tx, kind, subject)`: grava `PENDING`, `attempts = 0`, `next_attempt_at = now + 1
    min` e marca `SUPERSEDED` os pendentes do mesmo assunto e tipo;
  - `attemptNow(deliveryId, prepared)`: depois do commit, consome uma unidade do orçamento de
    `MAIL_SENDS_PER_MINUTE` (sem orçamento, não envia e a linha fica para o worker), reivindica a
    linha (`FOR UPDATE`, `attempts 0 → 1`, `message_id = <{id}.{attempt}@{domínio}>`, prazo em
    voo), envia com esse `Message-ID` e grava o resultado só se a linha ainda está `PENDING`
    naquela tentativa (um aviso que chegou antes vence);
  - `record(result)`: `SENT` + `sent_at`; permanente → `UNDELIVERED (REJECTED)`; temporário →
    próxima espera ou `FAILED` na 7ª;
  - `latestDeliveryState(kind, subjectIds)` para as visões: a tabela "Derived" de
    `data-model.md` (`DISCARDED`/`SUPERSEDED` → a situação da linha anterior), em uma consulta
    para a lista inteira.
  - Auditoria (mesma tarefa: `audit-event-types.ts`, `contracts/audit-events.md`, `journey.ts`):
    `mail_delivery.failed`, `mail_delivery.undelivered` (`source: SMTP`) e
    `mail_delivery.discarded`, ator `SYSTEM`, alvo `MAIL_DELIVERY`, metadados só com `kind`,
    `attempts`, `errorCode`, `reason` e `source`.
- [ ] T014 [US1] `apps/api/src/platform/mail/outbox/mail-delivery.worker.ts`
  (`MailDeliveryWorker`, substitui `ClassInvitationDeliveryWorker`):
  - timer de `MAIL_RETRY_INTERVAL_SECONDS` (`0` desliga), `runOnce(now)` para os testes;
  - orçamento de `MAIL_SENDS_PER_MINUTE` por uma chave compartilhada em `rate_limit_counters`
    (`0` → não reivindica nada);
  - reivindica até `min(50, orçamento)` linhas devidas (`FOR UPDATE SKIP LOCKED`, ordem
    `next_attempt_at, created_at`) gravando o `message_id` da tentativa na reivindicação, chama
    `MailSubject.prepare` do tipo na mesma transação
    (descarta, substitui ou gera token novo), confirma e envia fora da transação;
  - `EAUTH`: um log `mail.auth_failed` por ciclo; logs `mail.delivery_failed` e
    `mail.delivery_exhausted` com `kind`, `deliveryId`, `attempt`, `errorName` (contracts
    `audit-events.md`).
  - Apagar `apps/api/src/modules/class-invitations/delivery.{service,worker}.ts` e registrar o
    worker em `MailModule`.
- [ ] T015 [P] [US1] Assunto `CLASS_INVITATION` em
  `apps/api/src/modules/class-invitations/class-invitation.mail-subject.ts`: trava o convite,
  descarta se não está efetivamente `PENDING` (`ACCEPTED`, `CANCELLED` ou expirado),
  gira `token_hash` e devolve o destinatário e os parâmetros do modelo. `class-invitations.service.ts`
  (criar e reenviar) chama `MailOutbox.schedule` + `attemptNow`; `class-invitation.view.ts` lê
  `latestDeliveryState`. Migrar `003-class-invitation-delivery.spec.ts`, `003-us2`, `003-us5`,
  `003-concurrency` e `secret-leak-scan.spec.ts` para `mail_deliveries`, mantendo cada caso e os
  seus ids da 003.
- [ ] T016 [P] [US1] Contrato: `packages/contracts/src/provisioning/invitations.ts` ganha
  `delivery` e `deliveryIssue`, importados de `classes` (nunca redefinidos; `duplication.spec.ts`
  verde), e `pnpm --filter @repo/contracts build`. Assuntos `INVITATION_TEACHER` e
  `INVITATION_MANAGER` em
  `apps/api/src/modules/provisioning/invitation.mail-subject.ts` (descarta se não `PENDING` ou
  expirado; gira `invitations.token_hash`); `invitation.service.ts` troca o `MailDispatcher` pela
  fila; `invitation.view.ts` passa a preencher `delivery` com `latestDeliveryState` (e
  `deliveryIssue: null` até a US2).
- [ ] T017 [P] [US1] Assuntos `VERIFY_EMAIL` e `PASSWORD_RESET` em
  `apps/api/src/modules/auth/account.mail-subjects.ts`: descartam com `NOT_NEEDED` (e-mail já
  verificado) ou `REVOKED` (conta `SUSPENDED`), emitem um `user_tokens` novo do propósito pelo
  `user-token.service.ts` (que já invalida os antigos). `email-verification.service.ts` e
  `password-reset.service.ts` agendam na transação do pedido; a resposta não muda. Ajustar
  `apps/api/test/integration/mail-failure.spec.ts` (001) ao novo comportamento: mesma resposta, o
  envio fica `PENDING` e sai no `runOnce`.
- [ ] T018 [P] [US1] Assunto `ADMIN_ACTIVATION` em
  `apps/api/src/modules/admin-bootstrap/admin-bootstrap.mail-subject.ts` (descarta se o bootstrap
  não está `PENDING` ou expirou; gira `token_hash`). `admin-bootstrap.service.ts` agenda e o CLI
  (`src/cli/admin-bootstrap.command.ts`) faz a primeira tentativa síncrona e informa o resultado;
  sem `--print-link`, numa falha (ou sem orçamento) a linha fica `PENDING`, sai com o código 3 e a
  mensagem "o e-mail será tentado de novo pela API"; com `--print-link`, a falha marca o envio
  `DISCARDED (NOT_NEEDED)`, sai com o código 3 e a mensagem "e-mail não enviado; use o link
  impresso", e o link impresso continua valendo (nenhuma nova tentativa gira o token). Atualizar
  `us3-admin-bootstrap-cli.spec.ts` e `us3-admin-bootstrap.spec.ts`, com os dois casos.
- [ ] T019 [US1] Remover `MailDispatcher` (`mail-dispatcher.ts`) e as suas importações; nenhum
  envio fora da fila (`mail-boundary.spec.ts` ganha a regra: só `platform/mail/outbox` chama
  `Mailer.send`). Rodar T010–T012 verdes e tirar a US1, `SC-001` e `SC-002` de `pending`.

**Checkpoint**: os seis e-mails passam pela fila; as suítes 001 e 003 seguem verdes.

---

## Phase 4: User Story 2 — Quem convidou vê que o convite não foi entregue (Priority: P1)

**Goal**: o provedor avisa por uma rota pública assinada; o aviso é guardado uma vez, ligado pelo
Message-ID e aplicado pela tabela de N7; os convites mostram "Não entregue" com o motivo e o
"Reenviar" para o mesmo endereço pede confirmação.

**Independent Test**: convidar um aluno, postar um aviso Resend `email.bounced` (Permanent)
assinado para o Message-ID do envio e conferir a visão do professor (`UNDELIVERED`, `BOUNCED`);
o mesmo aviso de novo não muda nada; com assinatura errada → `401`.

### Tests for User Story 2 ⚠️

- [ ] T020 [P] [US2] Helper `apps/api/test/helpers/mail-notices.ts` (research N14):
  `signedResendNotice({ type, messageId, bounceType?, at })` (Svix: `svix-id`, `svix-timestamp`,
  `svix-signature` com o segredo de teste) e `signedSnsNotice({ type, messageId, … })` com uma
  chave RSA e um certificado autoassinado gerados por `node:crypto`, servidos por um
  `CertificateFetcher` injetado com o host real `sns.sa-east-1.amazonaws.com`; também
  `snsSubscriptionConfirmation`.
- [ ] T021 [P] [US2] `apps/api/test/integration/017-us2-notices.spec.ts`, cobrindo:
  - os cenários `017/US2-1`, `017/US2-2`, `017/US2-3`, `017/US2-4` (o campo que a tela usa para
    pedir a confirmação), `017/US2-6`, `017/US2-7` (nenhuma linha em `mail_notices`), `017/US2-8` e
    `017/US2-9`;
  - `017/FR-010`, `017/FR-012`, `017/FR-013` (temporário fica só no registro), `017/FR-014` (o
    mesmo cenário pelo Resend e pelo SES), `017/FR-015` (professor, ADMIN e gestor veem, cada um
    só os seus convites), `017/FR-017` e `017/FR-018` (as respostas públicas de confirmação e
    senha não mudam com um envio `UNDELIVERED`);
  - `017/SC-003`: o convite aparece `UNDELIVERED` na primeira leitura depois do aviso;
  - os casos de borda: aviso fora de ordem (bounce antes do delivered; o delivered depois não
    desfaz; um bounce emitido antes do delivered e recebido depois leva a `UNDELIVERED`), aviso de
    entregue/voltou antes do resultado do SMTP (aplicado; o `SENT` posterior é ignorado; um aviso de
    uma tentativa que não é a atual nunca move um envio `PENDING`, regra do serviço), vários
    avisos (o primeiro motivo final fica, todos os avisos guardados), aviso de uma tentativa antiga e
    de um envio substituído (a situação do convite segue o envio mais recente), aviso de dias
    depois, tipos ignorados (`email.opened`, `email.clicked`, `email.sent`) não guardados.
- [ ] T022 [P] [US2] `apps/api/test/security/017-notice-auth.spec.ts` (`017/US2-5`,
  `017/FR-011`, `017/SC-004`):
  - Resend: sem cabeçalhos, assinatura errada, corpo alterado, segredo de outro ambiente,
    timestamp fora de ±5 min, várias assinaturas no cabeçalho (uma válida passa) → `401
    NOTICE_REJECTED` sem detalhe e sem leitura de banco (espião no Prisma);
  - SES: `SignatureVersion` 1, `SigningCertURL` de outro host (`sns.evil.com`,
    `sns.sa-east-1.amazonaws.com.evil.com`, `http://`), certificado que não assina, `TopicArn`
    diferente, confirmação de outro tópico → `401`, sem buscar o `SubscribeURL`;
  - `:provider` que não é o configurado → `404`; corpo > 256 KB → `413`; JSON malformado com
    assinatura válida → `401` (`FORMAT`); limite por IP → `429`;
  - 100 avisos repetidos em paralelo → uma linha em `mail_notices` e um efeito;
  - recusas vão para o log `mail.notice_rejected` com `provider` e `reason`, nunca para a
    auditoria.
- [ ] T023 [P] [US2] Web, testes primeiro:
  - `apps/web/features/classes/components/class-invitations-tab.test.tsx`;
  - `apps/web/features/teachers/components/professores.test.tsx`;
  - `apps/web/features/managers/components/managers.test.tsx`.

  Cada um cobre (`017/US2-1`, `017/US2-2`, `017/US2-4`, `017/FR-015`, `017/FR-016`): o badge
  `warning` "Não entregue" com o texto do motivo (`contracts/web-ui.md`), nunca só cor; só em
  convite `PENDING`; "Reenviar" num `UNDELIVERED` abre o `AlertDialog` e só reenvia em
  "Reenviar", "Voltar" não chama a API; num convite sem problema, o reenvio da 003/001 segue
  igual; `axe` sem violações. Nas listas de professores e gestores (novas nisso): badge `neutral`
  "Enviando" e `danger` "Envio falhou", sem badge para `SENT`.

### Implementation for User Story 2

- [ ] T024 [US2] HTTP da rota pública em `apps/api/src/platform/http/`:
  - `@ProviderNotice()` (ao lado de `@AcceptsMultipart()`): o `OriginGuard` deixa passar sem
    `Origin` e com `application/json` ou `text/plain`;
  - `rawBody: true` em `apps/api/src/main.ts` e em `createTestApp`
    (`apps/api/test/helpers/test-app.ts`), com o limite de 256 KB só nessa rota;
  - `004-origin-multipart.spec.ts` ganha o caso: o marcador não abre outra rota.
- [ ] T025 [P] [US2] Adaptador Resend `apps/api/src/platform/mail/notices/resend.adapter.ts`:
  verificação Svix (HMAC-SHA256 de `${id}.${timestamp}.${body}`, `timingSafeEqual`, ±5 min pelo
  `Clock`), `ResendNoticeSchema` estrito nos campos usados e o mapeamento de N7 para
  `DELIVERED | BOUNCED | TEMPORARY | COMPLAINED | REJECTED | IGNORED`. Teste unitário
  `resend.adapter.spec.ts`.
- [ ] T026 [P] [US2] Adaptador SES `apps/api/src/platform/mail/notices/ses.adapter.ts` e
  `certificate-fetcher.ts`: SNS `SignatureVersion` 2, host do certificado
  `^sns\.[a-z0-9-]+\.amazonaws\.com$` por `https`, cache por URL, `fetch` com 5 s; texto a assinar
  pelas regras do SNS para `Notification` e `SubscriptionConfirmation`; `TopicArn` igual a
  `MAIL_SES_TOPIC_ARN`; confirmação buscando o `SubscribeURL` (mesma regra de host); o
  `SesNotificationSchema` lê `mail.commonHeaders.messageId` e o mapeamento de N7. Teste unitário
  `ses.adapter.spec.ts`.
- [ ] T027 [US2] `apps/api/src/platform/mail/notices/mail-notices.{controller,service}.ts`:
  - controller fino: `@Public()`, `@ProviderNotice()`, lê o corpo bruto e chama o serviço; `404`
    para o provedor não configurado; limite por IP de `RATE_LIMIT_MAIL_NOTICES_PER_MINUTE`;
  - serviço: verifica antes de qualquer banco; liga pelo Message-ID **antes** do `INSERT`
    (`message_id` da linha ou o `{id}.{n}` de uma tentativa antiga; desconhecido → log
    `mail.notice_unmatched` e contagem, sem linha); `INSERT … ON CONFLICT DO NOTHING` em
    `mail_notices` por `(provider, notice_id)`; aplica a transição de N7 com `FOR UPDATE` (o
    primeiro motivo final fica, `DELIVERED` nunca desfaz `UNDELIVERED`, um envio ainda `PENDING`
    na tentativa do aviso vai direto a `DELIVERED`/`UNDELIVERED` com `sent_at`); audita
    `mail_delivery.undelivered` com `source: NOTICE`;
  - rota nova: `mail.notice` em `endpoints.ts` (com os esquemas da T003), linha no `MATRIX` de `authorization-matrix.ts` (pública)
    e `route-declarations.spec.ts` com o motivo.
- [ ] T028 [US2] Visões dos convites: `class-invitation.view.ts` e
  `provisioning/invitation.view.ts` preenchem `deliveryIssue` a partir de `latestDeliveryState`
  (T013); as listas seguem em uma consulta de envios por página
  (`003-list-performance.spec.ts` verde). Nenhuma visão de conta mostra envio (`017/FR-018`).
- [ ] T029 [P] [US2] Web:
  - `apps/web/lib/messages/status-labels.ts`: "Não entregue" e os dois textos de motivo;
  - componente compartilhado `apps/web/features/invitations/components/delivery-status.tsx`
    (`Badge` + texto, os quatro estados de `contracts/web-ui.md`) e `resend-confirm-dialog.tsx` (`AlertDialog`), usados por
    `class-invitations-tab.tsx`, `teachers-admin.tsx` e `managers-admin.tsx`; se `features/`
    não aceitar uma pasta compartilhada pelas camadas do ESLint, ficam em
    `apps/web/components/invitations/`;
  - T023 verde.
- [ ] T030 [P] [US2] CLI de desenvolvimento `apps/api/src/cli/mail-notice.command.ts` e o script
  `mail:notice` em `apps/api/package.json` (quickstart passo 3): `--kind
  delivered|bounced|complained|failed --delivery <id> [--bad-signature]`, assina com o
  `MAIL_NOTICE_SECRET` local e posta na API; recusa `NODE_ENV=production`. Teste em
  `apps/api/test/integration/017-us2-notices.spec.ts` (não roda em produção).
- [ ] T031 [US2] Rodar T020–T023 verdes e tirar a US2, `SC-003` e `SC-004` de `pending`.

**Checkpoint**: MVP — a fila e o "Não entregue" funcionam de ponta a ponta com avisos assinados.

---

## Phase 5: User Story 3 — E-mails com a cara do DevTrack (Priority: P2)

**Goal**: os seis e-mails saem de uma fonte por tipo, com versão HTML segura para clientes de
e-mail e versão em texto com o mesmo conteúdo, sem recurso externo nem rastreamento.

**Independent Test**: gerar cada um dos seis com valores hostis e conferir as duas versões.

### Tests for User Story 3 ⚠️

- [ ] T032 [P] [US3] `apps/api/test/integration/017-us3-templates.spec.ts` (por tipo, os seis):
  - `017/US3-1`, `017/FR-019`: HTML e texto com o mesmo assunto, título, parágrafos, prazo e o
    mesmo link (o link aparece por extenso nas duas);
  - `017/US3-2`, `017/FR-020`: nome de turma/pessoa com `<script>`, `<img onerror>`, `"`, `&` e
    `{{` aparece escapado no HTML e literal no texto;
  - `017/US3-3`, `017/FR-021`: o HTML não contém `<img`, `<link`, `<script`, `@import`, `url(`,
    `src=`, `http` fora do link do DevTrack (`APP_ORIGIN`) e nenhum parâmetro de rastreio;
  - `017/US3-4`, `017/FR-022`: `lang="pt-BR"`, ação como texto do link (não imagem), preheader
    oculto, contraste ≥ 4.5 entre as cores de `mail-tokens.ts` (o cálculo de
    `apps/web/test/contrast.test.ts`);
  - `017/SC-005`: a varredura dos seis passa;
  - o e-mail recebido pelo `InMemoryMailer` tem `html`, `text`, `from` "DevTrack <…>" e
    `replyTo` quando configurado (`017/FR-023`).
- [ ] T033 [P] [US3] `apps/web/test/mail-tokens.test.ts`: as cores de
  `apps/api/src/platform/mail/templates/mail-tokens.ts` são as do tema claro de
  `apps/web/design-system/tokens.css` (`--primary`, `--foreground`, `--text-secondary`,
  `--background`, `--border`), lidas dos dois arquivos como texto (sem import entre apps).

### Implementation for User Story 3

- [ ] T034 [US3] `apps/api/src/platform/mail/templates/`: `layout.ts` (renderiza `{ html, text }`
  de `{ subject, heading, paragraphs, action, expiry, footer }`: tabelas, estilos inline, fonte do
  sistema, botão como link e link por extenso), `escape-html.ts`, `mail-tokens.ts` e um arquivo por
  tipo (`verify-email.ts`, `password-reset.ts`, `invitation-teacher.ts`, `invitation-manager.ts`,
  `admin-activation.ts`, `class-invitation.ts`) com os textos atuais de `templates.ts` (sem mudar
  o conteúdo, só a forma). Apagar `templates.ts`; os `MailSubject` (T015–T018) passam a usar os
  novos modelos. T032 e T033 verdes; tirar a US3 e `SC-005` de `pending`.

**Checkpoint**: os seis e-mails com HTML e texto, no Mailpit e nos testes.

---

## Phase 6: User Story 4 — Operador coloca o envio em produção e troca de provedor só pela configuração (Priority: P2)

**Goal**: a API recusa configuração de desenvolvimento em produção, nenhuma credencial vaza, e o
guia leva do Resend ao SES só com configuração e DNS.

**Independent Test**: subir a configuração com `NODE_ENV=production` e cada valor proibido; trocar
`MAIL_NOTICE_PROVIDER` de `resend` para `ses` com a mesma versão e ver os avisos e os envios
pendentes seguirem.

### Tests for User Story 4 ⚠️

- [ ] T035 [P] [US4] `apps/api/test/integration/017-us4-config.spec.ts`:
  - `017/US4-2`, `017/FR-025`: com `NODE_ENV=production` o carregador recusa `smtp://` sem
    `requireTLS`, `localhost`, `127.0.0.1`, `10.x`, `172.16–31.x`, `192.168.x`, `::1`, `mailpit`,
    `MAIL_FROM` sem domínio e `MAIL_NOTICE_PROVIDER=none`; aceita `smtps://…:465` e
    `smtp://…:587?requireTLS=true`; a mensagem nomeia a variável e nunca o valor;
  - `017/US4-3`, `017/US4-4`, `017/SC-006`: com envios `PENDING`, `SENT` e `UNDELIVERED`, a API
    recriada com outro `SMTP_URL` e `MAIL_NOTICE_PROVIDER=ses` envia os pendentes pelo novo
    mailer, aceita avisos SES, recusa os do Resend (`404`) e não muda a situação dos antigos;
  - `017/FR-029`: `.env.test.example` e `apps/web/e2e/.env.e2e` apontam para o Mailpit.
- [ ] T036 [P] [US4] `apps/api/test/security/secret-leak-scan.spec.ts` (`017/US4-5`,
  `017/FR-026`, `017/SC-007`): a senha do `SMTP_URL`, o `MAIL_NOTICE_SECRET`, os endereços, nomes,
  links e tokens dos seis e-mails nunca aparecem em logs, auditoria, linhas de
  `mail_deliveries`/`mail_notices` nem respostas, inclusive nos erros de SMTP (`EAUTH` com a URL),
  no erro do carregador de configuração e nas recusas de aviso; o Message-ID só aparece em
  `mail_deliveries.message_id`, nunca em logs, auditoria ou respostas.
- [ ] T037 [P] [US4] `apps/api/test/integration/017-email-guide.spec.ts` (`017/US4-1`, `017/FR-027`,
  `017/FR-028`, `017/SC-008`): `docs/deploy/email.md` existe, é linkado pelo `README.md` e cobre as
  seções obrigatórias (conta e domínio no Resend; SPF, DKIM, DMARC e return-path; as variáveis de
  `contracts/configuration.md`, todas citadas; o webhook e os 5 eventos; rastreamento desligado; a
  verificação `spf=pass`/`dkim=pass`/`dmarc=pass`; limites; a troca para o SES com identidade,
  DKIM, MAIL FROM, saída do sandbox, credenciais SMTP, configuration set sem rastreio, SNS com
  cabeçalhos originais; a nota da LGPD).

### Implementation for User Story 4

- [ ] T038 [US4] Guarda de produção em `apps/api/src/platform/config/config.schema.ts`
  (`superRefine` só com `NODE_ENV=production`, mensagens sem valores) e a lista de segredos do
  scan (008) com a senha do `SMTP_URL` e o `MAIL_NOTICE_SECRET`; `SmtpMailer` nunca loga a URL.
  T035 e T036 verdes.
- [ ] T039 [US4] Guia `docs/deploy/email.md` (português, research N15 e quickstart "Production" e
  "Switching to SES"), com o link no `README.md` e a lista de variáveis igual a
  `contracts/configuration.md`. T037 verde; tirar a US4, `SC-006`, `SC-007` e `SC-008` de
  `pending`. O `SC-008` (e-mails autenticados fora do spam) e o `SC-006` real (homologação) são
  verificações manuais do operador pelo guia; o teste cobre o procedimento.

**Checkpoint**: produção configurável, segredos fora de tudo, guia pronto.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [ ] T040 Retenção `mail-records` (`contracts/maintenance-jobs.md`, research N13) em
  `apps/api/src/platform/mail/retention/mail-records.job.ts`, registrado no
  `maintenance.service.ts`: avisos com mais de 90 dias; envios finais com mais de
  `MAIL_RECORDS_RETENTION_DAYS`, exceto o último de um convite `PENDING`; lotes de 1 000, numa
  transação com `SET LOCAL devtrack.mail_purge = 'on'`;
  `maintenance.job_completed` só com contagens. Teste em
  `apps/api/test/integration/maintenance.spec.ts` com `FixedClock`.
- [ ] T041 Auditoria e journey: `apps/api/test/helpers/journey.ts` com envio que falha, descarte,
  rejeição SMTP e aviso de bounce; `audit-coverage.spec.ts`: os três tipos novos com metadados só
  de enums, contagens e códigos.
- [ ] T042 [P] Segurança restante em `apps/api/test/security/017-boundaries.spec.ts`:
  - nenhuma rota além de `POST /mail/notices/:provider` é nova (`contracts/http-api.md`);
  - nenhuma resposta pública, de conta ou de `/me` contém `delivery`/`deliveryIssue`;
  - o professor B não vê a situação dos convites da turma de A (`404`), ADMIN e gestor só pelas
    permissões de 001;
  - a rota de avisos com `Origin` de fora e cookie de sessão não ganha sessão nem audita ator
    humano;
  - desempenho do aviso: p95 < 200 ms em 100 avisos válidos (plan, Performance Goals);
  - `017/FR-030`: nenhuma rota envia e-mail fora dos seis tipos nem em lote, nenhuma tabela guarda
    endereço bloqueado, nenhum receptor de e-mail, `mail_kind` tem exatamente os seis valores.
- [ ] T043 E2E `apps/web/e2e/production-email.spec.ts` (`017/US2-1`, `017/US2-4`, `017/US3-1`):
  1. o professor convida um aluno; no Mailpit o e-mail tem HTML e texto com o mesmo link e nenhuma
     imagem externa;
  2. o teste posta um aviso Resend `email.bounced` assinado (segredo do `.env.e2e`) para o
     Message-ID lido do Mailpit, na API E2E;
  3. a aba de convites mostra "Não entregue" com o motivo; "Reenviar" pede confirmação; "Voltar"
     não reenvia; tudo pelo teclado.

  A redefinição do banco E2E pede consentimento do usuário.
- [ ] T044 [P] Documentação:
  - `CLAUDE.md`: Project state com a 017; regra fácil de errar (todo e-mail pela fila, nada do
    e-mail guardado, aviso só muda o envio, rota pública só pela assinatura); `SPECS` da
    rastreabilidade com a 017; comandos `mail:notice`;
  - `apps/api/CLAUDE.md`: `platform/mail/outbox` e `notices`, `MailSubject`, helpers
    `mail-notices.ts`, suítes 017, o fim do `ClassInvitationDeliveryWorker`;
  - `apps/web/CLAUDE.md`: o status de envio dos convites;
  - `specs/003-class-invitations-enrollment/contracts/mail-delivery.md`: nota de que a 017 o substitui
    (sem reescrever a 003);
  - `README.md`: link do guia.
- [ ] T045 Rodar o `quickstart.md` local de ponta a ponta (passos 1–4 com `pnpm dev` e Mailpit) e
  `pnpm lint && pnpm check-types && pnpm test`; `pending` da 017 vazio.

---

## Dependencies & Execution Order

- **Ordem das fases**: Setup (T001–T003) → Foundational (T004–T009) → histórias → Polish.
- **US1 (T010–T019)**: depende da Foundational (a T016 também muda o contrato do provisioning e
  reconstrói `@repo/contracts`) e destrava a US2 (o `message_id` e
  `latestDeliveryState`). Dentro dela, T013 → T014 → T015–T018 (em paralelo) → T019.
- **US2 (T020–T031)**: depende da US1. T024 → T025/T026 → T027 → T028 → T029; T030 depois da
  T027.
- **US3 (T032–T034)**: depende só da Foundational e dos `MailSubject` da US1 para a troca final
  (T034); os testes T032/T033 podem ser escritos junto com a US2.
- **US4 (T035–T039)**: a guarda depende da configuração (T001) e o teste de troca de provedor dos
  adaptadores da US2 (T025, T026).
- **Polish (T040–T045)**: depois de todas; T040 só precisa da migração.
- **Dentro de cada história**: testes → regras puras e adaptadores → serviços e rotas → web.

## Parallel Opportunities

- **Setup**: T001, T002 e T003 juntos.
- **Foundational**: T007 e T008 em paralelo com T004/T005; T006 depois dos testes.
- **US1**: T010, T011 e T012 juntos; T015, T016, T017 e T018 juntos depois da T014.
- **US2**: T020–T023 juntos; T025 e T026 juntos; T029 e T030 juntos.
- **US2 e US3**: andam em paralelo depois da US1.
- **US4**: T035, T036 e T037 juntos.
- **Polish**: T042 e T044 em paralelo.

## Implementation Strategy

1. **MVP** = Setup + Foundational + US1 + US2: nenhum e-mail se perde numa falha do servidor de
   envio, e quem convidou vê o convite que não chegou.
2. **Incremento 2**: US3 (HTML + texto com a identidade do DevTrack).
3. **Incremento 3**: US4 (guarda de produção, segredos, guia Resend → SES) e Polish (retenção,
   auditoria, E2E, docs). A primeira implantação em produção precisa dos três incrementos.
