import { MAILPIT_URL } from "../env.ts";

/** Summary returned by Mailpit's search (`/api/v1/search`). */
interface MailpitSummary {
  ID: string;
  Created: string;
}

const POLL_INTERVAL_MS = 250;
const DEFAULT_TIMEOUT_MS = 15_000;

async function mailpit<T>(path: string): Promise<T> {
  const response = await fetch(`${MAILPIT_URL}/api/v1/${path}`);
  if (!response.ok) throw new Error(`Mailpit respondeu ${response.status} em /api/v1/${path}.`);
  return (await response.json()) as T;
}

async function messagesTo(email: string): Promise<MailpitSummary[]> {
  const query = encodeURIComponent(`to:"${email}"`);
  const { messages } = await mailpit<{ messages: MailpitSummary[] }>(`search?query=${query}&limit=50`);
  return messages;
}

async function textOf(id: string): Promise<string> {
  return (await mailpit<{ Text: string }>(`message/${id}`)).Text;
}

export interface WaitForLinkOptions {
  /** Path of the link to pick, e.g. `/verificar-email`. */
  path: string;
  timeoutMs?: number;
}

/**
 * Waits for an e-mail to `email` carrying a link to `path` and returns that link. E-mails leave
 * the API after the commit, off the response path, hence the polling.
 */
export async function waitForLink(email: string, { path, timeoutMs = DEFAULT_TIMEOUT_MS }: WaitForLinkOptions): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    // Newest first: the latest link is the only valid one.
    const messages = (await messagesTo(email)).sort((a, b) => Date.parse(b.Created) - Date.parse(a.Created));
    for (const message of messages) {
      const link = (await textOf(message.ID))
        .match(/https?:\/\/\S+/g)
        ?.find((candidate) => new URL(candidate).pathname === path);
      if (link) return link;
    }
    if (Date.now() > deadline) throw new Error(`Nenhum e-mail para ${email} com link ${path} em ${timeoutMs} ms.`);
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

/** One message as Mailpit shows it: the Message-ID (without `<>`) and both bodies. */
export interface MailpitMessage {
  MessageID: string;
  HTML: string;
  Text: string;
}

/** All the messages to `email`, oldest first, with their bodies. */
export async function messagesFor(email: string): Promise<MailpitMessage[]> {
  const summaries = (await messagesTo(email)).sort((a, b) => Date.parse(a.Created) - Date.parse(b.Created));
  return Promise.all(summaries.map((summary) => mailpit<MailpitMessage>(`message/${summary.ID}`)));
}

/** Waits until `count` messages to `email` arrived and returns them, oldest first. */
export async function waitForMessages(email: string, count: number, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<MailpitMessage[]> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const messages = await messagesFor(email);
    if (messages.length >= count) return messages;
    if (Date.now() > deadline) throw new Error(`${messages.length} de ${count} e-mails para ${email} em ${timeoutMs} ms.`);
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}
