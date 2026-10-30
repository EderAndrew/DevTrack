"use client";

import type { StudentGroup } from "@repo/contracts";
import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { messageForError } from "@/lib/messages/error-messages";
import { useAddMembers } from "../hooks/use-add-members";
import { useGroupEditing } from "../hooks/use-group-editing";
import { GroupStartDialog } from "./group-start-dialog";
import {
  ADD_MEMBERS,
  EDITING_NOW,
  GROUP_LABEL,
  HAND_EDITING,
  HAND_TO_LABEL,
  LEADER_MARK,
  RETURN_EDITING,
  TAKE_BACK_EDITING,
} from "../schemas/group-work";

/**
 * 023 contracts/web-ui.md "Student: in the group": the members, the leader marked, and who edits now in
 * a `role="status"` region, above the questions on the normal and the focus page. Who edits comes from
 * the API (the effective editor); names render as text. While the attempt is `open` (US4, FR-013): the
 * leader passes the editing to a member or takes it back, and the member editing gives it back; whether an
 * action is accepted is the API's (a refusal shows its reason). The leader also opens "Incluir integrantes"
 * (US5, FR-016) while the group has free slots; hidden when full.
 */
export function GroupBar({ activityId, group, open }: { activityId: string; group: StudentGroup; open: boolean }) {
  const editing = useGroupEditing(activityId);
  const addMembers = useAddMembers(activityId);
  const [adding, setAdding] = useState(false);
  const members = group.members.map((member) => (member.id === group.leader.id ? `${member.name} ${LEADER_MARK}` : member.name)).join(", ");
  const leads = group.myRole === "LEADER";
  const receivers = group.members.filter((member) => member.id !== group.leader.id && member.id !== group.editor.id);
  const memberEditing = group.editor.id !== group.leader.id;
  return (
    <section aria-label={GROUP_LABEL} className="flex flex-col gap-3 rounded-md border border-border bg-surface p-4 text-body-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="m-0">
          <span className="text-text-secondary">{GROUP_LABEL}: </span>
          <span>{members}</span>
        </p>
        <p role="status" aria-label={EDITING_NOW} className="m-0">
          <span className="text-text-secondary">{EDITING_NOW}:</span> <span className="font-semibold">{group.editor.name}</span>
        </p>
      </div>
      {open && (leads || group.canEdit) ? (
        <div className="flex flex-wrap items-center gap-3">
          {leads && receivers.length > 0 ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="outline" size="sm" disabled={editing.isPending}>
                  {HAND_EDITING}
                  <ChevronDown aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuLabel>{HAND_TO_LABEL}</DropdownMenuLabel>
                {receivers.map((member) => (
                  <DropdownMenuItem key={member.id} onSelect={() => editing.mutate({ action: "HAND", toUserId: member.id })}>
                    {member.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
          {leads && memberEditing ? (
            <Button type="button" variant="outline" size="sm" loading={editing.isPending} onClick={() => editing.mutate({ action: "TAKE_BACK" })}>
              {TAKE_BACK_EDITING}
            </Button>
          ) : null}
          {leads && group.freeSlots > 0 ? (
            <Button type="button" variant="outline" size="sm" onClick={() => setAdding(true)}>
              {ADD_MEMBERS}
            </Button>
          ) : null}
          {!leads && group.canEdit ? (
            <Button type="button" variant="outline" size="sm" loading={editing.isPending} onClick={() => editing.mutate({ action: "RETURN" })}>
              {RETURN_EDITING}
            </Button>
          ) : null}
        </div>
      ) : null}
      {open && leads ? (
        <GroupStartDialog
          mode="add"
          activityId={activityId}
          open={adding}
          onOpenChange={setAdding}
          onStart={async (body) => {
            await addMembers.mutateAsync({ memberIds: body.memberIds ?? [] });
            setAdding(false);
          }}
        />
      ) : null}
      {editing.isError ? (
        <Alert variant="danger">
          <AlertTitle>{messageForError(editing.error)}</AlertTitle>
        </Alert>
      ) : null}
    </section>
  );
}
