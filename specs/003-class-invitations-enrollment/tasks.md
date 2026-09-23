---

description: "Task list for 003 — Turmas, Convites e Matrículas de Alunos"
---

# Tasks: 003 — Turmas, Convites e Matrículas de Alunos

**Input**: Design documents from `/specs/003-class-invitations-enrollment/`
**Prerequisites**: plan.md, spec.md, research.md (D1–D16), data-model.md, contracts/
(http-api, permissions, audit-events, mail-delivery, web-ui), quickstart.md

**Tests**: obrigatórios (Constituição VII; spec §40–§41). Os testes de cada história
são escritos antes da implementação e falham antes dela. Títulos de `describe`/`it`
levam o id da spec 003 com prefixo (`003/US2-3`, `003/FR-048`, `003/SC-004`), que
`apps/api/test/traceability.spec.ts` passa a procurar na fase final. Cada fase termina
com `pnpm lint && pnpm check-types && pnpm test` verde.

**Organization**: tarefas agrupadas por user story. A ordem das fases segue as
dependências reais: US8 (fim do autocadastro e matriz de autorização) vem depois de
US1–US3, porque os testes que hoje criam alunos por cadastro público precisam de outro
caminho antes de a rota sair.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivos diferentes, sem dependência pendente)
- **[Story]**: user story da tarefa (US1…US8)
- Caminhos relativos à raiz do repositório

---

## Phase 1: Setup (infraestrutura compartilhada)

**Purpose**: configuração e utilitários que todas as histórias usam.

- [X] T001 Acrescentar em `apps/api/src/platform/config/config.schema.ts` as variáveis `MAIL_RETRY_INTERVAL_SECONDS` (`nonNegativeInt(30)`), `RATE_LIMIT_CLASS_INVITE_RESEND_SECONDS` (`positiveInt(60)`), `RATE_LIMIT_CLASS_INVITE_DAILY_SENDS` (`positiveInt(5)`) e `RATE_LIMIT_CLASS_INVITE_TEACHER_HOURLY` (`positiveInt(50)`), expostas em `AppConfig` como `mailRetryIntervalSeconds` e `rateLimit.classInvite{ResendSeconds,DailySends,TeacherHourly}`; documentar em `apps/api/.env.example`, `apps/api/.env.test.example` (`MAIL_RETRY_INTERVAL_SECONDS=0`) e `apps/web/e2e/.env.e2e` (`MAIL_RETRY_INTERVAL_SECONDS=5`) (D5, D6)
- [X] T002 [P] Criar `apps/api/src/platform/text/search-key.ts` com `searchKey(...parts: string[])` (NFD, remove diacríticos, minúsculas, espaços colapsados) e `apps/api/src/platform/text/search-key.spec.ts` (`003/FR-007`: "Programação" e "programacao" geram a mesma chave; código com hífen preservado) (D10)
- [X] T003 [P] Criar `apps/api/src/modules/identity/ra.ts` com `normalizeRa(value)` (trim, maiúsculas) e `apps/api/src/modules/identity/ra.spec.ts` (`003/FR-041`: `" 2026a-01 "` → `"2026A-01"`) (D2)
- [X] T004 [P] Mover `webLinks` de `apps/api/src/modules/auth/signup.service.ts` para `apps/api/src/platform/mail/links.ts`, acrescentando `classInvitation(token)` → `${webOrigin}/convite-turma?token=${token}`; atualizar os imports em `invitation.service.ts`, `email-verification.service.ts`, `password-reset.service.ts` e `admin-bootstrap.service.ts` (D12)
- [X] T005 [P] Escrever os componentes shadcn a partir do registro 4.21.0 (`pnpm dlx shadcn@4.21.0 view dialog alert-dialog select badge textarea`), com `import { cn } from "@/lib/utils"` e textos de acessibilidade em português ("Fechar"), em `apps/web/components/ui/{dialog,alert-dialog,select,badge,textarea}.tsx`, sem tocar em `package.json` (D14)

---

## Phase 2: Foundational (pré-requisitos bloqueantes)

**Purpose**: schema, contratos base, permissões, máquinas de estado e guardas. Nenhuma
história começa antes desta fase.

**⚠️ CRITICAL**: bloqueia todas as histórias.

