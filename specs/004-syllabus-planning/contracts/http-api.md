# HTTP API Contract: 004 — Área do Professor: Disciplinas, Ementas, Calendário e Tópicos

Mesmas convenções das fases 001 e 003: base `/api`, JSON, `Origin` permitido e
`Content-Type: application/json` em métodos não seguros — exceto as rotas de envio,
marcadas **multipart**, que aceitam `multipart/form-data` (E5) —, schemas **estritos**
(campo desconhecido → `400 VALIDATION_ERROR`), ordem de checagem origem → sessão (401) →
e-mail verificado (403) → permissão (403) → validação (400) → contexto (404) → regra
(409/422), erro `{statusCode, code, message}`.

Todo pedido e resposta é um schema de `@repo/contracts` (novo diretório
`packages/contracts/src/curriculum/`) e entra no catálogo `endpoints.ts`; rotas multipart
têm `upload: true` no catálogo. Contexto: toda rota enxerga só disciplinas e turmas cujo
`teacher_id` é o usuário da sessão, e os filhos dentro delas; fora disso → `404
NOT_FOUND` (E3). Toda operação que altera o planejamento recebe `planRevision` e devolve o
`ClassPlanView` atualizado (E13).

## Tipos compartilhados

| Schema | Forma |
|--------|-------|
| `SubjectStatusSchema` | `"ACTIVE" \| "INACTIVE"` |
| `CreateSubjectRequestSchema` | `{name: string trim 1–120, description?: string(1000)\|null}` |
| `UpdateSubjectRequestSchema` | os mesmos campos, opcionais, ao menos um |
| `ChangeSubjectStatusRequestSchema` | `{status: SubjectStatus}` |
| `SubjectViewSchema` | `{id, name, description, status, classCount: int, documentCount: int, createdAt, updatedAt}` |
| `SubjectListQuerySchema` | `{query?: string(120), status?: SubjectStatus, cursor?: string(200)}` |
| `SubjectPageSchema` | `{items: SubjectView[], nextCursor: string\|null}` |
| `IsoDateSchema` | `"YYYY-MM-DD"`, data de calendário válida |
| `ClassOfferingFields` (em `Create/UpdateClassRequest` da 003) | `subjectId?: uuid\|null`, `startsOn?: IsoDate\|null`, `endsOn?: IsoDate\|null` |
| `ClassViewSchema` (003, ampliado) | `+ subject: {id, name}\|null`, `startsOn`, `endsOn`, `plannable: boolean`, `planStatus: ClassPlanStatus\|null` |
| `ClassListQuerySchema` (003, ampliado) | `+ subjectId?: uuid` |
| `SyllabusMediaTypeSchema` | `"PDF" \| "DOCX" \| "PNG" \| "JPEG"` |
| `SyllabusProcessingStatusSchema` | `"UPLOADED" \| "PROCESSING" \| "PROCESSED" \| "FAILED"` |
| `SyllabusFailureCategorySchema` | `"UNREADABLE" \| "TIMEOUT" \| "INTERNAL"` |
| `SyllabusDocumentViewSchema` | `{id, subjectId, version, originalFilename, mediaType, sizeBytes, pageCount: int\|null, processingStatus, failureCategory: …\|null, extractionResult: "TEXT"\|"NO_TEXT"\|null, attempts, uploadedAt, processedAt: string\|null, confirmedRevision: {id, number}\|null, draftRevisionId: uuid\|null}` — nunca chave de armazenamento nem hash |
| `SyllabusUploadResultSchema` | `{document: SyllabusDocumentView, duplicate: boolean}` |
| `SyllabusExtractionSchema` | `{extractorVersion: 1, title: string\|null, syllabusText: string\|null, competencyText: string\|null, groups: {title: string\|null, items: string[]}[]}` |
| `SyllabusDocumentDetailSchema` | `SyllabusDocumentView & {extraction: SyllabusExtraction\|null, revisions: {id, number, status, source, confirmedAt}[]}` |
| `SyllabusRevisionSourceSchema` | `"EXTRACTION" \| "MANUAL" \| "REVISION"` |
| `CreateSyllabusRevisionRequestSchema` | `{source, basedOnRevisionId?: uuid}` (`basedOnRevisionId` obrigatório se e só se `source = "REVISION"`) |
| `SyllabusRevisionViewSchema` | `{id, documentId, number, status: "DRAFT"\|"CONFIRMED", source, title, syllabusText, competencyText, groups: {id, position, title, items: {id, position, text}[]}[], itemCount, confirmedAt: string\|null}` |
| `SaveSyllabusRevisionRequestSchema` | `{title?: string(200)\|null, syllabusText?: string(10000)\|null, competencyText?: string(10000)\|null, groups: {title?: string(300)\|null, items: {text: string trim 1–1000}[]}[]}` — até 500 itens no total |
| `ClassMeetingViewSchema` | `{id, date: IsoDate, number: int, status: "PLANNED"\|"COMPLETED"\|"CANCELLED", topicCount: int}` |
| `ClassMeetingListSchema` | `{items: ClassMeetingView[], total: int, planRevision: int\|null}` |
| `TopicResolutionSchema` | `{topicId, action: "MOVE", meetingDate: IsoDate} \| {topicId, action: "UNSCHEDULE"} \| {topicId, action: "MERGE", intoTopicId: uuid} \| {topicId, action: "ARCHIVE"}` |
| `UpdateClassMeetingsRequestSchema` | `{planRevision: int\|null, add: IsoDate[] (≤ 200), remove: IsoDate[] (≤ 200), resolutions: TopicResolution[]}` |
| `ClassPlanStatusSchema` | `"DRAFT" \| "READY" \| "ACTIVE" \| "ARCHIVED"` |
| `TopicStatusSchema` / `TopicOriginSchema` | `"DRAFT" \| "ACTIVE" \| "ARCHIVED"` / `"MANUAL" \| "GENERATED"` |
| `TopicViewSchema` | `{id, title, description, position, meetingId: uuid\|null, origin, status, items: {id, text, outsideRevision: boolean}[], mergedIntoTopicId, splitFromTopicId, createdAt, updatedAt}` |
| `ClassPlanViewSchema` | `{id, classId, status, revision: int, syllabus: {subjectId, documentId, documentVersion, revisionId, revisionNumber}, meetings: ClassMeetingView[], topics: TopicView[] (não arquivados, por posição), archivedTopicCount: int}` |
| `ClassPlanEnvelopeSchema` | `{plan: ClassPlanView\|null}` |
| `SelectPlanSyllabusRequestSchema` | `{planRevision: int\|null, revisionId: uuid}` |
| `ChangePlanStatusRequestSchema` | `{planRevision: int, action: "CONFIRM" \| "REOPEN" \| "START" \| "ARCHIVE"}` |
| `TopicFieldsSchema` | `{title: string trim 1–200, description?: string(5000)\|null, meetingId?: uuid\|null, itemIds: uuid[] (≤ 100, sem repetição)}` |
| `CreateTopicRequestSchema` | `{planRevision} & TopicFields` |
| `UpdateTopicRequestSchema` | `{planRevision} & Partial<TopicFields>`, ao menos um campo |
| `MergeTopicsRequestSchema` | `{planRevision, topicIds: uuid[2..20] (o primeiro é o que fica)} & TopicFields` |
| `SplitTopicRequestSchema` | `{planRevision, parts: TopicFields[2..10] (a primeira fica no tópico original)}` |
| `TopicActionRequestSchema` | `{planRevision}` (arquivar, restaurar) |
| `ReorderTopicsRequestSchema` | `{planRevision, items: {topicId, meetingId: uuid\|null}[]}` — todos os tópicos não arquivados, uma vez cada |
| `TopicListQuerySchema` | `{status: "ARCHIVED"}` |
| `TopicListSchema` | `{items: TopicView[]}` |
| `PlanCoverageSchema` | `{groups: {id, title, items: {id, text, topicIds: uuid[]}[]}[], coveredCount, totalCount}` |

