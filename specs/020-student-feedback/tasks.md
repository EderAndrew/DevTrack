---

description: "Task list for 020 — Feedback dos Alunos: o aluno envia um feedback sobre a plataforma, o ADMIN lê e muda a situação, o aluno acompanha a situação dos próprios feedbacks"
---

# Tasks: 020 — Feedback dos Alunos

**Input**: os documentos de design em `/specs/020-student-feedback/`.
**Prerequisites**:
- plan.md, spec.md, research.md (J1–J10) e data-model.md;
- contracts/: http-api, permissions, audit-events, maintenance-jobs e web-ui;
- quickstart.md;
- constituição v3.5.0.

**Tests**: os testes são obrigatórios (Constituição VII; SC-001–SC-007).
- **Testes primeiro**: os testes de cada história são escritos antes da implementação e devem
  falhar antes dela.
- **Ids nos títulos**: os títulos de `describe`/`it` levam o id da spec 020 com prefixo
  (`020/US1-3`, `020/FR-012`, `020/SC-005`), um id literal por cenário. Onde uma tarefa cita uma
  faixa (`020/US1-1`…`020/US1-5`), cada cenário ganha o seu próprio `it`.
- **Relógio**: injetado (`FixedClock`) nos testes do limite de 24 h e da retenção de 24 meses.
- **Tipo de auditoria novo**: exige, na mesma tarefa, `src/modules/audit/audit-event-types.ts`,
  `contracts/audit-events.md` e a emissão em `test/helpers/journey.ts`.
- **Rota nova**: exige, na mesma tarefa, `packages/contracts/src/endpoints.ts`, uma linha no
  `MATRIX` de `apps/api/test/security/authorization-matrix.ts` e `route-declarations.spec.ts`.
- **Build dos contratos**: mudanças em `packages/contracts` exigem
  `pnpm --filter @repo/contracts build` antes dos testes da API e do web.
- **Isolamento** (research J10): `student-feedback` (API) e `features/feedback` (web) não importam
  IA, ajuda de IA, e-mail, correção, pontos, ranking, bancos nem atividades; nenhuma auditoria ou log
  leva a mensagem, o trecho ou a tela de origem.
- **Fim de fase**: cada fase termina com `pnpm lint && pnpm check-types && pnpm test` verde.

**Organization**: por user story, na ordem das dependências reais.
- **Foundational**: migração, permissões, contratos, regras puras, esqueletos e guardas.
- **US1** (aluno envia) vem antes da **US2** (ADMIN trata), porque a US2 lê o que a US1 grava; as
  duas são P1.
- **US3** (aluno acompanha) depende da US1 e pode andar junto com a US2.
- **MVP**: US1 + US2.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivos diferentes, sem dependência de tarefa incompleta).
- **[Story]**: a história da tarefa (US1…US3).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: a correção da versão do deploy (pedida junto com a feature) e os contratos.

- [X] T001 Versão do sistema no deploy (feita antes do plano, plan "Summary"): `APP_COMMIT` na `env`
  da tarefa `build` de `turbo.json` e `APP_COMMIT="$DEPLOY_SHA" pnpm build` em
  `deploy/hostinger/update.sh`, para um commit que não muda arquivos do web não reaproveitar o build
  anterior com o rótulo antigo. Conferido com `turbo run build --dry=json`: o hash de `web#build`
  muda com `APP_COMMIT`.
