"use client";

import { useEffect, useSyncExternalStore } from "react";
import { Radio, RadioGroup } from "@/components/ui/radio";

type CatalogTheme = "dark" | "light";

const OPTIONS: { value: CatalogTheme; label: string }[] = [
  { value: "dark", label: "Escuro" },
  { value: "light", label: "Claro" },
];

const currentTheme = (): CatalogTheme => (document.documentElement.dataset.theme === "light" ? "light" : "dark");

const setPageTheme = (theme: string | undefined) => {
  if (theme === undefined) delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
};

/** `<html data-theme>` as an external store, so the options follow it from the first client render. */
const subscribe = (onChange: () => void) => {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
};

/**
 * "Tema do catálogo" (022 FR-014, research Z9): shows every component in either theme by switching
 * `data-theme` on `<html>`, so portals (dialogs, menus, toasts) follow too. Only for this visit: nothing
 * is saved and the API is never called; leaving the catalog puts back the theme the page came with.
 */
export function CatalogThemeSwitch() {
  const theme = useSyncExternalStore(subscribe, currentTheme, () => "dark" as const);

  useEffect(() => {
    const initial = document.documentElement.dataset.theme;
    return () => setPageTheme(initial);
  }, []);

  return (
    <RadioGroup legend="Tema do catálogo" className="mb-8 flex-row flex-wrap gap-x-6">
      {OPTIONS.map((option) => (
        <label key={option.value} className="flex items-center gap-2 text-body">
          <Radio
            name="tema-do-catalogo"
            value={option.value}
            checked={theme === option.value}
            onChange={() => setPageTheme(option.value)}
          />
          {option.label}
        </label>
      ))}
    </RadioGroup>
  );
}