- [X] T006 Atualizar `apps/api/prisma/schema.prisma` com os enums `ClassStatus`, `ClassInvitationStatus`, `ClassInvitationCancelReason`, `DeliveryStatus`, `StudentStatus`, `EnrollmentStatus`, o valor `CLASS_INVITATION` em `GrantSource`, os modelos `SchoolClass`, `ClassInvitation`, `ClassInvitationDelivery`, `Enrollment` e as colunas `ra`/`status` de `StudentProfile`, exatamente como em `data-model.md` (nomes `@@map` em snake_case, FKs `Restrict`, índices comuns)
- [X] T007 Gerar a migração `apps/api/prisma/migrations/<ts>_classes_invitations_enrollments/migration.sql` (`prisma migrate dev --create-only`) e acrescentar à mão: `CREATE UNIQUE INDEX` de `classes (teacher_id, upper(code))`, `class_invitations (class_id, email) WHERE status = 'PENDING'`, `enrollments (class_id, student_user_id) WHERE status = 'ACTIVE'`, `student_profiles (upper(ra)) WHERE ra IS NOT NULL`; os `CHECK`s de `data-model.md` (`academic_year BETWEEN 1900 AND 2100`, coerência de `accepted_at`, `cancelled_at`/`cancel_reason`, `removed_at`, `sent_at`); as permissões `turmas.*` e suas associações de `contracts/permissions.md` (`INSERT … ON CONFLICT DO NOTHING`); aplicar com `pnpm --filter api prisma migrate deploy` no banco de teste
- [X] T008 [P] Acrescentar as 10 permissões `turmas.*` em `apps/api/src/modules/access-control/permissions.ts` e em `ROLE_PERMISSIONS` de `apps/api/test/security/authorization-matrix.ts` (TEACHER: 9; STUDENT: `turmas.proprias.listar`)
- [X] T009 [P] Criar os contratos em `packages/contracts/src/classes/{classes,class-invitations,enrollments,my-classes}.ts` com todos os schemas da tabela "Tipos compartilhados" de `contracts/http-api.md` (strict, tipos via `z.infer`, sem mensagens de usuário); exportar em `packages/contracts/src/index.ts`; acrescentar `CLASS_CODE_TAKEN`, `CLASS_NOT_OPEN`, `ALREADY_ENROLLED`, `RA_TAKEN`, `RA_REQUIRED`, `TOKEN_EXPIRED` em `packages/contracts/src/common/errors.ts` e `"CLASS_INVITATION"` onde o contrato lista `via`
- [X] T010 [P] Acrescentar os erros novos em `apps/api/src/platform/http/errors.ts` (`classCodeTaken` 409, `classNotOpen` 409, `alreadyEnrolled` 409, `raTaken` 409, `raRequired` 400, `tokenExpired` 400), na ordem do `ErrorCatalog`, e os textos correspondentes de `contracts/web-ui.md` em `apps/web/lib/messages/error-messages.ts` (o teste `error-catalog.spec.ts` e o do web conferem a paridade)
- [X] T011 [P] Criar as máquinas de estado `apps/api/src/modules/classes/class.state-machine.ts`, `apps/api/src/modules/class-invitations/class-invitation.state-machine.ts` e `apps/api/src/modules/enrollments/enrollment.state-machine.ts` no formato de `provisioning/invitation.state-machine.ts`, com testes `*.state-machine.spec.ts` ao lado (`003/FR-004`, `003/FR-014`, `003/FR-044`: todas as transições válidas e inválidas)
- [X] T012 [P] Criar `apps/api/src/modules/classes/class-context.policy.ts` (`ClassContextPolicy implements ResourceContextPolicy`, consulta `WHERE id = $1 AND teacher_id = $2`, `findOwnedOrNotFound`) e registrar os módulos vazios `ClassesModule`, `ClassInvitationsModule`, `EnrollmentsModule` em `apps/api/src/app.module.ts` (D7)
- [X] T013 [P] Acrescentar os tipos de auditoria de `contracts/audit-events.md` com as allowlists de `metadata` em `apps/api/src/modules/audit/audit-event-types.ts` (incluindo `CLASS_INVITATION` em `via` de `role.granted`/`account.claimed`) e o teste da allowlist em `apps/api/src/modules/audit/audit.service.spec.ts`
- [X] T014 Evoluir `apps/api/test/security/audit-coverage.spec.ts` para ler `specs/001-foundation-identity-access/contracts/audit-events.md` e `specs/003-class-invitations-enrollment/contracts/audit-events.md` (união dos tipos; a tabela "Tipos aposentados" só passa a ser descontada em T048, quando `auth.signup` sai do código), com um conjunto temporário `PENDING_003_TYPES` (todos os tipos novos) que dispensa só a checagem "emitido pela jornada"; cada história retira seus tipos desse conjunto quando `test/helpers/journey.ts` passar a emiti-los (D13)
- [X] T015 Renomear `apps/api/test/security/no-academic-domain.spec.ts` para `apps/api/test/security/domain-boundary.spec.ts`: `EXPECTED_MODELS` com os 18 modelos de `data-model.md`; permitir os termos de turma e matrícula (`turma`, `matricul`, `class`, `classes`, `enrollment`) e manter proibidos os demais prefixos acadêmicos; título `003/D13 fronteira do domínio` (D13)
- [X] T016 Acrescentar em `apps/api/test/helpers/factories.ts` as fábricas `createClass(t, teacherId, overrides)`, `createClassInvitation(t, classId, email, overrides)` (devolve `{invitation, token}` gerando token real) e `createEnrollment(t, classId, studentUserId)`, e a opção `ra` em `createUser`
- [X] T016a Namespacing em `apps/api/test/traceability.spec.ts`: `ID` passa a capturar um prefixo opcional de feature (`/\b(?:(\d{3})\/)?(US\d+-\d+|SC-\d{3}|FR-\d{3}[a-z]?)\b/g`); em `coverage()`, a chave é o id puro quando não há prefixo ou o prefixo é `001`, e `NNN/id` nos demais casos, de modo que `003/US1-1` não cubra o `US1-1` da 001; caso novo no teste do extrator (título `003/US1-1 …` não conta para a 001) (`003/D13`)

**Checkpoint**: `pnpm lint && pnpm check-types && pnpm test` verde; migração aplicada; nenhuma rota nova ainda.

---

## Phase 3: User Story 1 — Professor cria e administra as próprias turmas (Priority: P1) 🎯 MVP

**Goal**: professor ativo cria, lista (pesquisa, filtros, cursor), vê, edita e muda a situação das próprias turmas.

**Independent Test**: com um professor, criar duas turmas, pesquisar e filtrar, editar, inativar e reativar uma, arquivar a outra; outro professor recebe 404 em tudo.

### Tests for User Story 1 ⚠️

- [ ] T017 [P] [US1] Teste de integração `apps/api/test/integration/003-us1-classes.spec.ts`: `003/US1-1` (criar → 201 `ACTIVE`, dono da sessão, auditoria `class.created`), `003/US1-2` (pesquisa sem acento e sem maiúsculas, filtros `year`/`status`, padrão sem arquivadas, cursor de 20), `003/US1-3` (PATCH salva e audita `class.updated` com nomes dos campos; `teacherId`/`status` no corpo → 400), `003/US1-4` (código repetido com outra caixa → 409 `CLASS_CODE_TAKEN`, inclusive em duas requisições simultâneas), `003/US1-5` (`ACTIVE → INACTIVE → ACTIVE`, `ARCHIVED` final, edição em arquivada → 409, arquivar cancela convites pendentes na mesma operação, `class.status_changed`), `003/US1-6` (turma de outro professor → 404 em GET, PATCH e status)
- [ ] T018 [P] [US1] Testes do web `apps/web/features/classes/components/classes-list.test.tsx` e `class-form.test.tsx`: lista com pesquisa, filtros, "Carregar mais", estado vazio e de erro; formulário com erros junto aos campos, `CLASS_CODE_TAKEN` no campo Código, axe e ordem de tabulação (`SC-012`)

