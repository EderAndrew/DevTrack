"use client";

import { BookOpen } from "lucide-react";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { ONLY_SUBJECT, SUBJECT_LABEL, SUBJECT_UNAVAILABLE } from "../schemas/student-activity";

export const SUBJECT_SELECT_ID = "materia-atual";

export interface SubjectSwitcherProps {
  options: { id: string; label: string }[];
  currentId: string;
  onChange: (classId: string) => void;
}

/**
 * The "Matéria" card of the Painel and "Minhas atividades" (026, contracts/ui.md "SubjectSwitcher"): a compact card in
 * the page header's actions, at the right of the title on wide screens, with the subject being viewed, written as text,
 * and a native select to switch it (the same control as the 012 filters). The page decides what a switch does (the
 * address).
 */
export function SubjectSwitcher({ options, currentId, onChange }: SubjectSwitcherProps) {
  return (
    <div className="flex w-full items-center gap-3 rounded-lg border border-border bg-card px-3 py-2 text-card-foreground shadow-sm md:w-80">
      <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary-subtle text-primary">
        <BookOpen className="size-4" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <Label htmlFor={SUBJECT_SELECT_ID}>{SUBJECT_LABEL}</Label>
        <NativeSelect
          id={SUBJECT_SELECT_ID}
          className="w-full"
          value={currentId}
          onChange={(event) => onChange(event.target.value)}
        >
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </NativeSelect>
        {options.length === 1 ? <span className="text-caption text-text-secondary">{ONLY_SUBJECT}</span> : null}
      </div>
    </div>
  );
}

/** The fallback notice (026/FR-011): the address named a class the student can't see; under the page header. */
export function SubjectUnavailableNotice() {
  return (
    <Alert variant="info">
      <AlertTitle>{SUBJECT_UNAVAILABLE}</AlertTitle>
    </Alert>
  );
}
