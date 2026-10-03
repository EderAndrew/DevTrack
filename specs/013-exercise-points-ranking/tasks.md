---

description: "Task list for 013 — Pontuação e Ranking dos Exercícios: exercício sem nota e sem prazo, pontos fixos por nível, tentativas de prática, correção certo/errado e ranking da turma"
---

# Tasks: 013 — Pontuação e Ranking dos Exercícios

**Input**: Design documents from `/specs/013-exercise-points-ranking/`
**Prerequisites**: plan.md, spec.md, research.md (K1–K18), data-model.md, contracts/
(http-api, student-status, permissions, audit-events, configuration, web-ui), quickstart.md

**Tests**: obrigatórios (Constituição VII; SC-001–SC-009).
- Os testes de cada história são escritos antes da implementação e devem falhar antes dela.
- Os títulos de `describe`/`it` levam o id da spec 013 com prefixo (`013/US2-7`, `013/FR-010a`,
  `013/SC-003`), **um id literal por cenário**: onde uma tarefa cita uma faixa
  (`013/US1-1`…`013/US1-5`), cada cenário ganha o seu `it`.
- Nenhum teste chama modelo nem executa código. O relógio é injetado (`Clock`) onde importa.
- **Trabalho (ASSIGNMENT) não muda**: toda suíte 012 que exercita Trabalho passa sem alteração. As
  partes das suítes 012 que aplicam Exercício com nota, prazo ou regra de atraso são reescritas
  para o comportamento novo (T012); nenhuma é apagada sem substituta.
- Nenhum arquivo de `apps/api/src/modules/{exercises,exercise-ai,works,work-ai}`,
  `packages/contracts/src/{exercises,works}` ou `apps/web/features/{exercises,works}` muda
  (plan: bancos inalterados).
- Pontos são inteiros em todo lugar; nunca chamados de "nota"; nunca passam por `notas.*`.
- Um tipo de auditoria novo exige, na mesma tarefa, `src/modules/audit/audit-event-types.ts`,
  `contracts/audit-events.md` e a emissão em `test/helpers/journey.ts`.
- Uma rota nova exige `packages/contracts/src/endpoints.ts`, linha no `MATRIX` de
  `apps/api/test/security/authorization-matrix.ts` e `route-declarations.spec.ts`.
- `packages/contracts` exige `pnpm --filter @repo/contracts build` antes dos testes da API e do web.
- Toda resposta ao aluno sai de `activities/views/student-view.ts` (research K10).
- Cada fase termina com `pnpm lint && pnpm check-types && pnpm test` verde.

**Organization**: por user story, na ordem das dependências reais.
- A Foundational entrega a migração (com a conversão da 012), as permissões, os contratos, as
  regras puras (situação, operações, resultados, ranking) e a adaptação das suítes 012.
- US1 (aplicar sem nota e sem prazo) é o primeiro elo. US2 (praticar e concluir) depende da US1.
  US3 (professor marca) depende da US2. US1–US3 são o MVP: exercício → pontos.
- US4 (ranking do aluno) depende dos resultados da US2/US3; US5 (ranking do professor) reusa o
  serviço da US4.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivos diferentes, sem dependência de tarefa incompleta)
- **[Story]**: a história da tarefa (US1…US5)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: vocabulário de pontos, configuração e códigos de erro.

- [X] T001 Criar `packages/contracts/src/activities/points.ts` com `EXERCISE_POINTS`
  (`BASIC` 15, `INTERMEDIATE` 30, `ADVANCED` 60), `PointsSchema` (inteiro ≥ 0) e
  `possiblePoints(difficulties)`; acrescentar em `packages/contracts/src/activities/enums.ts`
  `COMPLETED` a `StudentActivityStatusSchema` e `RosterStatusSchema` e o novo
  `ExerciseResultSchema` (`CORRECT`, `WRONG`, `PENDING_TEACHER`, `UNSCORED`); exportar em
  `packages/contracts/src/index.ts`; testes em `packages/contracts/test/activities.spec.ts`
  (valores exatos, soma 15+30+60 = 105, recusa de decimal e negativo) (`013/FR-002`).
