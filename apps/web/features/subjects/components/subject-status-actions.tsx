"use client";

import type { SubjectStatus, SubjectView } from "@repo/contracts";
import { useState } from "react";
import { ErrorSummary, type FormError } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { messageForError } from "@/lib/messages/error-messages";
import { useChangeSubjectStatus } from "../hooks/use-subjects";

const DONE: Record<SubjectStatus, string> = {
  ACTIVE: "Disciplina reativada.",
  INACTIVE: "Disciplina desativada.",
};

/**
 * Desativar / Reativar a subject (004/US1-6). Deactivating only stops offering it for new
 * classes; existing classes and plans stay as they are, so no confirmation is needed.
 */
export function SubjectStatusActions({ subject }: { subject: SubjectView }) {
  const change = useChangeSubjectStatus(subject.id);
  const [errors, setErrors] = useState<FormError[]>([]);
  const [announcement, setAnnouncement] = useState("");
  const to: SubjectStatus = subject.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";

  const run = async () => {
    if (change.isPending) return;
    setErrors([]);
    try {
      await change.mutateAsync(to);
      setAnnouncement(DONE[to]);
    } catch (error) {
      setErrors([{ message: messageForError(error) }]);
    }
  };

  return (
    <div>
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
      <ErrorSummary errors={errors} title="Não foi possível alterar a situação" />
      <Button type="button" variant="secondary" aria-busy={change.isPending || undefined} onClick={() => void run()}>
        {to === "INACTIVE" ? "Desativar" : "Reativar"}
      </Button>
    </div>
  );
}
