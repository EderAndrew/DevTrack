# Web UI Contract: 007 — Curriculum Agent

Every screen uses Design System tokens and components only (005). Destructive actions use
`variant="danger"` with explicit text. States never rely on color alone. WCAG 2.2 AA, with axe
and keyboard tests (`SC-012` helpers) in each page's test file.

## Code layout

- `features/curriculum-ai/api/curriculum-ai.ts`: `getStatus`, `requestAnalysis`,
  `applyProposal`. Only this layer touches `lib/api`.
- `features/curriculum-ai/hooks/`:
  - `useCurriculumAiStatus(documentId)`: polls while an execution is active;
  - `useRequestCurriculumAnalysis`;
  - `useCurriculumProposal(proposalId)`: the 006 `useAiProposal` plus parsing with
    `CurriculumProposalContentSchema`;
  - `useApplyCurriculumProposal`;
  - reject reuses the 006 `useDecideAiProposal`.
- `features/curriculum-ai/components/`: `CurriculumAiPanel`, `CurriculumProposalReview`,
  `CurriculumWarning`, `SourceRef`.
- `app/(app)/disciplinas/[id]/ementa/[documentId]/proposta/[proposalId]/page.tsx`.

## Document page — `CurriculumAiPanel`

This panel lives on `/disciplinas/[id]/ementa/[documentId]`, next to the 004 actions ("Revisar
conteúdo", "Preencher manualmente"). It renders only with `ementas.revisar` and
`ia.execucoes.visualizar`; that check is UX only, and the server decides.

| State (from `GET …/ai`) | What the teacher sees |
|---|---|
| `AVAILABLE`, nothing pending | Title "Preencher com IA" (Lucide `Sparkles`, decorative). Text: "A IA irá analisar o documento e sugerir o preenchimento. Revise as informações antes de aplicá-las." and "O conteúdo do documento será enviado a um provedor de IA externo." Button **"Preencher com IA"** (primary). "Preencher manualmente" stays visible. |
| unavailable (`availability` ≠ `AVAILABLE`) | Button disabled, with the reason from the catalog linked through `aria-describedby`; "Preencher manualmente" stays enabled (FR-039, FR-040). |
| `activeExecution` | `AiExecutionStatus` + `AiProcessingIndicator` with the stage text (FR-018), a "Cancelar análise" button (006 cancel, confirmed) and a polite live region. The request button is hidden, so it can't be pressed twice. |
| last `FAILED` / `TIMED_OUT` / `CANCELLED` | `AiErrorState` with the stage message (FR-018), plus "Tentar novamente" and "Preencher manualmente". |
| last `COMPLETED` with outcome `NOTHING_FOUND` | Notice "Não foi possível identificar conteúdo de ementa neste documento. Preencha manualmente." plus "Tentar novamente". |
| `pendingProposalId` | "Proposta pronta para revisão." with the link **"Revisar proposta"**; "Pedir nova análise" opens an `AlertDialog`: "A proposta pendente será descartada. Continuar?" → the request with `discardPendingProposal: true`. |

Stage texts: `QUEUED` "A análise está aguardando processamento."; `RUNNING` and
`WAITING_TOOL` "Analisando a ementa..."; `VALIDATING_OUTPUT` "Validando as informações
encontradas..."; `COMPLETED` "Proposta pronta para revisão."; `FAILED` "Não foi possível
analisar a ementa."; `TIMED_OUT` "A análise excedeu o tempo permitido."; `CANCELLED` "A
análise foi cancelada."

A `429` on the request shows "Muitas análises solicitadas. Tente novamente em alguns
minutos."

## Proposal page — `CurriculumProposalReview`

- `PageHeader` "Proposta da IA para a ementa", with the document version.
- Badge `AiProposalStatus`, and an `Alert` (info): "Sugestão gerada por IA a partir do
  documento. Revise antes de aplicar; você ainda poderá editar e confirmar a ementa depois."
- Layout: two columns from the `md` breakpoint (original document on the left, reusing the
  004 viewer; proposal on the right). Below it, a `Tabs` switch "Documento" / "Proposta".
- Proposal, read-only, rendered as text only (never HTML):
  - Checkbox + label for each identified field: "Nome da disciplina", "Ementa",
    "Competência". Fields not found show "Não identificado no documento" and have no
    checkbox.
  - "Objetos de aprendizagem": a checkbox per group, with the title (or "Grupo sem título")
    and a numbered item list.
  - Each item shows its `SourceRef` ("página 3", "parágrafo 41") when there is one.
  - `CurriculumWarning` appears next to the field, group or item it concerns: a Lucide
    `TriangleAlert` icon plus text. Texts:
    - `UNSUPPORTED_CONTENT`: "Não encontrado no documento — confira antes de aplicar."
    - `FIELD_NOT_FOUND`: "Não identificado no documento."
    - `AMBIGUOUS_STRUCTURE`: "A estrutura do documento é ambígua neste ponto."
    - `LOW_DOCUMENT_QUALITY`: "Parte do documento está com baixa qualidade."
    - `INCOMPLETE_SECTION`: "Esta seção parece incompleta no documento."
    - `UNREADABLE_CONTENT`: "Parte do conteúdo não pôde ser lida."
    - `POSSIBLE_DUPLICATE_CONTENT`: "Possível conteúdo repetido."
  - A summary at the top: "N itens sem correspondência no documento" when there are any,
    linking to the first one.
- Actions, while `READY_FOR_REVIEW`:
  - **"Aplicar à ementa"** (primary), disabled when nothing is checked.
    - The selection is validated with `SaveSyllabusRevisionRequestSchema` first; on error,
      the field is flagged and focused.
    - An `AlertDialog` then confirms: "Um rascunho da ementa será criado com os itens
      marcados. Você poderá editá-lo e deverá confirmá-lo."
    - If a draft exists (`REVISION_DRAFT_EXISTS`), a second `AlertDialog`
      (`variant="danger"`): "Já existe um rascunho desta ementa. Substituí-lo pelo conteúdo
      da proposta?" → "Substituir rascunho", which resends with `replaceDraft: true`.
    - On success, the page navigates to the draft in the 004 editor.
  - **"Rejeitar proposta"** (`variant="danger"`, confirmed): 006 decision `REJECT`, then back
    to the document.
- Once the proposal is decided or expired, the page is read-only, with the status and, when
  it was applied, a link "Abrir rascunho".
- Errors come from the catalog by `code` ([http-api.md](./http-api.md)).

## 004 editor — `AI_ASSISTED` drafts

- The revision editor shows a `Notice`: "Preenchido com IA — revise o conteúdo antes de
  confirmar." with a link "Ver proposta".
- The versions list labels the source "Preenchido com IA".

## "Operação de IA" (admin, 006 screen)

The per-agent metrics table gains these columns, all numeric with no content (FR-048):
- "Falhas de validação";
- "Propostas";
- "Aprovadas";
- "Aprovadas em parte";
- "Rejeitadas";
- "Tokens médios";
- "Custo médio".

Rates are shown as a percentage next to the count.

## Tests

- `curriculum-ai-panel.test.tsx`: each state row above, double-click protection, axe,
  `expectTabOrder`.
- `curriculum-proposal-review.test.tsx`: selection, warnings shown with text, apply and
  replace-draft dialogs, reject, read-only after decision, text-only rendering of
  `<script>`-like content, axe, keyboard.
- The E2E test is local only (Playwright, `e2e/curriculum-ai.spec.ts`). The E2E API runs the
  real `AnthropicProvider` against a local mock of the Messages API, started by the Playwright
  global setup (`e2e/anthropic-mock.ts`), through `ANTHROPIC_BASE_URL` and a dummy key. It
  replays the golden POO `recorded.json`; no test code ships in `dist/`. The flow: upload
  `poo.pdf` → "Preencher com IA" → review → uncheck a group → apply → edit an item in the
  draft → confirm.
