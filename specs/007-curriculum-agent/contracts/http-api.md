# HTTP API Contract: 007 — Curriculum Agent

The conventions of 001–006 apply:
- base `/api`, JSON;
- an allowed `Origin` and `Content-Type: application/json` on unsafe methods;
- strict schemas: an unknown field → `400 VALIDATION_ERROR`, including `workspaceId`,
  `teacherId`, `agentKey`, `toolKeys` and `riskLevel` (US4-6);
- check order: origin → session (401) → verified e-mail (403) → permission (403) →
  validation (400) → context (404) → rule (409/422/429);
- errors are `{statusCode, code, message}`.

Every schema lives in `packages/contracts/src/curriculum/curriculum-ai.ts` and every route has
an entry in `endpoints.ts`. Each route is catalogued in `test/contracts/endpoint-catalog.spec.ts`
and runs under `ContractConformanceInterceptor`.

## New routes

### `GET /syllabus-documents/:id/ai` — status of the AI fill (FR-040, research C14)

Response `200 CurriculumAiStatus`:

```ts
{
  availability: "AVAILABLE" | "DOCUMENT_NOT_READY" | "DOCUMENT_WITHOUT_TEXT"
              | "AGENT_DISABLED" | "MODEL_UNAVAILABLE" | "PAUSED",
  activeExecution: AiExecutionView | null,        // 006 schema, latest QUEUED…VALIDATING_OUTPUT
  lastExecution: AiExecutionView | null,          // latest of this teacher for this document
  lastOutcome: "PROPOSAL" | "NOTHING_FOUND" | null, // of lastExecution when COMPLETED
  pendingProposalId: uuid | null,                 // READY_FOR_REVIEW proposal for this document
}
```

Errors: `404 NOT_FOUND` when the document is outside the teacher's subjects.

### `POST /syllabus-documents/:id/ai-analyses` — request an analysis (FR-012–FR-015, FR-038)

Request `RequestCurriculumAnalysisRequest` (strict):

```ts
{ discardPendingProposal?: boolean }   // default false
```

Responses:
- `202 {execution: AiExecutionView, created: true}`: a new execution in `QUEUED`;
- `200 {execution: AiExecutionView, created: false}`: an active execution already existed,
  or a concurrent request won (research C13).

Errors, in this order after the context check:

| Status | `code` | When |
|---|---|---|
| 404 | `NOT_FOUND` | document outside the teacher's subjects |
| 429 | `RATE_LIMITED` | over 10 per hour per teacher (`curriculum-ai`) or over the 006 limit |
| 409 | `SYLLABUS_NOT_READY_FOR_AI` | document not `PROCESSED`, or processed with result `NO_TEXT` (PNG, JPG, scanned PDF) |
| 409 | `CURRICULUM_PROPOSAL_PENDING` | a `READY_FOR_REVIEW` proposal exists and `discardPendingProposal` is not `true` |
| 409 | `AI_AGENT_DISABLED` | the agent is disabled |
| 503 | `AI_MODEL_UNAVAILABLE` | model config disabled or provider not registered (no credential) |

With `discardPendingProposal: true`, the pending proposal is rejected (006 decision
`REJECT`) before the execution is requested.

### `POST /syllabus-documents/:id/ai-proposals/:proposalId/apply` — apply a proposal (FR-030–FR-036, research C10)

Request `ApplyCurriculumProposalRequest` (strict):

```ts
{
  acceptedItemIds: string[] (1–203, unique),   // ⊆ proposal.itemIds: "title" | "syllabusText" | "competencyText" | "group:<i>"
  replaceDraft: boolean,                         // explicit confirmation to rewrite an existing draft (FR-032)
}
```

Response `200 {revision: SyllabusRevisionView, proposal: AiProposalView}`. The revision is the
draft (`status: "DRAFT"`, `source: "AI_ASSISTED"`, `aiProposalId`). Repeating the same
request after success answers the same body (idempotent, FR-034).

Errors:

