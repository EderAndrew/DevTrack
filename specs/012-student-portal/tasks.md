---

description: "Task list for 012 — Portal do Aluno: atividades da turma, resposta com salvamento, entrega única, correção do professor e resultado liberado"
---

# Tasks: 012 — Portal do Aluno

**Input**: Design documents from `/specs/012-student-portal/`
**Prerequisites**: plan.md, spec.md, research.md (P1–P24), data-model.md, contracts/
(http-api, student-status, permissions, audit-events, configuration, web-ui), quickstart.md

**Tests**: obrigatórios (Constituição VII; critérios de aceite do pedido e SC-001–SC-012).
- Os testes de cada história são escritos antes da implementação e devem falhar antes dela.
- Os títulos de `describe`/`it` levam o id da spec 012 com prefixo (`012/US3-4`, `012/FR-024a`,
  `012/SC-006`), **um id literal por cenário**: onde uma tarefa cita uma faixa
  (`012/US1-1`…`012/US1-8`), cada cenário ganha o seu `it`. A traceability passa a procurá-los na
  fase final (T074).
- Nenhum teste chama modelo: nada da 012 usa IA. O relógio é injetado (`Clock`) em todo teste
  de prazo; nenhum teste depende do relógio real nem de `sleep`.
- As suítes 001–011 continuam verdes **sem alteração** em toda fase, exceto as guardas que a
  própria 012 atualiza (domain-boundary, authorization-matrix, audit-coverage, traceability e o
  teste de `ai-review` da 011, T005); cada fase termina com `pnpm lint && pnpm check-types &&
  pnpm test` verde.
- Nenhum arquivo de `apps/api/src/modules/{exercises,exercise-ai,work-ai}`,
  `packages/contracts/src/exercises` ou `apps/web/features/{exercises,works}` é alterado; em
  `modules/works` muda só `grading/ai-review.ts` (research P1, P12).
- Um tipo de auditoria novo exige, na mesma tarefa, `src/modules/audit/audit-event-types.ts`,
  `specs/012-student-portal/contracts/audit-events.md` e a emissão em `test/helpers/journey.ts`.
- Uma rota nova exige entrada em `packages/contracts/src/endpoints.ts`, linha no `MATRIX` de
  `apps/api/test/security/authorization-matrix.ts` e em `route-declarations.spec.ts`.
- `packages/contracts` exige `pnpm --filter @repo/contracts build` antes dos testes da API e do web.
- Notas nunca em ponto flutuante: centésimos inteiros no código, `numeric(5,2)` no banco, string
  `"0.50"` na rede (011 W3); a guarda `activities-boundary.spec.ts` vigia isso.
- Toda resposta ao aluno sai de `activities/views/student-view.ts` (research P15).

**Organization**: por user story, na ordem das dependências reais.
- A Foundational entrega a migração, as permissões, os contratos, as regras puras (situação,
  operações, ciclo de vida, snapshot, escopo, correção) e os módulos vazios.
- US1 (professor aplica e publica) é o primeiro elo e o MVP técnico: sem ela não há atividade.
- US2 (dashboard e listas) depende da US1; US3 (iniciar, responder, salvar) da US2 (detalhe);
  US4 (entregar) da US3. US1–US4 juntas são o MVP do aluno (aplicar → ver → responder → entregar).
- US5 (professor recebe, corrige e libera) depende da US4; US6 (histórico e resultado) da US5.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivos diferentes, sem dependência de tarefa incompleta)
- **[Story]**: a história da tarefa (US1…US6)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: vocabulário, configuração, códigos de erro e o ajuste do porto de correção da 011.

- [X] T001 Criar `packages/contracts/src/activities/enums.ts` com `ActivityTypeSchema`
  (`EXERCISE`, `ASSIGNMENT`), `ExecutionModeSchema` (`NORMAL`), `ActivityStatusSchema`,
  `PublicationPhaseSchema`, `LatePolicySchema`, `StudentActivityStatusSchema`,
  `StudentActivityFilterSchema` (`PENDING`, `IN_PROGRESS`, `OVERDUE`, `COMPLETED`),
  `RosterStatusSchema`, `AttemptStatusSchema`, `ActivityGradingStatusSchema`, exportados em
  `packages/contracts/src/index.ts`; teste em `packages/contracts/test/activities.spec.ts` com os
  valores exatos e a recusa de `EXAM`, `PROVA` e `CONTROLLED` (`012/FR-003`, `012/SC-012`).
- [X] T002 [P] Acrescentar `RATE_LIMIT_ACTIVITY_SAVES_PER_MINUTE` (60),
  `RATE_LIMIT_ACTIVITY_SUBMITS_PER_HOUR` (20) e `RATE_LIMIT_ACTIVITY_TEACHER_WRITES_PER_HOUR`
  (300) em `apps/api/src/platform/config/config.schema.ts` (`rateLimit.activitySavesPerMinute`,
  `activitySubmitsPerHour`, `activityTeacherWritesPerHour`), `apps/api/.env.example` e
  `apps/api/.env.test.example`; teste em `apps/api/test/integration/platform.spec.ts`
  (contracts/configuration.md). Nota de implementação: o `.env.test.example` não define nenhum
  limite (as suítes usam os padrões), então ficou sem as variáveis, como nas features anteriores.
- [X] T003 [P] Códigos de erro em `packages/contracts/src/common/errors.ts`,
  `apps/api/src/platform/http/errors.ts` e `apps/web/lib/messages/error-messages.ts`, com o
  teste do catálogo (`apps/web/lib/messages/error-messages.test.ts`): `SUBJECT_MISMATCH`,
  `OUT_OF_SCOPE_NOT_ACKNOWLEDGED`, `SOURCE_NOT_APPROVED`, `INVALID_SCHEDULE`,
  `ALREADY_PUBLISHED`, `CLASS_NOT_ACTIVE`, `ACTIVITY_VERSION_CONFLICT`,
  `SUBMISSION_VERSION_CONFLICT`, `NOT_SUBMITTED`, `GRADE_OUT_OF_RANGE`, `UNKNOWN_QUESTION`,
  `NOT_STARTED`, `ATTEMPT_ALREADY_SUBMITTED`, `ANSWER_CHANGED_ELSEWHERE`, `DEADLINE_PASSED`,
  `ACTIVITY_CLOSED`, `INVALID_ANSWER`, `STUDENT_CAN_STILL_SUBMIT`. Também: "Uma resposta foi
  alterada em outra aba. Carregamos a versão mais recente; revise antes de entregar." e "Este
  aluno ainda pode entregar a atividade.". Mensagens do aluno: "O prazo desta atividade terminou e ela não aceita
  entrega atrasada. Suas respostas salvas continuam guardadas.", "Esta atividade foi encerrada
  pelo professor.", "Esta atividade já foi entregue.", "Esta resposta não é válida para a
  questão."; do professor: "Esta atividade mudou em outra aba. Recarregue para ver a versão
  atual.", "Esta correção mudou em outra aba. Recarregue para ver a versão atual.", "A nota da
  questão deve ficar entre 0 e o valor dela.", "Este trabalho é de outra disciplina.", "Confirme
  a aplicação com tópicos ainda não concluídos.".