### Implementation for User Story 1

- [ ] T019 [US1] `apps/api/src/modules/classes/classes.service.ts`: `create` (grava `searchKey`, traduz conflito do índice em `CLASS_CODE_TAKEN`), `list` (keyset `created_at DESC, id DESC`, `escapeLike` sobre `searchKey`, filtros), `get`, `update` (bloqueia `ARCHIVED`), `changeStatus` (`FOR UPDATE`, máquina de estado, arquivar cancela convites `PENDING` com `cancel_reason = CLASS_ARCHIVED` e grava a contagem em `class.status_changed`), `activeStudentCount`; tudo via `ClassContextPolicy`; mapper `class.view.ts` para `ClassView`
- [ ] T020 [US1] `apps/api/src/modules/classes/classes.controller.ts` com as 5 rotas de "Turmas" de `contracts/http-api.md` (`@RequirePermissions`, `ZodBody`/`ZodValidationPipe` com os schemas do contrato); entradas `classes.list|create|get|update|changeStatus` em `packages/contracts/src/endpoints.ts`; linhas correspondentes em `MATRIX` de `apps/api/test/security/authorization-matrix.ts`
- [ ] T021 [US1] Emitir `class.created`, `class.updated` e `class.status_changed` em `apps/api/test/helpers/journey.ts` e retirá-los de `PENDING_003_TYPES`
- [ ] T022 [P] [US1] `apps/web/features/classes/api/classes.ts` e `hooks/use-classes.ts` (`useInfiniteQuery` com chave `["classes", filtros]`, `useClass`, mutations de criar, editar e situação com as invalidações de `contracts/web-ui.md`); `schemas/class-form.ts` derivado de `CreateClassRequestSchema`
- [ ] T023 [US1] Telas `apps/web/features/classes/components/{classes-list,class-form,class-status-actions}.tsx` (confirmação de arquivamento com `alert-dialog`, situação com `badge`) e rotas `apps/web/app/(app)/turmas/page.tsx`, `turmas/nova/page.tsx`, `turmas/[id]/editar/page.tsx`
- [ ] T024 [US1] Página `apps/web/app/(app)/turmas/[id]/page.tsx` com o cabeçalho da turma (nome, código, ano, período, situação, descrição, nº de alunos ativos, ações) e as abas "Alunos" e "Convites" ainda vazias; `/turmas/:path*` em `apps/web/proxy.ts`; item "Turmas" (`School`, `turmas.visualizar`) em `apps/web/components/shared/app-sidebar.tsx` e no teste `app-sidebar.test.tsx`

**Checkpoint**: professor gerencia turmas de ponta a ponta; suíte verde.

---

## Phase 4: User Story 2 — Professor convida aluno informando só o e-mail (Priority: P1)

**Goal**: convite de turma por e-mail com token de uso único, entrega assíncrona com novas tentativas e limites contra abuso.

**Independent Test**: convidar e-mail novo → convite pendente + e-mail; repetir → 409; aluno já matriculado → 409; mailer indisponível → convite criado e entregue quando o mailer volta.

### Tests for User Story 2 ⚠️

- [ ] T025 [P] [US2] Teste de integração `apps/api/test/integration/003-us2-class-invitations.spec.ts`: `003/US2-1` (201, validade 7 dias, e-mail `class-invitation` no `InMemoryMailer` com turma, professor, prazo e link), `003/US2-2` (e-mail inválido e campo extra → 400, nada criado), `003/US2-3` (pendente repetido → 409 `INVITATION_ALREADY_PENDING`), `003/US2-4` (matrícula ativa → 409 `ALREADY_ENROLLED`), `003/US2-5` (duas requisições simultâneas → um convite), `003/US2-7` (turma inativa/arquivada → 409 `CLASS_NOT_OPEN`), `003/US2-8` (corpo do e-mail sem senha, sem hash, token só dentro do link) e `003/FR-021` (limite por professor/hora → 429 com `Retry-After`)
- [ ] T026 [P] [US2] Teste de integração `apps/api/test/integration/003-class-invitation-delivery.spec.ts` (`003/US2-6`, `003/SC-007`, `contracts/mail-delivery.md`): mailer falhando → convite 201 e entrega `PENDING` com `attempts = 1`; mailer de volta + `worker.runOnce()` com relógio avançado → `SENT`, o link novo funciona e o da tentativa anterior não; convite cancelado antes da tentativa → `SUPERSEDED` sem envio; duas execuções simultâneas de `runOnce()` enviam uma vez; 7 falhas → `FAILED`; `expires_at`, `sendCount` e `lastSentAt` iguais antes e depois de `runOnce()` (`003/FR-015`); nenhuma linha de entrega, log ou auditoria contém token, hash ou link
- [ ] T027 [P] [US2] Testes unitários `apps/api/src/modules/class-invitations/delivery-schedule.spec.ts` (esperas 1 min, 5 min, 15 min, 1 h, 3 h, 6 h e `FAILED` na 7ª falha)
- [ ] T028 [P] [US2] Teste do web `apps/web/features/classes/components/invite-student-dialog.test.tsx`: diálogo acessível (foco preso e devolvido), erro junto ao campo, textos "Convite enviado.", "Já existe um convite pendente para este e-mail.", "Este aluno já está matriculado nesta turma.", axe

