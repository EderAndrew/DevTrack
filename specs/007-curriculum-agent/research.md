# Research: 007 — Curriculum Agent

Decisions C1–C20. Each one records what was chosen, why, and what else was considered. The
AI Foundation decisions (A1–A22) and the 004 decisions (E1–E23) still apply. Only the
changes are recorded here.

## C1. Where the agent lives

- **Decision**: domain code goes in a new Nest module, `modules/curriculum-ai`, which holds
  the agent definition, the read tool, the grounding check, the request/apply services and
  the controller. The module registers its definitions in `PRODUCTION_AI_DEFINITIONS` through
  a `curriculumAiDefinitions(config)` factory. It talks to the foundation only through
  `AiExecutionsService` and `AiProposalsService` (006 research A3), and it reads syllabus
  data through the `syllabus` module's services and repositories.
- **Rationale**: the foundation stays domain-free (006 FR-001). The syllabus module keeps
  owning its tables. A separate module keeps the AI flow off the deterministic 004 paths, so
  the manual flow cannot depend on it (FR-039).
- **Alternatives**: putting it inside `modules/syllabus` mixes an optional AI dependency into
  the core flow. Putting it inside `modules/ai` breaks the domain-free foundation rule.

## C2. First real provider: Anthropic, model `claude-opus-5`

- **Decision**:
  - Provider `anthropic` in `src/modules/ai/gateway/providers/anthropic.provider.ts`, built on
    the official `@anthropic-ai/sdk` package. This is the first new dependency.
  - Model config `curriculum-extraction-default`: model `claude-opus-5`, reference price
    US$ 5 / 25 per million input / output tokens, `maxOutputTokens` 16 000, timeout 60 s.
  - Adaptive thinking with effort `low`: the extraction is transcription, and a low effort
    keeps latency and cost down.
  - The server-side refusal fallback is on (`fallbacks: "default"`, beta
    `server-side-fallback-2026-07-01`).
  - Credential `ANTHROPIC_API_KEY`, optional, plus an optional `ANTHROPIC_BASE_URL` used only
    by the local E2E run, which points it at a mock of the Messages API. When it is missing, the provider is not
    registered (FR-043), so `providerFor` answers nothing and requests get
    `AI_MODEL_UNAVAILABLE`, while the app starts normally.
- **Rationale**:
  - The official SDK is the supported way to call Claude from TypeScript. It brings typed
    errors (`RateLimitError`, `InternalServerError`, `APIConnectionTimeoutError`…), which map
    cleanly to the gateway's `ProviderErrorCategory`, and typed request and response shapes.
  - The spec requires the provider (FR-042), which satisfies the "no dependency without a
    spec" rule.
  - The ESLint and scan boundary from 006 A15 already confines `@anthropic-ai/*` to
    `gateway/providers/**`.
  - Opus 5 is the current default model. Effort is the cost/latency lever instead of a
    weaker model, and the on-demand eval (C17) is where a later change of model or effort gets
    measured.
- **Alternatives**:
  - Raw `fetch`: no dependency, but it re-implements retries and typed errors that the SDK
    already provides, and the gateway still owns the retry policy.
  - A cheaper model: rejected as a default; it can be measured through the eval and switched
    by publishing a new model config.
  - Streaming: unnecessary with 16 000 output tokens and a 60 s call.

## C3. Mapping `ModelRequest` to the Messages API

- **Decision**: `AnthropicProvider` translates the 006 envelope and nothing else.
  - `system` → top-level `system`.
  - `context` and each `untrusted` block (already delimited and escaped by `prompt-envelope`)
    → the text of the first `user` message, context first.
  - `tools` → Messages tools with `strict: true` and `input_schema` = the tool's JSON Schema.
  - `history` → alternating `assistant` messages (`tool_use` blocks) and `user` messages
    (`tool_result` blocks). The provider generates the ids (`call_<n>`), because
    `ModelHistoryEntry` carries none; the id only pairs a use with its result.
  - Every result of one assistant turn goes back in one user message.
  - `generateStructured` adds `output_config.format = {type: "json_schema", schema}` after
    removing the keywords the API does not support (`minLength`, `maxLength`, `minimum`,
    `maximum`, `multipleOf`, `minItems`/`maxItems` above 1, `pattern`). The foundation's Zod
    validator still enforces them (006 FR-039).
  - `tool_choice` is `auto`.
