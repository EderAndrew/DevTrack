import type { RankingRow } from "@repo/contracts";
import { Users } from "lucide-react";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatPosition } from "../schemas/ranking";

export const NO_STUDENTS = "Esta turma ainda não tem alunos.";
export const NO_POINTS_YET = "Ainda não há pontos nesta turma.";

export interface RankingTableProps {
  /** In the order and with the positions the server ranked them (013/FR-019). */
  rows: readonly RankingRow[];
  /** The table's accessible name (visually hidden). */
  caption: string;
  /** The heading level of the empty state, under the surrounding heading. */
  headingLevel?: "h2" | "h3";
}

/**
 * The class ranking (013/FR-019–FR-021, contracts/web-ui.md): Posição, Aluno, Pontos, as the
 * server sent them. The viewer's row says "Você" in text, not only by its color; with every student
 * at 0 the rows come with a notice; with no student, only the empty state.
 */
export function RankingTable({ rows, caption, headingLevel = "h3" }: RankingTableProps) {
  if (rows.length === 0) return <EmptyState icon={Users} headingLevel={headingLevel} title={NO_STUDENTS} />;
  const noPoints = rows.every((row) => row.points === 0);
  return (
    <div className="flex flex-col gap-3">
      {noPoints ? (
        <Alert variant="info">
          <AlertTitle>{NO_POINTS_YET}</AlertTitle>
        </Alert>
      ) : null}
      <Table>
        <TableCaption className="sr-only">{caption}</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead scope="col">Posição</TableHead>
            <TableHead scope="col">Aluno</TableHead>
            <TableHead scope="col">Pontos</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, index) => (
            <TableRow key={`${row.position}-${index}`} data-viewer={row.isViewer || undefined} className={row.isViewer ? "bg-accent font-bold" : undefined}>
              <TableCell>{formatPosition(row.position)}</TableCell>
              <TableCell>
                <span className="inline-flex flex-wrap items-center gap-2">
                  <span>{row.name}</span>
                  {row.isViewer ? <Badge variant="info">Você</Badge> : null}
                </span>
              </TableCell>
              <TableCell>{row.points}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
