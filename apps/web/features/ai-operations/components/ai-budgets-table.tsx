import type { AiBudgetStatus } from "@repo/contracts";
import { CircleCheck, CircleMinus, type LucideIcon, TriangleAlert } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import type { StatusVariant } from "@/components/ui/status";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { IconStatus } from "./ai-health-table";
import { cost, count, Missing } from "./format";

/** The budget in words: "Diário do sistema", "Mensal do agente X"… */
function budgetName(budget: AiBudgetStatus): string {
  switch (budget.scope) {
    case "DAILY":
      return "Diário do sistema";
    case "MONTHLY":
      return "Mensal do sistema";
    case "PER_AGENT":
      return `Mensal do agente ${budget.agentKey ?? ""}`.trim();
    case "PER_USER":
      return "Mensal por usuário";
  }
}

function situation(budget: AiBudgetStatus): [string, StatusVariant, LucideIcon] {
  if (budget.limit === null) return ["Sem limite configurado", "neutral", CircleMinus];
  return budget.exceeded ? ["Atingido", "warning", TriangleAlert] : ["Dentro do limite", "success", CircleCheck];
}

/**
 * "Orçamentos" (009/US8, FR-022): consumption of today and this month, per agent and per user
 * against each configured budget, in USD. A reached budget is a warning — nothing is blocked — and
 * per user only the number of users over the budget appears, never who. `undefined` while the
 * metrics load (the page shows their error once, in "Indicadores").
 */
export function AiBudgetsTable({ budgets }: { budgets: AiBudgetStatus[] | undefined }) {
  if (!budgets) {
    return (
      <section aria-labelledby="ia-orcamentos">
        <h2 id="ia-orcamentos">Orçamentos</h2>
        <Skeleton className="h-24 w-full" />
      </section>
    );
  }
  const reached = budgets.filter((budget) => budget.exceeded);
  return (
    <section aria-labelledby="ia-orcamentos">
      <h2 id="ia-orcamentos">Orçamentos</h2>
      {reached.length > 0 ? (
        <Alert variant="warning" className="mb-4">
          <AlertDescription>
            {reached.length === 1 ? "Um orçamento foi atingido" : `${reached.length} orçamentos foram atingidos`}: {reached.map(budgetName).join(", ")}. Os pedidos
            continuam sendo atendidos.
          </AlertDescription>
        </Alert>
      ) : null}
      <Table>
        <TableCaption className="sr-only">Consumo em relação aos orçamentos</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead scope="col">Orçamento</TableHead>
            <TableHead scope="col">Limite</TableHead>
            <TableHead scope="col">Consumo</TableHead>
            <TableHead scope="col">Situação</TableHead>
            <TableHead scope="col">Usuários acima do limite</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {budgets.map((budget) => (
            <TableRow key={`${budget.scope}:${budget.agentKey ?? "-"}`}>
              <TableCell>{budgetName(budget)}</TableCell>
              <TableCell>{budget.limit === null ? <Missing /> : cost(budget.limit, "USD")}</TableCell>
              <TableCell>{cost(budget.spent, "USD")}</TableCell>
              <TableCell>
                <IconStatus entry={situation(budget)} />
              </TableCell>
              <TableCell>{budget.scope === "PER_USER" ? count(budget.usersOverBudget) : <Missing />}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </section>
  );
}