- [X] T002 [P] Acrescentar `RATE_LIMIT_EXERCISE_ATTEMPTS_PER_HOUR` (60,
  `rateLimit.exerciseAttemptsPerHour`) em `apps/api/src/platform/config/config.schema.ts` e
  `apps/api/.env.example`, com teste em `apps/api/test/integration/platform.spec.ts`
  (contracts/configuration.md).
- [X] T003 [P] Códigos de erro em `packages/contracts/src/common/errors.ts`,
  `apps/api/src/platform/http/errors.ts` e `apps/web/lib/messages/error-messages.ts` (com o teste
  `apps/web/lib/messages/error-messages.test.ts`): `ATTEMPT_NOT_COMPLETED` ("Conclua a tentativa
  atual antes de refazer."), `NOT_LATEST_ATTEMPT` ("Esta tentativa já foi refeita. Carregamos a
  mais recente."), `NOT_MARKABLE` ("Esta resposta não precisa de correção do professor.").

**Checkpoint**: contratos de pontos e configuração prontos.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: migração com a conversão da 012, permissões, contratos, regras puras e a adaptação
das suítes 012. ⚠️ Nenhuma história começa antes desta fase.

- [X] T004 Migração `apps/api/prisma/migrations/<ts>_exercise_points/migration.sql` e
  `apps/api/prisma/schema.prisma` (data-model.md): `total_grade`, `deadline`, `late_policy` e o
  `value` das questões anuláveis com CHECKs por tipo; `difficulty`/`points` nas questões com o
  CHECK do par; `class_activities_valid` (soma dos valores) só para ASSIGNMENT; troca de
  `activity_attempts_number_chk` por `number ≥ 1`, `completed_at`, o UNIQUE parcial de tentativa
  aberta e o gatilho `activity_attempts_numbering`; gatilho que recusa `activity_submissions` e
  `activity_question_gradings` de atividade EXERCISE; enum `exercise_result` e a tabela
  `exercise_question_results` com as FKs compostas, o UNIQUE parcial
  `(class_id, student_user_id, source_exercise_id) WHERE scoring`, os CHECKs de `points`/
  `nature`/`result` e o gatilho de colunas fixas; índices; seed de `exercicios.corrigir`,
  `ranking.visualizar` (TEACHER) e `ranking.turma.visualizar` (STUDENT); por último a conversão
  da 012 (research K17), com os gatilhos de imutabilidade desligados só nas próprias instruções.
- [X] T005 [P] `apps/api/test/integration/013-schema.spec.ts`: cada CHECK, UNIQUE e gatilho da
  T004 recusa o dado inválido (EXERCISE com nota/prazo, ASSIGNMENT sem; par nível/pontos errado;
  segunda tentativa aberta; tentativa 2 sem a 1 concluída; tentativa 2 em ASSIGNMENT; entrega
  numa atividade EXERCISE; resultado com pontos fora da regra; `PENDING_TEACHER` sem `scoring`;
  segundo `scoring` do mesmo exercício na turma; UPDATE de colunas fixas; DELETE de resultado).
- [X] T006 [P] `apps/api/test/integration/013-migration.spec.ts`: aplica as migrações até a 012,
  semeia uma atividade de Exercício no formato 012 com tentativa, respostas, entrega, correções e
  liberação e uma de Trabalho igual; aplica a 013 e confere: Exercício sem nota, prazo, regra,
  liberação, tentativas e entregas, com nível e pontos vindos do banco; Trabalho intacto
  (research K17, spec Assumptions Q3).
- [X] T007 [P] Contratos em `packages/contracts/src/activities/teacher.ts`: `CreateActivity`
  como união por `source.type` (EXERCISE estrito, sem `totalGrade`, `deadline`, `latePolicy`),
  `UpdateActivity` sem prazo/regra para EXERCISE (refinamento no serviço), campos anuláveis e
  `possiblePoints`, `difficulty`, `points` no resumo/detalhe/questão, roster com `pointsEarned` e
  `pendingMarks`, `TeacherExerciseResult`, `MarkExerciseResults`, `exercise` em `TeacherAttempt`;
  testes no `packages/contracts/test/activities.spec.ts` (contracts/http-api.md).
- [X] T008 [P] Contratos em `packages/contracts/src/activities/student.ts` e o novo
  `exercise-results.ts`: `points` no resumo e no detalhe, `attempt.number`, `completedAttempts`,
  `lastResult`, `StudentExerciseAttempt`, `RetryAttempt` (`{ afterNumber }`), `points` em
  `StudentQuestion`, `rankings` no `StudentDashboard`; teste de que `StudentQuestion` continua sem
  campos de gabarito.
- [X] T009 [P] Contratos em `packages/contracts/src/ranking/index.ts`: `RankingRowSchema`
  (`position`, `name`, `points`, `isViewer`, estrito) e `ClassRankingSchema`; exportar no índice;
  teste de que linha com qualquer outro campo é recusada (`013/SC-007`).
- [X] T010 [P] Registro de tipos em `apps/api/src/modules/activities/activity-types.ts`
  (`scoring`, `hasDeadline`, `attempts`) e o mapeamento do snapshot em
  `apps/api/src/modules/activities/snapshot/from-exercises.ts` (nível e pontos, sem `value`), com
  testes em `snapshot/snapshot.spec.ts` (`013/FR-002`, research K1, K2).
- [X] T011 [P] Regras puras com testes exaustivos (contracts/student-status.md):
  ramo EXERCISE de `deriveStudentStatus`, `deriveRosterStatus` e `allowedOperation` em
  `apps/api/src/modules/activities/status/` (incluindo `retry`, `complete`, nunca `OVERDUE`); o
  novo `apps/api/src/modules/activities/results/exercise-results.ts` com
  `resultFor(question, answer, { scoring })` pela tabela de resultados (EXACT_MATCH da 011 só
  para certo/errado, branco pela regra da 012 FR-023) e `pointsFor`; e
  `apps/api/src/modules/ranking/rank.ts` com `rankClass` (pontos desc, nome pt-BR sem
  acento/caixa, posições 1, 2, 2, 4) (`013/FR-009`, `013/FR-010`, `013/FR-014`, `013/FR-019`).
- [X] T012 Adaptar as suítes 012 que aplicam Exercício com nota/prazo
  (`apps/api/test/integration/012-{schema,us1-apply,us2-dashboard}.spec.ts`,
  `apps/api/test/security/012-{boundaries,isolation,performance,student-view}.spec.ts`,
  `apps/api/test/helpers/activities.ts`, `apps/api/test/helpers/journey.ts` (as aplicações de
  Exercício com `totalGrade`, linhas ~595 e ~725, passam ao formato novo; a entrega/correção de
  Exercício vira conclusão/marcação), `apps/api/src/modules/activities/activity.state-machine.spec.ts`
  (formato novo do registro: `scoring`, `hasDeadline`, `attempts`),
  `apps/web/features/activities/components/{new-activity,class-activities}.test.tsx`,
  `apps/web/features/{activities,student-activities}/components/test-fixtures.ts`,
  `apps/web/features/student-activities/components/student-history.test.tsx`): o que testa nota
  de Exercício passa a usar Trabalho ou é movido para as suítes 013; o helper `applyExercises`
  deixa de mandar `totalGrade`/`deadline`/`latePolicy`; cada cenário 012 removido ganha nota no
  arquivo apontando o cenário 013 que o substitui.
- [X] T013 [P] Tipos de auditoria `exercise_attempt.completed` e `exercise_result.marked` e as
  extensões de `activity_attempt.started`, `activity_submission.rejected` e `activity.published`
  em `apps/api/src/modules/audit/audit-event-types.ts`, `test/helpers/journey.ts` e
  `contracts/audit-events.md` (research K15).
- [X] T014 [P] Módulo vazio `apps/api/src/modules/ranking/ranking.module.ts` registrado no
  `AppModule`; `apps/api/test/activities-boundary.spec.ts` passa a cobrir `modules/ranking` e
  `features/ranking` (sem bancos, IA, execução de código nem ponto flutuante).
- [X] T015 Nota de emenda no topo de `specs/012-student-portal/spec.md` (Clarifications): "As
  regras de Exercício (nota, prazo, tentativa única, liberação) foram substituídas pela 013" com
  os ids alterados (FR-001, FR-006, FR-009, FR-014–FR-016, FR-024a, FR-027–FR-030, FR-036,
  US1-7, US1-8) (plan, post-design re-check).

**Checkpoint**: migração aplicada, suítes 012 verdes no comportamento novo, regras puras testadas.

---

## Phase 3: User Story 1 — Professor aplica exercícios sem nota e sem prazo (Priority: P1) 🎯 MVP

**Goal**: aplicar 1–10 exercícios com pontos fixos por nível, sem nota, prazo ou regra de atraso.

**Independent Test**: aplicar Básico + Intermediário + Avançado → 15/30/60, total 105, sem
nota/prazo/regra; alunos veem; mudar o nível no banco não muda a atividade.

### Tests for User Story 1 ⚠️

- [X] T016 [P] [US1] `apps/api/test/integration/013-us1-apply.spec.ts`: `013/US1-1`…`013/US1-5`,
  `013/FR-001`, `013/FR-003`, `013/FR-004` (pedido com `totalGrade`, `deadline` ou `latePolicy`
  → 400; edição de prazo/regra em EXERCISE → 400; Trabalho igual à 012).
- [X] T017 [P] [US1] Testes web em `apps/web/features/activities/components/new-activity.test.tsx`
  e `activity-detail.test.tsx`: Exercício sem os campos de nota/prazo/atraso, "Vale 30 pontos" por
  exercício e "Total: 105 pontos"; detalhe sem "Liberar resultado"; axe e teclado (`013/FR-003`).

### Implementation for User Story 1

- [X] T018 [US1] `apps/api/src/modules/activities/activities.service.ts` e
  `activities.controller.ts`: criação e edição pelo registro de tipos (K1), `possiblePoints`,
  auditoria `activity.published` com `possiblePoints`; `views/teacher-view.ts` com nível, pontos e
  campos anuláveis.
- [X] T019 [US1] Web `apps/web/features/activities/` (schemas, hooks, `new-activity`,
  `class-activities`, `activity-detail`): formulário por tipo, pré-visualização dos pontos com
  `EXERCISE_POINTS`, lista com "Sem prazo" (contracts/web-ui.md).

**Checkpoint**: o professor aplica exercícios no formato novo; Trabalho igual.

---

## Phase 4: User Story 2 — Aluno pratica, conclui e vê gabarito e pontos (Priority: P1)

**Goal**: tentativas numeradas, conclusão idempotente, resultados por questão, gabarito depois da
conclusão, pontos só da primeira, uma vez por turma.

**Independent Test**: concluir com MC certa (15) e pergunta aberta (aguardando); refazer certo →
pontos iguais; mesmo exercício em outra atividade → "já pontuado".

### Tests for User Story 2 ⚠️

- [X] T020 [P] [US2] `apps/api/test/integration/013-us2-practice.spec.ts`: `013/US2-1`…`013/US2-9`,
  `013/FR-005`…`013/FR-015`, `013/FR-010a` (inclui a atividade cancelada: pontos saem e o
  exercício não migra; e a submissão 012 de EXERCISE → 409). Casos de borda: atividade encerrada
  (iniciar, refazer e concluir → 409 `ACTIVITY_CLOSED`; pontos já ganhos continuam; pendências
  marcáveis), matrícula removida com tentativa aberta (404 e nada pontua), aluno matriculado
  depois da publicação (pratica normalmente), turma INACTIVE/ARCHIVED (só leitura,
  `CLASS_NOT_ACTIVE`).
- [X] T021 [P] [US2] Linhas do `MATRIX` e de `route-declarations.spec.ts` para `POST
  /me/activities/:activityId/attempts`, `POST …/attempts/:number/complete` e `GET
  …/attempts/:number`.
- [X] T022 [P] [US2] Testes web em
  `apps/web/features/student-activities/components/activity-answering.test.tsx` e
  `exercise-result.test.tsx`: sem prazo nem nota; diálogo "Concluir exercícios" com a contagem
  em branco; tela de resultado com os rótulos por texto e ícone, gabarito, explicação, "Você
  ganhou N pontos" / "Refazer não vale pontos"; "Refazer"; axe e teclado (`013/SC-008`).

### Implementation for User Story 2

- [X] T023 [US2] `apps/api/src/modules/activities/results/complete-attempt.ts`: a transação de
  conclusão (K5) — travas da 012, respostas pela regra de revisão, `completed_at`, resultados com
  o `INSERT … ON CONFLICT … WHERE scoring DO NOTHING` e o fallback "já pontuado" (K6), auditoria
  `exercise_attempt.completed`; conclusão repetida devolve a mesma.
- [X] T024 [US2] `apps/api/src/modules/student-activities/attempts.service.ts` e
  `attempts.controller.ts`: início da tentativa 1 para EXERCISE sem prazo; `POST
  /me/activities/:activityId/attempts` (K4); `POST …/attempts/:number/complete`; `GET
  …/attempts/:number`; submit 012 de EXERCISE → 409; limite `exerciseAttemptsPerHour` (K16);
  entradas em `packages/contracts/src/endpoints.ts`.
- [X] T025 [US2] `apps/api/src/modules/activities/views/student-view.ts`
  (`toStudentExerciseResult`, K10) e `student-activities/student-activity-loader.ts` /
  `my-activities.service.ts`: `points`, `completedAttempts`, `lastResult`, situação EXERCISE e a
  ordem das "próximas" (K9, `013/FR-015`).
- [X] T026 [US2] Web `apps/web/features/student-activities/`: hooks de concluir/refazer e da
  tentativa por número, página da atividade por tipo (sem avisos de prazo), `exercise-result`,
  cartões e lista com pontos; o buffer offline da 012 limpo na conclusão (contracts/web-ui.md).

**Checkpoint**: o aluno pratica, vê o gabarito e ganha os pontos de múltipla escolha.

---

## Phase 5: User Story 3 — Professor marca certo ou errado (Priority: P1)

**Goal**: o professor marca as respostas abertas e de código da primeira conclusão; pontos
imediatos, sem liberação.

**Independent Test**: duas primeiras conclusões aguardando; marcar uma certa e uma errada →
pontos e situação dos dois alunos.

### Tests for User Story 3 ⚠️

- [X] T027 [P] [US3] `apps/api/test/integration/013-us3-marks.spec.ts`: `013/US3-1`…`013/US3-5`,
  `013/FR-016`, `013/FR-017` (`NOT_MARKABLE` para MC, branco, prática e "já pontuado"; marca igual
  sem evento; mudança auditada com `from`/`to`; rotas de nota, liberação e aceitar entrega → 409
  em EXERCISE; marcação em atividade cancelada → 409, em encerrada → 200).
- [X] T028 [P] [US3] Linhas do `MATRIX`/`route-declarations` para `PUT …/attempts/:attemptId/marks`;
  teste web `apps/web/features/activities/components/attempt-review.test.tsx` (rádios Certo/Errado,
  comentário, sem campo de nota, axe e teclado).

### Implementation for User Story 3

- [X] T029 [US3] `apps/api/src/modules/activities/attempts-review.service.ts` e
  `attempts-review.controller.ts`: `PUT …/marks` (K8) com `exercicios.corrigir`, auditoria
  `exercise_result.marked`, limite de escrita do professor; `GET` da tentativa com o bloco
  `exercise`; recusa de `grades`/`accept-submission`/`release` para EXERCISE; `roster.ts` com
  `COMPLETED`, `pointsEarned` e `pendingMarks`; endpoint no catálogo.
- [X] T030 [US3] Web `apps/web/features/activities/` (attempt review e roster): marcação por
  questão, "Já pontuado em outra atividade" só leitura, contagem "aguardando correção".

**Checkpoint**: MVP — exercício → pontos completo (US1–US3).

---

## Phase 6: User Story 4 — Aluno vê o ranking da turma (Priority: P2)

**Goal**: top 5 por turma no painel e a tela com todas as posições.

**Independent Test**: turma de 7 alunos com empate e alunos sem pontos → top 5, lista completa,
nada de outra turma nem de removidos.

### Tests for User Story 4 ⚠️

- [X] T031 [P] [US4] `apps/api/test/integration/013-us4-ranking.spec.ts`: `013/US4-1`…`013/US4-7`,
  `013/FR-018`…`013/FR-021`, `013/FR-023`, `013/SC-005` (removido e readmitido; atividade
  cancelada; sem `ranking.turma.visualizar` → `rankings: []`). Casos de borda: turma com um só
  aluno (1º lugar), todos com 0 ponto (todos em 1º, com o aviso), turma INACTIVE/ARCHIVED
  (ranking visível só para consulta).
- [X] T032 [P] [US4] Linhas do `MATRIX`/`route-declarations` para `GET
  /me/classes/:classId/ranking`; testes web `apps/web/features/ranking/components/ranking-table.test.tsx`
  e `ranking-card.test.tsx` (linha "Você" por texto; todos com 0 → lista + "Ainda não há pontos
  nesta turma."; sem aluno ativo → "Esta turma ainda não tem alunos."; axe, teclado).

### Implementation for User Story 4

- [X] T033 [US4] `apps/api/src/modules/ranking/ranking.service.ts` e `ranking.controller.ts`: a
  consulta única (matrículas ACTIVE + `users.name` + Σ pontos de atividades não canceladas) →
  `rankClass` (K11, K12); `GET /me/classes/:classId/ranking`; endpoint no catálogo.
- [X] T034 [US4] `apps/api/src/modules/student-activities/my-activities.service.ts`: bloco
  `rankings` do painel pelo `RankingService`, uma entrada por turma ACTIVE, top 5 (K13).
- [X] T035 [US4] Web: `apps/web/features/ranking/{api,hooks,components}` (`RankingTable`,
  `RankingCard`), cartões no `/painel`, link "Ranking" em `/minhas-turmas` e a página
  `apps/web/app/(student)/minhas-turmas/[id]/ranking/page.tsx`.

**Checkpoint**: o aluno vê a própria posição em segundos.

---

## Phase 7: User Story 5 — Professor vê o ranking da turma (Priority: P3)

**Goal**: o ranking completo de cada turma do professor.

**Independent Test**: o ranking do professor é igual ao dos alunos; turma de outro professor → 404.

- [ ] T036 [P] [US5] `apps/api/test/integration/013-us5-teacher-ranking.spec.ts`
  (`013/US5-1`, `013/US5-2`, `013/FR-022`) e linhas do `MATRIX`/`route-declarations` para `GET
  /classes/:classId/ranking`.
- [ ] T037 [US5] `GET /classes/:classId/ranking` com `ranking.visualizar` e `ClassContextPolicy`
  no `ranking.controller.ts`; endpoint no catálogo.
- [ ] T038 [US5] Web: `apps/web/app/(app)/turmas/[id]/ranking/page.tsx` e o link "Ranking" na
  página da turma, com teste de página (axe, teclado).

**Checkpoint**: todas as histórias funcionando.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [ ] T039 [P] `apps/api/test/security/013-isolation.spec.ts` (contracts/permissions.md):
  professores A e B, alunos A1, A2, B1 em ranking, tentativas por número e marcações → 404 com
  `student_access.denied` onde a 012 audita; STUDENT/TEACHER/ADMIN/MANAGER nas rotas do outro
  lado → 403 (`013/SC-006`).
- [ ] T040 [P] `apps/api/test/security/013-student-view.spec.ts`: marcadores em todos os campos do
  gabarito; antes da conclusão nenhuma resposta do aluno os traz; depois, só a tentativa
  concluída do próprio aluno, só pelos campos de K10; nenhuma nota, prazo ou regra em EXERCISE
  (`013/SC-001`, `013/SC-004`, `013/FR-011`…`013/FR-013`).
- [ ] T041 [P] `apps/api/test/security/013-concurrency.spec.ts`: 10 conclusões simultâneas da
  mesma tentativa → uma conclusão e um evento; 10 "Refazer" simultâneos → uma tentativa; duas
  atividades com o mesmo exercício concluídas ao mesmo tempo → um só `scoring`; conclusão ×
  salvamento; marcação × cancelamento (`013/SC-003`, `013/US2-6`, `013/US2-7`).
- [ ] T042 [P] `apps/api/test/security/013-boundaries.spec.ts` e
  `013-rate-limits.spec.ts`: campos de servidor (`points`, `result`, `scoring`, `first`,
  `totalGrade`, `deadline`) → 400; limites de comentário; tentativas acima do limite → 429 sem
  gravar.
- [ ] T043 [P] `apps/api/test/security/013-performance.spec.ts`: ranking de turma com 200 alunos
  < 300 ms; painel com 10 turmas < 1 s; conclusão p95 < 500 ms em 100 chamadas (plan).
- [ ] T044 [P] `audit-coverage.spec.ts`, `test/helpers/journey.ts` e `secret-leak-scan.spec.ts`: a
  jornada aplica exercícios, conclui, refaz, marca e lê o ranking; os tipos novos cobertos, sem
  resposta, gabarito ou comentário nos metadados e logs (`013/SC-009`).
- [ ] T045 [P] E2E `apps/web/e2e/exercise-points.spec.ts` com apoio em
  `apps/web/e2e/support/`: professor aplica três níveis; aluno conclui, vê gabarito e 15 pontos,
  refaz sem ganhar; professor marca certo; ranking do aluno e do professor; ciclo praticar →
  concluir → ver gabarito → refazer só com teclado; 360 px sem rolagem horizontal (`013/SC-008`).
- [ ] T046 [P] XSS: comentário do professor, nomes no ranking e respostas como texto
  (`apps/web/test/student-portal-xss.test.tsx` ampliado para `features/ranking`).
- [ ] T047 [P] `apps/api/test/contracts/endpoint-catalog.spec.ts`, `domain-boundary`,
  `authorization-matrix`, `route-declarations` e `us7-matrix-completeness` verdes com as rotas e
  permissões novas.
- [ ] T048 [P] Conferir por `git diff main` que bancos (010/011) e o comportamento de Trabalho não
  mudaram: suítes `010-*`, `011-*` e as partes de Trabalho da 012 passam sem alteração.
- [ ] T049 [P] Documentação: `apps/api/CLAUDE.md` (resultados de exercício, ranking, suítes
  `013-*`), `CLAUDE.md` da raiz (estado 013, research K1–K18, regras fáceis de errar: pontos
  nunca nota, primeira conclusão = tentativa 1, uma vez por turma), `README.md`.
- [ ] T050 Acrescentar a 013 ao `SPECS` de `apps/api/test/traceability.spec.ts` (5 histórias,
  `successCriteria` SC-001–SC-009) e cobrir ids faltantes.
- [ ] T051 Rodar o `quickstart.md` à mão (medindo, no celular e no desktop, o tempo do painel até
  a própria posição: `013/SC-008`, ≤ 10 s) e revisar `spec.md` × implementação (decisões de
  implementação registradas no research).
- [ ] T052 `pnpm lint && pnpm check-types && pnpm build && pnpm test` e
  `pnpm --filter web test:e2e` verdes.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sem dependências.
- **Foundational (Phase 2)**: depende do Setup; bloqueia todas as histórias. T012 depende de
  T004 e T007–T008 (as suítes 012 só passam com a migração e os contratos novos).
- **US1 (Phase 3)**: depende da Foundational.
- **US2 (Phase 4)**: depende da US1 (atividades de Exercício no formato novo).
- **US3 (Phase 5)**: depende da US2 (resultados `PENDING_TEACHER`).
- **US4 (Phase 6)**: depende da US2 (pontos de múltipla escolha bastam); a US3 completa os testes
  de marcação → ranking.
- **US5 (Phase 7)**: depende da US4 (serviço do ranking).
- **Polish (Phase 8)**: depende das histórias desejadas.

### Within Each User Story

- Testes primeiro, falhando; depois a implementação na ordem das tarefas.
- `activities.service.ts` é tocado por T018 e T029; `attempts.service.ts` por T024;
  `my-activities.service.ts` por T025 e T034; `ranking.controller.ts` por T033 e T037;
  `packages/contracts/src/endpoints.ts` por T024, T029, T033 e T037: sequenciais.

### Parallel Opportunities

- Setup: T002 e T003 em paralelo com T001.
- Foundational: T005–T011, T013 e T014 em paralelo depois da T004; T012 depois de T004, T007 e
  T008; T015 a qualquer momento.
- US1: T016 e T017 em paralelo; T019 em paralelo com T018 depois dos contratos.
- US2: T020–T022 em paralelo; T026 em paralelo com T023–T025.
- US3: T027 e T028 em paralelo.
- US4: T031 e T032 em paralelo; T035 em paralelo com T033–T034.
- Polish: T039–T049 em paralelo.

## Parallel Example: Foundational

```text
Task: "T005 013-schema.spec.ts"      Task: "T006 013-migration.spec.ts"
Task: "T007 teacher contracts"       Task: "T008 student contracts"     Task: "T009 ranking contracts"
Task: "T010 type registry + snapshot"
Task: "T011 pure status/results/rank"
Task: "T013 audit types"             Task: "T014 ranking module + boundary"
# depois
Task: "T012 adapt the 012 suites"
```

## Parallel Example: User Story 2

```text
Task: "T020 013-us2-practice.spec.ts"
Task: "T021 MATRIX rows"
Task: "T022 web answering/result tests"
# depois
Task: "T023 complete-attempt"  →  "T024 attempts service/controller"  →  "T025 student view + loader"
Task: "T026 web student-activities"
```

## Implementation Strategy

### MVP First (US1 → US3)

1. Setup + Foundational (com a conversão da 012 e as suítes 012 adaptadas).
2. US1: o professor aplica exercícios valendo pontos.
3. US2: o aluno pratica, conclui, vê o gabarito e ganha pontos de múltipla escolha.
4. US3: o professor marca as abertas e de código → **MVP**: exercício → pontos completo.

### Incremental Delivery

1. US4: ranking do aluno (painel e tela completa) — o incentivo de engajamento.
2. US5: ranking do professor.
3. Polish: isolamento, visão do aluno, concorrência, limites, desempenho, jornada, E2E,
   documentação e traceability.
