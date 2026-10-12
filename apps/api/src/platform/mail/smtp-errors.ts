import { MailSendError } from "./mailer";

/** What nodemailer attaches to a failure: its code, the SMTP reply code and the command that got it. */
interface SmtpFailure {
  code?: unknown;
  responseCode?: unknown;
  command?: unknown;
}

/** Commands whose 5xx reply refuses this recipient or this message (017 research N8). */
const MESSAGE_COMMANDS = /^(RCPT TO|DATA)\b/;

/**
 * Classifies a nodemailer failure (017 research N8): a 5xx on `RCPT TO`/`DATA`, or a recipient the
 * client already refused, is permanent; credentials, timeouts, connections and 4xx are temporary,
 * and so is a 5xx elsewhere (`MAIL FROM`, `EHLO`: our configuration, not the e-mail). Only codes
 * leave this function, never the server's text.
 */
export function classifySmtpError(error: unknown): MailSendError {
  const failure = (typeof error === "object" && error !== null ? error : {}) as SmtpFailure;
  const code = typeof failure.code === "string" ? failure.code : "";
  const command = typeof failure.command === "string" ? failure.command : "";
  const reply = typeof failure.responseCode === "number" ? failure.responseCode : 0;

  if (code === "EAUTH" || command.startsWith("AUTH") || reply === 530 || reply === 535) return new MailSendError("EAUTH", false);
  if (reply >= 500 && MESSAGE_COMMANDS.test(command)) return new MailSendError(code === "EENVELOPE" ? "EENVELOPE" : "SMTP_5XX", true);
  if (code === "EENVELOPE" && (command === "API" || command === "")) return new MailSendError("EENVELOPE", true);
  if (reply >= 500) return new MailSendError("SMTP_5XX", false);
  if (reply >= 400) return new MailSendError("SMTP_4XX", false);
  if (code === "ETIMEDOUT") return new MailSendError("ETIMEDOUT", false);
  return new MailSendError("ECONNECTION", false);
}