- [X] T004 [P] Antes de criar, procurar em `apps/api/src` uma abstração de relógio existente
  (`planning-date.ts`, o `now` dos workers) e reaproveitá-la se servir; senão, `Clock` injetável
  em `apps/api/src/platform/clock/clock.ts` (provider
  `CLOCK`, `SystemClock` em produção; `FixedClock` com `set`/`advance` em
  `apps/api/test/helpers/clock.ts`; `createTestApp({ clock })`), sem mudar os relógios já
  existentes das features anteriores (research P10).
- [X] T005 [P] 011 → 012 (research P12): `AiReviewOutcome` ganha `{ kind: "UNAVAILABLE" }` em
  `apps/api/src/modules/works/grading/strategy.ts`; `ai-review.ts` devolve `pendingTeacher(…,
  "AI_REVIEW_UNAVAILABLE")` para ele; `PendingReasonSchema` ganha `AI_REVIEW_UNAVAILABLE` em
  `packages/contracts/src/works/grading.ts`; novo caso em
  `apps/api/src/modules/works/grading/ai-review.spec.ts` (`012/FR-027`).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: esquema, permissões, contratos, regras puras e módulos; nenhuma rota ainda.

**⚠️ CRITICAL**: nenhuma história começa antes desta fase.

- [ ] T006 Migração `apps/api/prisma/migrations/<ts>_class_activities/migration.sql` e
  `apps/api/prisma/schema.prisma` conforme `data-model.md`: os 8 enums; `class_activities` (CHECKs
  de nota, `deadline > publish_at`, tipo ↔ fonte, colunas de liberação ambas ou nenhuma; UNIQUE
  `(teacher_id, idempotency_key)`; índices); `class_activity_questions` (UNIQUE `(activity_id,
  position)` e `(activity_id, id)`, CHECK tipo ↔ estratégia, valor 0.01–100.00);
  `class_activity_alternatives` (UNIQUE `(question_id, position)` e `(question_id, id)`);
  `class_activity_test_cases`; `class_activity_question_topics`; `activity_attempts` (UNIQUE
  `(activity_id, student_user_id, number)`, `CHECK (number = 1)`); `activity_answers` (UNIQUE
  `(attempt_id, question_id)`, FK composta da alternativa, CHECKs de tamanho);
  `activity_submissions` (UNIQUE `attempt_id`); `activity_question_gradings` (PK composta,
  CHECKs de status ↔ natureza ↔ nota ↔ motivo); triggers: 1–10 questões e soma dos valores =
  total (`DEFERRABLE INITIALLY DEFERRED`), 3–5 alternativas com uma correta só em MC, casos de
  teste só em CODE, questão da resposta e da correção pertence à atividade da tentativa, tipo da
  resposta ↔ tipo da questão, nada muda numa resposta de tentativa SUBMITTED, tentativa nunca
  volta a IN_PROGRESS, colunas imutáveis da entrega, nota da questão ≤ valor; permissões
  `atividades.visualizar`, `atividades.aplicar`, `entregas.visualizar`, `notas.lancar`,
  `notas.liberar` (TEACHER) e `atividades.proprias.visualizar`,
  `atividades.proprias.responder`, `notas.proprias.visualizar` (STUDENT); `resetDb` limpa as
  tabelas novas.
- [ ] T007 [P] `apps/api/test/security/domain-boundary.spec.ts` (research P24): lista de modelos
  com as 9 tabelas novas; `nota` e `submiss` saem de `ACADEMIC_PREFIXES` (comentário: notas e
  entregas chegam com a 012); `notas.lancar` passa aos exemplos permitidos, junto de
  `activity_submissions` e `atividades.proprias.responder`; `prova`, `exam`, `tentativa`
  continuam proibidos (os exemplos `QuestãoProva`, `tentativas_prova`, `exam_attempts` seguem
  recusados).
- [ ] T008 [P] Teste do banco em `apps/api/test/integration/012-schema.spec.ts`: por SQL direto,
  recusam: soma dos valores ≠ total no commit; 0 e 11 questões; MC com 2 alternativas ou 2
  corretas; estratégia trocada; prazo antes da publicação; segunda tentativa do mesmo aluno;
  `number = 2`; segunda resposta da mesma questão; alternativa de outra questão; resposta TEXT em
  MC; mudar resposta de tentativa SUBMITTED; tentativa SUBMITTED → IN_PROGRESS; segunda entrega
  da tentativa; mudar `submitted_at`/`late`; nota final acima do valor; GRADED sem nota final;
  PENDING sem motivo (`012/FR-002`, `012/FR-016`, `012/FR-017`, `012/FR-025`).
- [ ] T009 [P] `apps/api/test/security/authorization-matrix.ts`: `ROLE_PERMISSIONS` de TEACHER e
  STUDENT com as permissões novas (e `us7-matrix-completeness.spec.ts` se preciso).
- [ ] T010 [P] Contratos do professor em `packages/contracts/src/activities/teacher.ts`
  (contracts/http-api.md): `ActivitySourceSchema`, `ScopeCheckSchema`,
  `CreateActivityRequestSchema` (`totalGrade` obrigatório em EXERCISE e recusado em ASSIGNMENT,
  1–10 `exerciseIds` distintos, `deadline > publishAt`, `acknowledgeOutOfScope`),
  `UpdateActivityRequestSchema`, `TeacherActivitySummarySchema`, `TeacherActivitySchema`,
  `TeacherQuestionSchema`, `TeacherAttemptSchema`, `QuestionGradingViewSchema`,
  `GradeSubmissionRequestSchema` (0–10 decisões distintas, feedback ≤ 5 000); testes de
  fronteira em `packages/contracts/test/activities.spec.ts` (0/1/10/11 exercícios; `totalGrade`
  "0.00"/"100.01"; prazo igual à publicação; campos `teacherId`, `status`, `value`,
  `gradingStrategy` recusados).
