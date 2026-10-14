"use client";

import type { Room } from "@repo/contracts";
import { Send } from "lucide-react";
import { type ReactNode, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { messageForError } from "@/lib/messages/error-messages";
import { useApplyAttendance, useRoom } from "../hooks/use-attendance";
import {
  ATTENDANCE_HINT,
  ATTENDANCE_TITLE,
  attendanceDelta,
  attendanceSummary,
  MARK_ALL,
  NO_STUDENTS,
  RELEASE_TO_PRESENT,
  releaseNotice,
  releaseQuestion,
  type ReleasedItem,
  selectedLabel,
  UNMARK_ALL,
} from "../schemas/attendance";
import { RoomPanel } from "./room-panel";

export interface AttendanceTabProps {
  classId: string;
  activityId: string;
  /** 018: an exam shows its own room panel (with the time and the holds) after the first release. */
  renderRoom?: (room: Room) => ReactNode;
  /** 018: what the release confirmation names (default the 016 work). */
  item?: ReleasedItem;
}

/**
 * The "Chamada" of a `PRESENT_ONLY` work (016 contracts/web-ui.md): before the first release a
 * checklist of the class with "Marcar todos", "Desmarcar todos", the counter and "Liberar para os
 * presentes" (confirmed); afterwards the room panel (`RoomPanel`), refreshed every 5 s. The checkboxes
 * are only a draft until the batch, which sends the differences (research M5).
 */
export function AttendanceTab({ classId, activityId, renderRoom, item = "WORK" }: AttendanceTabProps) {
  const query = useRoom(classId, activityId);

  let body;
  if (query.isPending) {
    body = (
      <div aria-busy="true">
        <span className="sr-only">Carregando a chamada…</span>
        <Skeleton className="h-24 w-full" />
      </div>
    );
  } else if (query.isError) {
    body = (
      <div role="alert" className="flex flex-col gap-2">
        <p className="m-0">{messageForError(query.error)}</p>
        <Button type="button" variant="secondary" className="w-fit" onClick={() => void query.refetch()}>
          Tentar novamente
        </Button>
      </div>
    );
  } else if (query.data.students.length === 0) {
    body = <p className="m-0">{NO_STUDENTS}</p>;
  } else if (query.data.present === 0) {
    body = <AttendanceChecklist classId={classId} activityId={activityId} item={item} room={query.data} />;
  } else {
    body = renderRoom ? renderRoom(query.data) : <RoomPanel classId={classId} activityId={activityId} room={query.data} />;
  }

  return (
    <section aria-labelledby="chamada-titulo" className="flex flex-col gap-2">
      <h3 id="chamada-titulo" className="m-0 text-h3">
        {ATTENDANCE_TITLE}
      </h3>
      {query.data && query.data.students.length > 0 ? <p className="m-0">{attendanceSummary(query.data)}</p> : null}
      {body}
    </section>
  );
}

function AttendanceChecklist({ classId, activityId, room, item }: { classId: string; activityId: string; room: Room; item: ReleasedItem }) {
  const apply = useApplyAttendance(classId, activityId);
  const marked = new Set(room.students.flatMap((row) => (row.markedAt ? [row.studentUserId] : [])));
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set(marked));
  const [error, setError] = useState<string | null>(null);
  const delta = attendanceDelta(marked, selected);

  const toggle = (id: string, on: boolean) =>
    setSelected((current) => {
      const next = new Set(current);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  const release = async () => {
    if (!delta) return;
    setError(null);
    try {
      await apply.mutateAsync(delta);
    } catch (caught) {
      setError(messageForError(caught));
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="m-0">{ATTENDANCE_HINT}</p>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="secondary" onClick={() => setSelected(new Set(room.students.map((row) => row.studentUserId)))}>
          {MARK_ALL}
        </Button>
        <Button type="button" variant="secondary" onClick={() => setSelected(new Set())}>
          {UNMARK_ALL}
        </Button>
        <p role="status" className="m-0">
          {selectedLabel(selected.size, room.students.length)}
        </p>
      </div>
      <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
        <legend className="sr-only">Alunos presentes</legend>
        {room.students.map((row) => {
          const id = `chamada-${row.studentUserId}`;
          return (
            <div key={row.studentUserId} className="flex items-center gap-2">
              <Checkbox id={id} checked={selected.has(row.studentUserId)} onChange={(event) => toggle(row.studentUserId, event.target.checked)} />
              <Label htmlFor={id}>{row.name}</Label>
            </div>
          );
        })}
      </fieldset>
      {error ? (
        <p role="alert" className="m-0 text-danger-text">
          {error}
        </p>
      ) : null}
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button type="button" className="w-fit" disabled={selected.size === 0 || apply.isPending}>
            <Send aria-hidden="true" />
            {RELEASE_TO_PRESENT}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{releaseQuestion(selected.size, item)}</AlertDialogTitle>
            <AlertDialogDescription>{releaseNotice(item)}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction onClick={() => void release()}>Liberar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
