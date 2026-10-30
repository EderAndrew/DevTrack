"use client";

import type { AttemptParticipant, TeacherAttemptGroup, TeacherQuestion } from "@repo/contracts";
import { ChevronDown, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import { messageForError } from "@/lib/messages/error-messages";
import { useAttemptGroup } from "../hooks/use-activities";
import {
  earlierSavesLabel,
  eventText,
  GROUP_BADGE,
  GROUP_NOTE,
  GROUP_TITLE,
  groupName,
  HISTORY_TITLE,
  joinedText,
  MEMBERS_TITLE,
  NO_HISTORY,
  NO_SAVES,
  SAVES_TITLE,
  savedText,
} from "../schemas/group-facts";

/** "Ana Souza e mais 2" with the "Em grupo" badge (never color alone: the badge has its text). */
export function GroupLabel({ participants }: { participants: readonly AttemptParticipant[] }) {
  return (
    <>
      {groupName(participants)}{" "}
      <Badge variant="info">
        <Users aria-hidden="true" />
        {GROUP_BADGE}
      </Badge>
    </>
  );
}

/**
 * "Grupo" in the review of a group attempt (023 US6, FR-020, SC-005): the members with the time they joined
 * and who added them, the editing history in words and, per question, who saved last and when, with the
 * earlier saves in a `Collapsible`. Facts, never a verdict or a grade (US6-5).
 */
export function GroupFacts({
  classId,
  activityId,
  attemptId,
  questions,
}: {
  classId: string;
  activityId: string;
  attemptId: string;
  questions: readonly TeacherQuestion[];
}) {
  const query = useAttemptGroup(classId, activityId, attemptId, true);
  return (
    <section aria-labelledby="grupo-titulo" className="flex flex-col gap-3">
      <h3 id="grupo-titulo" className="m-0 text-h3">
        {GROUP_TITLE}
      </h3>
      <p className="m-0">{GROUP_NOTE}</p>
      {query.error ? (
        <p role="alert" className="m-0">
          {messageForError(query.error)}
        </p>
      ) : !query.data ? (
        <div aria-busy="true">
          <span className="sr-only">Carregando o grupo…</span>
          <Skeleton className="h-16 w-full" />
        </div>
      ) : (
        <Facts group={query.data} questions={questions} />
      )}
    </section>
  );
}

function Facts({ group, questions }: { group: TeacherAttemptGroup; questions: readonly TeacherQuestion[] }) {
  const names = new Map(group.members.map((member) => [member.id, member.name]));
  const nameOf = (id: string) => names.get(id) ?? "Aluno";
  const positionOf = new Map(questions.map((question) => [question.id, question.position]));
  return (
    <>
      <h4 className="m-0 text-body font-semibold">{MEMBERS_TITLE}</h4>
      <ul aria-label={MEMBERS_TITLE} className="m-0 flex list-none flex-col gap-1 p-0">
        {group.members.map((member) => (
          <li key={member.id}>
            {member.name}
            {member.id === group.leaderId ? " (líder)" : ""} — {joinedText(member.joinedAt, member.addedById && nameOf(member.addedById))}
          </li>
        ))}
      </ul>

      <h4 className="m-0 text-body font-semibold">{HISTORY_TITLE}</h4>
      {group.events.length === 0 ? (
        <p className="m-0">{NO_HISTORY}</p>
      ) : (
        <ol aria-label={HISTORY_TITLE} className="m-0 flex list-none flex-col gap-1 p-0">
          {group.events.map((event, index) => (
            <li key={`${event.occurredAt}-${index}`}>
              <time dateTime={event.occurredAt}>{eventText(event, nameOf)}</time>
            </li>
          ))}
        </ol>
      )}

      <h4 className="m-0 text-body font-semibold">{SAVES_TITLE}</h4>
      {group.saves.length === 0 ? (
        <p className="m-0">{NO_SAVES}</p>
      ) : (
        <ul aria-label={SAVES_TITLE} className="m-0 flex list-none flex-col gap-2 p-0">
          {group.saves.map(({ questionId, entries }) => {
            const last = entries.at(-1)!;
            const earlier = entries.slice(0, -1).reverse();
            const position = (positionOf.get(questionId) ?? 0) + 1;
            return (
              <li key={questionId} className="flex flex-col gap-1">
                <span>
                  Questão {position}: {savedText(nameOf(last.studentId), last.savedAt, last.revision)}
                </span>
                {earlier.length > 0 ? (
                  <Collapsible>
                    <CollapsibleTrigger
                      aria-label={`${earlierSavesLabel(earlier.length)} da questão ${position}`}
                      className="inline-flex items-center gap-1 text-body-sm underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                    >
                      <ChevronDown aria-hidden="true" className="size-4" />
                      {earlierSavesLabel(earlier.length)}
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <ul className="m-0 flex list-none flex-col gap-1 pl-4 pt-1">
                        {earlier.map((entry) => (
                          <li key={entry.revision} className="text-body-sm">
                            {savedText(nameOf(entry.studentId), entry.savedAt, entry.revision)}
                          </li>
                        ))}
                      </ul>
                    </CollapsibleContent>
                  </Collapsible>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
