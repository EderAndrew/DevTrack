import type { ClassMeetingView, TopicView } from "@repo/contracts";
import { CircleCheck } from "lucide-react";
import type { ReactNode } from "react";
import { meetingLabel } from "@/features/class-calendar/components/calendar-dates";

/**
 * The controls of the topic at `index` of a list of `count` (the plan's editing controls, US6):
 * `header` sits beside the title ("Concluir aula" / "Reabrir aula", US9), `actions` below the items.
 */
export type RenderTopicActions = (
  topic: TopicView,
  index: number,
  count: number,
) => { header?: ReactNode; actions: ReactNode };

/**
 * One topic: its title, description and the syllabus items it covers (flagged when outside the
 * revision, E16); a completed topic carries the green "Aula concluída" mark (004/US9).
 */
export function TopicSummary({ topic, header, actions }: { topic: TopicView; header?: ReactNode; actions?: ReactNode }) {
  const completed = topic.status === "COMPLETED";
  return (
    <li className={`rounded-md border p-3 ${completed ? "border-2 border-success" : "border-border"}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h4 className="m-0 text-base">{topic.title}</h4>
        {completed ? (
          <span className="inline-flex items-center gap-1 rounded-md bg-success-surface px-2 py-0.5 text-sm font-semibold text-success">
            <CircleCheck aria-hidden="true" className="size-4" />
            Aula concluída
          </span>
        ) : null}
        {header ? <div className="ml-auto">{header}</div> : null}
      </div>
      {topic.description ? <p className="m-0 mt-1 whitespace-pre-line">{topic.description}</p> : null}
      {topic.items.length > 0 ? (
        <ul aria-label="Itens da ementa" className="m-0 mt-2 pl-5">
          {topic.items.map((item) => (
            <li key={item.id}>
              {item.text}
              {item.outsideRevision ? (
                <span className="font-semibold text-destructive"> — Este item não existe na versão da ementa usada agora.</span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="m-0 mt-1 text-muted-foreground">Sem itens da ementa.</p>
      )}
      {actions}
    </li>
  );
}

/** Topics of a list, in plan order. */
export function TopicList({
  topics,
  empty,
  renderActions,
}: {
  topics: readonly TopicView[];
  empty: string;
  renderActions?: RenderTopicActions;
}) {
  if (topics.length === 0) return <p className="m-0">{empty}</p>;
  return (
    <ol className="m-0 flex list-none flex-col gap-2 p-0">
      {topics.map((topic, index) => {
        const controls = renderActions?.(topic, index, topics.length);
        return <TopicSummary key={topic.id} topic={topic} header={controls?.header} actions={controls?.actions} />;
      })}
    </ol>
  );
}

/** A class day ("Aula 05 — 18/03/2027") with its topics (FR-034: zero, one or many). */
export function MeetingTopics({
  meeting,
  topics,
  renderActions,
}: {
  meeting: ClassMeetingView;
  topics: readonly TopicView[];
  renderActions?: RenderTopicActions;
}) {
  const headingId = `aula-${meeting.id}`;
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2">
      <h3 id={headingId} className="m-0">
        {meetingLabel(meeting.number, meeting.date)}
      </h3>
      <TopicList topics={topics} empty="Nenhum tópico nesta aula." renderActions={renderActions} />
    </section>
  );
}
