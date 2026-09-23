---

description: "Task list for 004 — Área do Professor: Disciplinas, Ementas, Calendário de Aulas e Tópicos"
---

# Tasks: 004 — Área do Professor: Disciplinas, Ementas, Calendário de Aulas e Tópicos

**Input**: Design documents from `/specs/004-syllabus-planning/`
**Prerequisites**: plan.md, spec.md, research.md (E1–E22), data-model.md, contracts/
(http-api, permissions, audit-events, syllabus-processing, web-ui), quickstart.md

**Tests**: obrigatórios (Constituição VII; SC-002–SC-012). Os testes de cada história
são escritos antes da implementação e falham antes dela. Títulos de `describe`/`it`
levam o id da spec 004 com prefixo (`004/US2-3`, `004/FR-041`, `004/SC-005`), que
`apps/api/test/traceability.spec.ts` passa a procurar na fase final. Cada fase termina
com `pnpm lint && pnpm check-types && pnpm test` verde.

**Organization**: tarefas agrupadas por user story. A ordem segue as dependências reais:
US1 (disciplina e turma como oferta) → US2 (envio e processamento) → US3 (revisão) → US4
(calendário) → US5 (planejamento e criação de tópicos) fecham o MVP; US8 consolida a
matriz de isolamento sobre as rotas do MVP; US6 e US7 vêm depois e acrescentam suas
rotas à matriz. As fábricas de teste da Foundational criam planejamentos e tópicos
direto no banco, para que US4 teste a remoção de datas com tópicos antes de US5 existir.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivos diferentes, sem dependência pendente)
- **[Story]**: user story da tarefa (US1…US8)
- Caminhos relativos à raiz do repositório

---

## Phase 1: Setup (infraestrutura compartilhada)

**Purpose**: dependências, configuração, amostras de arquivo e utilitários que várias histórias usam.

- [ ] T001 Instalar com versão exata `pdfjs-dist` (≥ 4.2.67, build `legacy`), `fflate` e `fast-xml-parser` em `apps/api/package.json` e `react-day-picker` em `apps/web/package.json` (`pnpm add -E --filter …`); registrar as quatro em `DEPENDENCIES.md` (licença, para quê, alternativa descartada — tabela de E9); `pnpm audit --prod --audit-level high` sem achados (E9)
- [ ] T002 Acrescentar em `apps/api/src/platform/config/config.schema.ts` `SYLLABUS_MAX_FILE_MB` (`positiveInt(10)`), `SYLLABUS_PROCESSING_INTERVAL_SECONDS` (`nonNegativeInt(10)`, `0` desliga), `SYLLABUS_PROCESSING_TIMEOUT_SECONDS` (`positiveInt(120)`), `RATE_LIMIT_SYLLABUS_UPLOADS_HOURLY` (`positiveInt(20)`) e `RATE_LIMIT_SYLLABUS_RETRIES_HOURLY` (`positiveInt(10)`), expostas em `AppConfig` como `syllabus.{maxFileMb,processingIntervalSeconds,processingTimeoutSeconds}` e `rateLimit.syllabus{UploadsHourly,RetriesHourly}`; documentar em `apps/api/.env.example`, `apps/api/.env.test.example` (`SYLLABUS_PROCESSING_INTERVAL_SECONDS=0`) e `apps/web/e2e/.env.e2e` (`SYLLABUS_PROCESSING_INTERVAL_SECONDS=1`) (E20, `contracts/syllabus-processing.md`)
- [ ] T003 [P] Criar `packages/contracts/src/curriculum/limits.ts` com as constantes nomeadas de E20 (`MAX_PDF_PAGES = 50`, `MAX_DOCX_UNZIPPED_BYTES = 50 MiB`, `MAX_DOCX_ENTRIES = 1000`, `MAX_IMAGE_PIXELS = 40_000_000`, `MAX_MEETINGS_PER_CLASS = 200`, `MAX_TOPICS_PER_PLAN = 300`, `MAX_ITEMS_PER_REVISION = 500`, `MAX_ITEMS_PER_TOPIC = 100`, `MAX_PROCESSING_ATTEMPTS = 3`), exportadas em `packages/contracts/src/index.ts` e usadas pelos schemas e pela API (sem texto de usuário)
- [ ] T004 [P] Escrever os componentes shadcn a partir do registro 4.21.0 (`pnpm dlx shadcn@4.21.0 view calendar checkbox progress`) em `apps/web/components/ui/{calendar,checkbox,progress}.tsx`, com `import { cn } from "@/lib/utils"`, Radix vindo do pacote `radix-ui` já instalado, `Calendar` com `locale` pt-BR do react-day-picker e rótulos de navegação em português ("Mês anterior", "Próximo mês")
- [ ] T005 [P] Criar `apps/api/test/fixtures/syllabus/build-fixtures.ts` (determinístico, só `fflate` e escrita manual de PDF/PNG/JPEG) que gera e grava em `apps/api/test/fixtures/syllabus/`: `poo.pdf` e `poo.docx` (a ementa de POO de `contracts/syllabus-processing.md`, com a frase marcadora `MARCADOR-EMENTA-004` no texto da ementa), `escaneado.pdf` (só imagem, sem texto), `ementa.png`, `ementa.jpg`, `executavel.pdf` (cabeçalho `MZ`), `imagem.docx` (PNG com extensão `.docx`), `macro.docx` (com `word/vbaProject.bin`), `bomba.docx` (entrada que descompacta além de 50 MB), `muitas-entradas.docx` (> 1000 entradas), `truncado.jpg` (sem `FF D9`), `corrompido.pdf`, `ole.docx` (cabeçalho `D0 CF 11 E0`) `gigante.png` (IHDR com mais de 40 MP), `dez-paginas.pdf` (10 páginas de texto com a mesma estrutura de seções e listas) e `poo.expected.json` (o `SyllabusExtraction` completo da ementa de POO, com os textos inteiros e o marcador); `protegido.pdf` versionado como binário pequeno, com origem e comando descritos em `apps/api/test/fixtures/syllabus/README.md`; script `fixtures:syllabus` em `apps/api/package.json` (arquivos de 10 MB para os testes de limite são gerados em memória pelos próprios testes, nunca versionados) (E22)
- [ ] T006 [P] Ampliar `apps/web/lib/api/client.ts`: `apiRequest` aceita `body: FormData` (sem `Content-Type` manual, sem `JSON.stringify`) e nova `apiUpload<T>(path, formData, {onProgress, signal})` sobre `XMLHttpRequest` (progresso real de envio, mesmo tratamento de erro `{statusCode, code, message}` e mesmo `baseUrl`), ainda o único ponto de rede do web; testes em `apps/web/lib/api/client.test.ts` (FormData sem `Content-Type`, progresso, erro 413 mapeado, abort)

---

## Phase 2: Foundational (pré-requisitos bloqueantes)

**Purpose**: schema, contratos base, permissões, erros, armazenamento, exceção multipart do `OriginGuard`, máquinas de estado, auditoria e guardas. Nenhuma história começa antes desta fase.

**⚠️ CRITICAL**: bloqueia todas as histórias.

