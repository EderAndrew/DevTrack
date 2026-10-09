"use client";

import type { TeacherActivitySummary } from "@repo/contracts";
import type { ComponentProps } from "react";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { WORK_OPTION_TEXTS, WORK_OPTIONS_LEGEND, WORK_OPTIONS_LOCKED, workOptionBadges } from "../schemas/activity-form";

type RegisteredBox = Omit<ComponentProps<"input">, "id" | "type">;

export interface WorkOptionsFieldsetProps {
  /** Prefix of the boxes' ids: `<prefix>-modo-controlado`, `<prefix>-ajuda-ia`. */
  idPrefix: string;
  controlled: RegisteredBox;
  aiHelp: RegisteredBox;
  /** Why the help can't be turned on (FR-004), or null; shown while the check is still pending too. */
  helpUnavailable: string | null;
  /** The activity already has the help: it can be turned off even when unavailable. */
  aiHelpOn?: boolean;
  /** A student started: neither option changes any more (FR-005). */
  locked?: boolean;
}

const describedBy = (...ids: (string | false)[]) => ids.filter(Boolean).join(" ") || undefined;

/**
 * "Como os alunos respondem" (015 contracts/web-ui.md): "Modo controlado" and "Ajuda da IA", each
 * with what the student will see. The help is disabled with its reason while unavailable, and both
 * are locked with the reason once a student started. The server decides either way.
 */
export function WorkOptionsFieldset({ idPrefix, controlled, aiHelp, helpUnavailable, aiHelpOn = false, locked = false }: WorkOptionsFieldsetProps) {
  const ids = {
    controlled: `${idPrefix}-modo-controlado`,
    aiHelp: `${idPrefix}-ajuda-ia`,
    locked: `${idPrefix}-opcoes-travadas`,
    unavailable: `${idPrefix}-ajuda-indisponivel`,
  };
  const showUnavailable = !locked && helpUnavailable !== null;
  return (
    <fieldset className="m-0 mb-4 flex flex-col gap-3 border-0 p-0">
      <legend className="mb-2 text-label text-foreground">{WORK_OPTIONS_LEGEND}</legend>
      {locked ? (
        <p id={ids.locked} className="m-0 text-text-secondary">
          {WORK_OPTIONS_LOCKED}
        </p>
      ) : null}
      <Option
        id={ids.controlled}
        texts={WORK_OPTION_TEXTS.controlled}
        disabled={locked}
        extraDescription={locked && ids.locked}
        box={controlled}
      />
      <Option
        id={ids.aiHelp}
        texts={WORK_OPTION_TEXTS.aiHelp}
        disabled={locked || (helpUnavailable !== null && !aiHelpOn)}
        extraDescription={locked ? ids.locked : showUnavailable && ids.unavailable}
        box={aiHelp}
      />
      {showUnavailable ? (
        <p id={ids.unavailable} className="m-0 text-text-secondary">
          {helpUnavailable}
        </p>
      ) : null}
    </fieldset>
  );
}

function Option({
  id,
  texts,
  disabled,
  extraDescription,
  box,
}: {
  id: string;
  texts: { label: string; description: string };
  disabled: boolean;
  extraDescription: string | false;
  box: RegisteredBox;
}) {
  const descriptionId = `${id}-descricao`;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <Checkbox id={id} disabled={disabled} aria-describedby={describedBy(descriptionId, extraDescription)} {...box} />
        <Label htmlFor={id}>{texts.label}</Label>
      </div>
      <p id={descriptionId} className="m-0 text-text-secondary">
        {texts.description}
      </p>
    </div>
  );
}

/** The options turned on, as text badges (015/FR-006); nothing for a normal activity without help. */
export function WorkOptionBadges({ activity }: { activity: Pick<TeacherActivitySummary, "executionMode" | "aiHelp"> }) {
  const badges = workOptionBadges(activity);
  if (badges.length === 0) return null;
  return (
    <ul aria-label={WORK_OPTIONS_LEGEND} className="m-0 flex list-none flex-wrap gap-2 p-0">
      {badges.map((badge) => (
        <li key={badge}>
          <Badge variant="info">{badge}</Badge>
        </li>
      ))}
    </ul>
  );
}