- [X] T002 [P] Criar `packages/contracts/src/feedback/{enums,feedback}.ts` (contracts/http-api.md):
  `FeedbackCategorySchema` (`PROBLEM`/`SUGGESTION`/`PRAISE`/`OTHER`), `FeedbackStatusSchema`
  (`RECEIVED`/`IN_REVIEW`/`RESOLVED`/`ARCHIVED`), `CreateFeedbackRequestSchema` (estrito;
  `submissionId` uuid; `message` aparada, 10–2 000 code points por `refine` com `[...value].length`,
  sem `\u0000`; `originPath` por `OriginPathSchema`, opcional/nulo, começa com `/`, até 200 caracteres
  de `[A-Za-z0-9/_.-]`, sem `//` inicial nem segmento `..`, research J2), `StudentFeedbackSchema`, `StudentFeedbackPageSchema`, `AdminFeedbackListItemSchema`,
  `AdminFeedbackPageSchema`, `AdminFeedbackSchema` (com `history`), `FeedbackSummarySchema`,
  `ListAdminFeedbacksQuerySchema` (`status`, `category`, `cursor` opcionais),
  `ChangeFeedbackStatusRequestSchema` (sem `RECEIVED`); constantes `FEEDBACK_MESSAGE_MIN = 10`,
  `FEEDBACK_MESSAGE_MAX = 2000`, `FEEDBACK_EXCERPT_LENGTH = 140`, `FEEDBACK_DAILY_LIMIT = 5`.
  Exportar em `packages/contracts/src/index.ts`; testes em `packages/contracts/test/feedback.spec.ts`
  (corpo estrito, 9/10 e 2 000/2 001 code points com emoji e acentos, aparar antes de contar, NUL
  recusado, `originPath` com `?`, `#`, espaço, `%`, sem `/` inicial ou com 201 caracteres recusado e
  nulo aceito, `RECEIVED` recusado na mudança, nenhum `originPath`/`history`/`submissionId` em
  `StudentFeedbackSchema`); `boundary.spec.ts` e `duplication.spec.ts` verdes.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: migração, permissões, regras puras, esqueletos e guardas. ⚠️ Nenhuma história começa
antes desta fase.

- [X] T003 Teste primeiro: `apps/api/test/integration/020-schema.spec.ts`, com as regras de
  `data-model.md`:
  - `student_feedbacks`: CHECK de 10–2 000 em `char_length` (emoji conta 1); CHECK de
    `origin_path` (nulo aceito, `/painel` aceito, sem `/` inicial, com `?`, com espaço ou com 201
    caracteres recusados); UNIQUE `(student_id, submission_id)` (o mesmo `submission_id` de outro
    aluno é aceito); `status` padrão `RECEIVED`;
  - gatilho de UPDATE: muda `category`, `message`, `origin_path`, `student_id`, `submission_id` ou
    `created_at` → erro; cada transição do diagrama aceita; mesma situação, volta a `RECEIVED` e
    `RESOLVED ↔ ARCHIVED` direto → erro;
  - DELETE de feedback e UPDATE/DELETE do histórico → erro; com `SET LOCAL devtrack.feedback_purge =
    'on'` o DELETE do feedback passa e leva o histórico (cascata);
  - `student_feedback_status_changes`: CHECK `from_status <> to_status` e `to_status <> 'RECEIVED'`;
  - as quatro permissões semeadas nos papéis de `contracts/permissions.md`, nenhuma no TEACHER ou
    no MANAGER.
- [X] T004 Migração `apps/api/prisma/migrations/<ts>_student_feedback/migration.sql` e
  `apps/api/prisma/schema.prisma`, com T003 verde ao final: os 2 enums, as 2 tabelas, CHECKs,
  índices, gatilhos e o seed das permissões (`feedbacks.enviar`, `feedbacks.proprios.listar` →
  STUDENT; `feedbacks.visualizar`, `feedbacks.alterar_situacao` → ADMIN). Na mesma tarefa:
  `apps/api/src/modules/access-control/permissions.ts` (as quatro chaves e o comentário das
  migrações); `resetDb` (`apps/api/test/helpers/`) apaga as tabelas novas na ordem certa, com a flag
  de purga; `domain-boundary.spec.ts` fixa os modelos novos.
- [X] T005 [P] Regras puras com testes (research J5, J7):
  - `apps/api/src/modules/student-feedback/feedback-state.ts` + `feedback-state.spec.ts`
    (`020/FR-006`): `canTransition(from, to)` e `allowedTransitions(from)` para as 16 combinações;
  - `apps/api/src/modules/student-feedback/excerpt.ts` + `excerpt.spec.ts`: `excerpt(message)` corta
    em 140 code points sem partir um emoji; sem imports.
- [X] T006 [P] Esqueletos e guardas (research J10):
  - `apps/api/src/modules/student-feedback/student-feedback.module.ts` registrado no `AppModule`,
    com os dois controllers vazios;
  - `apps/api/test/feedback-boundary.spec.ts` (novo): `modules/student-feedback` e
    `apps/web/features/feedback` sem imports de `ai`, `*-ai`, `work-help`, `platform/mail`,
    `activities`, `student-activities`, `exercises`, `works`, `exams`, `ranking`, `code-runs`
    (`020/FR-014`); os tipos `student_feedback.*` de `audit-event-types.ts` sem chave `message`,
    `text`, `excerpt` ou `originPath`; chamadas de log do módulo sem `message`/`originPath`; controle
    de que cada varredura acha o padrão proibido num exemplo.
