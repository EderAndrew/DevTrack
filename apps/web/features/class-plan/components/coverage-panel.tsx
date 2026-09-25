import type { PlanCoverage, TopicView } from "@repo/contracts";
import { Button } from "@/components/ui/button";

export interface CoveragePanelProps {
  coverage: PlanCoverage;
  /** Non-archived topics, to name the ones covering each item. */
  topics: readonly TopicView[];
  /** UX only (`planejamento.editar` on a plan that is not archived). */
  canEdit: boolean;
  /** "Criar tópico com este item" (FR-033). */
  onCreateFromItem: (item: { id: string; text: string }) => void;
}

/**
 * "Cobertura da ementa" (004/US5-3, US5-4, FR-040): the items of the revision in use with the
 * non-archived topics covering them; an item in several topics counts once.
 */
export function CoveragePanel({ coverage, topics, canEdit, onCreateFromItem }: CoveragePanelProps) {
  const titles = new Map(topics.map((topic) => [topic.id, topic.title]));
  return (
    <section aria-labelledby="cobertura-titulo" className="flex flex-col gap-3">
      <h2 id="cobertura-titulo">Cobertura da ementa</h2>
      <p className="m-0 font-semibold">
        {coverage.coveredCount} de {coverage.totalCount} {coverage.totalCount === 1 ? "item coberto" : "itens cobertos"}.
      </p>
      {coverage.groups.map((group) => (
        <div key={group.id} role="group" aria-labelledby={`grupo-${group.id}`}>
          <h3 id={`grupo-${group.id}`} className="m-0 mb-2 text-body font-semibold">
            {group.title ?? "Itens"}
          </h3>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {group.items.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span>{item.text}</span>
                {item.topicIds.length > 0 ? (
                  <span className="text-muted-foreground">
                    Coberto por: {item.topicIds.map((id) => titles.get(id) ?? "tópico").join(", ")}.
                  </span>
                ) : (
                  <>
                    <span className="font-semibold">Não coberto.</span>
                    {canEdit ? (
                      <Button
                        type="button"
                        variant="secondary"
                        aria-label={`Criar tópico com este item: ${item.text}`}
                        onClick={() => onCreateFromItem(item)}
                      >
                        Criar tópico com este item
                      </Button>
                    ) : null}
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
