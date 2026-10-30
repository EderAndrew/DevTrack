"use client";

import type { UiTheme } from "@repo/contracts";
import { Moon, Sun } from "lucide-react";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { useUpdateTheme } from "../hooks/use-update-theme";
import { LIGHT_THEME_SWITCH } from "../schemas/appearance";

export interface AppearanceSettingsProps {
  /** The account's theme, as the page read it from `GET /me`. */
  theme: UiTheme;
}

/** The current theme's icon is the strong one; the switch's position and `aria-checked` carry the state too. */
const iconClasses = (current: boolean) => cn("size-5 shrink-0", current ? "text-foreground" : "text-text-secondary");

/**
 * The theme switch of "Meu perfil" (022 contracts/web-ui.md, amended 2026-10-30), given to the page's
 * `PageHeader` as `actions`: a moon (dark, off), the switch and a sun (light, on), with no visible text;
 * "Tema claro" is the switch's accessible name. Saved on the account.
 */
export function AppearanceSettings({ theme: initial }: AppearanceSettingsProps) {
  const { theme, choose, pending, failure } = useUpdateTheme(initial);
  const light = theme === "LIGHT";
  return (
    <div className="flex flex-col items-start gap-2 md:items-end">
      <div className="flex items-center gap-2">
        <Moon aria-hidden="true" data-theme-icon="dark" className={iconClasses(!light)} />
        <Switch
          aria-label={LIGHT_THEME_SWITCH}
          checked={light}
          disabled={pending}
          aria-busy={pending || undefined}
          onCheckedChange={(on) => choose(on ? "LIGHT" : "DARK")}
        />
        <Sun aria-hidden="true" data-theme-icon="light" className={iconClasses(light)} />
      </div>
      {failure ? (
        <Alert variant="danger" role="alert">
          <AlertTitle>{failure}</AlertTitle>
        </Alert>
      ) : null}
    </div>
  );
}