- **Response mapping**:
  - `stop_reason: "tool_use"` → `{kind: "tool_calls"}`, with each input as parsed JSON.
  - `end_turn` → `{kind: "output", text}` from the concatenated text blocks.
  - `max_tokens` and `refusal` → `{kind: "output", text: ""}`, which the validator turns into
    `AI_OUTPUT_VALIDATION_FAILED` (empty output). The refusal category and explanation are
    never logged.
  - Usage comes from `usage.input_tokens` and `usage.output_tokens`; the total is their sum.
- **Error mapping**:
  - 429 → `RATE_LIMITED`;
  - 529 and 5xx → `UNAVAILABLE`;
  - connection and timeout errors → `TIMEOUT`;
  - 401 and 403 → `AUTH`;
  - 400, 404 and 413 → `INVALID_REQUEST`;
  - anything else → `UNKNOWN`.

  The SDK's own retries are off (`maxRetries: 0`), because the gateway already retries only
  transient failures (006 A12). The SDK timeout is the call's `AbortSignal`.
- **Health**: `healthCheck` calls `models.retrieve("claude-opus-5")`. It answers
  `NOT_CONFIGURED` without a key, `UP` or `DOWN` otherwise.
- **Alternatives**: `messages.parse()` with a Zod schema. It is rejected because the gateway
  receives a JSON Schema, not the Zod type, and validation is the foundation's job.

## C4. Agent definition

- **Decision**: `curriculum-agent` v1:
  - `L2_PROPOSAL`, `ASYNC`, `initialStatus: DISABLED`: the admin enables it in "Operação de
    IA" after the on-demand eval passes (C17, FR-051). The registry sync writes the status
    only when it creates the agent, so a later startup never overrides the admin's choice;
  - `requiredPermission: "ementas.revisar"` (existing, so there is no new permission);
  - `resourceTypes: ["SYLLABUS_DOCUMENT"]`;
  - `toolKeys: ["read-curriculum-document"]`;
  - `onToolDenied: "continue"`: a denied call (for example, an injected tool name) gets a
    denial result, and the model can still finish from the authorized document;
  - `input`: an empty strict object, because the document is the resource;
  - `limits`: `maxToolCalls: 2`, `maxModelCalls: 3`.
- **Prompt and output schema**:
  - prompt `curriculum-extraction` v1 (text in [contracts/curriculum-agent.md](./contracts/curriculum-agent.md));
  - output schema v1 = `CurriculumExtractionOutputSchema` from `@repo/contracts`.
- **Proposal**: `{type: "CURRICULUM_EXTRACTION", build}` (C6).
- **Context sent to the model** (`buildContext`): only `{documentId}`, so the model knows
  which id to pass to the tool. The subject name comes back inside the tool result (C7); the
  teacher's name and ids are never sent (FR-011).
- **Rationale**: this is the least privilege possible, one tool with one argument. With
  `continue`, a prompt injection that asks for another tool costs one denied call instead of
  failing the teacher's analysis (US5-4).

## C5. Output schema v1

- **Decision**: `CurriculumExtractionOutputSchema` (strict):
  ```ts
  {
    title: string(1–200) | null,
    syllabusText: string(1–10000) | null,
    competencyText: string(1–10000) | null,
    groups: Array<{ title: string(1–300) | null,
                    items: Array<{ text: string(1–1000), sourceRef: string(1–20) | null }> (1–200) }> (0–200),
    warnings: Array<{ code: CurriculumWarningCode, field: "title" | "syllabusText" | "competencyText" | "groups" | null,
                      groupIndex: int(0–199) | null }> (0–50),
  }
  ```
  with `CurriculumWarningCode = FIELD_NOT_FOUND | AMBIGUOUS_STRUCTURE | LOW_DOCUMENT_QUALITY |
  INCOMPLETE_SECTION | UNREADABLE_CONTENT | POSSIBLE_DUPLICATE_CONTENT`. The total number of
  items is capped at `MAX_ITEMS_PER_REVISION` (a refinement checked by the validator).
- **Rationale**:
  - The limits are the ones of the 004 draft (`SaveSyllabusRevisionRequestSchema`), so a valid
    output always fits a draft once the teacher accepts it. Domain revalidation (C10) still
    runs.
  - Warnings carry no free text: the teacher sees catalog messages by code (spec
    Assumptions), and the model's prose never reaches the screen.
  - There is no confidence field (spec Edge Cases).
