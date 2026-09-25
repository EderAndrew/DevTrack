"use client";

import type { ClassMeetingView, TopicView } from "@repo/contracts";
import { ArrowDown, ArrowUp, Archive, CircleCheck, Pencil, RotateCcw, Split } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Checkbox } from "@/components/ui/checkbox";
import { meetingLabel } from "@/features/class-calendar/components/calendar-dates";
import { NO_MEETING } from "../schemas/topic-form";

/** Ids of a topic's buttons, so focus can come back to them after the list is redrawn. */
export const moveButtonId = (direction: "up" | "down", topicId: string) => `${direction === "up" ? "subir" : "descer"}-${topicId}`;

export interface TopicActionsProps {
  topic: TopicView;
  meetings: readonly ClassMeetingView[];
  /** Position of the topic in its list (its meeting or "Sem data") and the list's length. */
  index: number;
  count: number;
  selected: boolean;
  busy: boolean;
  /** Subir/Descer would swap the topic with a completed one (FR-057). */
  lockedUp: boolean;
  lockedDown: boolean;
  onEdit: () => void;
  onSplit: () => void;
  onArchive: () => void;
  onMove: (direction: "up" | "down") => void;
  onMeetingChange: (meetingId: string | null) => void;
  onSelect: (selected: boolean) => void;
}

/**
 * What the teacher can do with a topic (004/US6, FR-035 – FR-038, contracts/web-ui.md): Editar,
 * Subir, Descer, Aula, Dividir, Arquivar and the selection for "Juntar tópicos". A completed topic
 * keeps only Arquivar here (004/US9, FR-057); "Concluir aula" / "Reabrir aula" sit beside the title
 * (`TopicClassToggle`). Every change goes to the API; nothing is decided here.
 */
export function TopicActions({
  topic,
  meetings,
  index,
  count,
  selected,
  busy,
  lockedUp,
  lockedDown,
  onEdit,
  onSplit,
  onArchive,
  onMove,
  onMeetingChange,
  onSelect,
}: TopicActionsProps) {
  const selectId = `aula-${topic.id}`;
  const checkId = `juntar-${topic.id}`;
  const completed = topic.status === "COMPLETED";
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <Button type="button" variant="secondary" disabled={completed} onClick={onEdit} aria-label={`Editar ${topic.title}`}>
        <Pencil aria-hidden="true" />
        Editar
      </Button>
      <Button
        type="button"
        variant="secondary"
        id={moveButtonId("up", topic.id)}
        disabled={busy || completed || lockedUp || index === 0}
        onClick={() => onMove("up")}
        aria-label={`Subir ${topic.title}`}
      >
        <ArrowUp aria-hidden="true" />
        Subir
      </Button>
      <Button
        type="button"
        variant="secondary"
        id={moveButtonId("down", topic.id)}
        disabled={busy || completed || lockedDown || index === count - 1}
        onClick={() => onMove("down")}
        aria-label={`Descer ${topic.title}`}
      >
        <ArrowDown aria-hidden="true" />
        Descer
      </Button>
      <div className="flex items-center gap-2">
        <Label htmlFor={selectId}>Aula</Label>
        <NativeSelect
          id={selectId}
          aria-label={`Aula de ${topic.title}`}
          value={topic.meetingId ?? NO_MEETING}
          disabled={busy || completed}
          onChange={(event) => onMeetingChange(event.target.value || null)}
        >
          <option value={NO_MEETING}>Sem data</option>
          {meetings.map((meeting) => (
            <option key={meeting.id} value={meeting.id}>
              {meetingLabel(meeting.number, meeting.date)}
            </option>
          ))}
        </NativeSelect>
      </div>
      <Button type="button" variant="secondary" disabled={completed} onClick={onSplit} aria-label={`Dividir ${topic.title}`}>
        <Split aria-hidden="true" />
        Dividir
      </Button>
      <Button type="button" variant="secondary" disabled={busy} onClick={onArchive} aria-label={`Arquivar ${topic.title}`}>
        <Archive aria-hidden="true" />
        Arquivar
      </Button>
      <div className="flex min-h-11 items-center gap-2">
        <Checkbox
          id={checkId}
          aria-label={`Juntar ${topic.title}`}
          checked={selected && !completed}
          disabled={completed}
          onChange={(event) => onSelect(event.target.checked)}
        />
        <Label htmlFor={checkId} className="font-normal">
          Juntar
        </Label>
      </div>
    </div>
  );
}

export interface TopicClassToggleProps {
  topic: TopicView;
  busy: boolean;
  /** "Concluir aula" is offered: plan in progress and the topic's class day has come (UX only; the API decides). */
  completable: boolean;
  onComplete: () => void;
  onReopen: () => void;
}

/** "Concluir aula" or, on a completed topic, "Reabrir aula", beside the topic's title (004/US9, FR-056, FR-058). */
export function TopicClassToggle({ topic, busy, completable, onComplete, onReopen }: TopicClassToggleProps) {
  if (topic.status === "COMPLETED") {
    return (
      <Button type="button" variant="secondary" disabled={busy} onClick={onReopen} aria-label={`Reabrir aula de ${topic.title}`}>
        <RotateCcw aria-hidden="true" />
        Reabrir aula
      </Button>
    );
  }
  if (!completable) return null;
  return (
    <Button type="button" variant="secondary" disabled={busy} onClick={onComplete} aria-label={`Concluir aula de ${topic.title}`}>
      <CircleCheck aria-hidden="true" />
      Concluir aula
    </Button>
  );
}
