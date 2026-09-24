import type { TopicView } from "@repo/contracts";
import { TopicList } from "./meeting-topics";

/** "Sem data" (004/US5-5): topics without a class day, in plan order, until the teacher picks one. */
export function UnscheduledTopics({ topics }: { topics: readonly TopicView[] }) {
  return (
    <section aria-labelledby="sem-data-titulo" className="flex flex-col gap-2">
      <h2 id="sem-data-titulo">Sem data</h2>
      <TopicList topics={topics} empty="Nenhum tópico sem data." />
    </section>
  );
}