- [X] T007 Acrescentar `020` ao `SPECS` de `apps/api/test/traceability.spec.ts` (regra do CLAUDE.md):
  `stories: 3`, `scenarios: 14`, `rows: 0`, `successCriteria: sc(1, 7)` e
  `pending: { stories: [1, 2, 3], successCriteria: ["SC-001", …, "SC-007"] }`. Cada história sai de
  `pending` na tarefa que escreve o último teste dela, cada SC quando o teste que o cita entra; ao fim
  da T024, `pending` está vazio.

**Checkpoint**: migração aplicada, regras puras e guardas verdes.

---

## Phase 3: User Story 1 — Aluno envia um feedback (Priority: P1) 🎯 MVP

**Goal**: o aluno envia categoria e mensagem de qualquer tela do portal (fora da tentativa de prova e
de trabalho em modo controlado),
uma vez por envio, no máximo 5 em 24 horas.

**Independent Test**: entrar como aluno, enviar um feedback "Problema" a partir do Painel e conferir a
confirmação e o feedback gravado com a categoria, o texto, o aluno e a tela.

### Tests for User Story 1 ⚠️

- [X] T008 [P] [US1] `apps/api/test/integration/020-us1-send.spec.ts`: `020/US1-1` (201, linha
  `RECEIVED` com aluno da sessão, momento do servidor, `originPath` gravado; resposta no formato de
  `StudentFeedbackSchema`; um aluno removido de todas as turmas também envia — spec Edge Cases), `020/US1-2` (sem categoria, 9 e 2 001 code points, só espaços, campo
  extra → 400, nada gravado), `020/US1-3` (o mesmo `submissionId` duas vezes → 201 e depois 200 com
  o mesmo id, corpo diferente no segundo devolve o primeiro, uma linha), `020/US1-4` (com
  `FixedClock`: 5 envios aceitos, o 6º → 429 `RATE_LIMITED` com `Retry-After` até o mais antigo fazer
  24 h, nada gravado; 24 h depois do primeiro, aceito), `020/FR-002` (caminho com `?token=` ou
  inválido → 400 e nada gravado; sem `originPath` → aceito com nulo; `studentId`/`status` no corpo →
  400). Use o helper
  novo `apps/api/test/helpers/feedback.ts` (`sendFeedback(agent, overrides)`).
- [X] T009 [P] [US1] `apps/api/test/security/020-concurrency.spec.ts` (`020/SC-005`): 10 `POST`
  simultâneos com o mesmo `submissionId` → exatamente 1 linha e 1 `student_feedback.submitted`;
  8 `POST` simultâneos com ids diferentes de um aluno sem envios → exatamente 5 linhas e 3 `429`;
  o limite de um aluno não afeta outro enviando ao mesmo tempo.
- [X] T010 [P] [US1] Web, testes primeiro em `apps/web/features/feedback/components/feedback-dialog.test.tsx`
  (`020/US1-1`, `020/US1-2`, `020/US1-4`, `020/FR-016`): abre pelo botão, foco preso e devolvido,
  categorias por setas, contador "N de 2.000" em code points, erros associados ao campo, envia
  `originPath` = `location.pathname` sem consulta, o mesmo `submissionId` numa nova tentativa após
  falha de rede, `originPath` nulo quando o pathname não passa no `OriginPathSchema`, toast "Feedback enviado. Obrigado!", alerta do 429 com o tempo de `Retry-After` e o
  texto mantido, `vitest-axe` sem violações; e em
  `apps/web/components/layout/student-layout.test.tsx` + `apps/web/app/(focus)/layout.test.tsx` (novo)
  (`020/US1-5`, `020/SC-006`): botão presente no layout do aluno com `feedbacks.enviar` (inclusive na
  página de uma atividade NORMAL, `app/(student)/minhas-atividades/[id]`), ausente sem a permissão e
  ausente no layout de foco (tentativa de prova e de trabalho CONTROLLED).

