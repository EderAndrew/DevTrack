import { randomUUID } from "node:crypto";
import type { CreateFeedbackRequest } from "@repo/contracts";
import type { api } from "./test-app";

type Client = ReturnType<typeof api>;

/** A valid 020 feedback body: a new `submissionId`, a PROBLEM from the Painel. */
export function feedbackBody(overrides: Record<string, unknown> = {}): CreateFeedbackRequest & Record<string, unknown> {
  return {
    submissionId: randomUUID(),
    category: "PROBLEM",
    message: "A página travou ao salvar a resposta.",
    originPath: "/painel",
    ...overrides,
  };
}

/** `POST /me/feedbacks` as the client's student. */
export function sendFeedback(client: Client, overrides: Record<string, unknown> = {}) {
  return client.post("/api/me/feedbacks", feedbackBody(overrides));
}
