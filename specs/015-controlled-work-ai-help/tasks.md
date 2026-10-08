---

description: "Task list for 015 — Trabalho em Modo Controlado com Ajuda da IA: modo controlado (tela cheia, saídas da tela e copiar/colar registrados, limite de digitação) e 3 ajudas da IA que orientam sem o gabarito"
---

# Tasks: 015 — Trabalho em Modo Controlado com Ajuda da IA

**Input**: Design documents from `/specs/015-controlled-work-ai-help/`
**Prerequisites**: plan.md, spec.md, research.md (F1–F18), data-model.md, contracts/
(http-api, work-helper, permissions, audit-events, configuration, web-ui), quickstart.md,
constituição v3.4.0 (aplicada)

**Tests**: obrigatórios (Constituição VII; SC-001–SC-011).
- Os testes de cada história são escritos antes da implementação e devem falhar antes dela.
- Os títulos de `describe`/`it` levam o id da spec 015 com prefixo (`015/US3-7`, `015/FR-013c`,
  `015/SC-002`), **um id literal por cenário**: onde uma tarefa cita uma faixa
  (`015/US1-1`…`015/US1-6`), cada cenário ganha o seu `it`.
- Nenhum teste chama modelo real: a API usa o provedor fake (`createAiTestApp`), o E2E o mock do
  OpenRouter. O relógio é injetado (`FixedClock`) onde importa.
- **NORMAL e Exercício não mudam**: toda suíte 012/013 passa sem alteração de comportamento.
- O gabarito (alternativa correta, resposta esperada, solução, explicação, rubrica, casos de teste
  privados) NUNCA entra em `provider.requests` nem em resposta ao aluno (SC-008, SC-011).
- Um tipo de auditoria novo exige, na mesma tarefa, `src/modules/audit/audit-event-types.ts`,
  `contracts/audit-events.md` e a emissão em `test/helpers/journey.ts`.
- Uma rota nova exige `packages/contracts/src/endpoints.ts`, linha no `MATRIX` de
  `apps/api/test/security/authorization-matrix.ts` e `route-declarations.spec.ts`.
- `packages/contracts` exige `pnpm --filter @repo/contracts build` antes dos testes da API e do web.
- `activities`/`student-activities` não importam `attempt-integrity` nem `work-help`: só os hooks
  `HelpAvailability` e `AnswerSaveGuard` (research F1).
- Cada fase termina com `pnpm lint && pnpm check-types && pnpm test` verde.

**Organization**: por user story, na ordem das dependências reais.
- A Foundational entrega a migração, a permissão, os contratos, as extensões da fundação de IA
  (006), os hooks e os guardas.
- US1 (professor liga as opções) é o primeiro elo. US2 (modo controlado) e US3 (ajuda da IA)
  dependem só da US1 e podem andar em paralelo. US1–US3 são o MVP.
- US4 (professor vê registros e ajudas) lê o que US2 e US3 gravam; US5 (histórico do aluno)
  reusa as visões da US2/US3.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivos diferentes, sem dependência de tarefa incompleta)
- **[Story]**: a história da tarefa (US1…US5)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: configuração, códigos de erro e contratos compartilhados.

- [X] T001 [P] Acrescentar em `apps/api/src/platform/config/config.schema.ts` e
  `apps/api/.env.example` as 5 variáveis de `contracts/configuration.md`
  (`CONTROLLED_TYPING_BURST_CHARS` 400, `CONTROLLED_TYPING_CHARS_PER_SECOND` 15,
  `RATE_LIMIT_ATTEMPT_EVENTS_PER_MINUTE` 120, `RATE_LIMIT_WORK_HELP_PER_HOUR` 20,
  `AI_WORK_HELP_EXECUTIONS_PER_HOUR` 1500), com teste de valores padrão e recusa de não positivos
  em `apps/api/test/integration/platform.spec.ts`.
