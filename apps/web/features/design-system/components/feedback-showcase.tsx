"use client";

import { Archive, Inbox } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Sample, Showcase } from "./sample";

const MESSAGES = {
  info: ["Convite reenviado.", "O aluno recebe um novo link por e-mail."],
  success: ["Plano confirmado.", "Os alunos já veem as aulas da turma."],
  warning: ["Ementa com itens sem tópico.", "Revise a cobertura antes de confirmar o plano."],
  danger: ["Não foi possível salvar.", "Confira sua conexão e tente de novo."],
} as const;

const VARIANTS = ["info", "success", "warning", "danger"] as const;

export function AlertShowcase() {
  return (
    <Showcase id="alert">
      {VARIANTS.map((variant) => (
        <Sample key={variant} name={variant} className="block">
          {/* role="note": the samples are not live messages. */}
          <Alert variant={variant} role="note">
            <AlertTitle>{MESSAGES[variant][0]}</AlertTitle>
            <AlertDescription>{MESSAGES[variant][1]}</AlertDescription>
          </Alert>
        </Sample>
      ))}
    </Showcase>
  );
}

export function ToastShowcase() {
  const { toast } = useToast();
  return (
    <Showcase id="toast">
      {VARIANTS.map((variant) => (
        <Sample key={variant} name={variant}>
          <Button
            type="button"
            variant="outline"
            onClick={() => toast({ variant, title: MESSAGES[variant][0], description: MESSAGES[variant][1] })}
          >
            Mostrar notificação {variant}
          </Button>
        </Sample>
      ))}
    </Showcase>
  );
}

export function ProgressShowcase() {
  return (
    <Showcase id="progress">
      {(
        [
          ["vazio", 0],
          ["em andamento", 40],
          ["completo", 100],
        ] as const
      ).map(([state, value]) => (
        <Sample key={state} name={state} className="max-w-80">
          <Progress value={value} aria-label={`Cobertura da ementa: ${value}%`} />
        </Sample>
      ))}
    </Showcase>
  );
}

export function SpinnerShowcase() {
  return (
    <Showcase id="spinner">
      <Sample name="carregando">
        <Spinner label="Carregando turmas…" />
      </Sample>
      <Sample name="com texto">
        <Spinner label="Processando a ementa…" showLabel />
      </Sample>
    </Showcase>
  );
}

export function EmptyStateShowcase() {
  return (
    <Showcase id="empty-state">
      <Sample name="com ação" className="block">
        <EmptyState
          icon={Inbox}
          headingLevel="h3"
          title="Nenhuma turma ainda"
          description="Crie a primeira turma para convidar os alunos."
          action={<Button type="button">Nova turma</Button>}
        />
      </Sample>
      <Sample name="sem ação" className="block">
        <EmptyState
          icon={Archive}
          headingLevel="h3"
          title="Nenhum tópico arquivado"
          description="Os tópicos arquivados aparecem aqui."
        />
      </Sample>
    </Showcase>
  );
}

export function SkeletonShowcase() {
  return (
    <Showcase id="skeleton">
      <Sample name="carregando" className="block">
        <section aria-busy="true" aria-label="Carregando a lista de turmas" className="flex max-w-120 flex-col gap-3">
          <Skeleton className="h-6 w-1/2" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </section>
      </Sample>
    </Showcase>
  );
}

export function TooltipShowcase() {
  return (
    <Showcase id="tooltip">
      <Sample name="no foco ou no mouse">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" size="icon" variant="ghost" aria-label="Arquivar tópico">
                <Archive aria-hidden="true" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Arquivar tópico</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </Sample>
    </Showcase>
  );
}