### Implementation for User Story 2

- [ ] T029 [US2] Modo de falha em `apps/api/src/platform/mail/in-memory.mailer.ts` (`failNext(n)` / `setFailing(bool)`) para os testes de entrega, sem mudar o comportamento padrão
- [ ] T030 [US2] Template `class-invitation` em `apps/api/src/platform/mail/templates.ts` (assunto, texto e HTML escapado de `contracts/mail-delivery.md`, data em `America/Sao_Paulo`)
- [ ] T031 [US2] `apps/api/src/modules/class-invitations/invitation-rate-limit.ts`: as três chaves de `RateLimitService` de D6 (reenvio por convite, envios por convite por dia, convites por professor por hora), lançando `rateLimited` com `Retry-After` antes de qualquer escrita
- [ ] T032 [US2] `apps/api/src/modules/class-invitations/delivery.service.ts` (`schedule(tx, invitationId)` cria entrega `PENDING` com `next_attempt_at = now + 1 min` e aposenta as anteriores; `attemptNow(deliveryId, token, invitation)` trava a entrega, envia e grava `SENT` ou a próxima espera; `delivery-schedule.ts` com a tabela de esperas) e `delivery.worker.ts` (`runOnce(now?)` com `FOR UPDATE SKIP LOCKED` em lotes de 50, token novo por tentativa só para convite `PENDING` efetivo e entrega mais recente, `setInterval` de `mailRetryIntervalSeconds` iniciado em `onApplicationBootstrap` e parado no shutdown; logs `class_invitation.delivery_failed`/`delivery_exhausted` sem token)
- [ ] T033 [US2] `apps/api/src/modules/class-invitations/class-invitations.service.ts`: `invite(classId, email, auth)` — contexto da turma, turma `ACTIVE`, e-mail normalizado, recusa se houver matrícula ativa, expira pendentes vencidos, `createManyAndReturn skipDuplicates` contra o índice parcial (conflito → `INVITATION_ALREADY_PENDING`), auditoria `class_invitation.created`, `DeliveryService.schedule` na mesma transação e `attemptNow` depois do commit; mapper `class-invitation.view.ts` com `delivery` (`SENDING`|`SENT`|`FAILED`)
- [ ] T034 [US2] Rota `POST /classes/:id/invitations` em `apps/api/src/modules/class-invitations/class-invitations.controller.ts`, entrada `classInvitations.create` em `packages/contracts/src/endpoints.ts`, linha no `MATRIX`; emitir `class_invitation.created` em `test/helpers/journey.ts` e retirá-lo de `PENDING_003_TYPES`
- [ ] T035 [P] [US2] `apps/web/features/classes/api/class-invitations.ts` e `hooks/use-class-invitations.ts` (mutation de convite com invalidação de `["classes", id, "invitations"]`); `components/invite-student-dialog.tsx` (shadcn `dialog`, RHF + `InviteStudentRequestSchema`) com o botão "Convidar aluno" na página da turma

**Checkpoint**: professor convida alunos; e-mail entregue mesmo com falha temporária; suíte verde.

---

## Phase 5: User Story 3 — Aluno novo aceita o convite criando a própria conta (Priority: P1)

**Goal**: página pública do convite e aceite atômico que cria conta, papel `STUDENT`, perfil com RA, matrícula e inicia a sessão.

**Independent Test**: convidar e-mail sem conta, abrir o link, concluir com nome, RA e senha → conta, perfil, matrícula ativa, convite aceito e sessão; reabrir o link → não é mais válido; falha no meio → nada gravado.

### Tests for User Story 3 ⚠️

- [ ] T036 [P] [US3] Teste de integração `apps/api/test/integration/003-us3-new-student-acceptance.spec.ts`: `003/US3-1` (preview com turma, professor, e-mail, `mode = CREATE_ACCOUNT`, `raRequired = true`), `003/US3-2` (aceite cria `User` verificado, `STUDENT` `via = CLASS_INVITATION`, perfil com RA normalizado, matrícula `ACTIVE`, convite `ACCEPTED`, `Set-Cookie`; auditoria `class_invitation.accepted`, `student.registered`, `enrollment.created`, `role.granted`), `003/US3-3` (campos `email`, `role`, `classId` no corpo → 400), `003/US3-4` (RA em uso, inclusive com outra caixa → 409 `RA_TAKEN`, nada criado), `003/US3-5` (senha fraca ou curta → 400, nada criado), `003/US3-6` (falha simulada depois da matrícula → rollback completo), `003/US3-7` (dois aceites simultâneos → um efeito; reenvio do mesmo aceite pela conta criada → 200 `alreadyEnrolled`; por anônimo → `TOKEN_INVALID`), `003/US3-8` (nenhuma resposta contém `password`/hash), token expirado → 400 `TOKEN_EXPIRED` e convite gravado `EXPIRED`, adulterado → 400 `TOKEN_INVALID`
- [ ] T037 [P] [US3] Teste do web `apps/web/features/class-invitations/components/class-invitation-page.test.tsx`: preview carregado, formulário `CREATE_ACCOUNT` (e-mail só leitura, nome, RA, senha, confirmação diferente → erro junto ao campo), sucesso "Você agora faz parte da turma.", estados "Este convite expirou." e "Este convite não é mais válido.", axe e teclado

### Implementation for User Story 3