- [X] T002 [P] Códigos de erro em `packages/contracts/src/common/errors.ts`,
  `apps/api/src/platform/http/errors.ts` e `apps/web/lib/messages/error-messages.ts` (com o teste
  `apps/web/lib/messages/error-messages.test.ts`): `AI_HELP_UNAVAILABLE` ("A ajuda está
  indisponível agora; tente de novo em instantes."), `ACTIVITY_ALREADY_STARTED` ("Não é possível
  mudar depois que um aluno iniciou."), `NOT_CONTROLLED`, `HELP_PENDING` ("Aguarde a orientação
  anterior."), `HELP_EXHAUSTED` ("Você já usou as 3 ajudas deste trabalho"), `HELP_NOT_ENABLED`,
  `TYPING_LIMIT_EXCEEDED` ("Esse trecho não foi salvo porque parece ter sido colado. Digite a
  resposta.").
- [X] T003 Contratos em `packages/contracts/src/activities/{enums,student}.ts`:
  `ExecutionModeSchema` = `NORMAL | CONTROLLED`; `AiHelpAllowanceSchema` = `0 | 3` e
  `AI_HELP_ALLOWANCE = 3`; `TYPING_LIMIT_EXCEEDED` no resultado por resposta de
  `SaveAnswersResult` (a resposta guardada e a revisão voltam inalteradas); testes em
  `packages/contracts/test/activities.spec.ts` (`015/FR-001`, `015/FR-003`), com os testes 012 de
  modo controlado reservado (`012/FR-003`, `012/SC-012`) reescritos para a 015 (prova continua
  reservada). Os campos novos dos corpos e das visões (`executionMode`/`aiHelpAllowance` em
  criar/editar, `aiHelp` nas visões, `aiHelpUsed` no roster) entram na T015, junto com o serviço e
  as visões que os honram, para nenhum contrato publicado prometer o que a API ainda não faz.
- [X] T004 [P] Criar `packages/contracts/src/attempt-integrity/{enums,events,views}.ts`
  (`IntegrityEventTypeSchema` com os 14 tipos, `IntegrityEventInputSchema` sem
  `TYPING_LIMIT_EXCEEDED`, `RecordEventsRequestSchema` 1–50, `RecordEventsResultSchema`,
  `IntegritySummarySchema`, `IntegrityTimelineSchema`, `StudentIntegritySchema`) e
  `packages/contracts/src/work-help/{enums,help}.ts` (`WorkHelpStatusSchema`,
  `RequestHelpSchema` com pergunta 1–500, `StudentHelpItemSchema`, `StudentHelpStateSchema`,
  `TeacherHelpItemSchema`, `HelpAvailabilitySchema`, `WorkHelperOutputSchema` de
  `contracts/work-helper.md`); exportar em `packages/contracts/src/index.ts`; testes de recusa de
  campos do servidor em `packages/contracts/test/{attempt-integrity,work-help}.spec.ts`.

**Checkpoint**: `pnpm --filter @repo/contracts build && pnpm --filter @repo/contracts test` verde.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: migração, permissão, fundação de IA, hooks e guardas. ⚠️ Nenhuma história começa
antes desta fase.

- [X] T005 Teste primeiro: `apps/api/test/integration/015-schema.spec.ts` com as regras do banco de
  `data-model.md` — CHECKs de modo e de franquia por tipo; troca de modo/franquia permitida sem
  tentativa e recusada com tentativa (trigger); eventos só em tentativa IN_PROGRESS de atividade
  CONTROLLED, sem UPDATE/DELETE, `UNIQUE (attempt_id, client_event_id)`, `client_occurred_at` sse
  `buffered`; ajuda: um REQUESTED por tentativa (UNIQUE parcial), status terminal imutável,
  campos por status (CHECK), no máximo 3 DELIVERED por tentativa (trigger diferido), franquia 3
  exigida, tamanhos.
- [X] T006 Migração `apps/api/prisma/migrations/<ts>_controlled_work_ai_help/migration.sql` e
  `apps/api/prisma/schema.prisma`: valor `CONTROLLED`, `ai_help_allowance`, enums
  `attempt_integrity_event_type` e `work_help_status`, tabelas `attempt_integrity_events` e
  `work_help_requests` com FKs compostas, índices, CHECKs e triggers (substituindo a regra de
  imutabilidade do modo da 012); seed da permissão `ia.ajuda.pedir` para STUDENT; T005 verde.
- [X] T007 [P] Fundação de IA (research F9): `proposal.settle?: "ON_MATERIALIZE"` em
  `apps/api/src/modules/ai/definitions/types.ts`, `materialize` podendo devolver
  `"APPROVE" | "REJECT"`; o runner (`execution/ai-execution.runner.ts`) grava a decisão na proposta
  na mesma transação, ator SYSTEM, auditada com `settledBy: "DOMAIN_RULE"` (atualizar
  `audit-event-types.ts` e `specs/006-ai-foundation/contracts/audit-events.md` se listar
  metadados); testes com um agente de referência novo em `apps/api/test/fixtures/ai/` e em
  `apps/api/test/integration/015-ai-settle.spec.ts` (APPROVE, REJECT, throw desfaz tudo, agentes
  sem `settle` inalterados).
- [X] T008 [P] Limite por agente (research F12): `hourlyLimit?: (config) => number` em
  `AgentDefinition`, lido por `AiExecutionsService.request`
  (`apps/api/src/modules/ai/execution/ai-executions.service.ts`) no lugar de
  `rateLimit.aiAgentPerHour` quando presente; teste em
  `apps/api/test/integration/015-ai-settle.spec.ts` (agente com limite próprio passa de 100;
  os demais continuam no global).
- [X] T009 Hooks (research F1): `apps/api/src/modules/activities/help-availability.ts`
  (`HelpAvailability`: `register(fn)`, `check(): { available, reason }`, "indisponível" sem
  registro) e `apps/api/src/modules/student-activities/answer-save-guard.ts`
  (`AnswerSaveGuard`: `register(fn)`, `check(tx, attempt, answers, now)` que devolve por resposta
  `OK | TYPING_LIMIT_EXCEEDED`; sem registro, tudo OK), exportados pelos módulos; testes
  unitários ao lado.
- [X] T010 [P] Esqueletos `apps/api/src/modules/attempt-integrity/attempt-integrity.module.ts` e
  `apps/api/src/modules/work-help/work-help.module.ts` registrados no `AppModule`;
  `productionAiDefinitions` passa a incluir `workHelpDefinitions()` (vazio até a US3).
- [X] T011 [P] Guardas: `SPECS` += 015 em `apps/api/test/traceability.spec.ts`; modelos
  `AttemptIntegrityEvent` e `WorkHelpRequest` na lista de `domain-boundary.spec.ts` lida de
  `specs/015-controlled-work-ai-help/data-model.md`; `apps/api/test/activities-boundary.spec.ts`
  emendado (research F18: `CONTROLLED` permitido nos enums e nas configurações de `activities`;
  termos de monitoramento só em `attempt-integrity`, `features/controlled-attempt` e
  `components/ui/assessment`; continua sem import de IA); novo
  `apps/api/test/work-help-boundary.spec.ts` (o tool e o contexto do prompt não leem
  `isCorrect`, `expectedAnswer`, `expectedSolution`, `explanation`, `rubric` nem casos privados;
  sem escolha de modelo; sem `parseFloat`/`Number(`) — títulos com `015/FR-030` (nada de prova,
  cronômetro, entrega automática ou bloqueio por eventos).
- [X] T012 [P] Helpers de teste `apps/api/test/helpers/integrity.ts` (`recordEvents`,
  `getIntegritySummary`, `getTimeline`, `getOwnIntegrity`) e `apps/api/test/helpers/work-help.ts`
  (`createWorkHelpApp()` com o `work-helper` ACTIVE e um modelo do catálogo aprovado no fake,
  `requestHelp`, `getHelp`, `scriptHelp(provider, requestId, output)`, `validGuidance()`);
  `createActivity` de `test/helpers/activities.ts` aceita `executionMode` e `aiHelpAllowance`.

**Checkpoint**: migração aplicada, fundação estendida, guardas verdes.

---

## Phase 3: User Story 1 — Professor liga modo controlado e ajuda da IA (Priority: P1) 🎯 MVP

**Goal**: aplicar e editar um Trabalho com modo e franquia; disponibilidade da ajuda.

**Independent Test**: aplicar o mesmo trabalho a duas turmas, uma com as duas opções e outra sem,
e conferir o gravado e o exibido.

### Tests for User Story 1 ⚠️

- [X] T013 [P] [US1] `apps/api/test/integration/015-us1-settings.spec.ts`: `015/US1-1` … `015/US1-6`
  (aplicar com as duas opções; padrão NORMAL/0; ajuda indisponível → 503 `AI_HELP_UNAVAILABLE`;
  editar antes do início e auditar `activity.settings_changed`, depois → 409
  `ACTIVITY_ALREADY_STARTED`; Exercício com opções → 400; franquia ≠ 3 → 400),
  `015/FR-005`, `015/FR-006`; `GET /work-help/availability` com o agente ativo, desabilitado e sem
  modelo.
- [X] T014 [P] [US1] Web: `apps/web/features/activities/components/new-activity.test.tsx` e
  `activity-detail.test.tsx` — fieldset "Como os alunos respondem", textos de
  `contracts/web-ui.md`, ajuda desabilitada com motivo, oculto para Exercício, opções travadas
  depois do início, badges por texto; axe e teclado (`015/US1-1`, `015/US1-3`, `015/FR-006`).

### Implementation for User Story 1

- [X] T015 [US1] Contratos: `executionMode` (padrão NORMAL) e `aiHelpAllowance` (padrão 0) em
  `CreateAssignmentRequest` e `UpdateActivityRequest` (o Exercício, estrito, continua recusando
  ambos: 400), `aiHelp: { allowance }` nas visões do professor e do aluno (`used` no detalhe do
  aluno), `executionMode` no resumo do aluno e `aiHelpUsed` (null no Exercício) no roster, em
  `packages/contracts/src/activities/{teacher,student}.ts`, com testes em
  `packages/contracts/test/activities.spec.ts` (`015/FR-002`, `015/FR-006`) e as fixtures web
  (`features/*/components/test-fixtures.ts`). `ActivitiesService.create/update` (`apps/api/src/modules/activities/activities.service.ts`):
  aceitar e gravar `executionMode`/`aiHelpAllowance`, consultar `HelpAvailability` para franquia 3,
  recusar troca com tentativa existente sob o lock da atividade, auditar
  `activity.settings_changed` (tipo novo: `audit-event-types.ts`, `contracts/audit-events.md`,
  `journey.ts`) e os novos metadados de `activity.published`; `aiHelp.used` e `aiHelpUsed` já
  contam as ajudas DELIVERED (zero até a US3); visões do professor e do aluno
  (`activities/views/{teacher-view,student-view}.ts`) com `executionMode` e `aiHelp`.
- [X] T016 [US1] `GET /work-help/availability` em
  `apps/api/src/modules/work-help/work-help-availability.controller.ts` (status do agente e rota da
  tarefa) e registro no `HelpAvailability` no `onModuleInit` do `WorkHelpModule`; endpoint no
  catálogo e linha no `MATRIX`.
- [X] T017 [US1] Web: `apps/web/features/activities/api` e `hooks` (disponibilidade),
  `components/new-activity.tsx` (fieldset, React Hook Form, validação do contrato) e
  `components/activity-detail.tsx` (badges, edição travada); T013 e T014 verdes.

**Checkpoint**: professor aplica trabalhos com as opções; nada muda para o aluno ainda.

---

## Phase 4: User Story 2 — Aluno responde em modo controlado (Priority: P1)

**Goal**: tela cheia sem menu, saídas registradas com horário do servidor e aviso, copiar/colar
bloqueados e registrados, limite de digitação no servidor; NORMAL inalterado.

**Independent Test**: iniciar um trabalho CONTROLLED, trocar de aba duas vezes, sair da tela cheia
uma vez, tentar colar, voltar, entregar; conferir avisos, eventos e a entrega normal.

### Tests for User Story 2 ⚠️

- [X] T018 [P] [US2] Unitários puros: `apps/api/src/modules/attempt-integrity/timeline.spec.ts`
  (pares saída → retorno, saída sem par termina no próximo evento ou na entrega, totais, eventos
  bufferizados fora de ordem) e `typing-allowance.spec.ts` (rajada, taxa por segundo, primeira
  resposta desde o início da tentativa, encolher sempre permitido, limites exatos) (`015/FR-013c`).
- [X] T019 [P] [US2] `apps/api/test/integration/015-us2-controlled.spec.ts`: `015/US2-3`,
  `015/US2-4`, `015/US2-5`, `015/US2-6`, `015/US2-8`, `015/US2-9` no servidor (eventos com
  horário do servidor, reenvio idempotente devolve o mesmo horário, bufferizado guarda o horário
  do navegador, NORMAL → 409 `NOT_CONTROLLED`, entregue → 409, nada bloqueia nem entrega a
  tentativa; `CONNECTION_LOST`/`CONNECTION_RESTORED` bufferizados formam um intervalo de conexão),
  `015/US2-10` e `015/US2-11` (eventos `PASTE_BLOCKED`/`COPY_BLOCKED` com a questão),
  `015/FR-013c` (salvamento acima do limite → `TYPING_LIMIT_EXCEEDED` só naquela resposta, as
  outras salvam, evento registrado; entrega com pendente acima → 422; Múltipla escolha nunca
  checada; NORMAL nunca checado), `015/FR-010`, `015/FR-014`, `015/SC-005` (nenhuma tentativa bloqueada, entregue sozinha ou com nota alterada).
- [X] T020 [P] [US2] Web unitários: `apps/web/features/controlled-attempt/hooks/focus-reducer.test.ts`
  (blur + hidden em 1 s = uma saída; diálogos internos não contam; tela cheia), 
  `use-clipboard-block.test.ts` (paste/copy/cut/drop/dragstart e `beforeinput` de colagem
  bloqueados só no CONTROLLED, mensagem, um evento por gesto, nada lido da área de transferência),
  `store/pending-events.test.ts` (buffer offline em `localStorage`, reenvio, `buffered`, falha de
  rede grava `CONNECTION_LOST` e o primeiro envio bem-sucedido acrescenta `CONNECTION_RESTORED`),
  `apps/web/components/ui/code/code-editor.test.tsx` (`blockClipboard`) (`015/US2-10`…`015/US2-12`,
  `015/FR-013a`, `015/FR-013b`).
- [X] T021 [P] [US2] Web componentes: `apps/web/components/ui/assessment/focus-violation-warning.test.tsx`
  e `exam-alert.test.tsx` (textos de `exam-mode.md`, horário do servidor ou "Estamos registrando
  este evento", "Voltar para tela cheia", axe, foco não roubado), e
  `apps/web/features/controlled-attempt/components/controlled-attempt.test.tsx` (`015/US2-1`,
  `015/US2-2`, `015/US2-3`, `015/US2-4`, `015/US2-5`, `015/US2-7`, `015/US2-9`, `015/FR-011`,
  `015/FR-012`: "Sair" e voltar do navegador com `ExamAlert`, fechar/recarregar com o
  `beforeunload` nativo registrando `PAGE_LEAVE_ATTEMPTED`; teclado).

### Implementation for User Story 2

- [X] T022 [US2] `apps/api/src/modules/attempt-integrity/{timeline,typing-allowance}.ts` (puros) e
  `controlled-answer-guard.ts` (implementa `AnswerSaveGuard` para atividades CONTROLLED, grava o
  evento `TYPING_LIMIT_EXCEEDED`), registrado no `onModuleInit`; `AttemptsService.save/submit`
  (`apps/api/src/modules/student-activities/attempts.service.ts`) consulta o hook sob o lock da
  tentativa e devolve o resultado por resposta / 422 na entrega.
- [X] T023 [US2] `focus-events.{controller,service}.ts` em `apps/api/src/modules/attempt-integrity/`:
  `POST /me/activities/:activityId/attempt/events` (contexto pela matrícula ACTIVE e tentativa
  própria via `StudentActivityLoader`, `ON CONFLICT DO NOTHING`, horário do servidor, rate limit
  `attempt-events`, auditoria `attempt_integrity.recorded` — tipo novo nos três lugares) e
  `GET /me/activities/:activityId/attempt/integrity`; catálogo e `MATRIX`.
- [X] T024 [US2] Componentes de Exam Mode `apps/web/components/ui/assessment/{focus-violation-warning,exam-alert}.tsx`
  com entrada no `features/design-system/registry.ts`, showcase, seção em
  `apps/web/design-system/components.md` e `exam-mode.md` ("O que já existe (015)", mensagens de
  bloqueio de colagem e de limite de digitação na tabela).
- [X] T025 [US2] `CodeEditor` (`apps/web/components/ui/code/code-editor.tsx` e
  `load-*.ts`): prop `blockClipboard` com `EditorView.domEventHandlers`; texto digitado intacto.
- [X] T026 [US2] `apps/web/features/controlled-attempt/`: `hooks/{focus-reducer,use-focus-monitor,use-fullscreen,use-clipboard-block}.ts`,
  `store/pending-events.ts`, `api/integrity.ts`, `hooks/use-integrity-events.ts` (envio em lote,
  reenvio, quedas e retomadas de conexão), `components/controlled-attempt.tsx` (envolve `ActivityAnswering` com monitor,
  bloqueio, avisos e o "Sair" com `ExamAlert`).
- [X] T027 [US2] Rota de foco: `apps/web/app/(focus)/layout.tsx` (sem menu) e
  `apps/web/app/(focus)/minhas-atividades/[id]/responder/page.tsx`; a página de detalhe do aluno
  (`apps/web/app/(student)/minhas-atividades/[id]/page.tsx` e o componente de detalhe que ela
  renderiza em `apps/web/features/student-activities/components/`) mostra o aviso do modo controlado e "Iniciar em modo controlado" (tela cheia pedida no clique, depois
  navegação); `proxy.ts` manda o `/responder` de uma atividade NORMAL de volta ao detalhe
  (implementado na própria página `/responder`, no servidor: o `proxy.ts` só vê o cookie e não
  conhece o modo sem chamar a API; o `ControlledAttempt` repete a checagem no cliente);
  `activity-answering` trata o resultado `TYPING_LIMIT_EXCEEDED` mantendo o texto na tela.

**Checkpoint**: modo controlado completo para o aluno; T018–T021 verdes.

---

## Phase 5: User Story 3 — Aluno pede ajuda da IA sem receber a resposta (Priority: P1)

**Goal**: 3 orientações por trabalho pelo `work-helper`, sem gabarito para o modelo, com checagem de
vazamento e limite exato.

**Independent Test**: com Múltipla escolha, Pergunta e resposta e Código, pedir uma ajuda em cada,
conferir que nenhuma contém a resposta, o contador chega a 0 e a quarta é recusada.

### Tests for User Story 3 ⚠️

- [X] T028 [P] [US3] Unitários de `apps/api/src/modules/work-help/help/leak-check.spec.ts`
  (research F10: rótulos de alternativa em todas as formas, texto de qualquer alternativa ≥ 12,
  resposta esperada inteira ≥ 25 e shingles de 8 com resposta e explicação, 3 linhas seguidas da
  solução, solução curta inteira, normalização de acento/pontuação/espaço, casos legítimos que NÃO
  bloqueiam) (`015/FR-018`, `015/US3-3`, `015/US3-4`, `015/US3-10`).
- [X] T029 [P] [US3] `apps/api/test/integration/015-us3-help.spec.ts` com o provedor fake:
  `015/US3-1`, `015/US3-2`, `015/US3-5`, `015/US3-6`, `015/US3-7`, `015/US3-8`, `015/US3-9`,
  `015/US3-10`, `015/US3-11` (pedido → 202 REQUESTED, execução, `drain`, DELIVERED e `used` 2 de 3;
  esgotado → 409 `HELP_EXHAUSTED`; duas requisições simultâneas → no máximo uma pendente
  `HELP_PENDING`; mesma chave → mesmo item; OUT_OF_SCOPE não consome; falha do provedor, timeout e
  agente desabilitado → FAILED reconciliado na leitura sem consumir; vazamento → BLOCKED sem texto
  e sem consumir; sem ajuda, entregue ou encerrada → recusa), `015/FR-016`, `015/FR-020`,
  `015/FR-021`, `015/FR-023` (nota e respostas intactas), proposta decidida APPROVE/REJECT por
  regra (F9), pedido pendente na entrega ainda é entregue, `015/SC-006` (falha da IA nunca consome
  ajuda nem impede salvar e entregar).
- [X] T030 [P] [US3] `apps/api/test/security/015-answer-key-scan.spec.ts`: para os três tipos, com
  os marcadores `MARCADOR-RESPOSTA-012`, `-SOLUCAO-`, `-EXPLICACAO-`, `-RUBRICA-`, `-PRIVADO-` no
  snapshot, nenhum aparece em `provider.requests` (sistema, contexto, conteúdo não confiável,
  resultados de tool) nem em resposta ao aluno; nome, e-mail e ids do aluno também ausentes
  (`015/SC-011`, `015/SC-008`, `015/FR-028`).
- [X] T031 [P] [US3] `apps/api/test/security/015-injection.spec.ts`: instruções no enunciado, na
  resposta do aluno e na pergunta chegam ao modelo só no bloco não confiável; uma resposta do
  modelo que obedece (dá a alternativa, o código) é bloqueada pela checagem (`015/US3-8`).
- [X] T032 [P] [US3] Golden set `apps/api/test/fixtures/work-help/` (README, ≥ 24 casos em
  `golden/<case>/{case.json,expected.json,recorded.json}` cobrindo os três tipos, várias
  disciplinas e linguagens, "qual é a resposta?", "me dá o código", "a letra B está certa?",
  injeções e fora do assunto; `score.ts` com `schemaValidity`, `leakFree`, `injectionClean`,
  `scopeAccuracy`, `relevance` e `falseBlockRate`) e `apps/api/test/integration/015-evaluation.spec.ts`
  que o repete com as respostas gravadas (`015/SC-002`, `015/SC-003`).
- [X] T033 [P] [US3] Web: `apps/web/features/work-help/components/help-dialog.test.tsx`,
  `help-guidance.test.tsx`, `help-counter.test.tsx` e `hooks/use-work-help.test.ts` (contador,
  textos de `contracts/web-ui.md`, polling enquanto pendente e parada em 60 s, fora do assunto sem
  consumo, indisponível, esgotado, colagem bloqueada no campo só em CONTROLLED, texto como texto,
  exemplo em `CodeBlock`, foco volta a "Pedir ajuda", axe e teclado) (`015/US3-1`, `015/US3-6`,
  `015/US3-9`, `015/US3-12`, `015/FR-022`).

### Implementation for User Story 3

- [X] T034 [US3] Definições em `apps/api/src/modules/work-help/definitions/`: `work-helper.ts`
  (agente v1 e tarefa `work-help` de `contracts/work-helper.md`, `settle: "ON_MATERIALIZE"`,
  `hourlyLimit` de `AI_WORK_HELP_EXECUTIONS_PER_HOUR`, DISABLED), `work-help.prompt.ts` (pt-BR,
  regras de tutor e OUT_OF_SCOPE), `read-work-help-request.tool.ts` (só os campos da visão do aluno
  via `activities/views/student-view.ts`, alternativas por letra, resposta salva, pergunta,
  orientações anteriores da questão) e `request.ownership.ts`; `workHelpDefinitions()` no
  `productionAiDefinitions`; entrada do catálogo aprovada só quando houver evidência (T047).
  Feito: a ferramenta seleciona só as colunas que a visão do aluno mostra (a mesma lista fechada de
  `toStudentQuestion`, casos de teste PUBLIC filtrados na consulta), sem ler nenhuma coluna de
  gabarito; as métricas `leakFree`, `scopeAccuracy` e `relevance` entraram na lista da política (009).
- [X] T035 [US3] `apps/api/src/modules/work-help/help/{leak-check,materialize,reconcile,views}.ts`:
  checagem pura (F10); `materialize` trava pedido e tentativa, grava DELIVERED/OUT_OF_SCOPE/BLOCKED
  e devolve APPROVE/REJECT; `reconcile` marca FAILED as execuções terminadas sem conclusão
  (UPDATE condicional); visões por lista fechada; auditorias `work_help.*` (tipos novos nos três
  lugares).
  Feito: migração extra `20261008120000_work_help_execution_link` — o pedido nasce antes da execução
  (a fundação confere o recurso), então `ai_execution_id` é gravado uma vez, de NULL, na mesma
  transação; `data-model.md` atualizado.
- [X] T036 [US3] `apps/api/src/modules/work-help/work-help.{controller,service}.ts`:
  `POST/GET /me/activities/:activityId/attempt/help` (contexto pelo `StudentActivityLoader`,
  pedido + execução numa transação via `beforeCreate`, regra de prazo da 012, rate limit
  `work-help`, `503 AI_HELP_UNAVAILABLE` para agente desabilitado ou sem modelo); catálogo e
  `MATRIX`; `toStudentActivity` com `aiHelp.used`.
  Feito: `GET …/attempt/help` sem tentativa responde o estado vazio (`used` 0, nada pendente) em vez
  de 404; o agente desabilitado depois do pedido reconcilia como FAILED `AI_AGENT_DISABLED`.
- [X] T037 [US3] Script `apps/api/test/eval/work-help.eval.ts` e `"eval:help"` em
  `apps/api/package.json` (mesmo layout de `eval:works`: candidatos do tier, `EVAL_MODEL`,
  `EVAL_RECORD`, `EVAL_REPLAY`) e a latência de cada caso na evidência (`015/SC-007`: p95 ≤ 15 s), fora
  do `pnpm test`.
  Feito: só o script; nenhuma evidência gravada (a aprovação no catálogo é a T047).
- [X] T038 [US3] Web `apps/web/features/work-help/{api,hooks,schemas,components}/…`: `HelpDialog`
  (React Hook Form, 500 caracteres), `HelpGuidance`, `HelpCounter`, `use-work-help` (TanStack Query
  com `refetchInterval` 1,5 s enquanto pendente); "Pedir ajuda" por questão em
  `features/student-activities/components/activity-answering.tsx` quando `aiHelp.allowance` é 3;
  bloqueio de colagem do campo em CONTROLLED via `use-clipboard-block`.
  Feito: no modo controlado, o bloqueio de colagem do campo vem do `use-clipboard-block` da página
  (o diálogo marca `data-help-question-id`, e a mensagem aparece dentro dele); o contador também
  fica no cabeçalho da página de foco.

**Checkpoint**: MVP completo — professor liga, aluno responde controlado e pede ajuda.

---

## Phase 6: User Story 4 — Professor vê saídas da tela e ajudas na correção (Priority: P2)

**Goal**: resumo por aluno, linha do tempo da tentativa e ajudas por questão, sem rótulo de fraude.

**Independent Test**: com uma entrega de 2 saídas e 2 ajudas, abrir a correção e conferir
contagens, linha do tempo, ajudas e "não encontrado" para outro professor.

### Tests for User Story 4 ⚠️

- [ ] T039 [P] [US4] `apps/api/test/integration/015-us4-teacher-review.spec.ts`: `015/US4-1` …
  `015/US4-6` (resumo com saídas, tempo fora, quedas de conexão, bloqueios, tela cheia indisponível; linha do tempo
  com intervalos derivados; ajudas por questão com status e motivo; tentativa não entregue;
  outro professor → 404, aluno → 403; nota intocada), `015/FR-024`, `015/FR-025`, `015/FR-026`;
  `aiHelpUsed` no roster.
- [ ] T040 [P] [US4] Web: `apps/web/features/activities/components/attempt-review.test.tsx` e
  `activity-detail.test.tsx` — seção "Registros do modo controlado" com a nota "Uma saída não
  significa, sozinha, uso indevido.", linha do tempo, "Ajuda da IA" por questão, colunas do roster;
  sem "fraude"/"violação"/"cola" em nenhum texto; axe e teclado (`015/US4-2`, `015/US4-3`).

### Implementation for User Story 4

- [ ] T041 [US4] `apps/api/src/modules/attempt-integrity/integrity-review.{controller,service}.ts`:
  `GET …/activities/:activityId/integrity` e `GET …/attempts/:attemptId/integrity` sob
  `ClassContextPolicy` com `entregas.visualizar`; `apps/api/src/modules/work-help/work-help-review.controller.ts`:
  `GET …/attempts/:attemptId/help`; `aiHelpUsed` no roster (`apps/api/src/modules/activities/roster.ts`,
  contagem de DELIVERED); catálogo e `MATRIX`.
- [ ] T042 [US4] Web: `features/activities/{api,hooks}` para integridade e ajuda;
  `components/attempt-review.tsx` (linha do tempo e ajudas com `CodeBlock`) e
  `components/activity-detail.tsx` (colunas do roster).

**Checkpoint**: professor enxerga tudo o que foi registrado.

---

## Phase 7: User Story 5 — Aluno vê as próprias ajudas depois da entrega (Priority: P3)

**Goal**: histórico com orientações por questão e saídas registradas.

**Independent Test**: depois de entregar com 1 ajuda e 1 saída, abrir o histórico e conferir, sem
nota antes da liberação.

- [ ] T043 [P] [US5] `apps/api/test/integration/015-us5-history.spec.ts`: `015/US5-1`, `015/US5-2`,
  `015/US5-3`, `015/FR-027` (ajudas e eventos próprios depois da entrega, nada de nota, feedback ou
  gabarito antes da liberação, outro aluno → 404).
- [ ] T044 [P] [US5] Web `apps/web/features/student-activities/components/student-history.test.tsx`
  (orientações por questão e "Saídas da tela registradas: n" com horários).
- [ ] T045 [US5] Web `student-history.tsx` e a visão do aluno ligadas a `GET …/attempt/help` e
  `GET …/attempt/integrity`; T043 e T044 verdes.

**Checkpoint**: todas as histórias entregues.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [ ] T046 Journey (`apps/api/test/helpers/journey.ts`) com uma tentativa CONTROLLED (eventos,
  colagem bloqueada, limite de digitação) e ajudas DELIVERED, OUT_OF_SCOPE, BLOCKED e FAILED;
  `audit-coverage.spec.ts` (metadados só ids/enums/códigos), `secret-leak-scan.spec.ts` e
  `006-ai-admin-scan.spec.ts` com os marcadores `MARCADOR-AJUDA-015` (pergunta) e
  `MARCADOR-ORIENTACAO-015` (orientação) fora de logs, auditoria e "Operação de IA" (`015/SC-010`).
- [ ] T047 Release gate: rodar `EVAL_MODEL=<key> EVAL_RECORD=1 pnpm --filter api eval:help` para os
  candidatos BASIC (autorizado pela memória `eval-runs-authorized`), commitar a evidência em
  `apps/api/test/fixtures/evaluations/work-help/` e as aprovações em
  `apps/api/src/modules/ai/definitions/model-catalog.ts`; `009-quality-gate.spec.ts` verde;
  resultados em `apps/api/CLAUDE.md` ("AI release-gate results").
- [ ] T048 [P] Segurança restante em `apps/api/test/security/`: `015-isolation.spec.ts` (professores
  A/B, alunos A1/A2/B1 em todas as rotas novas; ADMIN/MANAGER 403), `015-concurrency.spec.ts` (10
  pedidos de ajuda simultâneos → ≤ 3 entregues, `015/SC-001`; eventos duplicados; troca de modo ×
  início), `015-rate-limits.spec.ts`, `015-boundaries.spec.ts` (campos do servidor → 400,
  tamanhos, 0/1/50/51 eventos, pergunta 0/1/500/501), `015-performance.spec.ts` (lote de eventos
  p95 < 200 ms, pedido de ajuda < 500 ms, resumo de 60 alunos < 1 s).
- [ ] T049 [P] Web: `apps/web/test/student-portal-xss.test.tsx` cobre orientação, pergunta e linha
  do tempo; `token-usage`, `identity`, `docs` e `catalog.test.tsx` verdes com os componentes novos.
- [ ] T050 E2E `apps/web/e2e/controlled-work.spec.ts` contra o mock do OpenRouter (resposta de ajuda
  gravada): professor aplica com as opções, aluno inicia em modo controlado, sai da aba e volta
  (aviso), colagem bloqueada, pede ajuda, entrega; professor vê linha do tempo e ajuda
  (`015/SC-004`, `015/SC-009`). A redefinição do banco E2E pede consentimento do usuário.
- [ ] T051 [P] Documentação: `CLAUDE.md` (Recent Changes, regras fáceis de errar da 015),
  `apps/api/CLAUDE.md` (módulos `attempt-integrity` e `work-help`, helpers, suítes 015, extensões
  da fundação), `apps/web/CLAUDE.md` (rota `(focus)`, `blockClipboard`, guardas), `README.md`.
- [ ] T052 Rodar o `quickstart.md` de ponta a ponta e `pnpm lint && pnpm check-types && pnpm test`.

---

## Dependencies & Execution Order

- **Setup (T001–T004)** → **Foundational (T005–T012)** → histórias.
- **US1 (T013–T017)** depende da Foundational. **US2 (T018–T027)** e **US3 (T028–T038)** dependem
  da US1 e são independentes entre si. **US4 (T039–T042)** lê dados de US2 e US3. **US5
  (T043–T045)** reusa as visões de US2/US3. **Polish** depois de todas; T047 depende de T032–T037.
- Dentro de cada história: testes → domínio puro → serviços/rotas → web.

## Parallel Opportunities

- Setup: T001, T002 e T004 juntos (T003 em seguida, mesmo pacote de `activities`).
- Foundational: T007, T008, T010, T011 e T012 em paralelo depois de T006.
- US2 e US3 inteiras em paralelo (módulos e features diferentes); dentro de cada uma, os testes
  [P] juntos (ex.: T018–T021; T028–T033).
- Polish: T048, T049 e T051 em paralelo.

## Implementation Strategy

1. **MVP** = Setup + Foundational + US1 + US2 + US3: o professor liga as opções e o aluno responde
   em modo controlado com até 3 ajudas. O agente continua DISABLED em produção até T047.
2. Incremento 2: US4 (correção com registros e ajudas).
3. Incremento 3: US5 (histórico do aluno) e Polish (segurança, E2E, release gate, docs).