- [ ] T007 Atualizar `apps/api/prisma/schema.prisma` com os 11 enums e os 10 modelos novos de `data-model.md` (`Subject`, `StoredFile`, `SyllabusDocument`, `SyllabusRevision`, `SyllabusGroup`, `SyllabusItem`, `ClassMeeting`, `ClassPlan`, `Topic`, `TopicSyllabusItem`) e as colunas `subjectId`, `startsOn`, `endsOn` (`@db.Date`) de `SchoolClass`, com `@@map` em snake_case, FKs `Restrict`, `sha256` como `Bytes @db.ByteA`, índices comuns e `@@unique` simples
- [ ] T008 Gerar a migração `apps/api/prisma/migrations/<ts>_curriculum_planning/migration.sql` (`prisma migrate dev --create-only`) e acrescentar à mão: `UNIQUE (teacher_id, lower(name))` em `subjects`; `UNIQUE (document_id) WHERE status = 'DRAFT'` em `syllabus_revisions`; FK composta `(group_id, revision_id)` de itens para grupos (com `UNIQUE (id, revision_id)` em grupos); `UNIQUE (plan_id, position) DEFERRABLE INITIALLY DEFERRED` em `topics`; índices do worker (`(processing_status, next_attempt_at)`, `lease_expires_at WHERE processing_status = 'PROCESSING'`); os `CHECK`s de `data-model.md` (datas da turma, `size_bytes = octet_length(bytes)`, `confirmed_at`/`confirmed_by_id` juntos, `archived_at` ⇔ `ARCHIVED`, `based_on_revision_id` ⇔ `REVISION`); triggers de imutabilidade (`stored_files` rejeita `UPDATE`/`DELETE`; `syllabus_revisions` rejeita `UPDATE`/`DELETE` em `CONFIRMED` salvo a própria transição `DRAFT → CONFIRMED`; `syllabus_groups`/`syllabus_items` rejeitam `INSERT`/`UPDATE`/`DELETE` em revisão `CONFIRMED`); as 10 permissões e suas associações a `TEACHER` de `contracts/permissions.md` (`INSERT … ON CONFLICT DO NOTHING`); aplicar com `pnpm --filter api prisma migrate deploy` no banco de teste e conferir que `resetDb` (TRUNCATE, que não dispara triggers de linha) continua limpando as tabelas novas
- [ ] T009 [P] Acrescentar as 10 permissões em `apps/api/src/modules/access-control/permissions.ts` e em `ROLE_PERMISSIONS` de `apps/api/test/security/authorization-matrix.ts` (só TEACHER); criar `PENDING_004_PERMISSIONS` em `apps/api/test/security/us7-matrix-completeness.spec.ts` com todas elas (cada tarefa que põe rotas no `MATRIX` retira as suas)
- [ ] T010 [P] Criar os contratos em `packages/contracts/src/curriculum/{subjects,syllabus,class-meetings,class-plan}.ts` com todos os schemas da tabela "Tipos compartilhados" de `contracts/http-api.md` (strict, tipos via `z.infer`, limites de `limits.ts`, `IsoDateSchema` que recusa datas inválidas como `2027-02-30`, `TopicResolutionSchema` como união discriminada por `action`, `CreateSyllabusRevisionRequestSchema` com `basedOnRevisionId` obrigatório se e só se `source = "REVISION"`, `SaveSyllabusRevisionRequestSchema` com ≤ 500 itens no total, `TopicFieldsSchema` com `itemIds` sem repetição); ampliar `packages/contracts/src/classes/classes.ts` (`subjectId`, `startsOn`, `endsOn` em criar/editar com `endsOn ≥ startsOn` e ambos ou nenhum; `ClassViewSchema` + `subject`, `startsOn`, `endsOn`, `plannable`, `planStatus`; `subjectId` em `ClassListQuerySchema`); exportar em `packages/contracts/src/index.ts`; os 25 códigos novos em `packages/contracts/src/common/errors.ts`; testes em `packages/contracts/test/curriculum.spec.ts` (`004/FR-045`: campos desconhecidos e controlados pelo servidor recusados; limites; datas)
- [ ] T011 [P] Suporte no catálogo `packages/contracts/src/endpoints.ts` a entradas `upload: true` (sem `body` Zod; resposta validada) e `response: "binary"` (sem schema de resposta); ajustar `apps/api/test/contracts/endpoint-catalog.spec.ts` para aceitar essas formas e `apps/api/test/helpers/contract-conformance.interceptor.ts` para não validar rotas `binary`, com casos de teste para as duas (E5, E18)
- [ ] T012 [P] Acrescentar os 25 erros em `apps/api/src/platform/http/errors.ts` com os status de `contracts/http-api.md` (400 `FILE_*` exceto `FILE_TOO_LARGE` 413; 409 `SUBJECT_NAME_TAKEN`, `SUBJECT_INACTIVE`, `CLASS_SUBJECT_LOCKED`, `MEETINGS_OUTSIDE_PERIOD`, `REVISION_DRAFT_EXISTS`, `REVISION_CONFIRMED`, `MEETING_HAS_TOPICS`, `PLAN_REVISION_CONFLICT`, `PLAN_ARCHIVED`; 422 os demais), na ordem do `ErrorCatalog`, e os textos de `contracts/web-ui.md` em `apps/web/lib/messages/error-messages.ts` (paridade conferida por `error-catalog.spec.ts` e pelo teste do web)
- [ ] T013 [P] Decorador `@AcceptsMultipart()` em `apps/api/src/platform/http/origin.guard.ts`: aceita `multipart/form-data` só em rotas marcadas, continua exigindo `Origin` permitido; testes em `apps/api/test/security/004-origin-multipart.spec.ts` (`004/FR-007`: rota marcada aceita multipart com `Origin` permitido e recusa sem ele → 403 `ORIGIN_NOT_ALLOWED`; toda rota não marcada, percorrendo o catálogo, continua recusando multipart) (E5)
- [ ] T014 [P] Criar `apps/api/src/platform/http/upload.ts` com `SyllabusFileInterceptor` (`FileInterceptor("file")` com `memoryStorage` e `limits: {fileSize: syllabus.maxFileMb, files: 1, fields: 0, parts: 1}`) e o mapeamento de erros do multer (`LIMIT_FILE_SIZE` → 413 `FILE_TOO_LARGE`; campo extra, arquivo a mais ou sem `file` → 400 `VALIDATION_ERROR`), com `apps/api/src/platform/http/upload.spec.ts` (E5)
- [ ] T015 [P] Criar `apps/api/src/platform/storage/file-storage.ts` (interface `FileStorage`: `put(tx, bytes) → {key, sha256, sizeBytes}`, `get(key) → Buffer`) e `postgres-file-storage.ts` (grava em `stored_files` na transação recebida; `get` confere o SHA-256 e, se divergir, registra `syllabus.checksum_mismatch` em nível `error` e lança 500 sem devolver bytes); `StorageModule` global; teste de integração `apps/api/test/integration/004-file-storage.spec.ts` (`004/FR-009`, `004/FR-010`: grava e lê igual; `UPDATE` e `DELETE` em `stored_files` recusados pela trigger; checksum adulterado com a trigger desligada no teste → 500) (E4)
- [ ] T016 [P] Criar as máquinas de estado `apps/api/src/modules/syllabus/syllabus-processing.state-machine.ts`, `apps/api/src/modules/class-plans/class-plan.state-machine.ts` e `apps/api/src/modules/class-plans/topic.state-machine.ts` no formato de `classes/class.state-machine.ts`, com testes `*.state-machine.spec.ts` ao lado (`004/FR-014`, `004/FR-031`, `004/FR-039`: todas as transições válidas e inválidas de `data-model.md`, repetição sem efeito, `ARCHIVED` final do planejamento, restauração para `statusBeforeArchive` ou `ACTIVE`)
- [ ] T017 [P] Acrescentar os 17 tipos de `contracts/audit-events.md` com as allowlists de `metadata` em `apps/api/src/modules/audit/audit-event-types.ts` (alvos `SUBJECT`, `SYLLABUS_DOCUMENT`, `SYLLABUS_REVISION`, `CLASS_PLAN`, `TOPIC`; ator `SYSTEM` para `syllabus.processed`/`syllabus.processing_failed`) e o teste da allowlist em `apps/api/src/modules/audit/audit.service.spec.ts`
- [ ] T018 Evoluir `apps/api/test/security/audit-coverage.spec.ts` para ler também `specs/004-syllabus-planning/contracts/audit-events.md`, com o conjunto temporário `PENDING_004_TYPES` (todos os tipos 004) que dispensa só a checagem "emitido pela jornada"; cada história retira seus tipos quando `apps/api/test/helpers/journey.ts` passar a emiti-los
- [ ] T019 [P] Atualizar `apps/api/test/security/domain-boundary.spec.ts`: `EXPECTED_MODELS` com os 28 modelos de `data-model.md`; permitir os termos `subject`, `syllabus`, `ementa`, `disciplina`, `topic`, `tópico`, `meeting`, `plan`; manter proibidos os de fases futuras (questão, exercício, prova, trabalho, nota, tentativa); título `004/E22 fronteira do domínio` (E22)
- [ ] T020 Acrescentar em `apps/api/test/helpers/factories.ts`: `createSubject(t, teacherId, overrides)`, opções `subjectId`/`startsOn`/`endsOn` em `createClass`, `createSyllabusDocument(t, subjectId, {fixture?, status?, extraction?})` (grava `stored_files` real), `createConfirmedRevision(t, documentId, groups)` (devolve ids de grupos e itens), `createMeetings(t, classId, dates)`, `createPlan(t, classId, revisionId, overrides)` e `createTopic(t, planId, {meetingId?, itemIds?, status?})`, todas gravando direto pelo Prisma dentro das regras do schema
- [ ] T021 Criar `apps/api/src/modules/subjects/subject-context.policy.ts` (`SubjectContextPolicy.findOwnedOrNotFound(teacherId, id, tx?)`, `WHERE id = $1 AND teacher_id = $2`) e `apps/api/src/modules/classes/plannable-class.ts` (`requirePlannable(class)` → 422 `CLASS_NOT_PLANNABLE` sem disciplina ou datas; turma `ARCHIVED` → 409 `PLAN_ARCHIVED` nas escritas); registrar os módulos vazios `SubjectsModule`, `SyllabusModule` e `ClassPlansModule` em `apps/api/src/app.module.ts` (E3)

**Checkpoint**: `pnpm lint && pnpm check-types && pnpm test` verde; migração aplicada; testes da 003 continuam verdes; nenhuma rota nova ainda.

---