- [ ] T038 [US3] Estender `apps/api/src/modules/provisioning/role-grant-acceptance.service.ts` para `roleKey: "STUDENT"` e `via: "CLASS_INVITATION"`: sem `selfInviteForbidden` para `STUDENT`, `ensureStudentProfile(tx, userId, name)` em `identity/profile.repository.ts`, nome da conta a partir do pedido; manter intactos os caminhos de TEACHER/MANAGER/ADMIN (a suíte `role-grant-acceptance.spec.ts` continua verde)
- [ ] T039 [US3] `apps/api/src/modules/class-invitations/class-invitation-acceptance.service.ts`: `preview` e `accept` com `PublicRateLimit` (fluxos novos `class_invitation_preview`/`class_invitation_accept` em `auth/public-rate-limit.ts`), `findForAcceptance` com `FOR UPDATE` e expiração preguiçosa (`TOKEN_EXPIRED`), validação de turma `ACTIVE` e professor com `TEACHER` ativo (senão `TOKEN_INVALID` + `class_invitation.acceptance_refused` numa transação própria), RA obrigatório quando o perfil não tem (`RA_REQUIRED`), gravação do RA (conflito → `RA_TAKEN`), matrícula por `INSERT … ON CONFLICT DO NOTHING` (já matriculado → `alreadyEnrolled`), convite `ACCEPTED`, auditorias de `contracts/audit-events.md`, log `class_invitation.token_rejected` sem token
- [ ] T040 [US3] `apps/api/src/modules/class-invitations/class-invitation-acceptance.controller.ts` com `POST /class-invitations/preview` e `POST /class-invitations/accept` (`@Public()`, sessão opcional; `Set-Cookie` via `session-cookie.ts` nos modos `CREATE_ACCOUNT`/`CLAIM_ACCOUNT`, criando a sessão depois do commit com `SessionService`); entradas `classInvitations.preview|accept` em `endpoints.ts`; declaração pública em `route-declarations.spec.ts`; emitir os tipos de aceite em `test/helpers/journey.ts` e retirá-los de `PENDING_003_TYPES`
- [ ] T041 [P] [US3] `apps/web/features/class-invitations/{api,hooks,schemas}` (preview e aceite; `schemas/acceptance-form.ts` com confirmação de senha derivado de `AcceptClassInvitationRequestSchema`) e `components/class-invitation-page.tsx` com o formulário do modo `CREATE_ACCOUNT` e os estados de `contracts/web-ui.md`
- [ ] T042 [US3] Rota `apps/web/app/(public)/convite-turma/page.tsx` e `Referrer-Policy: no-referrer` para `/convite-turma` em `apps/web/next.config.js`

**Checkpoint**: um aluno novo entra na turma só com o link; o MVP (US1–US3) está completo.

---

## Phase 6: User Story 8 — Autorização por turma e fim do autocadastro (Priority: P1)

**Goal**: matriz de acesso completa das rotas novas, proteções do fluxo público e remoção do autocadastro (FR-048), migrando testes e E2E que dependiam dele.

**Independent Test**: matriz (sem sessão, aluno, professor dono, outro professor, professor suspenso, MANAGER, ADMIN) contra cada rota; `POST /api/auth/signup` → 404; `/cadastro` não existe; suíte e E2E verdes sem cadastro público.

### Tests for User Story 8 ⚠️

- [ ] T043 [P] [US8] `apps/api/test/security/003-class-authorization-matrix.spec.ts` sobre as linhas novas de `MATRIX`: `003/US8-1` (401), `003/US8-2` (aluno, MANAGER e ADMIN sem TEACHER → 403, inclusive `GET /classes`), `003/US8-3` (outro professor → 404 em turma, convite e matrícula, com corpo idêntico ao de id inexistente), `003/US8-4` (TEACHER suspenso → 403; turmas intactas), `003/US8-6` (campos desconhecidos em todas as rotas → 400)
- [ ] T044 [P] [US8] `apps/api/test/security/003-public-invitation.spec.ts`: `003/US8-5` (muitos tokens inválidos da mesma origem → 429; log sem token), `003/FR-039` (respostas de tokens inválidos idênticas entre si; preview sem token válido não revela conta)
- [ ] T045 [P] [US8] `apps/api/test/security/003-signup-removed.spec.ts`: `003/US8-7` e `003/FR-048` (`POST /api/auth/signup` → 404, nenhuma conta criada) e um teste `001/US1-1 001/US1-2 001/US1-6 001/US1-7 substituídos por 003/FR-048` que cobre os cenários de autocadastro da Fase 001 na guarda de rastreabilidade

### Implementation for User Story 8

- [ ] T046 [US8] Migrar para `createUser` (fábrica, `verified: false` quando preciso) os testes da API que criavam aluno por `POST /auth/signup`: `test/security/{us1-enumeration,us2-rate-limit,us6-account-takeover}.spec.ts`, `test/security/us3-no-public-admin.spec.ts` (o caso "cadastro com %s não cria ADMIN" passa a mirar `POST /class-invitations/accept` com `role`/`roleKey: "ADMIN"` extras → 400 e nenhum papel além de `STUDENT`), `test/integration/{us8-password-reset,maintenance,mail-failure,us1-unverified-purge,us5-teacher-invitations,us6-teacher-acceptance}.spec.ts` e `test/helpers/journey.ts` (a etapa de cadastro vira conta não verificada + verificação por link), sem mudar as asserções
- [ ] T047 [US8] Reescrever `apps/api/test/integration/us1-signup.spec.ts` como `us1-email-verification.spec.ts` mantendo só os cenários de verificação e reenvio da 001 (US1-3, US1-4, US1-5 e os demais que não são autocadastro) com contas criadas por fábrica
- [ ] T048 [US8] Remover `apps/api/src/modules/auth/signup.controller.ts` e o método `signup` de `signup.service.ts` (o que restar de verificação vai para `email-verification.service.ts`), o fluxo `signup` de `public-rate-limit.ts`, `auth.signup` de `audit-event-types.ts` e de `endpoints.ts` (e `audit-coverage.spec.ts` passa a descontar os "Tipos aposentados" da 003), `SignupRequestSchema` de `packages/contracts/src/auth/requests.ts`; atualizar `route-declarations.spec.ts` e `MATRIX`; o job `unverified-accounts` passa a ignorar contas com matrícula
- [ ] T049 [US8] E2E sem cadastro público: projeto `teacher` em `apps/web/e2e/playwright.config.ts` (depende de `admin`; `e2e/class-teacher-setup.spec.ts` faz o ADMIN convidar um professor, que aceita e cria uma turma, e grava as credenciais para os demais projetos); `createEnrolledStudent(page, turma)` em `e2e/fixtures/journeys.ts` (professor convida, aluno aceita pelo link do Mailpit) substituindo `signUp`/`verifyEmail`/`createVerifiedStudent` em `sessions`, `account-switch`, `password-reset`, `teacher-invitation` e `signup-keyboard` (vira jornada de aceite por teclado); remover `e2e/signup.spec.ts`; `journeys` passa a depender de `teacher`
- [ ] T050 [US8] Remover do web `apps/web/app/(public)/cadastro/`, `features/auth/components/{signup-form.tsx,cadastro.test.tsx}`, `signup` de `features/auth/api/auth.ts` e `useSignup` de `hooks/use-auth.ts`, `SignupFormSchema`/`signupMessages` de `schemas/forms.ts` e dos testes de mensagens; conferir que nenhuma tela linka `/cadastro`

