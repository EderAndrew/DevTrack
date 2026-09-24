import type { ClassMeetingView, TopicView } from "@repo/contracts";
import { meetingLabel } from "@/features/class-calendar/components/calendar-dates";

/** One topic: its title, description and the syllabus items it covers (flagged when outside the revision, E16). */
export function TopicSummary({ topic }: { topic: TopicView }) {
  return (
    <li className="rounded-md border border-border p-3">
      <h4 className="m-0 text-base">{topic.title}</h4>
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
    </li>
  );
}

/** Topics of a list, in plan order. */
export function TopicList({ topics, empty }: { topics: readonly TopicView[]; empty: string }) {
  if (topics.length === 0) return <p className="m-0">{empty}</p>;
  return (
    <ol className="m-0 flex list-none flex-col gap-2 p-0">
      {topics.map((topic) => (
        <TopicSummary key={topic.id} topic={topic} />
      ))}
    </ol>
  );
}

/** A class day ("Aula 05 — 18/03/2027") with its topics (FR-034: zero, one or many). */
export function MeetingTopics({ meeting, topics }: { meeting: ClassMeetingView; topics: readonly TopicView[] }) {
  const headingId = `aula-${meeting.id}`;
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2">
      <h3 id={headingId} className="m-0">
        {meetingLabel(meeting.number, meeting.date)}
      </h3>
      <TopicList topics={topics} empty="Nenhum tópico nesta aula." />
    </section>
  );
}