### Implementation for User Story 1

- [X] T011 [US1] Serviço e rota (research J3, J4, J9): `apps/api/src/modules/student-feedback/student-feedback.service.ts`
  (`create(studentId, request)`: transação com `pg_advisory_xact_lock(hashtext('student-feedback'),
  hashtext(studentId))`; busca por `(student_id, submission_id)` → devolve existente com `created:
  false`; conta as linhas das últimas 24 h pelo relógio injetado → ≥ 5 lança o erro de limite com
  `retryAfterSec`; `INSERT … ON CONFLICT DO NOTHING RETURNING`; auditoria
  `student_feedback.submitted` na mesma transação; depois do rollback do limite,
  `student_feedback.rate_limited` em transação própria), `views/student-feedback-view.ts`
  (allowlist) e `student-feedback.controller.ts` (`POST /me/feedbacks`, `feedbacks.enviar`, 201/200,
  `Retry-After` no 429). Na mesma tarefa: os dois tipos de auditoria (`audit-event-types.ts`,
  `contracts/audit-events.md`, `journey.ts`) e a rota (`endpoints.ts` `feedback.create`, `MATRIX`,
  `route-declarations.spec.ts`). T008 e T009 verdes.
- [X] T012 [US1] Web: `apps/web/features/feedback/{api/feedback-api.ts,schemas/feedback-form.ts,hooks/use-send-feedback.ts,components/feedback-dialog.tsx}`
  (React Hook Form + o schema do contrato, `crypto.randomUUID()` ao abrir, `originPath` =
  `location.pathname` se passar no `OriginPathSchema`, senão `null`, TanStack Query mutation
  que invalida `["feedback","mine"]`), botão "Enviar feedback" (`MessageSquarePlus`) no rodapé do menu
  em `apps/web/components/layout/student-layout.tsx`, textos de `contracts/web-ui.md`; T010 verde.
  `020/US1` sai de `pending`.

**Checkpoint**: o aluno envia feedbacks; o limite e a idempotência valem sob concorrência.

---

## Phase 4: User Story 2 — Administrador lê e trata os feedbacks (Priority: P1) 🎯 MVP

**Goal**: o ADMIN lista, filtra, abre e muda a situação dos feedbacks, com histórico e o contador de
"Recebido" no menu.

**Independent Test**: com feedbacks de dois alunos em categorias diferentes, entrar como ADMIN,
filtrar por Problema, abrir um feedback, marcá-lo "Em análise" e conferir a lista, o contador e o
histórico.

### Tests for User Story 2 ⚠️

- [ ] T013 [P] [US2] `apps/api/test/integration/020-us2-admin.spec.ts`: `020/US2-1` (todos os
  feedbacks, mais recentes primeiro, `excerpt` de 140 code points, nome do aluno; páginas de 50 com
  `nextCursor`; `GET /feedbacks/summary` conta só `RECEIVED`), `020/US2-2` (filtros de situação e de
  categoria combinados; valor desconhecido → 400), `020/US2-3` (detalhe com mensagem inteira, nome e
  e-mail, tela, histórico do mais antigo ao mais novo com o nome do ADMIN; id inexistente → 404),
  `020/US2-4` (`RECEIVED` → cada uma das três; `status_changed_at` e uma linha de histórico; contador
  cai), `020/US2-5` (`RESOLVED`/`ARCHIVED` → `IN_REVIEW`), `020/US2-6` (mesma situação, `RESOLVED →
  ARCHIVED` → 409 `INVALID_STATE_TRANSITION` sem histórico nem auditoria; `RECEIVED` no corpo → 400),
  `020/FR-012` (nenhuma rota edita ou apaga mensagem).
- [ ] T014 [P] [US2] `apps/api/test/security/020-isolation.spec.ts` (`020/SC-003`, `020/FR-011`):
  TEACHER (inclusive o professor da turma do aluno) e MANAGER → 403 nas quatro rotas do ADMIN e nas
  duas do aluno; STUDENT → 403 nas rotas do ADMIN; ADMIN sem papel de aluno → 403 em `/me/feedbacks`;
  e, em `020-concurrency.spec.ts`, dois ADMINs mudando o mesmo feedback ao mesmo tempo (para a
  mesma situação: uma aplicada e um 409; para situações diferentes válidas a partir de `RECEIVED`:
  as duas aplicadas em série) com exatamente uma linha de histórico por mudança aplicada (`020/FR-007`).