Códigos de erro novos em `ErrorCodeSchema` (textos no catálogo do web):
`SUBJECT_NAME_TAKEN`, `SUBJECT_INACTIVE`, `CLASS_SUBJECT_LOCKED`, `CLASS_NOT_PLANNABLE`,
`MEETINGS_OUTSIDE_PERIOD`, `FILE_TYPE_NOT_ALLOWED`, `FILE_TOO_LARGE`, `FILE_UNREADABLE`,
`FILE_PROTECTED`, `FILE_MACROS`, `FILE_TOO_COMPLEX`, `EXTRACTION_UNAVAILABLE`,
`REVISION_DRAFT_EXISTS`, `REVISION_CONFIRMED`, `REVISION_EMPTY`, `REVISION_NOT_CONFIRMED`,
`MEETING_OUT_OF_PERIOD`, `MEETING_HAS_TOPICS`, `TOO_MANY_MEETINGS`, `SYLLABUS_REQUIRED`,
`SYLLABUS_ITEM_NOT_IN_PLAN`, `PLAN_REVISION_CONFLICT`, `PLAN_ARCHIVED`,
`PLAN_HAS_NO_TOPICS`, `TOO_MANY_TOPICS`. Reutilizados: `VALIDATION_ERROR`, `NOT_FOUND`,
`INVALID_STATE_TRANSITION`, `RATE_LIMITED`.

## Disciplinas

