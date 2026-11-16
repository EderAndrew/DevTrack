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
  /** The address named a class the student can't see: the notice above the card (026/FR-011). */
  unavailable: boolean;
  onChange: (classId: string) => void;
}

/**
 * The "Matéria" card of the Painel and "Minhas atividades" (026, contracts/ui.md "SubjectSwitcher"): the subject being
 * viewed, written as text, and a native select to switch it (the same control as the 012 filters). The page decides
 * what a switch does (the address).
 */
export function SubjectSwitcher({ options, currentId, unavailable, onChange }: SubjectSwitcherProps) {
  return (
    <div className="flex flex-col gap-3">
      {unavailable ? (
        <Alert variant="info">
          <AlertTitle>{SUBJECT_UNAVAILABLE}</AlertTitle>
        </Alert>
      ) : null}
      <div className="flex flex-wrap items-center gap-4 rounded-lg border border-border bg-card p-4 text-card-foreground shadow-sm">
        <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary-subtle text-primary">
          <BookOpen className="size-5" />
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
    </div>
  );
}