- [ ] T011 [P] Contratos do aluno em `packages/contracts/src/activities/student.ts`:
  `StudentQuestionSchema` (estrito: só os campos permitidos, `alternatives` sem `isCorrect`,
  `publicTestCases`), `StudentActivitySummarySchema`, `StudentDashboardSchema`,
  `StudentActivitySchema` (`result` nulo ou completo), `StudentActivityListQuerySchema` (cursor,
  limite ≤ 50), `SaveAnswersRequestSchema` (1–10 itens distintos, `AnswerSchema` da 011,
  `baseRevision ≥ 0`), `SaveAnswersResultSchema`, `SubmitAttemptRequestSchema`; testes: um campo
  a mais em `StudentQuestion` (ex.: `isCorrect`, `expectedAnswer`) quebra o parse;
  `studentUserId`, `status`, `submittedAt`, `late`, `grade` recusados no corpo (`012/FR-030`,
  `012/FR-032`).
- [ ] T012 [P] Regras puras de situação em
  `apps/api/src/modules/activities/status/{student-status,roster-status,operations}.ts`
  (contracts/student-status.md) com testes exaustivos em `*.spec.ts`: todas as combinações de
  tentativa, entrega, correção completa, liberação, estado da atividade, política de atraso e
  relógio antes, no e depois do prazo; `urgent` em 48 h exatas; `canAnswer` e o código de recusa
  por operação (`012/FR-014`, `012/FR-015`, `012/FR-021`, `012/FR-024a`, `012/SC-007`).
- [ ] T013 [P] Máquina de estados `apps/api/src/modules/activities/activity.state-machine.ts`
  (ACTIVE→CLOSED, ACTIVE|CLOSED→CANCELLED, fase SCHEDULED/PUBLISHED por `publish_at` e relógio)
  e registro por tipo `activity-types.ts` (rótulo, nota total da fonte ou do pedido), com teste
  unitário (`012/FR-004`).
- [ ] T014 [P] Mapeamento puro de snapshot em
  `apps/api/src/modules/activities/snapshot/{from-work,from-exercises}.ts` (research P2, P6):
  linhas de trabalho → questões com valor, estratégia, alternativas, casos de teste e tópicos;
  exercícios → MC/`EXACT_MATCH`, OPEN_ANSWER/`AI_REVIEW` sem rubrica, CODE/`TEST_CASES` sem
  casos; valores por `distributeGrade` na ordem escolhida; testes em `*.spec.ts` (3 exercícios em
  1,00 → 34, 33, 33; trabalho mantém os valores; tópicos copiados).
- [ ] T015 [P] Escopo ensinado puro em `apps/api/src/modules/activities/scope/taught-scope.ts`
  (research P5): itens de tópicos COMPLETED do plano × tópicos das questões → itens fora, com as
  posições; turma sem plano → tudo fora e `hasPlan = false`; teste unitário (`012/FR-005a`).
- [ ] T016 [P] Ponte de correção em
  `apps/api/src/modules/activities/grading/{grade-submission,unavailable-ai-review}.ts`
  (research P12): monta as `GradableQuestion` do snapshot, chama `gradeQuestion` com
  `UnavailableCodeRunner` e `UnavailableAiReview`, devolve as correções e `computeWorkGrade`;
  resposta em branco de MC = 0; aberta/código em branco ficam pendentes; testes em `*.spec.ts`
  com as quatro linhas de contracts/student-status.md §"Grading at submission" (`012/FR-027`,
  `012/FR-028`).
- [ ] T017 [P] Visões em `apps/api/src/modules/activities/views/{teacher-view,student-view}.ts`
  (research P15): a do aluno copia a lista permitida do snapshot (nunca remove campos da do
  professor) e só monta `result` com liberação e correção completa; teste unitário que planta os
  marcadores `MARCADOR-RESPOSTA-012`, `MARCADOR-RUBRICA-012`, `MARCADOR-SOLUCAO-012`,
  `MARCADOR-PRIVADO-012`, `MARCADOR-EXPLICACAO-012` e confere a ausência deles e do id da
  alternativa correta marcada como tal (`012/FR-029`, `012/FR-030`).
- [ ] T018 Módulos `apps/api/src/modules/activities/activities.module.ts` e
  `apps/api/src/modules/student-activities/student-activities.module.ts` registrados no
  `AppModule`; fábricas em `apps/api/test/helpers/activities.ts`: `createClassWithStudents(t,
  teacherId, { subjectId, students })`, `createCompletedTopics(t, classId, itemIds)` e
  `createActivity` (direto no banco, com snapshot, para as histórias do aluno), usando
  `createWork`/`createExercise` das features 010/011. Os auxiliares que chamam rotas entram com
  as rotas: `applyWork`/`applyExercises` na T022, `startAttempt`/`saveAnswers` na T034,
  `submitAttempt` na T043.
- [ ] T019 [P] `apps/api/test/activities-boundary.spec.ts` (research P24): em
  `src/modules/{activities,student-activities}`, nenhum import de `modules/exercises`,
  `modules/ai`, `modules/work-ai`, `modules/exercise-ai`; de `modules/works` só
  `works/grading/*` e `works/types`; nenhum `child_process`, `vm`, `eval(`, `new Function`,
  `worker_threads`; nenhum `parseFloat`, `Number(`, `.toNumber()`; os controllers de
  `student-activities` só devolvem tipos de `views/student-view.ts`; e no web nenhum import
  entre `features/{activities,student-activities}` e `features/{works,exercises}`
  (`012/FR-036`).

**Checkpoint**: migração aplicada, regras puras, contratos e guardas testados; nenhuma rota nova.

---

## Phase 3: User Story 1 — Professor aplica e publica uma atividade para a turma (Priority: P1) 🎯 MVP

**Goal**: atividade da turma como cópia de um trabalho ou de 1–10 exercícios, com publicação,
prazo, regra de atraso e escopo ensinado sinalizado.

**Independent Test**: com um professor, uma turma com dois alunos e um trabalho aprovado,
aplicar e publicar; editar o trabalho no banco não muda a atividade.

### Tests for User Story 1 ⚠️

- [ ] T020 [P] [US1] `apps/api/test/integration/012-us1-apply.spec.ts`: aplicar trabalho APPROVED
  com publicação imediata → 201, snapshot completo, auditado `activity.published`; editar e
  arquivar o trabalho no banco não muda a atividade; DRAFT/ARCHIVED → `422 SOURCE_NOT_APPROVED`,
  de outro professor ou turma de outro professor → 404; agendada para amanhã não aparece no
  `GET` do aluno nem abre pelo id (relógio fixo, depois avançado); prazo antes da publicação →
  `422 INVALID_SCHEDULE`; mesma chave duas vezes → uma atividade; 3 exercícios em 1,00 → 0,34 ·
  0,33 · 0,33 e nota fora de 0,01–100,00 recusada; regra de atraso gravada; trabalho de outra
  disciplina → `422 SUBJECT_MISMATCH`; tópicos fora do escopo sem confirmação → `422
  OUT_OF_SCOPE_NOT_ACKNOWLEDGED`, com confirmação → criada com `outOfScopeTopicCount`; scope-check
  com e sem plano; turma INACTIVE → `409 CLASS_NOT_ACTIVE`; PATCH muda título, prazo e regra,
  data de publicação só enquanto agendada (`422 ALREADY_PUBLISHED`), versão antiga → `409
  ACTIVITY_VERSION_CONFLICT`; encerrar e cancelar com as transições válidas e inválidas e os
  no-ops (`012/US1-1`…`012/US1-8`, `012/FR-001`…`012/FR-005a`).
