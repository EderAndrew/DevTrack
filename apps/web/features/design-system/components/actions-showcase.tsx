"use client";

import { Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sample, Showcase } from "./sample";

const VARIANTS = [
  ["primary", "Salvar"],
  ["secondary", "Salvar rascunho"],
  ["outline", "Cancelar"],
  ["ghost", "Ver detalhes"],
  ["danger", "Excluir turma"],
  ["link", "Reenviar convite"],
] as const;

export function ButtonShowcase() {
  return (
    <Showcase id="button">
      {VARIANTS.map(([variant, label]) => (
        <Sample key={variant} name={variant}>
          <Button type="button" variant={variant}>
            {label}
          </Button>
        </Sample>
      ))}
      <Sample name="com ícone">
        <Button type="button">
          <Plus aria-hidden="true" />
          Nova turma
        </Button>
      </Sample>
      <Sample name="pequeno">
        <Button type="button" size="sm" variant="outline">
          Filtrar
        </Button>
      </Sample>
      <Sample name="só ícone">
        <Button type="button" size="icon" variant="ghost" aria-label="Editar tópico">
          <Pencil aria-hidden="true" />
        </Button>
      </Sample>
      <Sample name="desabilitado">
        <Button type="button" disabled>
          Salvar
        </Button>
        <Button type="button" variant="danger" disabled>
          Excluir turma
        </Button>
      </Sample>
      <Sample name="carregando">
        <Button type="button" loading>
          Salvando…
        </Button>
      </Sample>
    </Showcase>
  );
}
