import { Inject, Injectable, type OnModuleInit } from "@nestjs/common";
import { APP_CONFIG } from "../../platform/config/config.module";
import type { AppConfig } from "../../platform/config/config.schema";
import type { Tx } from "../../platform/database/transaction";
import { webLinks } from "../../platform/mail/links";
import type { DueDelivery, MailSubject, PrepareResult, PreparedMail } from "../../platform/mail/outbox/mail-subject";
import { MailSubjectRegistry } from "../../platform/mail/outbox/mail-subject";

/** What the notice needs: the student's address and the turma; never a teacher or a subject (027/FR-034). */
export const ENROLLMENT_NOTICE_SELECT = {
  status: true,
  student: { select: { user: { select: { email: true } } } },
  cohort: { select: { name: true, code: true, period: true } },
} as const;

type NoticeRow = {
  student: { user: { email: string } };
  cohort: { name: string; code: string; period: string | null };
};

/**
 * The `CLASS_ENROLLMENT_NOTICE` e-mail (027/FR-034): the MANAGER included an existing student in a turma. It has no
 * token, so a retry rebuilds the same e-mail; it is discarded once the enrollment is no longer ACTIVE.
 */
@Injectable()
export class EnrollmentNoticeMailSubject implements MailSubject, OnModuleInit {
  readonly kind = "CLASS_ENROLLMENT_NOTICE" as const;
  private readonly links: ReturnType<typeof webLinks>;

  constructor(
    @Inject(APP_CONFIG) config: AppConfig,
    private readonly registry: MailSubjectRegistry,
  ) {
    this.links = webLinks(config.webOrigin);
  }

  onModuleInit(): void {
    this.registry.register(this);
  }

  mail(row: NoticeRow): PreparedMail {
    return {
      to: row.student.user.email,
      template: "class-enrollment-notice",
      params: { className: row.cohort.name, classCode: row.cohort.code, period: row.cohort.period, link: this.links.signIn() },
    };
  }

  async prepare(tx: Tx, delivery: DueDelivery): Promise<PrepareResult> {
    const id = delivery.enrollmentId!;
    const row = await tx.enrollment.findUniqueOrThrow({ where: { id }, select: ENROLLMENT_NOTICE_SELECT });
    if (row.status !== "ACTIVE") return { discard: "NOT_NEEDED" };
    return { mail: this.mail(row) };
  }
}
