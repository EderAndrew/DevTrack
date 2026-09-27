"use client";

import type { AiTaskPolicyView } from "@repo/contracts";
import { useId, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";

export interface AiTaskOverrideProps {
  task: AiTaskPolicyView;
  pending: boolean;
  onSet: (modelConfigKey: string) => void;
  onRemove: () => void;
}

/**
 * The administrator's override of a task's model (009/US7): "Fixar modelo" lists only the models
 * the API says may be fixed now (`overrideCandidates`), and "Remover modelo fixado" (danger) gives
 * the choice back to the policy; both are confirmed by an `AlertDialog` that says the consequence.
 */
export function AiTaskOverride({ task, pending, onSet, onRemove }: AiTaskOverrideProps) {
  const selectId = useId();
  const current = task.override?.modelConfigKey ?? null;
  const [choice, setChoice] = useState<string>("");
  const options = task.overrideCandidates;
  const selected = options.includes(choice) ? choice : (options.find((key) => key !== current) ?? options[0] ?? "");

  return (
    <div className="flex flex-wrap gap-2">
      {options.length > 0 ? (
        <AlertDialog onOpenChange={(open) => open && setChoice("")}>
          <AlertDialogTrigger asChild>
            <Button type="button" variant="secondary" aria-label={`Fixar modelo da tarefa ${task.key}`} aria-busy={pending || undefined} disabled={pending}>
              Fixar modelo
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Fixar um modelo para a tarefa {task.key}?</AlertDialogTitle>
              <AlertDialogDescription>
                As novas execuções da tarefa passam a usar o modelo escolhido enquanto ele estiver aprovado e habilitado. Só aparecem os modelos aprovados para a tarefa, no
                nível dela.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="flex flex-col gap-2">
              <Label htmlFor={selectId}>Modelo</Label>
              <NativeSelect id={selectId} value={selected} onChange={(event) => setChoice(event.target.value)}>
                {options.map((key) => (
                  <option key={key} value={key}>
                    {key === current ? `${key} (fixado agora)` : key}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={() => onSet(selected)}>Fixar</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
      {current ? (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button type="button" variant="danger" aria-label={`Remover modelo fixado da tarefa ${task.key}`} aria-busy={pending || undefined} disabled={pending}>
              Remover modelo fixado
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remover o modelo fixado da tarefa {task.key}?</AlertDialogTitle>
              <AlertDialogDescription>
                A tarefa deixa de usar {current} e volta à escolha da política: o modelo aprovado de menor custo no nível dela.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction variant="danger" onClick={onRemove}>
                Remover modelo fixado
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
      {options.length === 0 && !current ? <span className="text-text-secondary">Nenhum modelo elegível</span> : null}
    </div>
  );
}