- [ ] T021 [P] [US1] Linhas do `MATRIX` e de `route-declarations.spec.ts` para `GET/POST
  /classes/:classId/activities`, `POST …/scope-check`, `GET/PATCH …/:activityId`, `POST
  …/close`, `POST …/cancel`.

### Implementation for User Story 1

- [ ] T022 [US1] `apps/api/src/modules/activities/activities.service.ts`: `scopeCheck`, `create`
  numa transação (turma por `ClassContextPolicy`, fonte do professor APPROVED lida por
  `snapshot/` com o filtro do professor, disciplina, escopo recalculado, `write-snapshot.ts`
  gravando atividade e snapshot, idempotência por chave, limite `activityTeacherWritesPerHour`;
  auxiliares `applyWork`/`applyExercises` em `apps/api/test/helpers/activities.ts`),
  `list`, `get`, `update` (versão sob lock), `close` e `cancel` (atividade `FOR UPDATE`);
  auditoria `activity.published`, `activity.updated`, `activity.closed`, `activity.cancelled`
  (tipos + contrato + jornada); `Prisma.Decimal` ↔ centésimos só na borda.
- [ ] T023 [US1] Rotas em `apps/api/src/modules/activities/activities.controller.ts` e entradas
  em `packages/contracts/src/endpoints.ts`.
- [ ] T024 [P] [US1] Web: `apps/web/features/activities/{api,hooks,schemas,components}` e as
  páginas `apps/web/app/(app)/turmas/[id]/atividades/page.tsx`, `…/atividades/nova/page.tsx` e
  `…/atividades/[activityId]/page.tsx` (dados, edição, questões com gabarito, Encerrar,
  Cancelar com `variant="danger"`), conforme contracts/web-ui.md; o passo 1 lista trabalhos e
  exercícios APPROVED pelas rotas existentes (`GET /works`, `GET /exercises`) chamadas em
  `features/activities/api`; o valor de cada questão de Exercício pré-visto com
  `distributeGrade`; a lista "Tópicos ainda não concluídos" e a caixa "Entendo e quero aplicar
  mesmo assim"; link "Atividades" na página da turma.
- [ ] T025 [P] [US1] Testes web em `apps/web/features/activities/components/*.test.tsx`: erros
  por campo ligados (`expectFieldErrorLinked`), nota com vírgula, data de publicação e prazo,
  confirmação de escopo obrigatória, cancelar pede confirmação, axe e ordem de Tab
  (`012/US1-5`, `012/US1-7`, `012/US1-8`).

**Checkpoint**: o professor publica atividades; nada ainda para o aluno.

---

## Phase 4: User Story 2 — Aluno vê o dashboard e "Minhas atividades" (Priority: P1)

**Goal**: dashboard e lista do aluno com situação derivada no servidor, filtros, ordem por prazo
e urgência, só das turmas com matrícula ativa.

**Independent Test**: aluno em duas turmas com atividades em cada situação: contadores, ordem,
filtros e ausência de turmas alheias.

### Tests for User Story 2 ⚠️

- [ ] T026 [P] [US2] `apps/api/test/integration/012-us2-dashboard.spec.ts`: contadores 3/2/1/8
  (concluídas = entregues + corrigidas, montadas com `createActivity` e linhas de
  tentativa/entrega), próximas por prazo (≤ 5), atrasadas que aceitam entrega à parte, `urgent`
  com 47 h e 49 h; turma sem matrícula, matrícula REMOVED, agendada e cancelada não aparecem;
  filtros por situação e tipo, cursor e limite; cada item com os campos do contrato e sem nota
  antes da liberação; aluno sem atividades → listas vazias; conta STUDENT + TEACHER vê só as de
  aluno; `GET /me/activities/:id` de outra turma → 404 e `student_access.denied`
  (`012/US2-1`…`012/US2-6`, `012/FR-007`…`012/FR-012`).
- [ ] T027 [P] [US2] Linhas do `MATRIX` e de `route-declarations.spec.ts` para `GET
  /me/dashboard`, `GET /me/activities`, `GET /me/activities/:activityId`.

### Implementation for User Story 2

- [ ] T028 [US2] `apps/api/src/modules/student-activities/student-activity-loader.ts` (research
  P16, P18): duas consultas a partir do usuário da sessão (matrículas ACTIVE → atividades
  publicadas não canceladas com turma, disciplina e professor; tentativas, entregas e correções
  do aluno), situação por `status/`, filtro, ordem `deadline, id`, cursor `deadline|id`; e
  `deniedAccess` (busca sem escopo só para decidir a auditoria `student_access.denied`, tipo +
  contrato + jornada).
- [ ] T029 [US2] `apps/api/src/modules/student-activities/my-activities.{service,controller}.ts`:
  `dashboard` (primeiro nome, contadores, próximas, atrasadas abertas, `serverNow`), `list` e
  `get` (visão do aluno, ainda sem tentativa); entradas em `endpoints.ts`.
- [ ] T030 [P] [US2] Web: `apps/web/features/student-activities/{api,hooks,schemas,components}`,
  páginas `apps/web/app/(student)/painel/page.tsx` e `…/minhas-atividades/page.tsx`
  (contracts/web-ui.md: contadores como links, cartões com selo "Vence em menos de 48 horas" com
  texto e ícone, filtros na URL, "Carregar mais", estados carregando/vazio/erro/sem conexão);
  `startPathFor` → `/painel` para `atividades.proprias.visualizar` sem
  `disciplinas.visualizar` em `apps/web/lib/navigation.ts`; menu do aluno em
  `apps/web/components/layout/student-layout.tsx` (Painel, Minhas atividades, Histórico, Minhas
  turmas, Meu perfil); `AREAS` e `apps/web/proxy.ts` com as rotas novas; datas por extenso no
  fuso do navegador.
- [ ] T031 [P] [US2] Testes web em `apps/web/features/student-activities/components/*.test.tsx`
  e `apps/web/lib/navigation.test.ts`: "Nenhuma atividade pendente." ≠ "Não foi possível carregar
  suas atividades.", a próxima atividade e o prazo na primeira seção do painel, sem rolagem, como
  verificação substituta do tempo de 10 s (`012/SC-001`; a largura de celular entra na T062),
  urgência com texto, filtros, axe, Tab, rota inicial do aluno e do professor (`012/US2-5`,
  `012/SC-010`).

