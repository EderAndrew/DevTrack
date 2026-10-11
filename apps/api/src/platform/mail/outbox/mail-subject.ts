import { Injectable } from "@nestjs/common";
import type { DiscardReason, MailDelivery, MailKind } from "../../../generated/prisma/client";
import type { Tx } from "../../database/transaction";
import type { MailMessage } from "../mailer";

/** What `prepare` sees of a due delivery: its kind, its subject and how many attempts it had. */
export type DueDelivery = Pick<
  MailDelivery,
  "id" | "kind" | "classInvitationId" | "invitationId" | "userId" | "adminBootstrapId" | "attempts" | "createdAt"
>;

/** The e-mail to send now: recipient, template and params, the fresh link among them. */
export type PreparedMail = Pick<MailMessage, "to" | "template" | "params">;

/** `prepare`'s answer: the e-mail with a fresh link, or why it is no longer due (017 FR-006). */
export type PrepareResult = { mail: PreparedMail } | { discard: DiscardReason };

/**
 * The owner of one kind of e-mail (017 research N3, plan Structure Decision). The module that owns
 * the subject (class invitations, provisioning, auth, admin bootstrap) registers its handler on
 * `MailSubjectRegistry` in `onModuleInit`, as the 015 hooks register on the activity modules, so
 * `platform/mail` never imports a domain module.
 *
 * `prepare(tx, delivery)` runs inside the worker's claiming transaction: it locks the subject,
 * decides whether the e-mail is still due and, if so, mints a fresh token on the subject (the
 * previous link dies) and answers the e-mail; otherwise it answers `{ discard: reason }`. It never
 * changes the delivery row itself.
 */
export interface MailSubject {
  readonly kind: MailKind;
  prepare(tx: Tx, delivery: DueDelivery): Promise<PrepareResult>;
}

/** Thrown when the worker meets a kind no module registered: a wiring bug, never a user error. */
export class MailSubjectNotRegisteredError extends Error {
  constructor(readonly kind: MailKind) {
    super(`no MailSubject registered for ${kind}`);
    this.name = "MailSubjectNotRegisteredError";
  }
}

/** The handlers of the six kinds, filled at startup by their owners. */
@Injectable()
export class MailSubjectRegistry {
  private readonly subjects = new Map<MailKind, MailSubject>();

  /** One handler per kind; a second registration of the same kind is a wiring bug. */
  register(subject: MailSubject): void {
    if (this.subjects.has(subject.kind)) throw new Error(`MailSubject ${subject.kind} registered twice`);
    this.subjects.set(subject.kind, subject);
  }

  get(kind: MailKind): MailSubject {
    const subject = this.subjects.get(kind);
    if (!subject) throw new MailSubjectNotRegisteredError(kind);
    return subject;
  }

  kinds(): MailKind[] {
    return [...this.subjects.keys()];
  }
}
