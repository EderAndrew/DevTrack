"use client";

import type { UiTheme } from "@repo/contracts";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Radio, RadioGroup } from "@/components/ui/radio";
import { useUpdateTheme } from "../hooks/use-update-theme";
import { APPEARANCE_TITLE, THEME_LABELS, THEME_LEGEND, THEME_OPTIONS } from "../schemas/appearance";

export interface AppearanceSettingsProps {
  /** The account's theme, as the page read it from `GET /me`. */
  theme: UiTheme;
}

/** "Aparência" in "Meu perfil" (022 contracts/web-ui.md): Escuro or Claro, saved on the account. */
export function AppearanceSettings({ theme: initial }: AppearanceSettingsProps) {
  const { theme, choose, pending, failure } = useUpdateTheme(initial);
  return (
    <section aria-labelledby="aparencia">
      <h2 id="aparencia">{APPEARANCE_TITLE}</h2>
      <RadioGroup legend={THEME_LEGEND} disabled={pending} aria-busy={pending}>
        {THEME_OPTIONS.map((option) => (
          <label key={option} className="flex items-center gap-2 text-body">
            <Radio name="tema" value={option} checked={theme === option} onChange={() => choose(option)} />
            {THEME_LABELS[option]}
          </label>
        ))}
      </RadioGroup>
      {failure ? (
        <Alert variant="danger" role="alert" className="mt-4">
          <AlertTitle>{failure}</AlertTitle>
        </Alert>
      ) : null}
    </section>
  );
}
