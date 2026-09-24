"use client";

import type { PlanCoverage } from "@repo/contracts";
import { useState } from "react";
import { fieldErrorId } from "@/components/shared";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Groups of syllabus items to choose from (the coverage's groups, or the items of one topic). */
export type ItemGroups = readonly { id: string; title: string | null; items: readonly { id: string; text: string }[] }[];

/** Lower case without accents, so "padroes" finds "Padrões". */
const normalize = (text: string) =>
  text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

/**
 * The groups of the plan's syllabus plus a group for the items `linked` has that are not in it
 * (kept after a syllabus switch, research E16), so editing never drops them silently.
 */
export function withLinkedItems(groups: PlanCoverage["groups"], linked: readonly { id: string; text: string }[]): ItemGroups {
  const known = new Set(groups.flatMap((group) => group.items.map((item) => item.id)));
  const outside = linked.filter((item, index) => !known.has(item.id) && linked.findIndex((other) => other.id === item.id) === index);
  return outside.length > 0 ? [...groups, { id: "fora-da-versao", title: "Fora da versão usada", items: outside }] : groups;
}

export interface ItemPickerProps {
  /** Prefix of the element ids; the search input is `<idPrefix>`. */
  idPrefix: string;
  groups: ItemGroups;
  value: readonly string[];
  onChange: (itemIds: string[]) => void;
  /** An API error about the items, linked to the search input. */
  error?: string;
  legend?: string;
}

/**
 * "Itens da ementa": checkboxes by group with a search that ignores accents; filtering keeps the
 * items already chosen (FR-034).
 */
export function ItemPicker({ idPrefix, groups, value, onChange, error, legend = "Itens da ementa" }: ItemPickerProps) {
  const [search, setSearch] = useState("");
  const query = normalize(search.trim());
  const shown = groups
    .map((group) => ({ ...group, items: group.items.filter((item) => normalize(item.text).includes(query)) }))
    .filter((group) => group.items.length > 0);
  const toggle = (id: string, checked: boolean) => onChange(checked ? [...value, id] : value.filter((other) => other !== id));

  return (
    <fieldset className="m-0 mb-4 flex flex-col gap-2 rounded-md border border-border p-3">
      <legend className="px-1 font-semibold">{legend}</legend>
      <Label htmlFor={idPrefix}>Buscar item da ementa</Label>
      <Input
        id={idPrefix}
        type="search"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? fieldErrorId(idPrefix) : undefined}
      />
      {error ? (
        <p id={fieldErrorId(idPrefix)} className="m-0 font-semibold text-destructive">
          {error}
        </p>
      ) : null}
      <p aria-live="polite" className="m-0 text-muted-foreground">
        {value.length === 1 ? "1 item marcado." : `${value.length} itens marcados.`}
      </p>
      {shown.length === 0 ? <p className="m-0">Nenhum item encontrado.</p> : null}
      <div className="flex max-h-72 flex-col gap-3 overflow-y-auto">
        {shown.map((group) => (
          <fieldset key={group.id} className="m-0 border-0 p-0">
            <legend className="font-semibold">{group.title ?? "Itens"}</legend>
            {group.items.map((item) => {
              const id = `${idPrefix}-${item.id}`;
              return (
                <div key={item.id} className="flex min-h-11 items-center gap-2">
                  <input
                    type="checkbox"
                    id={id}
                    checked={value.includes(item.id)}
                    onChange={(event) => toggle(item.id, event.target.checked)}
                    className="size-5 shrink-0"
                  />
                  <Label htmlFor={id} className="font-normal">
                    {item.text}
                  </Label>
                </div>
              );
            })}
          </fieldset>
        ))}
      </div>
    </fieldset>
  );
}
