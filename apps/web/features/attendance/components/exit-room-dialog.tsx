"use client";

import type { DeclareExit, StudentPauseReason } from "@repo/contracts";
import { useState } from "react";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form-field";
import { Radio, RadioGroup } from "@/components/ui/radio";
import { Textarea } from "@/components/ui/textarea";
import { formatLongDateTime } from "@/lib/messages/dates";
import { messageForError } from "@/lib/messages/error-messages";
import { useOnline } from "../hooks/use-my-pause";
import {
  CONFIRM_EXIT,
  EXIT_NOTE_LABEL,
  EXIT_OFFLINE,
  EXIT_ROOM,
  EXIT_ROOM_NOTICE,
  EXIT_ROOM_REASONS,
  PAUSE_NOTE_MAX_LENGTH,
  PAUSE_REASON_LABELS,
  STUDENT_PAUSE_REASONS,
} from "../schemas/attendance";

export interface ExitRoomDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The activity's deadline, a reminder that it keeps running (FR-015). */
  deadline: string | null;
  /** Saves what is pending and pauses; a rejection keeps the dialog open with its reason. */
  onConfirm: (body: DeclareExit) => Promise<void>;
}

/**
 * "Sair da sala" (016 US3-1, FR-011, contracts/web-ui.md): the closed list of reasons, "Outro" with an
 * optional text of up to 200 characters, the notice that the activity stays paused until the teacher
 * releases the return while the deadline keeps running, and the confirmation by an explicit action.
 * The exit needs the server: without a connection the student is told to warn the teacher instead.
 */
export function ExitRoomDialog({ open, onOpenChange, deadline, onConfirm }: ExitRoomDialogProps) {
  const online = useOnline();
  const [reason, setReason] = useState<StudentPauseReason | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    if (!reason) return;
    const text = note.trim();
    setBusy(true);
    setError(null);
    try {
      await onConfirm(reason === "OTHER" && text ? { reason, note: text } : { reason });
    } catch (caught) {
      setError(messageForError(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{EXIT_ROOM}</DialogTitle>
          <DialogDescription>{EXIT_ROOM_NOTICE}</DialogDescription>
        </DialogHeader>
        {deadline ? <p className="m-0 text-body-sm">Prazo: {formatLongDateTime(deadline)}</p> : null}
        <RadioGroup legend={EXIT_ROOM_REASONS}>
          {STUDENT_PAUSE_REASONS.map((option) => (
            <label key={option} className="flex items-center gap-2 text-body">
              <Radio name="motivo-saida" value={option} checked={reason === option} onChange={() => setReason(option)} disabled={busy} />
              {PAUSE_REASON_LABELS[option]}
            </label>
          ))}
        </RadioGroup>
        {reason === "OTHER" ? (
          <FormField id="motivo-saida-texto" label={EXIT_NOTE_LABEL} className="mb-0">
            {(control) => (
              <Textarea {...control} value={note} maxLength={PAUSE_NOTE_MAX_LENGTH} onChange={(event) => setNote(event.target.value)} disabled={busy} />
            )}
          </FormField>
        ) : null}
        {error ? (
          <Alert variant="danger" role="alert">
            <AlertTitle>{error}</AlertTitle>
          </Alert>
        ) : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancelar
          </Button>
          {online ? (
            <Button type="button" onClick={() => void confirm()} disabled={reason === null} loading={busy}>
              {CONFIRM_EXIT}
            </Button>
          ) : (
            <p role="status" className="m-0 text-body-sm text-danger-text">
              {EXIT_OFFLINE}
            </p>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
