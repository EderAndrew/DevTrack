"use client";

import { MessageSquarePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SEND_FEEDBACK } from "../schemas/feedback-form";
import { FeedbackDialog } from "./feedback-dialog";

/**
 * "Enviar feedback" at the bottom of the student menu (020 contracts/web-ui.md): a link-style button
 * that keeps its name when the menu is collapsed to icons, and opens `FeedbackDialog`.
 */
export function SendFeedbackButton() {
  return (
    <FeedbackDialog
      trigger={
        <Button type="button" variant="link" className="group-data-[collapsible=icon]:px-2 group-data-[collapsible=icon]:[&>span]:sr-only">
          <MessageSquarePlus aria-hidden="true" />
          <span>{SEND_FEEDBACK}</span>
        </Button>
      }
    />
  );
}