**Checkpoint**: nenhum caminho cria conta de aluno sem convite; matriz completa; E2E verde.

---

## Phase 7: User Story 4 — Aluno que já tem conta aceita o convite (Priority: P2)

**Goal**: aceite com a conta existente (login, conta errada, papel e RA que faltam, conta não verificada assumida, várias turmas).

**Independent Test**: aluno da turma A convidado para B aceita autenticado → uma conta, duas matrículas; outra conta logada → recusa.

### Tests for User Story 4 ⚠️

- [ ] T051 [P] [US4] Teste de integração `apps/api/test/integration/003-us4-existing-student-acceptance.spec.ts`: `003/US4-1` (sem sessão → 401 `SIGN_IN_REQUIRED`, senha ignorada e inalterada), `003/US4-2` (com sessão → matrícula, nenhuma conta nova), `003/US4-3` (outra conta → 403 `WRONG_ACCOUNT` + `class_invitation.acceptance_refused`), `003/US4-4` (professor sem `STUDENT` ganha papel e perfil, mantém `TEACHER`), `003/US4-5` (perfil sem RA → `raRequired` no preview, 400 `RA_REQUIRED` sem RA, RA gravado com `student.registered`; com RA não é pedido), `003/US4-6` (conta nunca verificada → `CLAIM_ACCOUNT`: nova senha, sessões anteriores revogadas, e-mail verificado, `account.claimed`), `003/US4-7` (três turmas → três matrículas ativas), `003/US4-8` (conta suspensa → `TOKEN_INVALID`), `003/FR-036` (turma `INACTIVE` → preview e aceite `TOKEN_INVALID` + `class_invitation.acceptance_refused`; turma reativada dentro do prazo → aceite volta a funcionar; papel `TEACHER` do responsável suspenso → `TOKEN_INVALID`, convite continua `PENDING`)
- [ ] T052 [P] [US4] Teste do web `class-invitation-page.test.tsx` (acréscimos): modo `SIGN_IN_REQUIRED` com "Entrar para aceitar" levando a `/entrar?next=/convite-turma?token=…`, aceite com RA quando `raRequired`, `WRONG_ACCOUNT` com a orientação de sair, modo `CLAIM_ACCOUNT` com nome e senha

### Implementation for User Story 4

- [ ] T053 [US4] Completar `class-invitation-acceptance.service.ts` para `SIGN_IN_REQUIRED` e `CLAIM_ACCOUNT` (RA só quando falta, sessão nova depois do commit no `CLAIM_ACCOUNT`, `alreadyEnrolled` quando já matriculado por outro convite)
- [ ] T054 [US4] Formulários dos modos `SIGN_IN_REQUIRED` e `CLAIM_ACCOUNT` em `apps/web/features/class-invitations/components/class-invitation-page.tsx`, retorno do login ao convite (`next` com o token, validado por `safeNextPath`) e mensagens de `contracts/web-ui.md`

**Checkpoint**: um aluno participa de várias turmas com uma só conta.

---

## Phase 8: User Story 5 — Professor acompanha, reenvia e cancela convites (Priority: P2)

**Goal**: lista de convites com pesquisa e filtro, reenvio com limites e cancelamento com confirmação.

**Independent Test**: reenviar → só o link novo funciona; cancelar → link recusado; vencido → "Expirado" e "Este convite expirou.".

### Tests for User Story 5 ⚠️

- [ ] T055 [P] [US5] Teste de integração `apps/api/test/integration/003-us5-manage-invitations.spec.ts`: `003/US5-1` (lista paginada, pesquisa por parte do e-mail, filtro pela situação efetiva, padrão `PENDING`), `003/US5-2` (reenvio: token novo, anterior inválido, prazo renovado, `sendCount + 1`, `class_invitation.resent`, entrega anterior `SUPERSEDED`), `003/US5-3` (dois reenvios em menos de 60 s e 6 envios no dia → 429 `Retry-After`, sem e-mail; depois de 6 tentativas automáticas falhas, o reenvio manual continua aceito), `003/US5-4` (cancelar → `CANCELLED`, link recusado, `class_invitation.cancelled` com `reason = TEACHER`), `003/US5-5` (reenviar/cancelar aceito, cancelado ou expirado → 409 `INVALID_STATE_TRANSITION`), `003/US5-6` (vencido aparece `EXPIRED`, token → `TOKEN_EXPIRED`), `003/US5-7` (tokens adulterado, cancelado e substituído → mesma resposta `TOKEN_INVALID`), reenvio para e-mail já matriculado → 409 `ALREADY_ENROLLED` e convite cancelado (`ALREADY_ENROLLED`)
- [ ] T056 [P] [US5] Teste do web `apps/web/features/classes/components/class-invitations-tab.test.tsx`: pesquisa, filtro, "Carregar mais", selo de situação e "Envio falhou", reenviar, cancelar com `alert-dialog` (foco devolvido), estado vazio "Nenhum convite pendente.", axe

