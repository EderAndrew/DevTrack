"use client";

import { FeedbackCategorySchema, FeedbackStatusSchema } from "@repo/contracts";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime } from "@/lib/messages/dates";
import { messageForError } from "@/lib/messages/error-messages";
import { useAdminFeedbacks } from "../hooks/use-admin-feedbacks";
import { ADMIN_FEEDBACKS_PATH, type AdminFeedbackFilters, filtersHref, NO_FEEDBACKS, STATUS_LABELS } from "../schemas/admin-feedback";
import { CATEGORY_LABELS } from "../schemas/feedback-form";
import { FeedbackCategoryBadge, FeedbackStatusBadge } from "./feedback-badges";

const ALL = "";

/**
 * The ADMIN's feedbacks (020 US2, contracts/web-ui.md): newest first, 50 at a time with "Carregar
 * mais", filtered by status and category on the server. The filters live in the URL
 * (`?situacao=&categoria=`), so a reload or a shared link keeps them. The excerpt is text, never HTML.
 */
export function AdminFeedbackList({ initialFilters }: { initialFilters: AdminFeedbackFilters }) {
  const router = useRouter();
  const [filters, setFilters] = useState(initialFilters);
  const feedbacks = useAdminFeedbacks(filters);
  const items = feedbacks.data?.pages.flatMap((page) => page.items) ?? [];

  const change = (next: AdminFeedbackFilters) => {
    setFilters(next);
    router.replace(filtersHref(next), { scroll: false });
  };

  return (
    <div>
      <form aria-label="Filtrar feedbacks" className="mb-4 flex flex-wrap items-end gap-4" onSubmit={(event) => event.preventDefault()}>
        <div className="flex flex-col gap-1">
          <Label htmlFor="feedback-situacao">Situação</Label>
          <NativeSelect
            id="feedback-situacao"
            className="w-48"
            value={filters.status ?? ALL}
            onChange={(event) => change({ ...filters, status: FeedbackStatusSchema.safeParse(event.target.value).data })}
          >
            <option value={ALL}>Todas</option>
            {FeedbackStatusSchema.options.map((status) => (
              <option key={status} value={status}>
                {STATUS_LABELS[status]}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="feedback-categoria">Categoria</Label>
          <NativeSelect
            id="feedback-categoria"
            className="w-48"
            value={filters.category ?? ALL}
            onChange={(event) => change({ ...filters, category: FeedbackCategorySchema.safeParse(event.target.value).data })}
          >
            <option value={ALL}>Todas</option>
            {FeedbackCategorySchema.options.map((category) => (
              <option key={category} value={category}>
                {CATEGORY_LABELS[category]}
              </option>
            ))}
          </NativeSelect>
        </div>
      </form>

      <p className="sr-only" aria-live="polite">
        {feedbacks.isSuccess && !feedbacks.isFetching ? `${items.length} feedback(s) listado(s).` : ""}
      </p>

      {feedbacks.isPending ? (
        <div aria-busy="true" className="flex flex-col gap-2">
          <span className="sr-only">Carregando feedbacks…</span>
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : feedbacks.isError && items.length === 0 ? (
        <div role="alert">
          <p>{messageForError(feedbacks.error)}</p>
          <Button type="button" variant="secondary" onClick={() => void feedbacks.refetch()}>
            Tentar novamente
          </Button>
        </div>
      ) : items.length === 0 ? (
        <p>{NO_FEEDBACKS}</p>
      ) : (
        <Table className="mb-6">
          <TableCaption className="sr-only">Feedbacks dos alunos</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Categoria</TableHead>
              <TableHead scope="col">Situação</TableHead>
              <TableHead scope="col">Mensagem</TableHead>
              <TableHead scope="col">Aluno</TableHead>
              <TableHead scope="col">Enviado em</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id}>
                <TableCell>
                  <FeedbackCategoryBadge category={item.category} />
                </TableCell>
                <TableCell>
                  <FeedbackStatusBadge status={item.status} />
                </TableCell>
                <TableCell className="whitespace-pre-wrap break-words">
                  <Link href={`${ADMIN_FEEDBACKS_PATH}/${item.id}`}>{item.excerpt}</Link>
                </TableCell>
                <TableCell>{item.student.name}</TableCell>
                <TableCell>{formatDateTime(item.createdAt)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {feedbacks.isError && items.length > 0 ? <p role="alert">{messageForError(feedbacks.error)}</p> : null}
      {feedbacks.hasNextPage ? (
        <Button
          type="button"
          aria-busy={feedbacks.isFetchingNextPage || undefined}
          onClick={() => (feedbacks.isFetchingNextPage ? undefined : void feedbacks.fetchNextPage())}
        >
          Carregar mais
        </Button>
      ) : null}
    </div>
  );
}