- **Alternatives**: a free-text `message` on each warning. It is rejected because it adds
  untrusted prose to the UI for no gain.

## C6. How the proposal is built: a foundation hook, `proposal.build`

- **Decision**: the foundation gets one generic, optional hook on `AgentDefinition.proposal`:
  ```ts
  build?(output: unknown, ctx: { toolResults: readonly { toolKey: string; output: unknown }[] })
    : { content: unknown; itemIds: string[] } | null
  ```
  - The runner calls it after validation, inside `complete`.
  - `null` means there is nothing to propose: the execution ends `COMPLETED` with no proposal
    (`proposal_id` stays null, which the 006 schema allows). The view shows
    `proposalId: null`.
  - An exception thrown by `build` counts as invalid output: the execution ends `FAILED` with
    `AI_OUTPUT_VALIDATION_FAILED` and no proposal. The 006 error-code list (FR-050) does not
    change.
  - Without the hook, the current behavior stays (`content = output`, `itemIds(output)`).
  - For the Curriculum Agent, `build`:
    1. takes the read tool's last successful result;
    2. runs the grounding check (C8);
    3. drops `sourceRef`s that don't exist (C9);
    4. returns `content = {extraction, grounding, source: {documentId, sha256, readerVersion}}`
       with `itemIds` = the identified fields (`title`, `syllabusText`, `competencyText`) plus
       `group:<i>` for each group. When the list is empty (nothing identified), it returns
       `null` (FR-017).
- **Rationale**:
  - The proposal content is immutable after insert (006 trigger), so the grounding result and
    the source checksum must be computed before the insert, in the same place the proposal is
    created.
  - Recomputing on read would re-read the document each time and make what the teacher saw
    non-reproducible.
  - The hook is pure: no I/O, only data the runner already holds.
- **Alternatives**:
  - A second read in the domain after the execution: this means duplicate I/O and a race with
    what the model actually saw.
  - A new L2 variant in the foundation: heavier.

## C7. The read tool: `read-curriculum-document`

- **Decision**: an L1 tool.
  - Input: `{documentId: uuid}` (strict). `resourceType: "SYLLABUS_DOCUMENT"`,
    `requiredPermission: "ementas.revisar"`, `timeoutMs: 10000`.
  - `run`:
    1. loads the execution's `resource_id` by `ctx.executionId` and refuses with
       `AI_CONTEXT_ACCESS_DENIED` if it differs from the argument (FR-008). The executor
       already checks the allowlist, the permission, the strict input and the ownership
       (006 A14).
    2. loads the document (subject owned by `ctx.workspaceId`,
       `processing_status = PROCESSED`, `extraction_result = TEXT`) together with the stored
       file.
    3. checks the file's SHA-256 against `syllabus_documents.sha256`; a mismatch means
       `AI_CONTEXT_ACCESS_DENIED`, which never happens by the 004 trigger.
    4. asks the syllabus worker thread for the normalized content (C11).
  - Output (strict, capped at 200 KB):
    ```ts
    { documentId, subjectName: string, mediaType: "PDF" | "DOCX", readerVersion: 1, sha256: hex(64),
      blocks: Array<{ ref: string, kind: "heading" | "group" | "item" | "text", text: string(1–4000) }> (1–5000) }
    ```
    `ref` is `p<page>.<line>` for PDF and `par<n>` for DOCX.
- **Rationale**:
  - The agent never sees the file or the format, only ordered text blocks with a stable
    reference, which is exactly what the grounding check and the source references need.
  - The checksum and reader version travel with the result that `build` uses (C6).
  - `subjectName` is the only metadata, and it helps with titles.
- **Alternatives**:
  - Handing the 004 extraction JSON to the model: the model would see only what the
    deterministic rules already found, which defeats the purpose.
  - Sending the raw PDF as a `document` block: this is format-coupled, heavier, and breaks
    the grounding check.

## C8. Deterministic grounding check