### Implementation for User Story 5

- [ ] T057 [US5] Em `class-invitations.service.ts`: `list` (keyset `created_at DESC`, `escapeLike` no e-mail, situação efetiva), `resend` (`FOR UPDATE` no escopo da turma, limites de `invitation-rate-limit.ts`, matrícula ativa → cancela e `ALREADY_ENROLLED`, token novo, prazo, `sendCount`, `DeliveryService.schedule` + `attemptNow`) e `cancel` (máquina de estado, `cancel_reason = TEACHER`)
- [ ] T058 [US5] Rotas `GET /classes/:id/invitations`, `POST …/:invitationId/resend` e `POST …/:invitationId/cancel` no controller, entradas `classInvitations.list|resend|cancel` em `endpoints.ts`, linhas no `MATRIX`; emitir `class_invitation.resent`/`cancelled` na jornada e retirá-los de `PENDING_003_TYPES`
- [ ] T059 [US5] `apps/web/features/classes/components/class-invitations-tab.tsx` (tabela, pesquisa, filtro `select`, `badge`, reenviar, cancelar com confirmação) e hooks de lista/reenvio/cancelamento com as invalidações de `contracts/web-ui.md`, ligados à aba "Convites" de `/turmas/[id]`

**Checkpoint**: o professor controla todos os convites da turma.

---

## Phase 9: User Story 6 — Professor vê os alunos da turma e remove um aluno (Priority: P2)

**Goal**: lista de matrículas com pesquisa e filtro, contagem de ativos e remoção sem apagar histórico.

**Independent Test**: remover um aluno → matrícula `REMOVED` com data, contagem atualizada, conta intacta; convidar de novo → nova matrícula ativa, a antiga preservada.

### Tests for User Story 6 ⚠️

- [ ] T060 [P] [US6] Teste de integração `apps/api/test/integration/003-us6-enrollments.spec.ts`: `003/US6-1` (detalhe com `activeStudentCount`), `003/US6-2` (lista por nome, pesquisa por nome e prefixo de RA, filtro de situação, padrão `ACTIVE`, cursor; sem dados de autenticação), `003/US6-3` (remover → `REMOVED`, `removedAt`, `removedById`, `enrollment.removed`; `User`, papel, perfil e outras matrículas intactos), `003/US6-4` (remover de novo → 200 sem nova auditoria), `003/US6-5` (novo convite e aceite → nova matrícula ativa; a removida continua), `003/US6-6` (matrícula de turma alheia → 404), turma arquivada → remoção 409, duas remoções simultâneas → um efeito
- [ ] T061 [P] [US6] Teste do web `apps/web/features/classes/components/class-students-tab.test.tsx`: lista, pesquisa, filtro, estado vazio "Nenhum aluno nesta turma.", remoção com `alert-dialog` e contagem atualizada, axe

### Implementation for User Story 6

- [ ] T062 [US6] `apps/api/src/modules/enrollments/enrollments.service.ts` (`list` keyset por `lower(users.name), id`, pesquisa em nome e `ra LIKE termo%`; `remove` com `UPDATE … WHERE status = 'ACTIVE' RETURNING`, idempotente, bloqueado em turma `ARCHIVED`) e mapper `enrollment.view.ts`
- [ ] T063 [US6] `apps/api/src/modules/enrollments/enrollments.controller.ts` com `GET /classes/:id/enrollments` e `POST /classes/:id/enrollments/:enrollmentId/remove`, entradas `enrollments.list|remove` em `endpoints.ts`, linhas no `MATRIX`; emitir `enrollment.removed` na jornada e retirá-lo de `PENDING_003_TYPES`
- [ ] T064 [US6] `apps/web/features/classes/components/class-students-tab.tsx` e hooks de lista/remoção (invalidam `["classes", id]` e `["classes", id, "enrollments"]`), ligados à aba "Alunos" de `/turmas/[id]`

**Checkpoint**: o professor sabe quem está na turma e corrige matrículas.

---

## Phase 10: User Story 7 — Aluno vê as turmas de que participa (Priority: P3)

**Goal**: "Minhas turmas" com as matrículas ativas do aluno.

**Independent Test**: aluno com duas matrículas ativas e uma removida vê só as duas; página administrativa da turma → 404.

### Tests for User Story 7 ⚠️

- [ ] T065 [P] [US7] Teste de integração `apps/api/test/integration/003-us7-my-classes.spec.ts`: `003/US7-1` (só matrículas `ACTIVE`, com nome do professor, sem outros alunos), `003/US7-2` (aluno em `GET /classes/:id` → 403; professor-aluno em turma alheia → 404)
- [ ] T066 [P] [US7] Teste do web `apps/web/features/my-classes/components/my-classes.test.tsx`: lista, estado vazio, mensagem "Você agora faz parte da turma." quando vem do aceite, axe

### Implementation for User Story 7

- [ ] T067 [US7] `apps/api/src/modules/enrollments/my-classes.service.ts` e `my-classes.controller.ts` com `GET /me/classes`, entrada `me.classes` em `endpoints.ts`, linha no `MATRIX`
- [ ] T068 [US7] `apps/web/features/my-classes/{api,hooks,components}` e `apps/web/app/(app)/minhas-turmas/page.tsx`; `/minhas-turmas` em `proxy.ts`; item "Minhas turmas" (`BookOpen`, `turmas.proprias.listar`) no menu lateral e no teste; o aceite (US3/US4) passa a levar para `/minhas-turmas?bem-vindo=1`

**Checkpoint**: todas as histórias funcionam de forma independente.

---

## Phase 11: Polish & Cross-Cutting Concerns

