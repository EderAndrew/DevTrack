# Web UI Contract: 006 — AI Foundation

Only Design System tokens and components (005). Texts are in Portuguese. Error messages
come from `lib/messages/error-messages.ts`, keyed by the normalized code (FR-066).

## Route

| Route | Group | Permission (UX) | Page |
|-------|-------|-----------------|------|
| `/admin/ia` | `app/(app)` (AppShell) | `ia.operacao.visualizar` | "Operação de IA" |

Navigation (`lib/navigation.ts`):
- the menu item "Operação de IA" goes next to the user areas, with
  `ia.operacao.visualizar`;
- `STAFF_AREA_PERMISSIONS` gains `ia.operacao.visualizar`;
- `AREAS` gains `{prefix: "/admin/ia", name: "Operação de IA"}`;
- `proxy.ts` already covers `/admin`.

Without the permission, the page shows `NoAccess`, which is UX only (US7-7).

## "Operação de IA" (`features/ai-operations`)

The `PageHeader` shows "Operação de IA" and the description "Saúde, uso e custo dos agentes
de IA. Nenhum conteúdo de professores aparece aqui." The page has these sections, each an
`h2`:

1. **Saúde**:
   - a `Table` of model configs with columns Configuração, Provedor, Modelo, Situação
     (`Status`: "Habilitada"/"Desabilitada") and Provedor responde (`Status`:
     "Respondendo" ✓ / "Sem resposta" ✕ / "Não configurado" ⚠, always text + icon);
   - the button "Verificar de novo" refetches;
   - with no config: `EmptyState` "Nenhuma configuração de modelo registrada."
2. **Indicadores**:
   - a `Select` "Período" with "Últimas 24 horas", "Últimos 7 dias" and "Últimos 30
     dias";
   - a `Table` per agent and version with columns Agente, Versão, Instruções, Modelo,
     Execuções, Concluídas, Falhas, Tempo esgotado, Canceladas, Duração média, Chamadas ao
     modelo and Chamadas de ferramenta;
   - empty: "Nenhuma execução no período."
3. **Uso e custo**:
   - a `Table` per provider and model with Chamadas, Tokens de entrada, Tokens de saída,
     Total and Custo estimado;
   - "—" with the `sr-only` text "não informado" when it is null.
4. **Agentes**:
   - a `Table` with Agente, Versão, Nível (`Badge`: "Leitura"/"Proposta"), Configuração de
     modelo, Na fila/Em execução and Situação;
   - with `ia.agentes.gerenciar`, the action "Desabilitar" (`variant="danger"`) or
     "Habilitar";
   - both actions confirm with an `AlertDialog`: "Desabilitar o agente X? Pedidos novos
     serão recusados e as N execuções na fila serão canceladas.";
   - empty: "Nenhum agente registrado. Os agentes entram com as próximas funcionalidades."
5. **Configurações de modelo**: the same pattern ("Desabilitar"/"Habilitar", with the
   message "Os agentes X, Y deixarão de aceitar pedidos novos.").

After a change, a `toast` shows the result and the lists are refetched (TanStack Query
`invalidateQueries`). Errors from these actions (`INVALID_STATE_TRANSITION`, `NOT_FOUND`)
show as an `Alert` near the table.

Keyboard: Tab goes through Select → Verificar de novo → the action of each row, and the
dialog traps focus and returns it to the button (SC-012; `test/keyboard.ts`).

### Amendment 2026-09-29: sections in tabs

The sections above (plus the ones 009 added: Orçamentos, Tarefas and Modelos) no longer stack on
one page; each group is a tab of the design system's `Tabs` (`TabsList` labelled "Seções da
operação de IA"), in this order:

| Tab | `?aba=` | Content |
|-----|---------|---------|
| Saúde | `saude` (default) | Saúde |
| Indicadores | `indicadores` | the "Período" `Select`, Indicadores and Uso e custo (cost by model, task, tier and family) |
| Orçamentos | `orcamentos` | Orçamentos |
| Tarefas | `tarefas` | Tarefas (with the override actions) |
| Modelos | `modelos` | the "Período" `Select` (the same period as Indicadores) and Modelos |
| Agentes | `agentes` | Agentes |
| Configurações de modelo | `configuracoes` | Configurações de modelo |

