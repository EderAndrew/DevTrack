"use client";

import {
  type WorkGenerationRequestStatus,
  type WorkGenerationRequestView,
  WorkQuestionTypeSchema,
} from "@repo/contracts";
import { Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Notice } from "@/components/shared/notice";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Status, type StatusVariant } from "@/components/ui/status";
import { messageForError } from "@/lib/messages/error-messages";
import {
  useRequestWorkGeneration,
  useWorkGenerationRequest,
  useWorkGenerationRequests,
} from "../hooks/use-works";
import {
  formatGrade,
  WORK_DIFFICULTY_LABELS,
  WORK_QUESTION_TYPE_LABELS,
} from "../schemas/work-form";
import { regenerationRequest } from "../schemas/work-generation-form";

const STATUS: Record<
  WorkGenerationRequestStatus,
  { label: string; variant: StatusVariant }
> = {
  PENDING: { label: "Gerando", variant: "info" },
  GENERATED: { label: "Gerado", variant: "success" },
  FAILED: { label: "Falhou", variant: "danger" },
  CANCELLED: { label: "Cancelado", variant: "neutral" },
};

const plural = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`;

/** "Intermediário · 10 questões (…) · 2 pegadinhas · Java · nota 2,00": the configuration in words. */
function configurationText(request: WorkGenerationRequestView): string {
  const counts = WorkQuestionTypeSchema.options
    .filter((type) => request.counts[type] > 0)
    .map((type) => `${WORK_QUESTION_TYPE_LABELS[type]} ${request.counts[type]}`)
    .join(" · ");
  return [
    WORK_DIFFICULTY_LABELS[request.difficulty],
    `${plural(request.total, "questão", "questões")} (${counts})`,
    request.trickQuestions > 0
      ? plural(request.trickQuestions, "pegadinha", "pegadinhas")
      : null,
    request.language?.name ?? null,
    `nota ${formatGrade(request.totalGrade)}`,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** "Pedir de novo" (011/FR-032): the same configuration, linked to `request`; opens the new one. */
function RequestAgainButton({
  request,
  label,
}: {
  request: WorkGenerationRequestView;
  label: string;
}) {
  const router = useRouter();
  const mutation = useRequestWorkGeneration();
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-1">
      <Button
        type="button"
        variant="secondary"
        aria-busy={mutation.isPending || undefined}
        disabled={mutation.isPending}
        onClick={async () => {
          setError(null);
          try {
            const created = await mutation.mutateAsync(
              regenerationRequest(request, idempotencyKey),
            );
            router.push(`/trabalhos/pedidos/${created.id}`);
          } catch (cause) {
            setError(messageForError(cause));
          }
        }}
      >
        {label}
      </Button>
      {error ? <p role="alert" className="m-0">{error}</p> : null}
    </div>
  );
}

/**
 * The teacher's generation requests (011 contracts/web-ui.md, `/trabalhos/pedidos`), newest first,
 * with the status in words (never by color alone), the configuration and the created work;
 * refreshed while one is still generating.
 */
export function WorkGenerationRequestsList() {
  const requests = useWorkGenerationRequests();
  const items = requests.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <>
      {requests.isError ? (
        <p role="alert">{messageForError(requests.error)}</p>
      ) : null}
      {requests.isSuccess && items.length === 0 ? (
        <EmptyState
          icon={Sparkles}
          title="Nenhum pedido de geração"
          description="Os trabalhos que você pedir à IA aparecem aqui."
          action={
            <Button asChild>
              <Link href="/trabalhos/gerar">Criar trabalho com IA</Link>
            </Button>
          }
        />
      ) : null}
      <ul className="m-0 flex list-none flex-col gap-4 p-0">
        {items.map((request) => (
          <li
            key={request.id}
            className="flex flex-col gap-2 rounded-md border border-border p-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="m-0 text-h3">
                <Link href={`/trabalhos/pedidos/${request.id}`}>
                  {request.title}
                </Link>
              </h2>
              <Status variant={STATUS[request.status].variant}>
                {STATUS[request.status].label}
              </Status>
            </div>
            <p className="m-0 text-text-secondary">
              {request.subject.name} · {configurationText(request)}
            </p>
            <p className="m-0 text-text-secondary">
              Tópicos:{" "}
              {request.topics.map((topic) => topic.itemText).join(", ")}
            </p>
            <div className="flex flex-wrap items-start gap-2">
              {request.workId ? (
                <Button asChild variant="ghost">
                  <Link href={`/trabalhos/${request.workId}`}>
                    Abrir trabalho
                  </Link>
                </Button>
              ) : null}
              {request.status !== "PENDING" ? (
                <RequestAgainButton request={request} label="Pedir de novo" />
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      {requests.hasNextPage ? (
        <div className="mt-4">
          <Button
            type="button"
            variant="secondary"
            onClick={() => void requests.fetchNextPage()}
            aria-busy={requests.isFetchingNextPage || undefined}
          >
            Carregar mais
          </Button>
        </div>
      ) : null}
    </>
  );
}

/**
 * One request (`/trabalhos/pedidos/[id]`): polled while PENDING; GENERATED links to the DRAFT
 * work; FAILED or CANCELLED says the generation didn't finish and offers "Tentar de novo".
 */
export function WorkGenerationRequestDetail({ id }: { id: string }) {
  const query = useWorkGenerationRequest(id);
  if (query.isError) return <p role="alert">{messageForError(query.error)}</p>;
  if (!query.data) return <p aria-busy="true">Carregando…</p>;
  const request = query.data;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="m-0 text-h3">{request.title}</h2>
        <Status variant={STATUS[request.status].variant}>
          {STATUS[request.status].label}
        </Status>
      </div>
      <div aria-live="polite">
        {request.status === "PENDING" ? (
          <Notice role="status">
            <p className="m-0">
              A IA está preparando o trabalho. Esta página se atualiza sozinha;
              o trabalho chega em rascunho para você revisar.
            </p>
          </Notice>
        ) : null}
        {request.status === "GENERATED" && request.workId ? (
          <Notice role="status">
            <p className="m-0">
              Trabalho gerado em rascunho.{" "}
              <Link href={`/trabalhos/${request.workId}`}>
                Abrir trabalho para revisar
              </Link>
            </p>
          </Notice>
        ) : null}
        {request.status === "FAILED" || request.status === "CANCELLED" ? (
          <Notice role="status">
            <p className="m-0">
              {request.status === "FAILED"
                ? "A geração falhou e nenhum trabalho foi criado."
                : "A geração foi cancelada e nenhum trabalho foi criado."}
            </p>
          </Notice>
        ) : null}
      </div>
      <dl className="m-0 grid gap-2">
        <div>
          <dt className="font-semibold">Disciplina</dt>
          <dd className="m-0">{request.subject.name}</dd>
        </div>
        <div>
          <dt className="font-semibold">Configuração</dt>
          <dd className="m-0">{configurationText(request)}</dd>
        </div>
        <div>
          <dt className="font-semibold">Tópicos</dt>
          <dd className="m-0">
            {request.topics.map((topic) => topic.itemText).join(", ")}
          </dd>
        </div>
        {request.description ? (
          <div>
            <dt className="font-semibold">Descrição</dt>
            <dd className="m-0">{request.description}</dd>
          </div>
        ) : null}
      </dl>
      {request.status === "FAILED" || request.status === "CANCELLED" ? (
        <div>
          <RequestAgainButton request={request} label="Tentar de novo" />
        </div>
      ) : null}
    </div>
  );
}