## Phase 3: User Story 1 — Professor organiza disciplinas e liga turmas a elas (Priority: P1) 🎯 MVP

**Goal**: o professor cria, lista, edita, desativa e reativa disciplinas, e a turma da 003 passa a ser a oferta da disciplina, com período e datas.

**Independent Test**: com um professor ativo, criar a disciplina POO, criar uma turma nova já ligada a ela com período e datas, ligar uma turma antiga (sem disciplina) a ela; outro professor e um administrador não veem nada.

### Tests for User Story 1 ⚠️

- [ ] T022 [P] [US1] Teste de integração `apps/api/test/integration/004-us1-subjects.spec.ts`: `004/US1-1` (criar → 201 `ACTIVE`, dono da sessão, auditoria `subject.created` sem nome no `metadata`), `004/US1-2` (nome repetido com outra caixa e espaços → 409 `SUBJECT_NAME_TAKEN`, na criação, na renomeação e em duas requisições simultâneas), `004/US1-6` (desativar e reativar com `subject.updated` `status`; turmas existentes intactas), lista com pesquisa sem acento, filtro de situação, ordem por nome e cursor de 50, `004/FR-002` (sem rota de exclusão), disciplina de outro professor → 404 em GET, PATCH e status
- [ ] T023 [P] [US1] Teste de integração `apps/api/test/integration/004-us1-class-offering.spec.ts`: `004/US1-3` (criar turma com `subjectId`, `period`, `startsOn`, `endsOn` → aparece em `GET /classes?subjectId=` e em `classCount`), `004/US1-4` (turma da 003 sem disciplina → `plannable: false`; PATCH com disciplina e datas → `plannable: true`, `class.offering_updated` com `fields`), `004/US1-5` (término antes do início, ou só uma das datas → 400 no campo), disciplina desativada → 409 `SUBJECT_INACTIVE`, disciplina de outro professor → 404, `004/FR-003` (criar turma sem os campos novos continua 201 como na 003)
- [ ] T024 [P] [US1] Testes do web `apps/web/features/subjects/components/subjects-list.test.tsx`, `subject-form.test.tsx` e `subject-detail.test.tsx` (lista com pesquisa, filtro, "Carregar mais", vazio e erro; `SUBJECT_NAME_TAKEN` no campo Nome; desativar/reativar; turmas da disciplina com período, datas e situação do planejamento; axe e `expectTabOrder` — `004/SC-012`) e `apps/web/features/classes/components/class-form.test.tsx` ampliado (select Disciplina só com ativas, Data de início e Data de término, erro de datas junto ao campo)

### Implementation for User Story 1

- [ ] T025 [US1] `apps/api/src/modules/subjects/subjects.service.ts` (`create` com `searchKey` e conflito do índice → `SUBJECT_NAME_TAKEN`; `list` keyset por `name, id` com `escapeLike` sobre `searchKey` e filtro de situação; `get`; `update`; `changeStatus` — repetição sem efeito; auditorias na mesma transação) e mapper `subject.view.ts` (`classCount`, `documentCount`), tudo via `SubjectContextPolicy`
- [ ] T026 [US1] `apps/api/src/modules/subjects/subjects.controller.ts` com as 5 rotas de "Disciplinas" de `contracts/http-api.md`; entradas `subjects.list|create|get|update|changeStatus` em `packages/contracts/src/endpoints.ts`; linhas no `MATRIX` de `apps/api/test/security/authorization-matrix.ts`; retirar `disciplinas.*` de `PENDING_004_PERMISSIONS`
- [ ] T027 [US1] Ampliar `apps/api/src/modules/classes/classes.service.ts` e `class.view.ts`: aceitar `subjectId`/`startsOn`/`endsOn` em criar e editar (disciplina via `SubjectContextPolicy` → 404; `INACTIVE` → 409 `SUBJECT_INACTIVE` só quando a disciplina muda), filtro `subjectId` na lista, `plannable` e `planStatus` na view, `class.offering_updated` quando disciplina, período ou datas mudam (`class.updated` da 003 continua para os demais campos); os testes da 003 atualizados para o `ClassView` ampliado
- [ ] T028 [US1] Emitir `subject.created`, `subject.updated` e `class.offering_updated` em `apps/api/test/helpers/journey.ts` e retirá-los de `PENDING_004_TYPES`
- [ ] T029 [P] [US1] `apps/web/features/subjects/api/subjects.ts`, `hooks/use-subjects.ts` (`useInfiniteQuery` `["subjects", filtros]`, `useSubject`, mutations de criar, editar e situação com invalidações) e `schemas/subject-form.ts` derivado de `CreateSubjectRequestSchema`; ampliar `apps/web/features/classes/api` e `schemas/class-form.ts` com os campos de oferta
- [ ] T030 [US1] Componentes `apps/web/features/subjects/components/{subjects-list,subject-form,subject-detail,subject-status-actions}.tsx` e rotas `apps/web/app/(app)/disciplinas/page.tsx`, `disciplinas/nova/page.tsx`, `disciplinas/[id]/page.tsx` (dados, "Turmas da disciplina" com "Nova turma" levando `?disciplina=<id>`, seção "Ementa" vazia até US2); `/disciplinas/:path*` em `apps/web/proxy.ts`; item "Minhas disciplinas" (`Library`, `disciplinas.visualizar`) em `apps/web/components/shared/app-sidebar.tsx` e no seu teste (administrador sem papel de professor não vê)
- [ ] T031 [US1] Formulário de turma `apps/web/features/classes/components/class-form.tsx` com Disciplina (select das ativas, pré-selecionada por `?disciplina=`), Data de início e Data de término; abas de navegação da turma em `apps/web/features/classes/components/class-tabs.tsx` (Alunos, Convites, Ementa, Calendário, Planejamento) usadas por `apps/web/app/(app)/turmas/[id]/layout.tsx`, e `class-offering-required.tsx` com "Informe a disciplina e as datas de início e término da turma para planejar." e o link para editar a turma

**Checkpoint**: professor gerencia disciplinas e liga turmas a elas; suíte verde.

---

## Phase 4: User Story 2 — Professor envia a ementa e o documento original é preservado (Priority: P1)

**Goal**: envio multipart validado, original imutável no `stored_files`, versões por disciplina, processamento assíncrono em worker com leitura isolada em `worker_threads`, download seguro e "Tentar novamente".

**Independent Test**: enviar um PDF válido e acompanhar até "Processado"; tentar um executável renomeado para `.pdf`, um arquivo acima do limite e um nome malicioso; baixar o original e comparar o SHA-256.

### Tests for User Story 2 ⚠️

