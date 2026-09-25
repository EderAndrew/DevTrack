"use client";

import type { AiProposalDecision, AiProposalStatus as AiProposalStatusValue } from "@repo/contracts";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { AiProposalStatus } from "./ai-proposal-status";

export interface AiProposalReviewItem {
  id: string;
  label: string;
  description?: string;
}

export interface AiProposalReviewProps {
  items: readonly AiProposalReviewItem[];
  status: AiProposalStatusValue;
  /** `acceptedIds` only with APPROVE_PARTIALLY. */
  onDecide: (decision: AiProposalDecision, acceptedIds?: string[]) => void;
  pending?: boolean;
}

interface Action {
  decision: AiProposalDecision;
  label: string;
  variant: "primary" | "secondary" | "danger";
  title: string;
  description: string;
}

/**
 * The base of an AI proposal review (006/US9-3): each item with a checkbox (all checked), and
 * "Aprovar tudo", "Aprovar selecionados" (only with a proper subset checked) and "Rejeitar", each
 * confirmed by an `AlertDialog`. Read-only once decided. The proposal comes from a model, so its
 * content is shown as text only, never as HTML. Approving records the decision; applying it is up
 * to the agent's own screen.
 */
export function AiProposalReview({ items, status, onDecide, pending = false }: AiProposalReviewProps) {
  const id = useId();
  const [checked, setChecked] = useState<ReadonlySet<string>>(() => new Set(items.map((item) => item.id)));
  const reviewing = status === "READY_FOR_REVIEW";
  const selected = items.filter((item) => checked.has(item.id)).map((item) => item.id);
  const partial = selected.length > 0 && selected.length < items.length;

  const toggle = (itemId: string, on: boolean) =>
    setChecked((current) => {
      const next = new Set(current);
      if (on) next.add(itemId);
      else next.delete(itemId);
      return next;
    });

  const actions: Action[] = [
    {
      decision: "APPROVE",
      label: "Aprovar tudo",
      variant: "primary",
      title: `Aprovar os ${items.length} itens da proposta?`,
      description: "A decisão fica registrada e não pode ser desfeita.",
    },
    ...(partial
      ? [
          {
            decision: "APPROVE_PARTIALLY" as const,
            label: "Aprovar selecionados",
            variant: "secondary" as const,
            title: `Aprovar ${selected.length} de ${items.length} itens?`,
            description: "Os itens não marcados ficam de fora. A decisão fica registrada e não pode ser desfeita.",
          },
        ]
      : []),
    {
      decision: "REJECT",
      label: "Rejeitar",
      variant: "danger",
      title: "Rejeitar a proposta?",
      description: "Nenhum item será aproveitado. A decisão fica registrada e não pode ser desfeita.",
    },
  ];

  return (
    <section aria-labelledby={`${id}-titulo`} data-slot="ai-proposal-review" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={`${id}-titulo`} className="m-0 text-h3">
          Proposta da IA
        </h3>
        <AiProposalStatus status={status} />
      </div>
      <ul className="m-0 flex list-none flex-col gap-3 p-0">
        {items.map((item) => {
          const inputId = `${id}-${item.id}`;
          const descriptionId = item.description ? `${inputId}-descricao` : undefined;
          return (
            <li key={item.id} className="flex items-start gap-3">
              {reviewing ? (
                <Checkbox
                  id={inputId}
                  checked={checked.has(item.id)}
                  disabled={pending}
                  aria-describedby={descriptionId}
                  onChange={(event) => toggle(item.id, event.target.checked)}
                  className="mt-px"
                />
              ) : null}
              <div className="flex flex-col gap-1">
                {reviewing ? <Label htmlFor={inputId}>{item.label}</Label> : <span className="text-label">{item.label}</span>}
                {item.description ? (
                  <p id={descriptionId} className="m-0 text-body-sm text-text-secondary">
                    {item.description}
                  </p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
      {reviewing ? (
        <div className="flex flex-wrap gap-3">
          {actions.map((action) => (
            <AlertDialog key={action.decision}>
              <AlertDialogTrigger asChild>
                <Button type="button" variant={action.variant} disabled={pending} aria-busy={pending || undefined}>
                  {action.label}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{action.title}</AlertDialogTitle>
                  <AlertDialogDescription>{action.description}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    variant={action.variant === "danger" ? "danger" : "default"}
                    onClick={() => onDecide(action.decision, action.decision === "APPROVE_PARTIALLY" ? selected : undefined)}
                  >
                    {action.label}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ))}
        </div>
      ) : null}
    </section>
  );
}