| Método | Rota | Acesso | Entrada | Sucesso | Erros |
|--------|------|--------|---------|---------|-------|
| GET | `/subjects` | `disciplinas.visualizar` | query `SubjectListQuery` | `200 SubjectPage` (por nome, 50 por página) | 400 |
| POST | `/subjects` | `disciplinas.criar` | `CreateSubjectRequest` | `201 SubjectView` | 400, 409 `SUBJECT_NAME_TAKEN` |
| GET | `/subjects/:id` | `disciplinas.visualizar` | — | `200 SubjectView` | 404 |
| PATCH | `/subjects/:id` | `disciplinas.editar` | `UpdateSubjectRequest` | `200 SubjectView` | 400, 404, 409 `SUBJECT_NAME_TAKEN` |
| POST | `/subjects/:id/status` | `disciplinas.editar` | `ChangeSubjectStatusRequest` | `200 SubjectView` | 400, 404 |

Turmas como oferta: `POST /classes` e `PATCH /classes/:id` (003, `turmas.criar` /
`turmas.editar`) aceitam `subjectId`, `startsOn`, `endsOn`. Erros novos: `404` (disciplina
de outro professor), `409 SUBJECT_INACTIVE` (escolher disciplina desativada), `409
CLASS_SUBJECT_LOCKED`, `409 MEETINGS_OUTSIDE_PERIOD` (novas datas deixariam encontros de
fora; o web resolve pelo calendário antes). `GET /classes?subjectId=` lista as ofertas da
disciplina.

## Ementa: documentos

| Método | Rota | Acesso | Entrada | Sucesso | Erros |
|--------|------|--------|---------|---------|-------|
| GET | `/subjects/:id/syllabus-documents` | `ementas.visualizar` | — | `200 {items: SyllabusDocumentView[]}` (versão mais recente primeiro) | 404 |
| POST | `/subjects/:id/syllabus-documents` | `ementas.enviar` | **multipart**, campo `file` | `201 SyllabusUploadResult` (`duplicate: false`) ou `200` (`duplicate: true`, versão existente) | 400 `FILE_TYPE_NOT_ALLOWED`/`FILE_UNREADABLE`/`FILE_PROTECTED`/`FILE_MACROS`/`FILE_TOO_COMPLEX`, 404, 409 `SUBJECT_INACTIVE`, 413 `FILE_TOO_LARGE`, 429 |
| GET | `/syllabus-documents/:id` | `ementas.visualizar` | — | `200 SyllabusDocumentDetail` | 404 |
| GET | `/syllabus-documents/:id/file` | `ementas.visualizar` | query `view?: "inline"` (só PNG/JPEG) | `200` bytes, `Content-Disposition: attachment` (ou `inline` para imagem), `Cache-Control: private, no-store`, `Content-Security-Policy: default-src 'none'; sandbox` | 400 (`inline` para PDF/DOCX), 404 |
| POST | `/syllabus-documents/:id/retry` | `ementas.enviar` | `{}` | `202 SyllabusDocumentView` (`UPLOADED`) | 404, 409 `INVALID_STATE_TRANSITION`, 429 |

A rota de download fica fora do interceptor de conformidade (resposta binária) e fora do
catálogo de schemas de resposta, com `response: "binary"` no catálogo.

## Ementa: revisões

| Método | Rota | Acesso | Entrada | Sucesso | Erros |
|--------|------|--------|---------|---------|-------|
| POST | `/syllabus-documents/:id/revisions` | `ementas.revisar` | `CreateSyllabusRevisionRequest` | `201 SyllabusRevisionView` (rascunho, pré-preenchido pela extração, vazio no manual ou copiado da revisão base) | 400, 404, 409 `REVISION_DRAFT_EXISTS`, 422 `EXTRACTION_UNAVAILABLE` (extração ausente ou `NO_TEXT`), 422 `REVISION_NOT_CONFIRMED` (base não confirmada) |
| GET | `/syllabus-revisions/:id` | `ementas.visualizar` | — | `200 SyllabusRevisionView` | 404 |
| PUT | `/syllabus-revisions/:id` | `ementas.revisar` | `SaveSyllabusRevisionRequest` | `200 SyllabusRevisionView` | 400, 404, 409 `REVISION_CONFIRMED` |
| POST | `/syllabus-revisions/:id/confirm` | `ementas.revisar` | `{}` | `200 SyllabusRevisionView` (`CONFIRMED`) | 404, 409 `REVISION_CONFIRMED` (repetido = sem efeito, 200), 422 `REVISION_EMPTY` |

"Preencher manualmente" é `POST …/revisions` com `source: "MANUAL"`, permitido em qualquer
situação do documento, inclusive `FAILED` e `PROCESSED` com `NO_TEXT`.

## Calendário