- [ ] T032 [P] [US2] Testes unitários `apps/api/src/modules/syllabus/syllabus-file-inspector.spec.ts` (cada fixture de T005 → tipo ou código: `executavel.pdf`/`imagem.docx` → `FILE_TYPE_NOT_ALLOWED`, `corrompido.pdf`/`truncado.jpg` → `FILE_UNREADABLE`, `protegido.pdf`/`ole.docx` → `FILE_PROTECTED`, `macro.docx` → `FILE_MACROS`, `bomba.docx`/`muitas-entradas.docx`/`gigante.png` → `FILE_TOO_COMPLEX`; extensão e tipo declarado divergentes da assinatura → `FILE_TYPE_NOT_ALLOWED`) e `original-filename.spec.ts` (`004/US2-4`: `../../etc/passwd.pdf` → `passwd.pdf`, `\`, controles e bidi removidos, NFC, 255 caracteres, vazio → `ementa.<ext>`) (E6)
- [ ] T033 [P] [US2] Teste de ouro `apps/api/src/modules/syllabus/extraction/syllabus-extractor.spec.ts` (`004/SC-005`, `004/FR-019`: `poo.pdf` e `poo.docx` produzem exatamente `apps/api/test/fixtures/syllabus/poo.expected.json` (resumido em `contracts/syllabus-processing.md`), 4 grupos e 16 itens na ordem; duas execuções dão o mesmo JSON; `escaneado.pdf` → `NO_TEXT`; PNG/JPEG → `NO_TEXT` sem OCR (`004/FR-020`); numeração mista `1.`, `1.1`, `a)`, `-`, `•` em amostras em memória; rótulos em inglês; lista sem seção de objetos cai em grupos) (E10)
- [ ] T034 [P] [US2] Teste de integração `apps/api/test/integration/004-us2-syllabus-upload.spec.ts`: `004/US2-1` (multipart `poo.pdf` → 201 `UPLOADED` versão 1, `duplicate: false`, auditoria `syllabus.uploaded` sem nome de arquivo; resposta sem chave de armazenamento nem hash), `004/US2-2` (`executavel.pdf`, `imagem.docx`, `Content-Type` falso → 400 `FILE_TYPE_NOT_ALLOWED`, nenhuma linha em `stored_files` nem `syllabus_documents`), `004/US2-3` e `004/SC-003` (todas as amostras hostis de T005; arquivo de 10 MB + 1 byte gerado em memória → 413 `FILE_TOO_LARGE`; corrompido, protegido, macro, bomba → 400 com o código; nada gravado; log `syllabus.upload_rejected` com `code` e sem nome), `004/US2-4` (nome malicioso gravado saneado; chave = UUID), `004/US2-5` (download com SHA-256 igual ao enviado, `Content-Disposition: attachment; filename*=UTF-8''…`, `Cache-Control: private, no-store`, `Content-Security-Policy: default-src 'none'; sandbox`, `nosniff`; `?view=inline` só para PNG/JPEG, PDF → 400), `004/US2-6` (mesmo arquivo de novo → 200 `duplicate: true` com a versão existente, nenhuma versão nova), disciplina desativada → 409 `SUBJECT_INACTIVE`, `004/FR-013` (sem rota de exclusão), `004/US8-5` parcial (21º envio na hora → 429 com `Retry-After`)
- [ ] T035 [P] [US2] Teste de integração `apps/api/test/integration/004-syllabus-processing.spec.ts` (`004/FR-014`, `004/FR-015`, `contracts/syllabus-processing.md`): `runOnce(now)` leva `UPLOADED → PROCESSING → PROCESSED(TEXT)` com `extraction` gravada e `syllabus.processed` (ator SYSTEM, contagens); `NO_TEXT` para imagem; `UNREADABLE` → `FAILED` direto com `syllabus.processing_failed`; `INTERNAL`/`TIMEOUT` (prazo de 1 s por config e extrator de teste lento) voltam a `UPLOADED` com esperas de 1 min e 5 min e viram `FAILED` na 3ª tentativa; lease vencido (servidor "reiniciado") é reservado de novo; `004/SC-009` (duas `runOnce` simultâneas processam cada documento uma vez); kill switch (`SYLLABUS_PROCESSING_INTERVAL_SECONDS=0`: envio aceito e fica `UPLOADED`, nem o `kick()` do envio processa); `004/FR-016` (`POST /syllabus-documents/:id/retry` em `FAILED` → 202 `UPLOADED` com `attempts` zerado; em outra situação → 409 `INVALID_STATE_TRANSITION`; 11º na hora → 429); `extraction` nunca muda depois de gravada; nenhum log contém `MARCADOR-EMENTA-004`
- [ ] T036 [P] [US2] Testes do web `apps/web/features/syllabus/components/syllabus-upload.test.tsx` (selecionar e soltar arquivo, "PDF, DOCX, PNG ou JPG, até 10 MB.", recusa no cliente por tipo e tamanho, barra de progresso, mensagens "Ementa enviada." e "Este arquivo já foi enviado (versão N).", axe e teclado) e `syllabus-status.test.tsx` (selos, `aria-live="polite"`, consulta a cada 2 s só em `UPLOADED`/`PROCESSING`, "O processamento falhou: …" com "Tentar novamente" e "Preencher manualmente") (`004/FR-051`, E17)

### Implementation for User Story 2

- [ ] T037 [US2] Leitura isolada: `apps/api/src/modules/syllabus/extraction/extract.worker.ts` (entrada do `worker_thread`, mensagens de `contracts/syllabus-processing.md`, sem Prisma, config, logger nem rede) e `apps/api/src/modules/syllabus/syllabus-worker-runner.ts` (`inspect(bytes, declared)` com prazo de 10 s e `extract(bytes, mediaType)` com `syllabus.processingTimeoutSeconds`, um `Worker` por tarefa com `resourceLimits: {maxOldGenerationSizeMb: 256, maxYoungGenerationSizeMb: 32}`, `terminate()` no prazo → `TIMEOUT`, log `syllabus.worker_timeout`); garantir que a entrada do worker carregue em `dist/` e nos testes do Vitest (o runner recebe o caminho do worker por injeção, com padrão em `dist/`; `apps/api/test/helpers/global-setup.ts` compila a pasta `extraction/` com `@swc/core` para `apps/api/test/.tmp/extraction/` e `createTestApp` injeta esse caminho; `test/.tmp/` no `.gitignore`; documentar em `apps/api/CLAUDE.md`) (E8)
- [ ] T038 [US2] `apps/api/src/modules/syllabus/syllabus-file-inspector.ts` (assinaturas, pdfjs com `isEvalSupported: false`, `disableFontFace: true`, criptografia e ≤ 50 páginas; DOCX com `fflate` contando entradas e bytes durante a descompressão, `[Content_Types].xml`, `vbaProject.bin`/`macroEnabled`, OLE; PNG IHDR/IEND; JPEG SOF/EOI; ≤ 40 MP) e `original-filename.ts`, executados dentro do worker de T037 (E6)
- [ ] T039 [US2] Extrator `apps/api/src/modules/syllabus/extraction/{pdf-lines,docx-lines,section-labels,syllabus-extractor}.ts`: linhas do PDF agrupadas por coordenada vertical (tolerância 2 pt), parágrafos do DOCX com `fast-xml-parser` (`processEntities: false`, sem DTD) usando `w:numPr/w:ilvl`, `w:pStyle` e `numbering.xml`; seções, grupos, itens, continuação de linha, título e `NO_TEXT` (< 20 caracteres não brancos) conforme E10; resultado validado por `SyllabusExtractionSchema` com `extractorVersion: 1`
- [ ] T040 [US2] `apps/api/src/modules/syllabus/syllabus-documents.service.ts`: `upload(subjectId, file, auth)` — limite por professor (`RateLimitService`), disciplina própria e `ACTIVE`, inspeção no worker, SHA-256, transação com `FileStorage.put` + documento (versão `max + 1` sob `pg_advisory_xact_lock` da disciplina; conflito em `(subject_id, sha256)` → devolve a versão existente com `duplicate: true` sem gravar arquivo) + `syllabus.uploaded`, `worker.kick()` depois do commit; `list`, `getDetail` (com `extraction` e revisões), `download` (bytes conferidos, cabeçalhos de E18), `retry` (máquina de estado, limite próprio); mapper `syllabus-document.view.ts` sem chave nem hash
- [ ] T041 [US2] `apps/api/src/modules/syllabus/syllabus-processing.worker.ts`: `runOnce(now?)` com a reserva `FOR UPDATE SKIP LOCKED` de E7 (lote de 2, lease 3 min), extração pelo runner fora da transação, gravação de `PROCESSED` (`extraction`, `extractionResult`, `extractorVersion`, `processedAt`) ou `FAILED`/backoff com `failureCategory`, auditorias SYSTEM, logs `syllabus.processing_retry` sem texto; `setInterval` de `syllabus.processingIntervalSeconds` iniciado em `onApplicationBootstrap` (nada com `0`) e parado no shutdown; `kick()` sem sobreposição de execuções e sem efeito quando o intervalo é `0`
- [ ] T042 [US2] `apps/api/src/modules/syllabus/syllabus-documents.controller.ts` com as 5 rotas de "Ementa: documentos" (`@AcceptsMultipart()` + `SyllabusFileInterceptor` no envio; download com `StreamableFile` e cabeçalhos); entradas `syllabusDocuments.list|upload|get|download|retry` em `endpoints.ts` (`upload: true`, `response: "binary"`); suporte a pedidos multipart e respostas binárias no helper do `MATRIX` e linhas das 5 rotas; retirar `ementas.enviar` e `ementas.visualizar` de `PENDING_004_PERMISSIONS`
- [ ] T043 [US2] Emitir `syllabus.uploaded`, `syllabus.processed` (via `runOnce`) e `syllabus.processing_failed` (fixture ilegível) em `apps/api/test/helpers/journey.ts` e retirá-los de `PENDING_004_TYPES`
- [ ] T044 [P] [US2] `apps/web/features/syllabus/api/syllabus-documents.ts` (lista, detalhe, envio com `apiUpload` e progresso, retry; URL de download) e `hooks/use-syllabus-documents.ts` (`useSubjectDocuments`, `useSyllabusDocument` com `refetchInterval` de 2 s enquanto `UPLOADED`/`PROCESSING`, mutations com invalidação de `["subjects", id, "syllabus-documents"]`)
- [ ] T045 [US2] Componentes `apps/web/features/syllabus/components/{syllabus-upload,syllabus-status,syllabus-versions-list}.tsx` (zona de soltar com eventos nativos e `<input type="file" accept=".pdf,.docx,.png,.jpg,.jpeg">` rotulado, `Progress`); seção "Ementa" de `/disciplinas/[id]` com versões e "Enviar ementa"; rota `apps/web/app/(app)/disciplinas/[id]/ementa/[documentId]/page.tsx` com situação, texto extraído, "Baixar original" e "Tentar novamente"; rota `apps/web/app/(app)/turmas/[id]/ementa/page.tsx` com o envio pela disciplina da turma (`?turma=<id>` para voltar) ou `class-offering-required`

**Checkpoint**: envio, validação, armazenamento imutável, processamento e download funcionam; suíte verde.

---

## Phase 5: User Story 3 — Professor revisa e confirma o conteúdo extraído (Priority: P1)

**Goal**: revisões em rascunho (da extração, manual ou a partir de uma confirmada), edição de grupos e itens, confirmação imutável.

**Independent Test**: processar a ementa de POO, corrigir e mover itens, confirmar; enviar uma imagem e preencher à mão; conferir que o original e o conteúdo extraído não mudaram.

### Tests for User Story 3 ⚠️

- [ ] T046 [P] [US3] Teste de integração `apps/api/test/integration/004-us3-syllabus-revisions.spec.ts`: `004/US3-1` (revisão `EXTRACTION` pré-preenchida com título, ementa, competência, 4 grupos e 16 itens), `004/US3-2` (PUT edita, move entre grupos, reordena, acrescenta e remove; GET devolve o salvo; `extraction` do documento e SHA-256 do original iguais), `004/US3-3` (confirmar → `CONFIRMED` com `syllabus.revision_confirmed`; PUT depois → 409 `REVISION_CONFIRMED`; confirmar de novo → 200 sem novo registro; sem itens → 422 `REVISION_EMPTY`), `004/US3-4` (documento `FAILED` ou `NO_TEXT`: `source: "EXTRACTION"` → 422 `EXTRACTION_UNAVAILABLE`; `failureCategory` na view), `004/US3-5` (`source: "MANUAL"` em `FAILED` e em `PROCESSED`/`NO_TEXT` → confirmado ligado ao mesmo documento, `source` `MANUAL`), `004/US3-6` (`source: "REVISION"` copia a confirmada com `originItemId`; base em rascunho → 422 `REVISION_NOT_CONFIRMED`; a confirmada anterior não muda), segundo rascunho → 409 `REVISION_DRAFT_EXISTS`, mais de 500 itens → 400, `004/SC-004` (UPDATE direto em revisão, grupo ou item confirmado → erro da trigger), edge case "processamento terminou depois do preenchimento manual" (rascunho manual intacto; extração disponível como sugestão), `004/FR-018` (texto com `<script>` guardado e devolvido como texto)
- [ ] T047 [P] [US3] Testes do web `apps/web/features/syllabus/components/syllabus-revision-editor.test.tsx` (campos Título, Ementa, Competência; "Adicionar grupo", "Adicionar item", "Subir", "Descer", "Mover para o grupo…", "Remover" com foco preservado; "Revisão salva."; "Inclua ao menos um item antes de confirmar."; axe e teclado) e `syllabus-document-page.test.tsx` (`NO_TEXT` com "Não foi possível ler o texto deste arquivo. Preencha o conteúdo manualmente." e a imagem `?view=inline` ao lado; `FAILED` com a razão; confirmado somente leitura com "Nova revisão"; texto extraído escapado)

### Implementation for User Story 3

- [ ] T048 [US3] `apps/api/src/modules/syllabus/syllabus-revisions.service.ts`: `create(documentId, {source, basedOnRevisionId})` (documento via disciplina própria; rascunho único pelo índice parcial → `REVISION_DRAFT_EXISTS`; `EXTRACTION` a partir de `extraction` com `TEXT`; `MANUAL` vazio; `REVISION` copiando grupos e itens com `originItemId`; `number` = `max + 1`), `get`, `save` (`FOR UPDATE` da revisão; `DRAFT` apenas; apaga e recria grupos e itens na transação), `confirm` (≥ 1 item, `confirmedAt`/`confirmedById`, auditoria com contagens; repetido sem efeito); mapper `syllabus-revision.view.ts`
- [ ] T049 [US3] `apps/api/src/modules/syllabus/syllabus-revisions.controller.ts` com as 4 rotas de "Ementa: revisões"; entradas `syllabusRevisions.create|get|save|confirm` em `endpoints.ts`; linhas no `MATRIX`; retirar `ementas.revisar` de `PENDING_004_PERMISSIONS`; emitir `syllabus.revision_confirmed` em `journey.ts` e retirá-lo de `PENDING_004_TYPES`
- [ ] T050 [P] [US3] `apps/web/features/syllabus/api/syllabus-revisions.ts`, `hooks/use-syllabus-revisions.ts` e `schemas/revision-form.ts` derivado de `SaveSyllabusRevisionRequestSchema`
- [ ] T051 [US3] `apps/web/features/syllabus/components/syllabus-revision-editor.tsx` (RHF `useFieldArray` aninhado para grupos e itens) e a página do documento completa: "Revisar conteúdo" (cria `EXTRACTION` ou abre o rascunho), "Preencher manualmente" (`MANUAL`), "Nova revisão" a partir da confirmada, "Confirmar conteúdo" com `alert-dialog`, imagem ao lado quando PNG/JPEG e o texto extraído ao lado quando PDF/DOCX

**Checkpoint**: conteúdo revisado e confirmado; imagem preenchida à mão; suíte verde.

---

## Phase 6: User Story 4 — Professor marca no calendário os dias em que terá aula (Priority: P1)

**Goal**: encontros por data dentro do período da turma, numerados na leitura, com resolução obrigatória dos tópicos ligados quando uma data sai.

**Independent Test**: numa turma de fevereiro a junho, marcar 18 quartas-feiras deixando uma de fora, conferir total e numeração; desmarcar uma data sem tópico e uma com tópico.

### Tests for User Story 4 ⚠️

- [ ] T052 [P] [US4] Teste de integração `apps/api/test/integration/004-us4-class-meetings.spec.ts`: `004/US4-1` (18 datas → 18 encontros `PLANNED` numerados 1–18 por data, `total: 18`, `class_meetings.updated` com `added`/`total`), `004/US4-2` (04/03, 11/03 e 25/03 → 3 encontros, sem motivo pedido; `004/FR-026`), `004/US4-3` (data fora do período → 422 `MEETING_OUT_OF_PERIOD`; data repetida no pedido ou já existente → um encontro; 201ª data → 422 `TOO_MANY_MEETINGS`), `004/US4-4` (data no meio renumera; tópicos continuam nos mesmos encontros), `004/US4-5` (remover sem tópico apaga e renumera), `004/US4-6` (remover com tópico sem resolução → 409 `MEETING_HAS_TOPICS` no formato padrão de erro e nada mudado; com `MOVE`, `UNSCHEDULE`, `MERGE` e `ARCHIVE` → encontro removido, nenhum tópico apagado, um registro por tópico afetado), `004/US4-7` (PATCH das datas da turma que deixaria encontros de fora → 409 `MEETINGS_OUTSIDE_PERIOD`; depois de removê-los pelo calendário, aceito), turma sem disciplina ou datas → 422 `CLASS_NOT_PLANNABLE`, com planejamento: `planRevision` antigo → 409 `PLAN_REVISION_CONFLICT` e planejamento `ARCHIVED` → 409 `PLAN_ARCHIVED`, `004/SC-008` (`DELETE` direto de encontro com tópico recusado pela FK; nenhum tópico com `meeting_id` inexistente depois de toda a suíte), datas passadas aceitas (tópicos e planejamento criados pelas fábricas de T020)
- [ ] T053 [P] [US4] Teste do web `apps/web/features/class-calendar/components/meeting-calendar.test.tsx` (`004/FR-052`: mês com dia da semana, dias fora do período desabilitados, setas movem o foco, `PageUp`/`PageDown` trocam o mês, Espaço/Enter marcam, "Total de aulas selecionadas: N", lista numerada, "Salvar calendário" envia só acrescentadas e removidas, diálogo "Esta aula tem tópicos planejados" com as quatro escolhas por tópico, "Calendário salvo.", axe)

### Implementation for User Story 4

- [ ] T054 [US4] `apps/api/src/modules/class-plans/plan-revision.guard.ts` (`bumpRevision(tx, planId, planRevision)` com o `UPDATE … WHERE revision = $2 AND status <> 'ARCHIVED' RETURNING revision` de E13 → `PLAN_REVISION_CONFLICT` ou `PLAN_ARCHIVED`; log `class_plan.revision_conflict`) e `apps/api/src/modules/class-plans/topic-mutations.ts` (operações de transação sobre tópicos, reutilizadas por US6: `moveToMeeting`, `unschedule`, `mergeInto` com união de itens e `merged_into_topic_id`, `archive` com `statusBeforeArchive` e `reason`, cada uma com seu registro de auditoria)
- [ ] T055 [US4] `apps/api/src/modules/class-plans/class-meetings.service.ts`: `list` (número por `row_number()`, `topicCount`, `planRevision`), `update` (turma própria e planejável; `bumpRevision` quando há planejamento, `planRevision` nulo só sem planejamento; datas no período e ≤ 200; acrescentar ignorando existentes; aplicar resoluções antes das remoções — `MOVE` exige data que exista depois da gravação; remover com tópico sem resolução → `MEETING_HAS_TOPICS`; `class_meetings.updated` com `resolutions` por ação); em `classes.service.ts`, mudança de `startsOn`/`endsOn` que deixaria encontros de fora → `MEETINGS_OUTSIDE_PERIOD` (E12)
- [ ] T056 [US4] `apps/api/src/modules/class-plans/class-meetings.controller.ts` com `GET`/`PUT /classes/:id/meetings`; entradas `classMeetings.list|update` em `endpoints.ts`; linhas no `MATRIX`; retirar `calendario.gerenciar` de `PENDING_004_PERMISSIONS`; emitir `class_meetings.updated` (com resolução `ARCHIVE`, emitindo também `topic.archived`) em `journey.ts` e retirá-los de `PENDING_004_TYPES`
- [ ] T057 [P] [US4] `apps/web/features/class-calendar/api/class-meetings.ts` e `hooks/use-class-meetings.ts` (query `["classes", id, "meetings"]`, mutation que invalida também `["classes", id, "plan"]`)
- [ ] T058 [US4] `apps/web/features/class-calendar/components/{meeting-calendar,meeting-list,topic-resolution-dialog}.tsx` (o diálogo "Esta aula tem tópicos planejados" lista os tópicos da data a partir do `ClassPlanView` em cache, antes de enviar; `Calendar` `mode="multiple"` com `startMonth`/`endMonth` do período, `weekStartsOn: 0`, pt-BR; datas locais sem fuso) e rota `apps/web/app/(app)/turmas/[id]/calendario/page.tsx` (somente leitura sem `calendario.gerenciar`; `class-offering-required` quando não planejável)

**Checkpoint**: calendário salvo e numerado; remoção com tópicos resolvida sem perda; suíte verde.

---

## Phase 7: User Story 5 — Professor cria os tópicos a partir da ementa confirmada (Priority: P1)

**Goal**: planejamento da turma com a ementa confirmada escolhida, criação manual de tópicos ligados a itens e encontros, cobertura, troca de versão da ementa.

**Independent Test**: com a ementa de POO confirmada (16 itens) e 18 encontros, criar tópicos cobrindo todos os itens (alguns com mais de um item e um item em dois tópicos) e conferir a cobertura; tentar criar tópico numa turma sem ementa confirmada.

### Tests for User Story 5 ⚠️

- [ ] T059 [P] [US5] Teste de integração `apps/api/test/integration/004-us5-plan-and-topics.spec.ts`: `GET /classes/:id/plan` sem planejamento → `{plan: null}`; `PUT …/plan/syllabus` com revisão confirmada → cria `DRAFT` com `class_plan.syllabus_selected`; revisão em rascunho → 422 `REVISION_NOT_CONFIRMED`; revisão de outra disciplina ou de outro professor → 404; `004/US5-1` (tópico com item e aula 02 → `DRAFT`, `MANUAL`, `ClassPlanView` com `revision + 1`, `topic.created` sem título), `004/US5-2` (sem planejamento → 422 `SYLLABUS_REQUIRED`), `004/US5-4` (mesmo item em três tópicos conta uma vez na cobertura), `004/US5-5` (tópicos sem aula com `meetingId: null`, em ordem), `004/US5-6` (não existe rota de geração; `origin` no corpo → 400), item fora da revisão usada → 422 `SYLLABUS_ITEM_NOT_IN_PLAN`, encontro de outra turma → 404, 301º tópico → 422 `TOO_MANY_TOPICS`, `planRevision` antigo → 409 `PLAN_REVISION_CONFLICT`, `004/FR-004` (trocar a disciplina da turma com ementa selecionada → 409 `CLASS_SUBJECT_LOCKED`), `004/FR-042` (troca para nova versão confirmada: tópicos mantidos, ligações remapeadas por `originItemId`, as que não existem voltam com `outsideRevision: true` e contam em `outsideRevisionLinks`), `004/FR-040` (cobertura por tópicos não arquivados; original e revisão confirmada inalterados)
- [ ] T060 [P] [US5] Testes do web `apps/web/features/class-plan/components/class-plan-page.test.tsx` (encontros "Aula 05 — 18/03/2027" com tópicos, seção "Sem data", "Novo tópico", "Envie e confirme a ementa antes de criar tópicos." com link para a ementa da turma), `topic-form-dialog.test.tsx` (Título, Descrição, Aula com "Sem data", itens por grupo em caixas de seleção com busca, "Tópico criado.", `SYLLABUS_ITEM_NOT_IN_PLAN`, axe e teclado) e `coverage-panel.test.tsx` (`004/US5-3`: "Criar tópico com este item" abre o formulário com o item marcado e o título preenchido, editável)

### Implementation for User Story 5

- [ ] T061 [US5] `apps/api/src/modules/class-plans/class-plans.service.ts`: `getEnvelope(classId)`, `selectSyllabus(classId, {planRevision, revisionId})` (turma própria e planejável; revisão `CONFIRMED` de documento da disciplina da turma; cria o planejamento ou `bumpRevision`; remapeamento de E16 pela cadeia `originItemId`; `class_plan.syllabus_selected` com `previousRevisionId` e `outsideRevisionLinks`) e `apps/api/src/modules/class-plans/class-plan.view.ts` (encontros numerados com `topicCount`, tópicos não arquivados por posição com itens e `outsideRevision`, `archivedTopicCount`), numa consulta por coleção (sem N+1)
- [ ] T062 [US5] `apps/api/src/modules/class-plans/topics.service.ts` `create` (planejamento existente senão `SYLLABUS_REQUIRED`; `bumpRevision`; ≤ 300 não arquivados; encontro da mesma turma → 404; itens da revisão usada → 422; situação `DRAFT` ou `ACTIVE` conforme o planejamento; posição ao fim; `topic.created`) e `apps/api/src/modules/class-plans/coverage.ts` (grupos → itens → `topicIds` de tópicos não arquivados, `coveredCount`, `totalCount`) (E15)
- [ ] T063 [US5] `apps/api/src/modules/class-plans/class-plans.controller.ts` com `GET /classes/:id/plan`, `PUT /classes/:id/plan/syllabus`, `GET /classes/:id/plan/coverage` e `POST /classes/:id/plan/topics`; entradas `classPlans.get|selectSyllabus|coverage` e `topics.create` em `endpoints.ts`; linhas no `MATRIX`; retirar `planejamento.visualizar` e `planejamento.editar` de `PENDING_004_PERMISSIONS`; `CLASS_SUBJECT_LOCKED` em `classes.service.ts` (ementa selecionada ou tópicos não arquivados); emitir `class_plan.syllabus_selected` e `topic.created` em `journey.ts` e retirá-los de `PENDING_004_TYPES`
- [ ] T064 [P] [US5] `apps/web/features/class-plan/api/class-plan.ts`, `hooks/use-class-plan.ts` (query `["classes", id, "plan"]`; toda mutation grava o `ClassPlanView` devolvido no cache e envia o `revision` do cache como `planRevision`) e `schemas/topic-form.ts` derivado de `TopicFieldsSchema`
- [ ] T065 [US5] `apps/web/features/class-plan/components/{class-plan-view,meeting-topics,unscheduled-topics,topic-form-dialog,coverage-panel}.tsx` e rota `apps/web/app/(app)/turmas/[id]/planejamento/page.tsx`; em `/turmas/[id]/ementa`, a ementa usada e a escolha entre versões confirmadas (troca com `alert-dialog` que avisa dos itens fora da versão); na página do documento, depois de "Conteúdo confirmado." vindo de `?turma=`, o diálogo "Usar esta ementa na turma <nome>?" que chama `PUT …/plan/syllabus` (`004/US2-1`, `004/FR-006`)

**Checkpoint**: MVP completo — disciplina → turma → envio → revisão → calendário → tópicos com cobertura; suíte verde.

---

## Phase 8: User Story 8 — Área privada isolada no backend (Priority: P1)

**Goal**: provar, sobre todas as rotas 004 já existentes, que só o professor dono acessa, com 404 indistinguível para o conteúdo alheio e ligações cruzadas recusadas. US6 e US7 acrescentam suas rotas à mesma matriz.

**Independent Test**: percorrer a matriz de acesso com dono, outro professor, administrador, gestor, aluno, suspenso, não verificado e anônimo.

### Tests for User Story 8 ⚠️

- [ ] T066 [P] [US8] `apps/api/test/security/004-curriculum-authorization-matrix.ts` (sujeitos e fixtures de `contracts/permissions.md`) e `004-curriculum-authorization-matrix.spec.ts` sobre toda linha 004 do `MATRIX`: `004/US8-1` (ADMIN sem TEACHER, MANAGER e STUDENT → 403 sem dado pedagógico; sem sessão → 401; não verificado → 403 `EMAIL_NOT_VERIFIED`; professor suspenso e professor que perdeu o papel `TEACHER` → 403, com o conteúdo preservado no banco), `004/US8-2` (outro professor com os ids do dono → 404 com corpo idêntico ao de id inexistente, inclusive download do documento e `?view=inline`), `004/US8-6` (ADMIN + TEACHER → 2xx no próprio conteúdo e 404 no alheio), `004/SC-002`
- [ ] T067 [P] [US8] Teste `apps/api/test/security/004-cross-links.spec.ts` (`004/US8-3`: turma própria com disciplina alheia; seleção de revisão alheia; tópico com item de ementa alheia ou de outra versão; tópico com encontro de outra turma; resolução `MOVE`/`MERGE` apontando tópico de outra turma; junção com tópico de outro planejamento → todos 404 ou 422 conforme o contrato, sem efeito) e `004-server-controlled-fields.spec.ts` (`004/US8-4`, `004/FR-045`: `teacherId`, `ownerId`, `processingStatus`, `sha256`, `storageKey`, `origin`, `version`, `status` do tópico e campos desconhecidos em todo corpo JSON → 400 sem efeito; campo de formulário extra no multipart → 400)
- [ ] T068 [P] [US8] Teste `apps/api/test/security/004-rate-limits.spec.ts` (`004/US8-5`, `004/FR-046`: envios e "Tentar novamente" acima do limite por professor → 429 com `Retry-After`; o limite de um professor não afeta outro)

### Implementation for User Story 8

- [ ] T069 [US8] Corrigir o que as tarefas T066–T068 revelarem (consultas sem o pai confirmado, mensagens diferentes para "não existe" e "não é seu", validação de ligações); conferir que `route-declarations.spec.ts` e `us7-matrix-completeness.spec.ts` cobrem todas as rotas 004 existentes; teste `apps/web/components/shared/app-sidebar.test.tsx` com administrador sem papel de professor sem "Minhas disciplinas"

**Checkpoint**: isolamento comprovado para o MVP; suíte verde.

---

## Phase 9: User Story 6 — Professor edita e reorganiza os tópicos (Priority: P2)

**Goal**: editar, juntar, dividir, arquivar, restaurar e reordenar tópicos com rastreabilidade e controle de concorrência, sem alterar a ementa.

**Independent Test**: juntar "Herança" e "Modificadores de acesso", dividir "SOLID" em três, criar um manual, arquivar "Introdução a bibliotecas", mover e reordenar; conferir itens de origem e ementa inalterada.

### Tests for User Story 6 ⚠️

- [ ] T070 [P] [US6] Teste de integração `apps/api/test/integration/004-us6-topic-editing.spec.ts`: `004/US6-1` (PATCH título e descrição → `topic.updated` com `fields`, sem textos; revisão confirmada e SHA-256 iguais), `004/US6-2` (junção revisada: um tópico com a união dos itens e a aula 05, o outro `ARCHIVED` com `mergedIntoTopicId`, um único `topic.merged`; tópico arquivado ou de outro planejamento → 409/404; ids repetidos → 400), `004/US6-3` (divisão em partes com itens distribuídos, um item em duas partes, original como primeira parte, demais com `splitFromTopicId`; tópico sem itens também divide), `004/US6-4` (manual sem itens, com ou sem aula), `004/US6-5` (arquivar → sai do planejamento e o item aparece não coberto; restaurar → volta a `statusBeforeArchive`, ou `ACTIVE` com planejamento confirmado; restaurar não arquivado → 409; restaurar acima de 300 → 422), `004/US6-6` (`PUT …/topic-order` regrava posições 1..N e aulas numa operação; lista incompleta ou com arquivado → 400; encontro sem tópico e tópico sem aula permitidos; `topics.reordered` com `movedCount`), `004/US6-7` (duas gravações com o mesmo `planRevision` → a segunda 409 `PLAN_REVISION_CONFLICT`, a primeira preservada; `004/FR-041`), `004/US6-8` (não há rota `DELETE` de tópico no catálogo nem na aplicação), `004/SC-007` (depois de junções e divisões, todos os itens de origem continuam ligados e a cobertura bate)
- [ ] T071 [P] [US6] Testes do web `apps/web/features/class-plan/components/topic-actions.test.tsx` e `merge-topics-dialog.test.tsx`/`split-topic-dialog.test.tsx` (Editar, Subir, Descer mantendo o foco e anunciando "Tópico movido para a posição 4.", select Aula, Dividir, Arquivar, seleção para "Juntar tópicos" com título, descrição, aula e itens (união por padrão) revisáveis, "Tópicos arquivados" com "Restaurar", mensagens de sucesso e de conflito "O planejamento foi alterado depois que você o abriu. Atualize a página antes de continuar.", axe e teclado — `004/FR-053`, `004/SC-012`)

### Implementation for User Story 6

- [ ] T072 [US6] Em `apps/api/src/modules/class-plans/topics.service.ts`: `update`, `merge` (primeiro id fica; 2–20 não arquivados do mesmo planejamento; usa `topic-mutations.mergeInto`), `split` (2–10 partes; partes novas com a situação do original e posições logo após ele, sob a restrição adiada), `archive`, `restore`, `reorder` (lista completa dos não arquivados; arquivados depois, na ordem em que estavam) e `listArchived`; cada operação com `bumpRevision` e sua auditoria (E14)
- [ ] T073 [US6] Rotas `PATCH /classes/:id/plan/topics/:topicId`, `POST …/topics/merge`, `POST …/topics/:topicId/{split,archive,restore}`, `PUT …/topic-order` e `GET …/topics?status=ARCHIVED` em `apps/api/src/modules/class-plans/class-plans.controller.ts` (ou `topics.controller.ts`); entradas `topics.update|merge|split|archive|restore|reorder|listArchived` em `endpoints.ts`; linhas no `MATRIX`; emitir `topic.updated`, `topic.merged`, `topic.split`, `topic.restored` e `topics.reordered` em `journey.ts` e retirá-los de `PENDING_004_TYPES`
- [ ] T074 [US6] `apps/web/features/class-plan/components/{topic-actions,merge-topics-dialog,split-topic-dialog,archived-topics}.tsx`, com as mutations em `hooks/use-class-plan.ts`; conflito 409 mostra a mensagem e oferece "Atualizar" (refetch) sem descartar o formulário aberto

**Checkpoint**: planejamento reorganizável sem perda de rastreabilidade; suíte verde.

---

## Phase 10: User Story 7 — Professor confirma e acompanha o planejamento (Priority: P2)

**Goal**: situações do planejamento (`DRAFT ⇄ READY → ACTIVE`, qualquer → `ARCHIVED`) com ativação dos tópicos e modo somente leitura.

**Independent Test**: confirmar e ver os tópicos ativos; iniciar, ajustar com auditoria, arquivar e conferir somente leitura.

### Tests for User Story 7 ⚠️

- [ ] T075 [P] [US7] Teste de integração `apps/api/test/integration/004-us7-plan-status.spec.ts`: `004/US7-1` (`CONFIRM` → `READY`, tópicos `DRAFT` viram `ACTIVE`, `class_plan.status_changed` com `activatedTopics`), `004/US7-2` (sem tópico não arquivado → 422 `PLAN_HAS_NO_TOPICS`), `004/US7-3` (`REOPEN` → `DRAFT`, tópicos continuam `ACTIVE`), `004/US7-4` (`START` → `ACTIVE`; tópico criado, dividido ou restaurado depois já nasce `ACTIVE` — `004/FR-039`), `004/US7-5` (em `ACTIVE`, editar, juntar e mover são aceitos e auditados), `004/US7-6` (`ARCHIVE` de qualquer situação; depois, toda escrita em tópicos, ordem, encontros e ementa usada → 409 `PLAN_ARCHIVED`; nenhuma transição sai de `ARCHIVED` → 409 `INVALID_STATE_TRANSITION`; turma arquivada também deixa o planejamento somente leitura), `004/US7-7` (cobertura com cobertos e não cobertos), repetição da transição já aplicada → 200 sem novo registro, `004/FR-043` (tópicos ativos de planejamento `READY`/`ACTIVE` identificáveis por id estável com `classId` e `syllabus.subjectId` no `ClassPlanView`; arquivados continuam acessíveis por `GET …/topics?status=ARCHIVED`)
- [ ] T076 [P] [US7] Teste do web `apps/web/features/class-plan/components/plan-status-bar.test.tsx` (situação atual, "Confirmar planejamento", "Reabrir", "Iniciar", "Arquivar planejamento" com `alert-dialog`, "Crie ao menos um tópico antes de confirmar.", planejamento arquivado com "Este planejamento está arquivado e não pode ser alterado." e ações de edição ocultas, axe e teclado)

### Implementation for User Story 7

- [ ] T077 [US7] `changeStatus(classId, {planRevision, action})` em `apps/api/src/modules/class-plans/class-plans.service.ts` (máquina de estado de T016; `CONFIRM` ativa os `DRAFT`; `bumpRevision` antes; repetição sem efeito); rota `POST /classes/:id/plan/status`; entrada `classPlans.changeStatus` em `endpoints.ts`; linha no `MATRIX`; retirar `planejamento.alterar_situacao` de `PENDING_004_PERMISSIONS`; emitir `class_plan.status_changed` em `journey.ts` e retirá-lo de `PENDING_004_TYPES`
- [ ] T078 [US7] `apps/web/features/class-plan/components/plan-status-bar.tsx` e modo somente leitura (planejamento `ARCHIVED` ou turma arquivada) no planejamento, no calendário e na ementa da turma; situação do planejamento nas turmas de `/disciplinas/[id]`

**Checkpoint**: todas as histórias funcionam de forma independente.

---

## Phase 11: Polish & Cross-Cutting Concerns

- [ ] T079 E2E em `apps/web/e2e/` (`004/SC-011`): `syllabus-plan.spec.ts` (login do professor → disciplina → turma com datas → envio de `poo.pdf` → "Processado" → revisão e confirmação → "Usar esta ementa na turma" → calendário com 18 datas → tópicos → juntar, dividir, arquivar → confirmar planejamento), `syllabus-manual.spec.ts` (envio de `ementa.png` → mensagem sem texto → preenchimento manual → confirmação) e `syllabus-upload-limit.spec.ts` (arquivo de 10 MB passa pela rewrite do Next e é aceito; 10 MB + 1 → "O arquivo passa de 10 MB.") — E5; fixtures lidas de `apps/api/test/fixtures/syllabus/`
- [ ] T080 [P] Varredura de conteúdo: estender `apps/api/test/security/secret-leak-scan.spec.ts` para que `MARCADOR-EMENTA-004`, títulos e descrições de tópicos, nomes de disciplina e nomes de arquivo da jornada 004 não apareçam em logs nem em `metadata` de auditoria (`004/SC-010`, `004/FR-047`, `004/FR-048`)
- [ ] T081 [P] Teste de imutabilidade `apps/api/test/security/004-immutability.spec.ts` (`004/SC-004`, `004/US2-7`: depois de revisar, confirmar, criar, editar, juntar, dividir, arquivar, mudar calendário e trocar a versão usada, o SHA-256 de todo `stored_files` e o conteúdo de toda revisão confirmada são iguais aos de antes)
- [ ] T082 [P] Teste de concorrência `apps/api/test/security/004-concurrency.spec.ts` (`004/SC-009`: envio simultâneo do mesmo arquivo → uma versão; envios simultâneos de arquivos diferentes → versões 1 e 2 sem buraco; gravações simultâneas no mesmo planejamento → uma aceita e as outras 409; mesma data acrescentada por dois pedidos → um encontro; remoção de encontro contra `MOVE` para ele → uma falha e nenhum tópico órfão; dois `runOnce` com lease vencido → um executor)
- [ ] T083 [P] Teste de desempenho `apps/api/test/security/004-performance.spec.ts` (`004/SC-006`: envio de 10 MB responde em ≤ 2 s, também com um PDF de 50 páginas gerado em memória; processamento de `dez-paginas.pdf` em ≤ 1 min; planejamento com 200 encontros e 300 tópicos carrega em ≤ 1 s)
- [ ] T084 Esvaziar e remover `PENDING_004_TYPES` de `audit-coverage.spec.ts` (`004/SC-010`) e `PENDING_004_PERMISSIONS` de `us7-matrix-completeness.spec.ts`; acrescentar a 004 em `SPECS` de `apps/api/test/traceability.spec.ts` (prefixo `004/`, todos os cenários `USn-k`, a tabela "Acceptance Criteria Traceability" e SC-002–SC-012; SC-001 é tempo de uma pessoa usando as telas, validado no percurso do quickstart de T086, como SC-001/SC-002 da 001) e cobrir os ids que faltarem
- [ ] T085 [P] Documentação: `CLAUDE.md` (contratos `curriculum/`, módulos `subjects`/`syllabus`/`class-plans`, `platform/storage`, `@AcceptsMultipart`, worker de processamento e `SYLLABUS_PROCESSING_INTERVAL_SECONDS`, `worker_threads`, guardas 004), `apps/api/CLAUDE.md` (fixtures de ementa, `runOnce`, worker nos testes), `README.md`, `apps/web/README.md` (features novas) e `DEPENDENCIES.md` revisado
- [ ] T086 Percorrer `specs/004-syllabus-planning/quickstart.md` §1–§8 num worktree limpo, cronometrando o caminho de SC-001 (disciplina → planejamento confirmado com 18 tópicos em menos de 30 min), e corrigir o que divergir
- [ ] T087 Rodar `pnpm lint && pnpm check-types && pnpm build && pnpm test` e `pnpm --filter web test:e2e` finais (o E2E roda `prisma migrate reset`, que exige o consentimento do usuário a cada execução); `pnpm audit --prod --audit-level high` sem achados

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sem dependências.
- **Foundational (Phase 2)**: depende do Setup; bloqueia todas as histórias.
- **US1 (Phase 3)**: depende da Foundational.
- **US2 (Phase 4)**: depende de US1 (disciplina e página da disciplina).
- **US3 (Phase 5)**: depende de US2 (documento processado).
- **US4 (Phase 6)**: depende de US1 (turma planejável); pode correr em paralelo com US2 e US3 (usa as fábricas de T020 para planejamento e tópicos).
- **US5 (Phase 7)**: depende de US3 (revisão confirmada) e US4 (encontros e `plan-revision.guard`).
- **US8 (Phase 8)**: depende de US1–US5 (rotas do MVP).
- **US6 (Phase 9)**: depende de US5; reutiliza `topic-mutations.ts` de US4.
- **US7 (Phase 10)**: depende de US5; pode correr em paralelo com US6.
- **Polish (Phase 11)**: depende de todas.

### Within Each User Story

- Testes antes da implementação, falhando.
- Serviço → controller + catálogo de endpoints + matriz → jornada de auditoria → web.
- Cada fase termina com a suíte verde.

### Parallel Opportunities

- Setup: T003, T004, T005 e T006 em paralelo depois de T001/T002.
- Foundational: T009–T017 e T019 em paralelo depois de T007/T008.
- Em cada história, as tarefas de teste marcadas [P] (API e web) em paralelo; a camada de
  API do web (`features/*/api`, `hooks`) em paralelo com o serviço da API.
- US4 em paralelo com US2/US3; US6 em paralelo com US7; T080–T083 em paralelo.

---

## Parallel Example: User Story 2

```bash
# Testes primeiro, em paralelo:
Task: "T032 Inspetor e nome de arquivo em apps/api/src/modules/syllabus/syllabus-file-inspector.spec.ts"
Task: "T033 Teste de ouro em apps/api/src/modules/syllabus/extraction/syllabus-extractor.spec.ts"
Task: "T034 Envio e download em apps/api/test/integration/004-us2-syllabus-upload.spec.ts"
Task: "T035 Worker de processamento em apps/api/test/integration/004-syllabus-processing.spec.ts"
Task: "T036 Envio e situação em apps/web/features/syllabus/components/syllabus-upload.test.tsx"
```

## Parallel Example: User Story 5

```bash
Task: "T059 Planejamento e tópicos em apps/api/test/integration/004-us5-plan-and-topics.spec.ts"
Task: "T060 Tela de planejamento em apps/web/features/class-plan/components/class-plan-page.test.tsx"
# Depois dos serviços:
Task: "T064 API e hooks do planejamento em apps/web/features/class-plan/api/class-plan.ts"
```

---

## Implementation Strategy

### MVP First (US1 → US2 → US3 → US4 → US5 → US8)

1. Setup e Foundational.
2. US1 (disciplinas e oferta), US2 (envio e processamento), US3 (revisão), US4
   (calendário), US5 (tópicos) — o professor sai da disciplina ao planejamento com
   tópicos ligados à ementa.
3. US8 fecha o MVP com a matriz de isolamento.
4. **Parar e validar** com o quickstart §2–§6 e §8.

### Incremental Delivery

1. MVP → US6 (reorganizar tópicos) → US7 (situação do planejamento), cada uma validada
   pela seção correspondente do quickstart.
2. Polish: E2E, varreduras, imutabilidade, concorrência, desempenho, rastreabilidade,
   documentação e quickstart.

---

## Notes

- **[P]**: arquivos diferentes, sem dependência pendente.
- Nomes de teste com o id da 004 (`004/USn-k`, `004/FR-…`, `004/SC-…`).
- `PENDING_004_TYPES` e `PENDING_004_PERMISSIONS` são transitórios: cada história retira
  os seus; T084 remove os dois.
- Nenhum texto pedagógico (ementa, títulos, descrições, nomes de disciplina ou arquivo)
  em logs, auditoria ou mensagens de erro.
- Commit ao fim de cada fase, só quando o usuário pedir.