| Status | `code` | When |
|---|---|---|
| 404 | `NOT_FOUND` | document outside the teacher's subjects; proposal of another teacher, of another type or targeting another document |
| 400 | `VALIDATION_ERROR` | body invalid, or an id not in `proposal.itemIds` |
| 409 | `CURRICULUM_SOURCE_CHANGED` | `payload.source.sha256` ≠ document `sha256`, or unknown `readerVersion` |
| 409 | `REVISION_DRAFT_EXISTS` | a draft exists and `replaceDraft` is `false` |
| 409 | `INVALID_STATE_TRANSITION` | proposal `REJECTED`/`EXPIRED`, past its expiry, or already applied with another selection |
| 422 | `CURRICULUM_PROPOSAL_INVALID` | the accepted content fails the 004 draft validation (`SaveSyllabusRevisionRequestSchema`); nothing is written, and the proposal stays `READY_FOR_REVIEW` |
| 429 | `RATE_LIMITED` | 006 decision limit |

The error body has no field paths (project convention). The web validates the selection with
the same schema before sending it and points to the field (US3-8). The 422 is the server's
guard.

## Changed routes and schemas

| Route / schema | Change |
|---|---|
| `SyllabusRevisionSourceSchema` | + `"AI_ASSISTED"` |
| `SyllabusRevisionViewSchema`, `SyllabusDocumentDetailSchema.revisions[]` | + `aiProposalId: uuid \| null` |
| `SyllabusDocumentViewSchema.confirmedRevision` | + `source`, so the versions list labels an `AI_ASSISTED` revision "Preenchido com IA" (web-ui.md) |
| `POST /syllabus-documents/:id/revisions` | `source: "AI_ASSISTED"` → `400 VALIDATION_ERROR` |
| `POST /ai/proposals/:id/decision` (006) | `APPROVE` or `APPROVE_PARTIALLY` on a proposal whose agent declares `approveThroughDomain` → `409 AI_PROPOSAL_APPLY_REQUIRED`; `REJECT` unchanged |
| `GET /ai/operations/metrics` (006) | `AiAgentMetrics` + `outputInvalid`, `proposals: {created, approved, partiallyApproved, rejected, expired}`, `avgTotalTokens: int \| null`, `avgEstimatedCost: DecimalString \| null`, `currency: string \| null` (research C12.5) |
| `AiProposalViewSchema` (006) | unchanged; `content` parses with `CurriculumProposalContentSchema` on the web for this type |

## New error codes (`common/errors.ts` + web message catalog)

| `code` | Status | Message (pt-BR, catalog) |
|---|---|---|
| `SYLLABUS_NOT_READY_FOR_AI` | 409 | "O preenchimento com IA precisa de um documento com texto (PDF com texto ou DOCX). Preencha o conteúdo manualmente." |
| `CURRICULUM_PROPOSAL_PENDING` | 409 | "Já existe uma proposta aguardando revisão. Revise-a ou descarte-a para pedir uma nova análise." |
| `CURRICULUM_SOURCE_CHANGED` | 409 | "O documento analisado não corresponde mais a esta proposta. Peça uma nova análise." |
| `CURRICULUM_PROPOSAL_INVALID` | 422 | "Parte do conteúdo selecionado não pode ser aplicada. Desmarque o campo indicado e tente de novo." |
| `AI_PROPOSAL_APPLY_REQUIRED` | 409 | "Esta proposta é aprovada ao aplicá-la na ementa." |

## Web-only messages (catalog, not API codes)

| Key | Text |
|---|---|
| availability `AGENT_DISABLED`, `MODEL_UNAVAILABLE`, `PAUSED` | "O preenchimento com IA está indisponível no momento." |
| availability `DOCUMENT_NOT_READY` | "Aguarde o processamento do documento para usar a IA." |
| availability `DOCUMENT_WITHOUT_TEXT` | same text as `SYLLABUS_NOT_READY_FOR_AI` |
| outcome `NOTHING_FOUND` | "Não foi possível identificar conteúdo de ementa neste documento. Preencha manualmente." |
| warning codes (`FIELD_NOT_FOUND`…, `UNSUPPORTED_CONTENT`) | see [web-ui.md](./web-ui.md) |
