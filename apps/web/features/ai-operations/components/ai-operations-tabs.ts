// No "use client": the page (a Server Component) reads `?aba=` through `aiOperationsTabOf`.

/** The tabs of the page, in order, with the `?aba=` value of each (006 contracts/web-ui.md, amendment 2026-09-29). */
export const AI_OPERATIONS_TABS = {
  saude: "Saúde",
  indicadores: "Indicadores",
  orcamentos: "Orçamentos",
  tarefas: "Tarefas",
  modelos: "Modelos",
  agentes: "Agentes",
  configuracoes: "Configurações de modelo",
} as const;
export type AiOperationsTab = keyof typeof AI_OPERATIONS_TABS;

export const isAiOperationsTab = (value: unknown): value is AiOperationsTab => typeof value === "string" && Object.hasOwn(AI_OPERATIONS_TABS, value);

/** The tab a `?aba=` value opens; anything else opens Saúde. */
export const aiOperationsTabOf = (value: unknown): AiOperationsTab => (isAiOperationsTab(value) ? value : "saude");
