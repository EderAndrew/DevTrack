import type { DashboardRanking } from "@repo/contracts";
import Link from "next/link";
import { useId } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { classRankingHref } from "../schemas/ranking";
import { RankingTable } from "./ranking-table";

/**
 * One class of the dashboard (013/FR-021, contracts/web-ui.md `/painel`): "Ranking — {turma}", the
 * 1º to 5º as the server sent them and "Ver ranking completo".
 */
export function RankingCard({ ranking }: { ranking: DashboardRanking }) {
  const titleId = useId();
  return (
    <section aria-labelledby={titleId}>
      <Card>
        <CardHeader>
          <h3 id={titleId} className="m-0 text-h3">
            Ranking — {ranking.class.name}
          </h3>
        </CardHeader>
        <CardContent>
          <RankingTable rows={ranking.top} caption={`Cinco primeiros da turma ${ranking.class.name}`} headingLevel="h3" />
        </CardContent>
        <CardFooter>
          <Button asChild variant="secondary">
            <Link href={classRankingHref(ranking.class.id)} aria-label={`Ver ranking completo de ${ranking.class.name}`}>
              Ver ranking completo
            </Link>
          </Button>
        </CardFooter>
      </Card>
    </section>
  );
}