- **Decision**: a pure function `checkGrounding(extraction, blocks)` in
  `curriculum-ai/grounding.ts`.
  - Normalization, `norm(s)`:
    1. NFKC;
    2. lowercase;
    3. strip diacritics (NFD without `\p{M}`);
    4. strip a leading list marker (`^\s*(\d+[.)]|[a-z][.)]|[-–•*·])\s+`);
    5. replace every run of non-alphanumeric characters with one space;
    6. trim.
  - The document stream is `norm` of every block text, joined with a space.
  - A text is **supported** when `norm(text)` is a substring of the stream.
  - Checked: `title`, `syllabusText`, `competencyText`, each group title and each item.
  - Result: `{unsupported: Array<{field, groupIndex?, itemIndex?}>}`, stored in the proposal
    `content.grounding` and shown as `UNSUPPORTED_CONTENT` next to the field or item.
  - It never removes or approves anything (FR-021).
- **Rationale**:
  - Extraction must be verbatim or near-verbatim, and normalization absorbs line wraps,
    bullets, accents, case and punctuation.
  - Anything the model invented ("Polimorfismo" when the document has only "Encapsulamento e
    herança.") is not a substring and gets flagged.
  - It is deterministic, has no cost and is unit-testable (constitution XII).
- **Known limits**: an item the model split or rephrased gets flagged even though it is
  correct. That is a false positive shown as a warning, and the teacher decides. The eval
  (C17) measures the rate. Fuzzy matching (token overlap) was considered and deferred: it
  lets invented items through when they share words.

## C9. Source references

- **Decision**: the model copies the `ref` of the block the item came from. `build` keeps a
  `sourceRef` only if the ref exists in the tool's blocks **and** that block, or that block
  joined with the next one, contains the normalized item. Otherwise it drops the ref and
  shows no origin, never an invented one (FR-023).
- **Display**: `p3.12` shows as "página 3"; `par41` shows as "parágrafo 41".

## C10. Applying the proposal in the domain, atomically

- **Decision**: route `POST /syllabus-documents/:id/ai-proposals/:proposalId/apply`
  `{acceptedItemIds: string[] (1+), replaceDraft: boolean}` in `CurriculumAiApplyService`,
  all in **one transaction**:
  1. `SELECT … FOR UPDATE` on the syllabus document, scoped to the session teacher's subjects
     (404 otherwise).
  2. Read the proposal (`AiProposalsService.getForUpdate(tx, workspaceId, id)`, new) and check
     that its type is `CURRICULUM_EXTRACTION` and that its target is this document (404
     otherwise). Then check that `content.source.sha256` equals the document's `sha256` and
     that `content.source.readerVersion` is known (`CURRICULUM_SOURCE_CHANGED`, 409).
  3. Idempotent replay: if the proposal is `APPROVED`/`PARTIALLY_APPROVED` and a revision
     already has `ai_proposal_id = proposalId`, return that revision (same answer). If the
     proposal was decided another way, or the accepted set differs, answer
     `409 INVALID_STATE_TRANSITION`.
  4. Build the draft content from `extraction`, keeping only the accepted fields and groups,
     and validate it with `SaveSyllabusRevisionRequestSchema`. Failure:
     `422 CURRICULUM_PROPOSAL_INVALID` (no field paths, per the project's error convention),
     and nothing written (FR-036). The web runs the same schema first and points to the field.
  5. Draft slot:
     - if there is no draft, create a revision `DRAFT` with source `AI_ASSISTED` and
       `ai_proposal_id`;
     - if there is a draft and `replaceDraft` is false, answer `409 REVISION_DRAFT_EXISTS`;
     - if `replaceDraft` is true, rewrite that draft in place (same id and number) with source
       `AI_ASSISTED` and `ai_proposal_id`, deleting its groups and items first, as the 004
       `save` does.
     A confirmed revision is never touched: when there is one, the new draft simply gets the
     next number, the same as the 004 "Nova revisão" flow (FR-033).
  6. `AiProposalsService.decideWithin(tx, auth, id, {decision, acceptedItemIds})` (new, C12):
     `APPROVE` when every item is accepted, `APPROVE_PARTIALLY` otherwise.
  7. Audit `curriculum_ai.proposal_applied`.

  `UNIQUE (ai_proposal_id)` on `syllabus_revisions` makes a second application impossible,
  even under concurrency (FR-034). The foundation's conditional `UPDATE` elects a single
  winner.
- **Rationale**:
  - Applying and deciding happen in one transaction, so a domain validation failure leaves
    the proposal `READY_FOR_REVIEW` (US3-8), which the 006 two-step flow (decide, then apply)
    cannot guarantee.
  - Reusing the 004 draft means one editor and one confirmation rule (Clarification Q2).
- **Draft rewrite vs. new draft**: 004 allows at most one draft per document (partial unique
  index). Rewriting it in place keeps that invariant without adding a delete operation for
  drafts.
- **Origin ids**: items created by the application have no `origin_item_id`; topics keep
  pointing at the earlier confirmed revision's items, as with a manual draft.

## C11. Normalized content from the 004 readers

- **Decision**:
  - The worker-thread entry `extract.worker.ts` gains a second message type, `normalize`, which
    runs the same `pdfLines` and `docxLines` readers and returns the lines with a reference.
  - `SourceLine` gains an optional `ref` (`p<page>.<line>` from `pdfLines`, `par<n>` from
    `docxLines`). The deterministic extractor ignores it, so `EXTRACTOR_VERSION` stays 1 and
    the 004 golden test is unchanged.
  - `READER_VERSION = 1` identifies the normalized format.
  - PDF wrapped lines are joined into the previous block, using the same `wraps` rule the
    extractor uses.
  - `kind` comes from the `emphasis` and `list` hints (`heading`, `group`, `item`, `text`).
  - `SyllabusWorkerRunner` gets `normalize(fileBytes, mediaType, signal)` with the tool's
    timeout; a crash or a timeout means `AI_TOOL_EXECUTION_FAILED`.
- **Rationale**:
  - The spec asks for the existing reading layer (FR-009).
  - The worker thread keeps PDF parsing off the event loop and already has limits and crash
    isolation (004 E8).
  - Computing on demand avoids a schema change and a backfill for the documents already
    processed.
- **Alternatives**: storing the normalized content at processing time. It is rejected because
  it needs a migration and a backfill, and the content is cheap to recompute.

## C12. Foundation changes (small, generic)

1. `AgentDefinition.proposal.build` (C6), and the runner support for a `COMPLETED` L2
   execution with no proposal.
2. `AiProposalsService.decideWithin(tx, auth, id, body, requestId, now)`: the transactional
   core of `decide`. `decide` keeps the rate limit and wraps it. Also
   `getForUpdate(tx, workspaceId, id)`: `SELECT … FOR UPDATE` scoped to the workspace.
3. `AiExecutionsService.availability(agentKey)`: `"AVAILABLE" | "AGENT_DISABLED" |
   "MODEL_UNAVAILABLE" | "PAUSED"`, where `PAUSED` means
   `AI_EXECUTION_INTERVAL_SECONDS = 0`. It is used by the domain status route (FR-040) and
   never exposes the provider or the model.
4. `AiExecutionsService.request` accepts an optional `idempotencyKey` derived by the domain
   (C13) and an optional hook `onCreated(tx, executionId)`, which runs inside the
   transaction that creates the execution, after `ai_execution.requested`. The domain writes
   its own audit there (C15), so both rows share the transaction; an exception in the hook
   rolls everything back. The HTTP contract of `POST /ai/executions` stays unchanged.
5. `AiAgentMetricsSchema` gains, generically for every agent:
   - `outputInvalid` (failed with `AI_OUTPUT_PARSE_FAILED` or `AI_OUTPUT_VALIDATION_FAILED`);
   - `proposals: {created, approved, partiallyApproved, rejected, expired}`;
   - `avgTotalTokens: int | null`;
   - `avgEstimatedCost: DecimalString | null` with `currency`.

   The "Operação de IA" screen shows the rates (FR-048).
6. `AgentDefinition.proposal.approveThroughDomain?: boolean`. When it is true,
   `POST /ai/proposals/:id/decision` refuses `APPROVE` and `APPROVE_PARTIALLY` with
   `409 AI_PROPOSAL_APPLY_REQUIRED`; `REJECT` stays allowed. Only `decideWithin`, called by
   the domain's apply flow, approves, so an approved curriculum proposal always has its draft
   (data-model invariant 2).
7. `PRODUCTION_AI_DEFINITIONS` becomes `productionAiDefinitions(config)`, which returns the
   curriculum definitions plus the Anthropic provider only when `ANTHROPIC_API_KEY` is set.
   `006-ai-no-real-provider.spec.ts` becomes: without a key, production registers no
   provider; the tests register only `fake*` ones; `anthropic` is the only real provider key
   in the code.

## C13. One active analysis per document, without a new lock

- **Decision**: the domain request service:
  1. rate-limits scope `curriculum-ai` (10 per hour per teacher, `RATE_LIMIT_CURRICULUM_AI_PER_HOUR`);
  2. checks the document (404, or 409 `SYLLABUS_NOT_READY_FOR_AI`);
  3. looks for an active execution of `curriculum-agent` with this resource and returns it
     (`created: false`, 200) if there is one;
  4. otherwise counts this teacher's executions for this document (`n`) and requests one with
     `idempotencyKey = derivedUuid("curriculum-ai:<documentId>:<n>")`: a SHA-256 of the
     string laid out as a version-5 UUID with `node:crypto`, with no new dependency.

  Two concurrent first requests compute the same `n`, and so the same key; the foundation's
  unique index makes one win and the other replay it (FR-014). After an execution finishes,
  the next request gets `n + 1`, a new key.
- **Rationale**: this reuses the foundation's idempotency. There is no advisory lock and no
  new index, and double clicks, other tabs and retries all collapse.
- **Pending proposal**: when a `READY_FOR_REVIEW` proposal exists for the document, the
  request needs `discardPendingProposal: true`. Without it, the answer is
  `409 CURRICULUM_PROPOSAL_PENDING`. With it, the proposal is rejected through
  `AiProposalsService.decide` before the request (FR-038).

## C14. Availability and the "sem texto" rule

- **Decision**: `GET /syllabus-documents/:id/ai` answers:
  - `availability`: `AVAILABLE` or one reason code, in this order: `DOCUMENT_NOT_READY`,
    `DOCUMENT_WITHOUT_TEXT`, `AGENT_DISABLED`, `MODEL_UNAVAILABLE`, `PAUSED`;
  - `activeExecution`: the latest active execution view, or null;
  - `pendingProposalId`;
  - `lastExecution`: the latest execution view, if any;
  - `lastOutcome`: `NOTHING_FOUND` when the last `COMPLETED` execution has no proposal.

  The web shows the reasons from the message catalog (FR-040).
- **Rationale**: a single read drives the button, the explanation and the resume after a
  reload, with no content.

## C15. Audit events (FR-045)

- **Decision**: two new types, recorded by the domain in the same transaction:
  - `curriculum_ai.analysis_requested` `{documentId, executionId, created, discardedProposal}`;
  - `curriculum_ai.proposal_applied` `{documentId, proposalId, revisionId, revisionNumber,
    replacedDraft, acceptedFields, acceptedGroups, groupCount, itemCount, unsupportedCount}`.

  The remaining spec events map one-to-one to the 006 events already written in the same
  transaction, identified by `agentKey = curriculum-agent` and the target
  `SYLLABUS_DOCUMENT`:

  | Spec event | 006 event |
  |---|---|
  | `ANALYSIS_STARTED` | `ai_execution.started` |
  | `ANALYSIS_COMPLETED` | `ai_execution.completed` |
  | `ANALYSIS_FAILED` | `ai_execution.failed` |
  | `PROPOSAL_CREATED` | `ai_proposal.created` |
  | `PROPOSAL_APPROVED` | `ai_proposal.approved` / `ai_proposal.partially_approved` |
  | `PROPOSAL_REJECTED` | `ai_proposal.rejected` |
- **Rationale**: no duplicate rows and no new foundation hook for events. Every row already
  has ids, counts and codes only.

## C16. Retries and limits specific to this agent

- **Decision**: the global 006 limits apply (120 s total, 60 s per model call, 10 s per tool,
  2 retries). The agent lowers them to 3 model calls and 2 tool calls. The expected path is
  two model calls: call 1 asks for the tool, call 2 returns the JSON. Input size is checked by
  the executor (200 KB); an oversized document fails with `AI_EXECUTION_LIMIT_EXCEEDED` before
  the second call (spec Edge Cases).
- **Latency (SC-008)**: effort `low` and a small schema keep call 2 well under 60 s for a
  10-page ementa. The on-demand eval records p95 durations; if they come close to the limit,
  the answer is a new model config (another effort level or model), never a larger timeout by
  default.

## C17. Evaluation (constitution XIX, FR-049–FR-051)

- **Decision**:
  - The golden set lives in `apps/api/test/fixtures/curriculum-agent/golden/`, version `1`.
    Each case has:
    - a source document, fictitious or authorized (`poo.pdf` and `poo.docx` from 004, plus new
      small PDFs and DOCX files built by the fixture script);
    - `expected.json`, reviewed by a person;
    - `recorded.json`, the model responses for the fake provider.
  - Cases:
    1. POO (four groups × four items), PDF;
    2. the same content as DOCX;
    3. no competency;
    4. groups without titles;
    5. minimal "Encapsulamento e herança.";
    6. an injection telling the model to ignore its rules and return other teachers' data;
    7. an injection asking it to call `deleteCurriculum`;
    8. a duplicated section.
  - Pure scorer `scoreCurriculumCase(expected, content)`:
    - field hits (title, ementa, competency);
    - item recall in order (longest common subsequence over the normalized items);
    - count of unsupported items without a warning (must be 0);
    - invented fields (must be 0);
    - schema validity;
    - injection outcome (no tool outside the allowlist, no data from outside the document).
  - **CI mode**: `test/integration/007-us6-evaluation.spec.ts` runs every case through the
    real runner with the fake provider replaying `recorded.json`, stores the results through
    `AiEvaluationStore` and asserts the scorer's thresholds.
  - **On-demand mode**: `pnpm --filter api eval:curriculum` (a separate Vitest config,
    `vitest.eval.config.ts`, outside the default suite; needs `ANTHROPIC_API_KEY`) runs the
    same cases against the real provider, prints the metrics, stores them, and with
    `EVAL_RECORD=1` rewrites `recorded.json` for review. It runs under Vitest rather than as a
    compiled script because the golden fixtures live in `test/`, outside `dist/`, and the Nest
    app needs the decorator transform.
  - **Production gate**: the agent is registered `DISABLED` (C4). The admin enables it in
    "Operação de IA" only after this run passes the SC-005 and SC-006 thresholds. A later
    change of model config, prompt or schema is evaluated on demand before it is deployed.
    Both are release steps in `quickstart.md` §3.
- **Rationale**: CI never calls a real model (006 SC-011), yet the scorer, the grounding check
  and the proposal building are exercised against realistic outputs. The on-demand run is the
  regression gate for model, prompt or schema changes.

## C18. Web

- **Decision**:
  - The syllabus document page (`features/syllabus`) gets a `CurriculumAiPanel`, from a new
    feature `features/curriculum-ai/{api,components,hooks}`. It shows:
    - the explanation (FR-041);
    - the "Preencher com IA" button, disabled with its reason (C14);
    - the execution status through the existing `AiExecutionStatus` and
      `AiProcessingIndicator`, polled with `useAiExecution` (`refetchInterval` until a final
      status);
    - cancel, "Tentar novamente" and "Preencher manualmente".
  - The proposal review is a page route, `/disciplinas/[id]/ementa/[documentId]/proposta/[proposalId]`,
    split in two columns: the original on the left (reusing the 004 viewer) and a read-only
    `CurriculumProposalReview` on the right.
    - Fields and groups have checkboxes, built on the item list of `AiProposalReview`.
    - Items show their source ("página 3"), and `UNSUPPORTED_CONTENT` / catalog warnings
      appear with an icon and text, never color alone.
    - Actions: "Aplicar à ementa" (primary, with confirmation, and a second confirmation when a
      draft exists) and "Rejeitar" (`variant="danger"`, confirmed).
  - After applying, the page navigates to the draft in the 004 editor, which shows a
    "Preenchido com IA — revise antes de confirmar" notice for `AI_ASSISTED` drafts.
- **Rationale**: it reuses the 006 state components and the 004 editor, and adds no new
  foundational component.

## C19. Logs and scans

- **Decision**:
  - The `ai-log` allowlist from 006 already covers execution, agent, versions, model, status,
    duration, usage, error code and tool.
  - The curriculum module logs only `documentId`, `proposalId`, `revisionId` and counts.
  - `secret-leak-scan` adds the fixture marker `MARCADOR-EMENTA-007` (inside the golden
    documents and the recorded outputs) and the fake Anthropic key used in the provider unit
    tests.
  - The provider unit tests run against a local mocked HTTP server (the SDK `baseURL`
    option), never the network.

## C20. What stays the same

- The 004 extraction, review and confirmation.
- The 006 HTTP routes (except the metrics fields, C12.5).
- The permissions, and the roles' access.
- No Redis, queue or WebSocket.
- The only new dependency is `@anthropic-ai/sdk` in `apps/api` (recorded in
  `DEPENDENCIES.md`).