| Método | Rota | Acesso | Entrada | Sucesso | Erros |
|--------|------|--------|---------|---------|-------|
| GET | `/classes/:id/meetings` | `planejamento.visualizar` | — | `200 ClassMeetingList` | 404, 422 `CLASS_NOT_PLANNABLE` |
| PUT | `/classes/:id/meetings` | `calendario.gerenciar` | `UpdateClassMeetingsRequest` | `200 ClassMeetingList` | 400, 404, 409 `PLAN_REVISION_CONFLICT`, 409 `MEETING_HAS_TOPICS` (encontro removido com tópico sem resolução), 409 `PLAN_ARCHIVED`, 422 `CLASS_NOT_PLANNABLE`, 422 `MEETING_OUT_OF_PERIOD`, 422 `TOO_MANY_MEETINGS` |

`planRevision` é `null` enquanto a turma não tem planejamento e obrigatório depois.
Acrescentar data existente ou remover data inexistente não tem efeito. As resoluções são
aplicadas antes das remoções, na mesma transação; `MERGE` junta o tópico ao indicado
(mesma regra de FR-036, com os itens unidos) e `MOVE` exige data que exista depois da
gravação.

## Planejamento e tópicos

Rotas em `/classes/:id/plan…`; `:topicId` é buscado dentro do planejamento da turma.

| Método | Rota | Acesso | Entrada | Sucesso | Erros |
|--------|------|--------|---------|---------|-------|
| GET | `/classes/:id/plan` | `planejamento.visualizar` | — | `200 ClassPlanEnvelope` | 404 |
| PUT | `/classes/:id/plan/syllabus` | `planejamento.editar` | `SelectPlanSyllabusRequest` | `200 ClassPlanView` (cria o planejamento `DRAFT` se não existir) | 400, 404, 409 `PLAN_REVISION_CONFLICT`/`PLAN_ARCHIVED`, 422 `CLASS_NOT_PLANNABLE`, 422 `REVISION_NOT_CONFIRMED` (ou revisão de outra disciplina → 404) |
| POST | `/classes/:id/plan/status` | `planejamento.alterar_situacao` | `ChangePlanStatusRequest` | `200 ClassPlanView` | 404, 409 `PLAN_REVISION_CONFLICT`, 409 `INVALID_STATE_TRANSITION`, 422 `PLAN_HAS_NO_TOPICS` |
| GET | `/classes/:id/plan/coverage` | `planejamento.visualizar` | — | `200 PlanCoverage` | 404 (sem planejamento) |
| GET | `/classes/:id/plan/topics` | `planejamento.visualizar` | query `TopicListQuery` | `200 TopicList` (arquivados) | 404 |
| POST | `/classes/:id/plan/topics` | `planejamento.editar` | `CreateTopicRequest` | `201 ClassPlanView` | 400, 404, 409 `PLAN_REVISION_CONFLICT`/`PLAN_ARCHIVED`, 422 `SYLLABUS_REQUIRED`, 422 `SYLLABUS_ITEM_NOT_IN_PLAN`, 422 `TOO_MANY_TOPICS` |
| PATCH | `/classes/:id/plan/topics/:topicId` | `planejamento.editar` | `UpdateTopicRequest` | `200 ClassPlanView` | 400, 404, 409 (revisão, arquivado → `INVALID_STATE_TRANSITION`), 422 `SYLLABUS_ITEM_NOT_IN_PLAN` |
| POST | `/classes/:id/plan/topics/merge` | `planejamento.editar` | `MergeTopicsRequest` | `200 ClassPlanView` | 400 (ids repetidos), 404, 409, 422 |
| POST | `/classes/:id/plan/topics/:topicId/split` | `planejamento.editar` | `SplitTopicRequest` | `200 ClassPlanView` | 400, 404, 409, 422 |
| POST | `/classes/:id/plan/topics/:topicId/archive` | `planejamento.editar` | `TopicActionRequest` | `200 ClassPlanView` | 404, 409 |
| POST | `/classes/:id/plan/topics/:topicId/restore` | `planejamento.editar` | `TopicActionRequest` | `200 ClassPlanView` | 404, 409 `INVALID_STATE_TRANSITION` (não arquivado), 422 `TOO_MANY_TOPICS` |
| PUT | `/classes/:id/plan/topic-order` | `planejamento.editar` | `ReorderTopicsRequest` | `200 ClassPlanView` | 400 (lista não bate com os não arquivados), 404, 409 |

`meetingId` e `itemIds` são conferidos contra a turma e a revisão do planejamento; ids de
outro professor ou de outra turma → `404`. Em planejamento `ARCHIVED` ou turma arquivada,
toda escrita → `409 PLAN_ARCHIVED`.

Não existem rotas de exclusão de disciplinas, documentos, revisões nem tópicos (FR-013,
FR-038).
