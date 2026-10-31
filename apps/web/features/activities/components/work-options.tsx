"use client";

import type { TeacherActivitySummary } from "@repo/contracts";
import type { ComponentProps } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Radio, RadioGroup } from "@/components/ui/radio";
import {
  CODE_RUNNER_UNAVAILABLE,
  GROUP_FORMAT_TEXTS,
  GROUP_SIZE_OPTIONS,
  WORK_OPTION_TEXTS,
  WORK_OPTIONS_LEGEND,
  WORK_OPTIONS_LOCKED,
  workOptionBadges,
} from "../schemas/activity-form";

type RegisteredBox = Omit<ComponentProps<"input">, "id" | "type">;
type RegisteredSelect = Omit<ComponentProps<"select">, "id">;

const describedBy = (...ids: (string | false)[]) => ids.filter(Boolean).join(" ") || undefined;

export interface GroupFormatFieldProps {
  /** Prefix of the controls' ids: `<prefix>-formato-individual`, `<prefix>-formato-grupo`, `<prefix>-max-integrantes`. */
  idPrefix: string;
  /** The registered `groupFormat` field, spread on both radios. */
  format: RegisteredBox;
  /** The registered `groupSize` field (2–5). */
  size: RegisteredSelect;
  /** "Em grupo" is chosen: the maximum is shown. */
  inGroup: boolean;
  /** A student started: the format doesn't change any more (023/FR-002, the 015 rule). */
  locked?: boolean;
  error?: string;
}

/**
 * "Formato" of a work (023 contracts/web-ui.md): "Individual" by default or "Em grupo" with the
 * maximum of participants, the leader included. Locked with the 015 reason once a student started;
 * the server decides either way.
 */
export function GroupFormatField({ idPrefix, format, size, inGroup, locked = false, error }: GroupFormatFieldProps) {
  const ids = {
    individual: `${idPrefix}-formato-individual`,
    group: `${idPrefix}-formato-grupo`,
    size: `${idPrefix}-max-integrantes`,
    locked: `${idPrefix}-formato-travado`,
    error: `${idPrefix}-max-integrantes-erro`,
  };
  const describedByLocked = locked ? ids.locked : undefined;
  return (
    <RadioGroup legend={GROUP_FORMAT_TEXTS.legend} className="mb-4" aria-describedby={describedByLocked}>
      {locked ? (
        <p id={ids.locked} className="m-0 text-text-secondary">
          {WORK_OPTIONS_LOCKED}
        </p>
      ) : null}
      <div className="flex items-center gap-2">
        <Radio id={ids.individual} value="INDIVIDUAL" disabled={locked} {...format} />
        <Label htmlFor={ids.individual}>{GROUP_FORMAT_TEXTS.individual}</Label>
      </div>
      <div className="flex items-center gap-2">
        <Radio id={ids.group} value="GROUP" disabled={locked} {...format} />
        <Label htmlFor={ids.group}>{GROUP_FORMAT_TEXTS.group}</Label>
      </div>
      {inGroup ? (
        <div className="flex flex-col gap-1">
          <Label htmlFor={ids.size}>{GROUP_FORMAT_TEXTS.size}</Label>
          <NativeSelect
            id={ids.size}
            disabled={locked}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy(error ? ids.error : false, locked && ids.locked)}
            {...size}
          >
            {GROUP_SIZE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </NativeSelect>
          {error ? (
            <p id={ids.error} className="m-0 text-danger-text">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
    </RadioGroup>
  );
}

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
  /**
   * 021: "Permitir executar o código", only for a work with a runnable CODE question; `runnerDown`
   * shows the US2-6 notice, the box staying enabled.
   */
  codeExecution?: { box: RegisteredBox; runnerDown: boolean } | null;
}

/**
 * "Como os alunos respondem" (015 contracts/web-ui.md): "Modo controlado" and "Ajuda da IA", each
 * with what the student will see. The help is disabled with its reason while unavailable, and both
 * are locked with the reason once a student started. The server decides either way.
 */
export function WorkOptionsFieldset({
  idPrefix,
  controlled,
  aiHelp,
  helpUnavailable,
  aiHelpOn = false,
  locked = false,
  codeExecution = null,
}: WorkOptionsFieldsetProps) {
  const ids = {
    controlled: `${idPrefix}-modo-controlado`,
    aiHelp: `${idPrefix}-ajuda-ia`,
    codeExecution: `${idPrefix}-executar-codigo`,
    locked: `${idPrefix}-opcoes-travadas`,
    unavailable: `${idPrefix}-ajuda-indisponivel`,
    runnerDown: `${idPrefix}-execucao-indisponivel`,
  };
  const showRunnerDown = !locked && codeExecution?.runnerDown === true;
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
      {codeExecution ? (
        <Option
          id={ids.codeExecution}
          texts={WORK_OPTION_TEXTS.codeExecution}
          disabled={locked}
          extraDescription={locked ? ids.locked : showRunnerDown && ids.runnerDown}
          box={codeExecution.box}
        />
      ) : null}
      {showRunnerDown ? (
        <Alert variant="warning" id={ids.runnerDown}>
          <AlertDescription>{CODE_RUNNER_UNAVAILABLE}</AlertDescription>
        </Alert>
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

/** The options turned on, as text badges (015/FR-006, 021/FR-004, 023 "Em grupo (até N)"); nothing for a normal individual activity without help. */
export function WorkOptionBadges({
  activity,
}: {
  activity: Pick<TeacherActivitySummary, "type" | "executionMode" | "aiHelp" | "codeExecution" | "groupSize">;
}) {
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