- Each section keeps its `h2` and its region, so its content, empty states, actions, dialogs,
  toasts and `Alert`s are unchanged; only the active tab's panel is rendered.
- The active tab is in the URL (`/admin/ia?aba=agentes`), replaced without a new history entry;
  an unknown value opens Saúde. A reload or a shared link opens the same tab.
- Width: the page is a wide AppShell page (`data-layout="wide"`, 005 `layouts.md`): it takes the
  whole width of the screen, beyond `--content-max`, and table actions use the small button. A status (icon + text) never breaks across lines; on a
  narrow screen the tabs wrap and each table scrolls sideways inside its own frame, never the page.
- Keyboard (SC-012): Tab reaches the active tab, the arrows move between tabs (activating them),
  and Tab goes on into the active panel: its controls in the order above (for example Período →
  the action of each row). Dialogs still trap focus and return it to their button.

## State components (`components/shared/ai/`, catalog group "Inteligência artificial")

| Component | Props | Behavior |
|-----------|-------|----------|
| `AiExecutionStatus` | `status: AiExecutionStatus`, `cancelRequested?` | `Status` with icon + text: Na fila (`Clock`), Processando (`Loader`, for RUNNING, WAITING_TOOL and VALIDATING_OUTPUT, animation off with reduced motion), Concluída (`CircleCheck`), Falhou (`CircleX`), Cancelada (`Ban`), Tempo esgotado (`TimerOff`); "Cancelando…" when `cancelRequested`. Inside `role="status"` `aria-live="polite"`, never moves focus |
| `AiProposalStatus` | `status: AiProposalStatus` | Pronta para revisão, Aprovada, Aprovada em parte, Rejeitada, Expirada (icon + text) |
| `AiProcessingIndicator` | `label?` | progress without a percentage (`aria-busy`, text "Processando com IA…") |
| `AiErrorState` | `code: AiErrorCode`, `onRetry?` | `Alert variant="danger"`: title and guidance from the message catalog (e.g. `AI_TIMEOUT`: "A IA demorou demais para responder." / "Tente de novo em alguns minutos."); "Tentar de novo" only when `onRetry` exists; never internal details |
| `AiProposalReview` | `items: {id, label, description?}[]`, `status`, `onDecide(decision, acceptedIds?)`, `pending?` | a list of items with a `Checkbox` each (all checked); buttons "Aprovar tudo" (`primary`), "Aprovar selecionados" (only with a proper subset checked) and "Rejeitar" (`danger`), each with an `AlertDialog`; read-only when already decided; the content is rendered as text, never HTML |

Each component gets:
- a `registry.ts` entry with variants and states;
- a showcase;
- a section in `components.md` with the 6 subsections;
- a test (variants, keyboard, `vitest-axe`, announcement).

## Hooks and API for future agent screens (`features/ai`)

- `api/ai-executions.ts`: `requestAiExecution`, `getAiExecution`, `cancelAiExecution` and
  `getAiExecutionResult`.
- `api/ai-proposals.ts`: `listAiProposals`, `getAiProposal` and `decideAiProposal`.
- `hooks/use-ai-execution.ts`: `refetchInterval` of 2 s while the status is not final,
  stopping at a final status.
- `hooks/use-decide-ai-proposal.ts`.
- `useRequestAiExecution` generates one `idempotencyKey` per user intent
  (`crypto.randomUUID()` on click, reused on retry).

## New messages (`error-messages.ts`)

These keys get a title and guidance:
- the `AI_*` codes of `AiErrorCodeSchema`;
- `AI_IDEMPOTENCY_KEY_REUSED`, `AI_PROPOSAL_ITEMS_INVALID` and
  `AI_RESOURCE_TYPE_NOT_ACCEPTED`.

None of these texts mention the provider or the model.
