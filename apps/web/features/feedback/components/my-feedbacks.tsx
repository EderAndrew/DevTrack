"use client";

import { MessageSquarePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatMediumDate } from "@/lib/messages/dates";
import { messageForError } from "@/lib/messages/error-messages";
import { useMyFeedbacks } from "../hooks/use-my-feedbacks";
import { MY_FEEDBACKS_TITLE, NO_OWN_FEEDBACKS, SEND_FEEDBACK } from "../schemas/feedback-form";
import { FeedbackCategoryBadge, FeedbackStatusBadge } from "./feedback-badges";
import { FeedbackDialog } from "./feedback-dialog";

const sendButton = (
  <FeedbackDialog
    trigger={
      <Button type="button" variant="secondary">
        <MessageSquarePlus aria-hidden="true" />
        {SEND_FEEDBACK}
      </Button>
    }
  />
);

/**
 * "Meus feedbacks" (020 US3, contracts/web-ui.md): the student's own feedbacks, newest first, 50 at a
 * time with "Carregar mais" — category, day, status in words and the whole message as text, never
 * HTML. No history and no ADMIN name: the API never sends them. A new send refreshes the list.
 */
export function MyFeedbacks() {
  const feedbacks = useMyFeedbacks();
  const items = feedbacks.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div>{sendButton}</div>

      {feedbacks.isPending ? (
        <div aria-busy="true" className="flex flex-col gap-2">
          <span className="sr-only">Carregando feedbacks…</span>
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : feedbacks.isError && items.length === 0 ? (
        <div role="alert">
          <p>{messageForError(feedbacks.error)}</p>
          <Button type="button" variant="secondary" onClick={() => void feedbacks.refetch()}>
            Tentar novamente
          </Button>
        </div>
      ) : items.length === 0 ? (
        <p>{NO_OWN_FEEDBACKS}</p>
      ) : (
        <ul aria-label={MY_FEEDBACKS_TITLE} className="m-0 flex list-none flex-col gap-3 p-0">
          {items.map((item) => (
            <li key={item.id} className="flex flex-col gap-2 rounded-md border border-border bg-surface p-4">
              <div className="flex flex-wrap items-center gap-2">
                <FeedbackCategoryBadge category={item.category} />
                <FeedbackStatusBadge status={item.status} />
                <span className="text-body-sm text-muted-foreground">
                  Enviado em <time dateTime={item.createdAt}>{formatMediumDate(item.createdAt)}</time>
                </span>
              </div>
              <p className="m-0 whitespace-pre-wrap break-words">{item.message}</p>
            </li>
          ))}
        </ul>
      )}

      {feedbacks.isError && items.length > 0 ? <p role="alert">{messageForError(feedbacks.error)}</p> : null}
      {feedbacks.hasNextPage ? (
        <div>
          <Button
            type="button"
            aria-busy={feedbacks.isFetchingNextPage || undefined}
            onClick={() => (feedbacks.isFetchingNextPage ? undefined : void feedbacks.fetchNextPage())}
          >
            Carregar mais
          </Button>
        </div>
      ) : null}
    </div>
  );
}