**Checkpoint**: o aluno vê o que precisa fazer e os prazos.

---

## Phase 5: User Story 3 — Aluno inicia, responde e salva uma atividade (Priority: P1)

**Goal**: tentativa única, respostas por questão com revisão, salvamento automático e
recuperação após recarga, saída ou queda de conexão.

**Independent Test**: iniciar, responder duas questões, recarregar, sair, entrar e conferir as
respostas e a questão atual.

### Tests for User Story 3 ⚠️

- [ ] T032 [P] [US3] `apps/api/test/integration/012-us3-answering.spec.ts`: iniciar PENDENTE →
  tentativa, EM_ANDAMENTO, `activity_attempt.started`; iniciar de novo → mesma tentativa, sem
  evento; salvar → SAVED com revisão 1→2; mesmo conteúdo → UNCHANGED sem evento; `baseRevision`
  antiga com conteúdo diferente → CONFLICT com a resposta do servidor; alternativa de outra
  questão, tipo errado, texto > 20 000, questão de outra atividade → `422 INVALID_ANSWER`;
  salvar sem iniciar → `409 NOT_STARTED`; depois do prazo com REJECT → `409 DEADLINE_PASSED` e
  com ACCEPT_MARKED aceito; encerrada → `409 ACTIVITY_CLOSED`; turma INACTIVE → `409
  CLASS_NOT_ACTIVE`; matrícula removida → 404 e tentativa preservada para o professor; recusas
  auditadas `activity_submission.rejected` com o código; `activity_attempt.progress_saved` na
  primeira gravação e de novo só depois de 15 min (relógio fixo); a visão com tentativa traz as
  respostas e revisões e nenhum dado de correção; código de questão CODE salvo como texto e
  nunca executado (`012/US3-1`…`012/US3-8`, `012/FR-016`…`012/FR-022`).
- [ ] T033 [P] [US3] Linhas do `MATRIX` e de `route-declarations.spec.ts` para `POST
  /me/activities/:activityId/attempt` e `PUT …/attempt/answers`.

### Implementation for User Story 3

- [ ] T034 [US3] `apps/api/src/modules/student-activities/attempts.service.ts`: `start` (`INSERT
  … ON CONFLICT DO NOTHING` + leitura, operação permitida por `status/operations.ts`, limite
  `activitySubmitsPerHour`) e `saveAnswers` (tentativa `FOR UPDATE`, protocolo SAVED / UNCHANGED /
  CONFLICT da research P8, `last_saved_at`, auditoria de progresso com o intervalo de 15 min,
  limite `activitySavesPerMinute`); auditoria `activity_attempt.started`,
  `activity_attempt.progress_saved`, `activity_submission.rejected` (tipos + contrato + jornada);
  `GET /me/activities/:id` passa a trazer a tentativa; auxiliares `startAttempt`/`saveAnswers`
  em `apps/api/test/helpers/activities.ts`.
- [ ] T035 [US3] `apps/api/src/modules/student-activities/attempts.controller.ts` e entradas em
  `endpoints.ts`.
- [ ] T036 [P] [US3] Componentes de avaliação em `apps/web/components/ui/assessment/` (research
  P21, `apps/web/design-system/exam-mode.md`): `ExamProgress`, `QuestionNavigator` (atual, não
  respondida, respondida; `aria-current="step"`, setas), `QuestionHeader`, `QuestionStatus`,
  `QuestionStatement`, `MultipleChoiceAnswer`, `EssayAnswer` (contador), `CodeAnswer` (sem
  regiões de execução), `CodeEditor` (textarea com números de linha, Tab indenta, Esc e Tab sai,
  `font-mono` dentro de `components/ui`), `SaveStatus` (tabela do contrato, "Salvando…" só após
  400 ms), `AttemptStatus`, `AssessmentFooter`; entradas em
  `apps/web/features/design-system/registry.ts` com vitrines, seções em
  `apps/web/design-system/components.md`, nota em `exam-mode.md` do que existe; testes em
  `apps/web/components/ui/assessment/*.test.tsx` (estados, anúncios, axe, teclado) e o catálogo
  continua verde (`token-usage`, `identity`, `docs`, `catalog.test.tsx`).
- [ ] T037 [P] [US3] `apps/web/features/student-activities/store/pending-answers.ts` (research
  P22): leitura e escrita em `localStorage` por `devtrack:respostas:<userId>:<attemptId>` dentro
  de try/catch, remoção na entrega e de todas as chaves `devtrack:respostas:` no logout (no fluxo
  de saída existente em `apps/web/features/auth`); teste com `localStorage` indisponível.
- [ ] T038 [US3] Hook `apps/web/features/student-activities/hooks/use-attempt-answers.ts`: estado
  local, questões sujas, salvamento 1,5 s após parar de digitar, na troca de questão e em
  `visibilitychange`, reenvio no `online` e ao carregar, CONFLICT substitui a cópia local e
  avisa, `SaveStatus` derivado, "Tentar novamente" reenvia o conteúdo da tela; teste com
  `fetch` simulado (falha, sem conexão, conflito, retry).
- [ ] T039 [US3] Página `apps/web/app/(student)/minhas-atividades/[id]/page.tsx` e componente
  `features/student-activities/components/activity-answering.tsx`: cabeçalho da atividade,
  "Iniciar atividade", navegação entre questões, respostas pelos componentes de T036, alerta sem
  conexão, alerta de conflito, avisos de prazo aos 10 e 1 minuto a partir de `serverNow`
  (anunciados uma vez); testes de componente com axe e Tab (`012/US3-5`, `012/US3-6`,
  `012/SC-005`).

**Checkpoint**: o aluno responde sem perder nada.

---

## Phase 6: User Story 4 — Aluno entrega a atividade (Priority: P1)

**Goal**: entrega explícita, confirmada, única e idempotente, com as respostas pendentes, prazo
e atraso decididos pelo servidor e Múltipla escolha corrigida na hora.

**Independent Test**: responder parte, entregar com dois cliques e com a conexão caindo depois
do envio: uma entrega, todas as respostas, situação ENTREGUE.

### Tests for User Story 4 ⚠️

