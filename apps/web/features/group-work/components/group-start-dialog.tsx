"use client";

import type { StartAttemptRequest } from "@repo/contracts";
import { useState } from "react";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { messageForError } from "@/lib/messages/error-messages";
import { unavailableIds } from "../api/group-work-api";
import { useGroupCandidates } from "../hooks/use-group-candidates";
import {
  CANDIDATES_LEGEND,
  chosenCount,
  CONTINUE_ALONE,
  GROUP_START_TITLE,
  groupStartMessage,
  LOADING_CANDIDATES,
  NO_CANDIDATES,
  START_IN_GROUP,
  unavailableMessage,
} from "../schemas/group-work";

export interface GroupStartDialogProps {
  activityId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Starts the attempt; a rejection keeps the dialog open with its reason. */
  onStart: (body: StartAttemptRequest) => Promise<void>;
}

/**
 * "Iniciar" on a group work (023 US2, contracts/web-ui.md): the eligible classmates by name with "n de N",
 * the unchecked boxes disabled at the limit, "Iniciar em grupo" with at least one and "Continuar sozinho".
 * A `409 GROUP_MEMBERS_UNAVAILABLE` reads the list again and names who left; the server decides.
 */
export function GroupStartDialog({ activityId, open, onOpenChange, onStart }: GroupStartDialogProps) {
  const candidates = useGroupCandidates(activityId, open);
  const [chosen, setChosen] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const slots = candidates.data?.freeSlots ?? 0;
  const list = candidates.data?.candidates ?? [];
  const toggle = (id: string) => setChosen((current) => (current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]));

  const start = async (body: StartAttemptRequest) => {
    setBusy(true);
    setError(null);
    try {
      await onStart(body);
    } catch (caught) {
      const gone = unavailableIds(caught);
      if (gone.length > 0) {
        const names = list.filter((candidate) => gone.includes(candidate.id)).map((candidate) => candidate.name);
        setChosen((current) => current.filter((id) => !gone.includes(id)));
        setError(unavailableMessage(names));
        await candidates.refetch();
      } else {
        setError(messageForError(caught));
      }
    } finally {
      setBusy(false);
    }
  };

  // The request goes in the list's order (by name), whatever the order of the clicks.
  const memberIds = list.filter((candidate) => chosen.includes(candidate.id)).map((candidate) => candidate.id);

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{GROUP_START_TITLE}</DialogTitle>
          <DialogDescription>{candidates.data ? groupStartMessage(slots) : LOADING_CANDIDATES}</DialogDescription>
        </DialogHeader>
        {candidates.isError ? (
          <Alert variant="danger">
            <AlertTitle>{messageForError(candidates.error)}</AlertTitle>
          </Alert>
        ) : null}
        {candidates.data && list.length === 0 ? <p className="m-0 text-body">{NO_CANDIDATES}</p> : null}
        {list.length > 0 ? (
          <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
            <legend className="mb-2 flex w-full justify-between gap-4 text-label text-foreground">
              <span>{CANDIDATES_LEGEND}</span>
              <span aria-live="polite">{chosenCount(memberIds.length, slots)}</span>
            </legend>
            {list.map((candidate) => {
              const id = `colega-${candidate.id}`;
              const checked = chosen.includes(candidate.id);
              return (
                <div key={candidate.id} className="flex items-center gap-2">
                  <Checkbox
                    id={id}
                    checked={checked}
                    disabled={busy || (!checked && memberIds.length >= slots)}
                    onChange={() => toggle(candidate.id)}
                  />
                  <Label htmlFor={id}>{candidate.name}</Label>
                </div>
              );
            })}
          </fieldset>
        ) : null}
        {error ? (
          <Alert variant="danger" role="alert">
            <AlertTitle>{error}</AlertTitle>
          </Alert>
        ) : null}
        <DialogFooter>
          {list.length > 0 ? (
            <Button type="button" onClick={() => void start({ memberIds })} disabled={memberIds.length === 0 || busy} loading={busy}>
              {START_IN_GROUP}
            </Button>
          ) : null}
          <Button type="button" variant="outline" onClick={() => void start({ alone: true })} disabled={busy || !candidates.data}>
            {CONTINUE_ALONE}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
