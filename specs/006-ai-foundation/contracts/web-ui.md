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

### Amendment 2026-10-22: the sections in the side menu, no tabs

The sections of the 2026-09-29 table are no longer tabs: the page has no `TabsList` and shows only the
section of `?aba=` (Saúde without it or with an unknown value), still under the `PageHeader`
"Operação de IA". The navigation is the side menu, where the item "Operação de IA" becomes a collapsible
group, like "Usuários": the button "Operação de IA" (icon `Activity`, the same permission) opens and
closes it, open by default, and its sub-items are the seven sections in the table's order and with its
names, each a link to its `?aba=` (`/admin/ia?aba=saude` … `/admin/ia?aba=configuracoes`). The sub-item
of the section on screen is marked (`aria-current="page"`). With the menu collapsed to icons, the button
expands the menu and opens the group (its sub-items are hidden while collapsed). Each sub-item has its own
Lucide icon before the name (amendment 2026-10-22): Saúde `HeartPulse`, Indicadores `ChartColumn`, Orçamentos `Wallet`,
Tarefas `ListTodo`, Modelos `Cpu`, Agentes `Bot`, Configurações de modelo `SlidersHorizontal`.

- The sections are one list in `lib/navigation.ts` (`AI_OPERATIONS_TABS`); the route reads `?aba=` and
  passes the section to the page, so a reload or a shared link opens the same section.
- Each section keeps its `h2`, region, content, empty states, actions, dialogs, toasts and `Alert`s.
  Moving between sections keeps the page mounted, so the "Período" chosen in Indicadores is the one of
  Modelos.
- Keyboard (SC-012): Tab goes from the menu into the section's controls in the order above; dialogs
  still trap focus and return it to their button. This replaces the keyboard rule of the tabs.

### Amendment 2026-10-22: charts in Indicadores

Indicadores gets two bar charts, each above the table with the same numbers (the tables stay, unchanged,
as the complete and accessible view). Both read only the period's totals the API already returns
(`byAgent`, `byModel`); no API, contract or query changes. A chart over time needs a series the API does not
return and is a later amendment.

| Chart | Where | Data | Form |
|-------|-------|------|------|
| "Execuções por agente" | Indicadores, after the "Período" `Select`, before "Indicadores por agente" | `byAgent` summed per `agentKey` (versions, instructions and models add up); agents with no execution in the four outcomes are left out | one horizontal bar per agent, stacked in the fixed order Concluídas (`--success`, `CircleCheck`), Falhas (`--danger`, `CircleX`), Tempo esgotado (`--warning`, `TimerOff`), Canceladas (`--text-secondary`, `Ban`), 2px of the page background between segments |
| "Custo estimado por modelo" | Uso e custo, before "Uso e custo por modelo" | `byModel` with an `estimatedCost`, summed per `model`, the most expensive first | one horizontal bar per model in `--chart-1` |

- No chart when its data is empty (the table's empty state says so), and no cost chart when the costs come
  in more than one currency (bars of different currencies would share one axis).
- Each chart is a `<figure>` named by its `h3`, with "Os números de cada item estão na tabela abaixo." under
  it; the SVG keeps Recharts' keyboard layer (Tab reaches it, the arrows walk the categories and open the
  tooltip) and carries the same title and note. The outcomes are never told by color alone: a legend with
  icon and name below the chart, the name and value in the tooltip. A single series has no legend.
- The tooltip shows the category, then each series with its square, name and value (counts in pt-BR, the
  cost through `cost()` with the currency).
- **Dependency**: `recharts` 3.10.1 and its peer `react-is` (MIT, no known vulnerability, React 19 peer),
  pinned exact in `apps/web`. It is reached through `components/ui/chart.tsx` (`ChartContainer`,
  `ChartTooltip`, `ChartTooltipContent`, `seriesColor`), the design-system component with its catalog entry,
  showcase and `components.md` section; the chart elements (`BarChart`, `Bar`, axes, grid) come from
  `recharts` in the feature. Recharts uses Redux Toolkit internally; the ESLint rule that keeps `@reduxjs/*`
  out of the app's own code is unchanged.
- **Token**: `--chart-1` (`#A66BFF`, Neon Purple stepped into the dark band, ≥ 3:1 on `--background` and
  `--surface`, `test/contrast.test.ts`), documented in `design-system/tokens.md`. The outcome order never
  puts Concluídas next to Tempo esgotado (ΔE 6.6 under protanopia; every adjacent pair ≥ 8.9).

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