- [ ] T040 [P] [US4] `apps/api/test/integration/012-us4-submit.spec.ts`: entregar dentro do
  prazo → respostas pendentes gravadas, entrega com `submitted_at` do relógio, `late = false`,
  `blank_count` (em branco pela spec FR-023: sem resposta, MC sem alternativa, texto só com
  espaços, código vazio ou igual ao código inicial), ENTREGUE, `activity_submission.created`, o professor vê a entrega no detalhe da
  atividade logo depois (`012/SC-008`); repetir → mesma entrega, sem evento; salvar depois →
  `409 ATTEMPT_ALREADY_SUBMITTED`; entrega com uma resposta de revisão antiga e conteúdo
  diferente → `409 ANSWER_CHANGED_ELSEWHERE`, nada entregue, a resposta mais nova intacta;
  depois do prazo com REJECT → `409 DEADLINE_PASSED`, respostas
  preservadas, `activity_submission.rejected`; com ACCEPT_MARKED → `late = true`; encerrada →
  `409 ACTIVITY_CLOSED`; matrícula removida → 404; MC corrigida (certa = valor, errada e em
  branco = 0), aberta e código pendentes com o motivo, nota parcial; nenhuma nota na resposta ao
  aluno (`012/US4-1`…`012/US4-6`, `012/FR-023`…`012/FR-028`).
- [ ] T041 [P] [US4] `apps/api/test/security/012-concurrency.spec.ts`: 10 inícios simultâneos →
  uma tentativa; 10 entregas simultâneas → uma entrega e um evento; salvamento concorrente com a
  entrega → a entrega fica consistente e o salvamento recusado ou anterior; encerrar × entregar
  serializados; duas abas salvando a mesma questão → uma SAVED e uma CONFLICT; entrega de uma
  aba com revisão antiga depois de a outra salvar → `ANSWER_CHANGED_ELSEWHERE`; duas aceitações do
  professor simultâneas → uma entrega (`012/SC-006`, `012/FR-025`).
- [ ] T042 [P] [US4] Linha do `MATRIX` e de `route-declarations.spec.ts` para `POST
  …/attempt/submit`.

### Implementation for User Story 4

- [ ] T043 [US4] `attempts.service.ts`: `submit` numa transação (atividade `FOR SHARE`, tentativa
  `FOR UPDATE`, repetição devolve a entrega existente, operação por `status/operations.ts`,
  respostas do corpo pela regra de revisão da research P8 — conteúdo igual UNCHANGED, revisão
  antiga com outro conteúdo aborta tudo com `409 ANSWER_CHANGED_ELSEWHERE` —, tentativa
  SUBMITTED, entrega, `blank_count` pela definição da spec FR-023, `grade-submission.ts`, linhas
  de `activity_question_gradings`, nota e parcial), extraído numa função reaproveitada pela T048a;
  limite `activitySubmitsPerHour`; auditoria `activity_submission.created` (tipo + contrato +
  jornada); rota em `attempts.controller.ts` e `endpoints.ts`; auxiliar `submitAttempt` em
  `apps/api/test/helpers/activities.ts`.