- [ ] T015 [P] [US2] Web, testes primeiro em `apps/web/features/feedback/components/admin-feedback-list.test.tsx`
  e `admin-feedback-detail.test.tsx` (`020/US2-1`…`020/US2-6`, `020/SC-007`): filtros no URL
  (`?situacao=&categoria=`), "Carregar mais", vazio, mensagem como texto (HTML e URL não
  interpretados), só os botões das transições permitidas, toast e atualização do contador após a
  mudança, aviso do 409 com refetch, `vitest-axe`; e em `apps/web/components/shared/app-sidebar.test.tsx`
  + `apps/web/lib/navigation.test.ts`: item "Feedbacks" com `feedbacks.visualizar`, badge com o
  número e o nome acessível "Feedbacks, N novos", sem badge com 0, área "Feedbacks" em `AREAS`,
  `feedbacks.visualizar` em `STAFF_AREA_PERMISSIONS`.

### Implementation for User Story 2

- [ ] T016 [US2] Serviço e rotas (research J5–J7): `apps/api/src/modules/student-feedback/admin-feedback.service.ts`
  (`list(query)` keyset `(created_at DESC, id DESC)` 50 por página com cursor opaco no padrão de
  `classes`; `summary()`; `detail(id)`; `changeStatus(adminId, id, to)`: transação com `SELECT … FOR
  UPDATE`, `canTransition` → 409, `UPDATE` de `status`/`status_changed_at`, linha de histórico,
  auditoria `student_feedback.status_changed`), `views/admin-feedback-view.ts` (allowlist; nome do
  perfil de aluno com o nome da conta como reserva) e `admin-feedback.controller.ts` (`GET /feedbacks`,
  `GET /feedbacks/summary`, `GET /feedbacks/:id`, `POST /feedbacks/:id/status`). Na mesma tarefa: o
  tipo de auditoria e as quatro rotas (catálogo, `MATRIX`, `route-declarations.spec.ts`). T013 e T014
  verdes.
- [ ] T017 [US2] Web: `apps/web/features/feedback/{hooks/use-admin-feedbacks.ts,components/admin-feedback-list.tsx,components/admin-feedback-detail.tsx,components/feedback-badges.tsx}`,
  páginas `apps/web/app/(app)/admin/feedbacks/page.tsx` e `[id]/page.tsx`, item e badge
  (`SidebarMenuBadge`, refetch no foco e na invalidação, nunca polling) em
  `apps/web/components/shared/app-sidebar.tsx` e `apps/web/lib/navigation.ts`; T015 verde. `020/US2`
  sai de `pending`.

**Checkpoint**: o ADMIN trata os feedbacks de ponta a ponta; MVP completo.

---

## Phase 5: User Story 3 — Aluno acompanha os próprios feedbacks (Priority: P2)

**Goal**: "Meus feedbacks" mostra os feedbacks do aluno e a situação de cada um.

**Independent Test**: enviar dois feedbacks como aluno, mudar a situação de um deles como ADMIN e
conferir a lista do aluno.

### Tests for User Story 3 ⚠️

- [ ] T018 [P] [US3] `apps/api/test/integration/020-us3-own.spec.ts`: `020/US3-1` (só os próprios,
  mais recentes primeiro, páginas de 50), `020/US3-2` (situação `RESOLVED` visível; resposta sem
  histórico, ADMIN, `originPath`, `statusChangedAt` ou `submissionId` — comparação exata com as chaves
  de `StudentFeedbackSchema`), `020/US3-3` (dois alunos: cada um vê só os seus; nenhuma rota do aluno
  aceita o id de um feedback); um aluno removido de todas as turmas também vê os seus.
- [ ] T019 [P] [US3] Web, testes primeiro em `apps/web/features/feedback/components/my-feedbacks.test.tsx`
  (`020/US3-1`, `020/US3-2`): lista, situação em palavras, vazio com o botão, "Carregar mais",
  mensagem como texto, `vitest-axe`; item "Meus feedbacks" no menu do aluno com
  `feedbacks.proprios.listar`.

### Implementation for User Story 3