- [ ] T069 E2E das jornadas de §41 em `apps/web/e2e/`: `class-teacher.spec.ts` (`003/SC-010` fluxo 1: login, cria turma, abre, convida, convite pendente), `class-new-student.spec.ts` (fluxo 2), `class-existing-student.spec.ts` (fluxo 3: segunda turma, login, aceite) e `class-remove-student.spec.ts` (fluxo 4: remove, matrícula removida, aluno ainda entra no sistema)
- [ ] T070 [P] Varredura de segredos na jornada 003: estender `apps/api/test/security/secret-leak-scan.spec.ts` para incluir tokens de convite de turma, senhas do aceite e hashes (`003/SC-006`)
- [ ] T071 [P] Teste de concorrência consolidado `apps/api/test/security/003-concurrency.spec.ts` (`003/SC-004`: convites, aceites e remoções simultâneos sem duplicatas nem estado parcial)
- [ ] T072 [P] Teste de desempenho `apps/api/test/security/003-list-performance.spec.ts` (`003/SC-008`: professor com 100 turmas e turma com 200 alunos; listas em ≤ 1 s)
- [ ] T073 Esvaziar e remover `PENDING_003_TYPES` de `audit-coverage.spec.ts` (`003/SC-009`) e `PENDING_003_PERMISSIONS` de `us7-matrix-completeness.spec.ts` e estender `apps/api/test/traceability.spec.ts` para a spec 003 (chaves `003/…` do namespacing de T016a, todos os cenários `USn-k` e a tabela "Acceptance Criteria Traceability")
- [ ] T074 [P] Documentação: `CLAUDE.md` (contratos `classes/`, módulos novos, worker de entregas e `MAIL_RETRY_INTERVAL_SECONDS`, guardas `domain-boundary` e rastreabilidade 003, fim do autocadastro), `README.md`, `apps/web/README.md` (features novas) e a seção de cadastro de `specs/001-foundation-identity-access/quickstart.md` (substituída pelo convite de turma)
- [ ] T075 Percorrer `specs/003-class-invitations-enrollment/quickstart.md` §1–§8 num worktree limpo e corrigir o que divergir
- [ ] T076 Rodar `pnpm lint && pnpm check-types && pnpm build && pnpm test` e `pnpm --filter web test:e2e` finais; `pnpm audit --prod --audit-level high` sem altas (nenhuma dependência nova)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sem dependências.
- **Foundational (Phase 2)**: depende do Setup; bloqueia todas as histórias.
- **US1 (Phase 3)**: depende da Foundational.
- **US2 (Phase 4)**: depende de US1 (turma e página da turma).
- **US3 (Phase 5)**: depende de US2 (convite e token).
- **US8 (Phase 6)**: depende de US1–US3 (as fixtures de E2E e da API passam a criar alunos por convite antes de a rota de cadastro sair).
- **US4 (Phase 7)**: depende de US3 (serviço de aceite).
- **US5 (Phase 8)**: depende de US2; pode correr em paralelo com US3, US4 e US6.
- **US6 (Phase 9)**: depende de US3 (matrículas existem); pode correr em paralelo com US4 e US5.
- **US7 (Phase 10)**: depende de US3.
- **Polish (Phase 11)**: depende de todas.

### Within Each User Story

- Testes antes da implementação, falhando.
- Serviço → controller + catálogo de endpoints + matriz → jornada de auditoria → web.
- Cada fase termina com a suíte verde.

### Parallel Opportunities

- Setup: T002, T003, T004 e T005 em paralelo.
- Foundational: T008–T013 em paralelo depois de T006/T007.
- Em cada história, as tarefas de teste marcadas [P] (API e web) em paralelo; a camada
  de API do web (`features/*/api`, `hooks`) em paralelo com o serviço da API.
- Depois de US3: US4, US5, US6 e US7 podem ser feitas por pessoas diferentes.

---

## Parallel Example: User Story 2

```bash
# Testes primeiro, em paralelo:
Task: "T025 Integração de convites em apps/api/test/integration/003-us2-class-invitations.spec.ts"
Task: "T026 Entrega com novas tentativas em apps/api/test/integration/003-class-invitation-delivery.spec.ts"
Task: "T027 Esperas em apps/api/src/modules/class-invitations/delivery-schedule.spec.ts"
Task: "T028 Diálogo de convite em apps/web/features/classes/components/invite-student-dialog.test.tsx"
```

---

## Implementation Strategy

### MVP First (US1 → US2 → US3)

1. Setup e Foundational.
2. US1 (turmas), US2 (convite), US3 (aluno novo aceita) — um professor já consegue formar
   uma turma com alunos novos.
3. **Parar e validar** com o quickstart §2–§3.

### Incremental Delivery

1. MVP → US8 (fim do autocadastro e matriz) → deploy possível sem cadastro público.
2. US4 (aluno existente) → US5 (gestão de convites) → US6 (alunos e remoção) → US7
   (Minhas turmas), cada uma validada pela seção correspondente do quickstart.
3. Polish: E2E de §41, varreduras, rastreabilidade, documentação e quickstart.

---

## Notes

- **[P]**: arquivos diferentes, sem dependência pendente.
- Nomes de teste com o id da 003 (`003/USn-k`, `003/FR-…`, `003/SC-…`).
- `PENDING_003_TYPES` é transitório: cada história retira seus tipos; T073 remove o conjunto.
- `PENDING_003_PERMISSIONS` (em `apps/api/test/security/us7-matrix-completeness.spec.ts`, criado
  em T008) também é transitório: dispensa a regra "toda permissão é exigida por uma rota" para as
  permissões `turmas.*` ainda sem rota. Cada tarefa que põe linhas no `MATRIX` (T020, T034, T058,
  T063 e a rota `/me/classes`) retira as permissões correspondentes; T073 remove o conjunto.
- Commit ao fim de cada fase, só quando o usuário pedir.