- [ ] T044 [US4] Web: em `activity-answering.tsx`, "Entregar atividade" no `AssessmentFooter` com
  `AlertDialog` ("Tem certeza de que deseja entregar esta atividade? Depois de entregue, não
  será possível alterar as respostas." + "N questões em branco"), botão desabilitado durante o
  envio, repetição automática após queda (mesma chamada idempotente), em
  `ANSWER_CHANGED_ELSEWHERE` recarrega as respostas e pede revisão antes de entregar de novo, confirmação "Atividade
  entregue em {data e hora}.", visão somente leitura, recusa com a mensagem do catálogo e as
  respostas mantidas; limpa a cópia local; testes de componente (`012/US4-4`, `012/US4-5`,
  `012/SC-009` parcial).

**Checkpoint**: MVP do aluno — aplicar → ver → responder → entregar.

---

## Phase 7: User Story 5 — Professor recebe, corrige e libera o resultado (Priority: P2)

**Goal**: situação por aluno, abertura de cada tentativa com o gabarito, correção das questões
pendentes com feedback e liberação do resultado da atividade.

**Independent Test**: duas entregas de um trabalho misto: MC já corrigidas, as demais corrigidas
pelo professor, liberar e conferir o que cada aluno vê antes e depois.

### Tests for User Story 5 ⚠️

- [ ] T045 [P] [US5] `apps/api/test/integration/012-us5-grading.spec.ts`: detalhe da atividade
  com a lista de alunos e as situações Não iniciou / Em andamento / Entregou / Entregou com
  atraso / Não entregou (incluindo aluno removido com tentativa) e os contadores; abrir tentativa
  entregue e não entregue (somente leitura); MC GRADED pela regra; nota do professor dentro do
  valor → DECIDED, nota recalculada, `activity_submission.graded`; fora do valor ou 3 casas →
  `422 GRADE_OUT_OF_RANGE`/400; questão de outra atividade → `422 UNKNOWN_QUESTION`; tentativa
  não entregue → `409 NOT_SUBMITTED`; versão antiga → `409 SUBMISSION_VERSION_CONFLICT`;
  sobrescrever um RULE_RESULT; liberar → `activity_result.released`, repetir é no-op, cancelada →
  409; ajuste depois de liberado vale na hora com `afterRelease: true`; outro professor → 404;
  aceitar como entrega a tentativa de quem perdeu o prazo sob REJECT e de quem estava em
  andamento quando a atividade foi encerrada → entrega com as respostas salvas, `late`,
  `acceptedByTeacher`, MC corrigidas, `activity_submission.accepted_by_teacher`, o aluno vê
  ENTREGUE; repetir → mesma entrega sem evento; aluno que ainda pode entregar → `409
  STUDENT_CAN_STILL_SUBMIT`; sem tentativa → `409 NOT_STARTED` (`012/US5-1`…`012/US5-6`,
  `012/FR-006`, `012/FR-006b`).
- [ ] T046 [P] [US5] Linhas do `MATRIX` e de `route-declarations.spec.ts` para `GET
  …/attempts/:attemptId`, `PUT …/attempts/:attemptId/grades`, `POST
  …/attempts/:attemptId/accept-submission` e `POST …/release`.

### Implementation for User Story 5

- [ ] T047 [US5] `activities.service.ts`: lista de alunos com `deriveRosterStatus` e contadores
  no `get` e no `list`; `release` (atividade `FOR UPDATE`, idempotente); auditoria
  `activity_result.released` (tipo + contrato + jornada); rota em `activities.controller.ts`.
- [ ] T048 [US5] `apps/api/src/modules/activities/attempts-review.{service,controller}.ts`:
  `getAttempt` (respostas ao lado do gabarito, correções, entrega) e `grade` (entrega `FOR
  UPDATE` com `version`, `decideByTeacher` por decisão, feedback por questão e geral,
  `computeWorkGrade`, `graded_at`), limite `activityTeacherWritesPerHour`; auditoria
  `activity_submission.graded` (tipo + contrato + jornada); entradas em `endpoints.ts`.
- [ ] T048a [US5] `attempts-review.service.ts`: `acceptSubmission` (spec FR-006b, research P9) —
  atividade e tentativa sob lock, recusa `STUDENT_CAN_STILL_SUBMIT` enquanto
  `status/operations.ts` permitir ao aluno entregar, reaproveita a função de entrega da T043 só
  com as respostas salvas, `late = true` e `accepted_by_id`; auditoria
  `activity_submission.accepted_by_teacher` (tipo + contrato + jornada); rota em
  `attempts-review.controller.ts` e `endpoints.ts`.
- [ ] T049 [P] [US5] Web: lista de alunos e ações "Liberar resultado" (confirmação com quantas
  ainda pendem) no detalhe da atividade; página
  `apps/web/app/(app)/turmas/[id]/atividades/[activityId]/tentativas/[attemptId]/page.tsx` com
  respostas e gabarito por questão, "Corrigida automaticamente", nota por questão ("0,00 a
  0,05"), feedback, feedback geral, "Salvar correção", "Não entregue" somente leitura com
  "Aceitar como entrega" (confirmação de contracts/web-ui.md) quando o aluno não pode mais
  entregar, selo "Entrega aceita pelo professor", aluno anterior/próximo; testes com axe, Tab e
  `expectFieldErrorLinked`.

**Checkpoint**: o professor fecha o ciclo de correção.

---

## Phase 8: User Story 6 — Aluno consulta histórico, nota e feedback (Priority: P2)

**Goal**: histórico das entregas e resultado visível só depois da liberação com correção
completa, sem gabarito.

**Independent Test**: uma entrega corrigida e não liberada e outra liberada: a nota só aparece
na liberada e não está em nenhuma resposta da API antes disso.

### Tests for User Story 6 ⚠️

- [ ] T050 [P] [US6] `apps/api/test/integration/012-us6-history.spec.ts`: `status=COMPLETED` traz
  as entregues e corrigidas com data, atraso, situação; corrigida e não liberada → ENTREGUE sem
  `result` nem nota em nenhuma rota do aluno; liberada mas com questão pendente → ainda ENTREGUE;
  liberada e completa → CORRIGIDO com nota total, nota e feedback por questão e geral,
  `activity_result.viewed` uma vez só; sem `notas.proprias.visualizar` → `result` nulo;
  atividade de turma alheia → 404 e `student_access.denied`; id de tentativa ou entrega de outro
  aluno no corpo de salvar/entregar → 400 (campo desconhecido) e nenhum dado alheio em resposta; após liberar, gabarito,
  solução e casos privados continuam ausentes (`012/US6-1`…`012/US6-4`, `012/FR-029`…
  `012/FR-031`).

### Implementation for User Story 6

- [ ] T051 [US6] `my-activities.service.ts`: bloco `result` e `result` resumido da lista a partir
  da visão do aluno (T017) e de `notas.proprias.visualizar`; `result_viewed_at` e auditoria
  `activity_result.viewed` na primeira leitura (tipo + contrato + jornada).
- [ ] T052 [P] [US6] Web: página `apps/web/app/(student)/historico/page.tsx` e o resultado em
  `minhas-atividades/[id]` (nota "0,45 de 0,50", nota e feedback por questão, feedback geral,
  selo "Com feedback" na lista); testes com axe, Tab e os estados vazio/erro (`012/US6-2`).

**Checkpoint**: ciclo completo do ponto de vista do aluno.

---

## Phase 9: Polish & Cross-Cutting Concerns

- [ ] T053 [P] `apps/api/test/security/012-isolation.spec.ts` (contracts/permissions.md):
  professores A e B, alunos A1, A2 e B1; toda rota do professor com a sessão de A nos ids de B →
  404; toda rota do aluno com A1 nos recursos de A2, de B1, de atividade agendada e cancelada →
  404 com `student_access.denied`; STUDENT nas rotas do professor, TEACHER nas do aluno, ADMIN e
  MANAGER em todas → 403 (`012/SC-002`, `012/FR-008`, `012/FR-009`).
- [ ] T054 [P] `apps/api/test/security/012-student-view.spec.ts`: atividades dos dois tipos com
  os marcadores em todos os campos do gabarito; varre o corpo de toda resposta do aluno em todas
  as situações (pendente, em andamento, entregue, corrigida não liberada, liberada) — nada dos
  marcadores, de `isCorrect`, `gradingStrategy`, motivos de pendência nem casos privados; nota e
  feedback ausentes antes da liberação (`012/SC-003`, `012/SC-004`).
- [ ] T055 [P] `apps/api/test/security/012-boundaries.spec.ts`: corpos com campos desconhecidos
  ou do servidor (`studentUserId`, `status`, `submittedAt`, `late`, `grade`, `value`,
  `isCorrect`) → 400 em toda rota; limites de tamanho de resposta e feedback; 0/1/10/11
  respostas por salvamento (`012/FR-020`).
- [ ] T056 [P] `apps/api/test/security/012-rate-limits.spec.ts`: salvamentos, entregas e escritas
  do professor acima do limite → `429 RATE_LIMITED` sem gravar nada.
- [ ] T057 [P] `apps/api/test/security/012-performance.spec.ts`: aluno em 10 turmas × 50
  atividades com tentativas e entregas — painel e lista < 1 s; detalhe de atividade com 60 alunos
  < 1 s (inserção em lote); salvamento de 10 respostas com p95 < 300 ms em 100 chamadas
  (plan, Performance Goals).
- [ ] T058 [P] `apps/api/test/security/012-xss.spec.ts` e teste web: resposta, título e feedback
  com `<script>` e HTML chegam como texto nas telas do aluno e do professor; nenhum
  `dangerouslySetInnerHTML` em `features/{activities,student-activities}` e
  `components/ui/assessment` (scan) (`012/FR-035`).
- [ ] T059 [P] `test/helpers/journey.ts` e `secret-leak-scan.spec.ts`: a jornada aplica as duas
  fontes, inicia, salva, entrega, corrige, libera e lê o resultado; nenhuma resposta, enunciado,
  gabarito ou feedback nos logs nem na auditoria.
- [ ] T060 [P] `apps/api/test/security/audit-coverage.spec.ts`: os 13 tipos da 012 cobertos,
  metadados só com ids, contagens, enums, booleanos e códigos (`012/SC-011`).
- [ ] T061 [P] E2E `apps/web/e2e/student-portal.spec.ts`: professor aplica um trabalho misto;
  aluno entra e cai no painel, inicia, responde, recarrega e encontra as respostas, sai e volta,
  entrega com confirmação; professor corrige e libera; aluno vê a nota no histórico e nenhum
  gabarito; a sequência iniciar → responder → entregar de 5 questões só com teclado
  (`012/SC-009`); offline simulado (`context.setOffline`) mantém e depois envia a resposta
  (`012/SC-005`).
- [ ] T062 [P] Teste web de responsividade e acessibilidade das páginas do aluno em largura de
  celular (painel, atividade, histórico): nada sai da tela, navegação por Tab (`012/FR-034`).
- [ ] T063 [P] SC-012: teste em `apps/api/test/activities-boundary.spec.ts` e
  `packages/contracts/test/activities.spec.ts` de que nenhum contrato, rota, enum nem texto do web
  aceita ou mostra Prova ou modo controlado; e nenhum código de cronômetro, fullscreen, foco ou
  clipboard em `features/student-activities` (`012/FR-036`).
- [ ] T064 [P] Conferir por `git diff main -- apps/api/src/modules/exercises
  apps/api/src/modules/exercise-ai apps/api/src/modules/work-ai packages/contracts/src/exercises
  apps/web/features/exercises apps/web/features/works` que nada mudou, e em `modules/works` só
  `grading/` (T005); as suítes `010-*` e `011-*` passam sem alteração.
- [ ] T065 [P] `apps/api/CLAUDE.md`: módulos `activities`/`student-activities`, fábricas
  (`test/helpers/activities.ts`, `FixedClock`), protocolo de salvamento, regras de entrega e
  correção, suítes `012-*` e a guarda `activities-boundary`.
- [ ] T066 [P] `CLAUDE.md` da raiz: estado (012 implementada), arquitetura (`activities` no
  contracts, componentes de avaliação), guardas novas, regras fáceis de errar (nota só liberada,
  visão do aluno por lista permitida, relógio do servidor).
- [ ] T067 [P] `README.md`: fase 012, Portal do Aluno, ciclo professor → aluno.
- [ ] T068 [P] `apps/web/design-system/exam-mode.md` e `components.md`: o que a 012 construiu e o
  que fica para a feature de provas; `exceptions.md` se houver exceção (idealmente nenhuma).
- [ ] T069 Rodar o `quickstart.md` à mão (incluindo o teste sem conexão) e corrigir divergências.
- [ ] T070 Revisar `specs/012-student-portal/spec.md` × implementação (Assumptions e decisões de
  implementação registradas no research).
- [ ] T071 [P] Apoio do E2E em `apps/web/e2e/support/student-portal-seed.ts`: cria pela API do
  E2E (:4100) professor, disciplina, ementa confirmada, turma, trabalho aprovado e aluno pelo
  convite lido no Mailpit, para a T061 (sem depender de dados de outros specs E2E).
- [ ] T072 [P] `apps/api/test/contracts/endpoint-catalog.spec.ts` verde com as 17 rotas e o
  `ContractConformanceInterceptor` sem 500 em nenhuma suíte 012.
- [ ] T073 [P] Conferir `domain-boundary`, `authorization-matrix`, `route-declarations` e
  `us7-matrix-completeness` sem permissões órfãs nem rotas sem linha.
- [ ] T074 Acrescentar a 012 ao `SPECS` de `apps/api/test/traceability.spec.ts` (6 histórias,
  cenários do spec, `rows: 0`, `successCriteria` SC-001–SC-012) e cobrir ids faltantes.
- [ ] T075 `pnpm lint && pnpm check-types && pnpm build && pnpm test` e
  `pnpm --filter web test:e2e` verdes.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sem dependências.
- **Foundational (Phase 2)**: depende do Setup; bloqueia todas as histórias.
- **US1 (Phase 3)**: depende da Foundational — MVP técnico.
- **US2 (Phase 4)**: depende da Foundational e usa atividades criadas pela US1 (ou
  `createActivity` direto no banco, o que permite começar em paralelo com a US1).
- **US3 (Phase 5)**: depende da US2 (`GET /me/activities/:id` e o carregador).
- **US4 (Phase 6)**: depende da US3 (tentativa e respostas).
- **US5 (Phase 7)**: depende da US4 (entregas e correções gravadas).
- **US6 (Phase 8)**: depende da US5 (liberação e notas do professor).
- **Polish (Phase 9)**: depende das histórias desejadas.

### Within Each User Story

- Testes primeiro, falhando; depois a implementação na ordem das tarefas.
- `activities.service.ts`/`activities.controller.ts` são tocados por T022, T023 e T047;
  `attempts-review.service.ts`/`.controller.ts` por T048 e T048a;
  `attempts.service.ts`/`attempts.controller.ts` por T034, T035 e T043; `my-activities.service.ts`
  por T029 e T051; `activity-answering.tsx` por T039 e T044; `packages/contracts/src/endpoints.ts`
  por T023, T029, T035, T043, T047, T048 e T048a: sequenciais.

### Parallel Opportunities

- Setup: T002–T005 em paralelo depois da T001.
- Foundational: T007–T017 e T019 em paralelo depois da T006; T018 depois de T014–T017.
- US1: T020, T021 em paralelo; T024 e T025 em paralelo com T022–T023.
- US2: T026, T027 em paralelo; T030 e T031 em paralelo com T028–T029; a US2 pode começar com
  `createActivity` antes de a US1 terminar.
- US3: T032, T033 em paralelo; T036 e T037 em paralelo com T034–T035.
- US4: T040–T042 em paralelo.
- US5: T045, T046 em paralelo; T049 em paralelo com T047–T048.
- Polish: T053–T068 e T071–T073 em paralelo.

## Parallel Example: User Story 3

```text
Task: "T032 012-us3-answering.spec.ts"
Task: "T033 MATRIX rows for start and save"
Task: "T036 assessment components (Exam Mode subset)"
Task: "T037 pending-answers store"
# depois
Task: "T034 attempts.service start + saveAnswers"  →  "T035 attempts.controller"
Task: "T038 use-attempt-answers"  →  "T039 answering page"
```

## Parallel Example: Foundational

```text
Task: "T007 domain-boundary update"
Task: "T008 012-schema.spec.ts"
Task: "T010 teacher contracts"   Task: "T011 student contracts"
Task: "T012 status rules"        Task: "T013 state machine"
Task: "T014 snapshot mapping"    Task: "T015 taught scope"
Task: "T016 grading bridge"      Task: "T017 views"
Task: "T019 activities-boundary"
```

## Implementation Strategy

### MVP First (US1 → US4)

1. Setup + Foundational.
2. US1: o professor publica → validar pela API e pelas telas da turma.
3. US2: o aluno vê painel e lista.
4. US3: o aluno responde e não perde nada (o ponto mais sensível à confiança).
5. US4: entrega única e idempotente → **MVP do aluno**; demonstrar o fluxo
   aplicar → ver → responder → entregar.

### Incremental Delivery

1. US5: o professor recebe, corrige e libera.
2. US6: o aluno vê o resultado e o histórico — ciclo completo.
3. Polish: isolamento, visão do aluno, concorrência, limites, desempenho, XSS, jornada,
   varreduras, E2E, documentação e traceability.