- [ ] T020 [US3] `listMine(studentId, cursor)` em `student-feedback.service.ts` e `GET /me/feedbacks`
  (`feedbacks.proprios.listar`) em `student-feedback.controller.ts`, com a rota no catálogo, `MATRIX` e
  `route-declarations.spec.ts`; T018 verde.
- [ ] T021 [US3] Web: `apps/web/features/feedback/{hooks/use-my-feedbacks.ts,components/my-feedbacks.tsx}`,
  página `apps/web/app/(student)/meus-feedbacks/page.tsx`, item "Meus feedbacks" (`MessagesSquare`)
  em `student-layout.tsx` e a área em `lib/navigation.ts`; T019 verde. `020/US3` sai de `pending`.

**Checkpoint**: as três histórias funcionando de forma independente.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T022 Retenção e auditoria (`020/FR-015`, `020/SC-004`): job `student-feedback` em
  `apps/api/src/modules/student-feedback/feedback-retention.job.ts`, registrado em
  `MAINTENANCE_JOB_NAMES` (contracts/maintenance-jobs.md da 001 atualizado), lotes de 1 000 com
  `SET LOCAL devtrack.feedback_purge = 'on'`, logs só com o nome e a contagem;
  `apps/api/test/security/020-retention.spec.ts` (com `FixedClock`: `RESOLVED`/`ARCHIVED` de 24 meses
  + 1 dia apagados com o histórico; de 24 meses − 1 dia mantidos; `RECEIVED`/`IN_REVIEW` antigos
  nunca); `020-audit.spec.ts` + `secret-leak-scan.spec.ts` com `MARCADOR-FEEDBACK-020` na mensagem e
  na tela de origem, fora de auditoria e logs; `audit-coverage.spec.ts` verde.
- [ ] T023 [P] Segurança restante e E2E: `apps/web/test/student-portal-xss.test.tsx` (ou o guarda XSS
  equivalente) com uma mensagem contendo HTML e URL nas três telas; `features/feedback` na lista sem
  `dangerouslySetInnerHTML`; `020-performance.spec.ts` (criar p95 < 150 ms, listas e detalhe p95 < 100
  ms); E2E `apps/web/e2e/student-feedback.spec.ts` (`020/SC-001`, `020/SC-002`, `020/SC-006`: aluno
  envia do Painel pelo teclado em ≤ 3 interações após digitar, vê em "Meus feedbacks"; a página de
  um exercício tem o botão e a tentativa de um trabalho CONTROLLED não tem; ADMIN vê o contador, filtra, abre, resolve; o aluno vê "Resolvido") — a
  redefinição do banco E2E pede consentimento do usuário.
- [ ] T024 Documentação e fechamento: `CLAUDE.md` (Project state com a 020, regra fácil de errar do
  feedback, contrato `feedback`, guarda `feedback-boundary`), `apps/api/CLAUDE.md` (módulo, helper,
  suítes), `apps/web/CLAUDE.md` (`features/feedback`), `README.md` (linha da spec 020); rodar o
  `quickstart.md` de ponta a ponta e `pnpm lint && pnpm check-types && pnpm test`; `pending` do
  `SPECS` 020 vazio.

---

## Dependencies & Execution Order

- **Ordem das fases**: Setup (T001–T002) → Foundational (T003–T007) → histórias.
- **US1 (T008–T012)**: depende da Foundational.
- **US2 (T013–T017)**: depende da US1 (há feedbacks para ler).
- **US3 (T018–T021)**: depende da US1; pode andar junto com a US2.
- **Polish (T022–T024)**: depois de todas.
- **Dentro de cada história**: testes → serviço e rotas → web.

## Parallel Opportunities

- **Foundational**: T005 e T006 em paralelo depois da T004.
- **US1**: T008, T009 e T010 juntos; T012 depois da T011 (usa a rota).
- **US2**: T013, T014 e T015 juntos.
- **US3** inteira em paralelo com a US2 (arquivos diferentes, exceto `student-feedback.service.ts`,
  que só a US3 muda nessa fase).
- **Polish**: T022 e T023 em paralelo.

## Implementation Strategy

1. **MVP** = Setup + Foundational + US1 + US2: o aluno envia e o ADMIN lê e trata.
2. **Incremento 2**: US3 (o aluno acompanha a situação).
3. **Incremento 3**: Polish (retenção, E2E, documentação).
