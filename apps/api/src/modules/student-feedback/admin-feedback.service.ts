import { Inject, Injectable } from "@nestjs/common";
import type { AdminFeedback, AdminFeedbackPage, ChangeFeedbackStatusRequest, FeedbackSummary, ListAdminFeedbacksQuery } from "@repo/contracts";
import { CLOCK, type Clock } from "../../platform/clock/clock";
import { afterCursor, decodeCursor, encodeCursor } from "../../platform/database/keyset";
import { PrismaService } from "../../platform/database/prisma.service";
import { invalidStateTransition, notFound } from "../../platform/http/errors";
import { AuditService } from "../audit/audit.service";
import { canTransition } from "./feedback-state";
import { ADMIN_FEEDBACK_LIST_SELECT, ADMIN_FEEDBACK_SELECT, toAdminFeedback, toAdminFeedbackListItem } from "./views/admin-feedback-view";

/** Keyset page size of the ADMIN list (research J7). */
const PAGE_SIZE = 50;

/**
 * The ADMIN's side of the feedbacks (020 US2, research J5–J7). The feedbacks belong to the platform:
 * no class or teacher context, only `feedbacks.visualizar`/`feedbacks.alterar_situacao`. A status
 * change locks the row (`FOR UPDATE`), so two ADMINs serialise: the second either applies over the
 * first's result or gets `409 INVALID_STATE_TRANSITION`, with exactly one history row and one audit
 * event per applied change. Reads write no event; nothing here edits or deletes the message (FR-012).
 */
@Injectable()
export class AdminFeedbackService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** Newest first, `(created_at DESC, id DESC)`, optionally by status and category. */
  async list({ status, category, cursor }: ListAdminFeedbacksQuery): Promise<AdminFeedbackPage> {
    const after = cursor ? decodeCursor(cursor) : null;
    const rows = await this.prisma.studentFeedback.findMany({
      where: {
        ...(status ? { status } : {}),
        ...(category ? { category } : {}),
        ...(after ? { AND: [afterCursor(after)] } : {}),
      },
      select: ADMIN_FEEDBACK_LIST_SELECT,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: PAGE_SIZE + 1,
    });
    const page = rows.slice(0, PAGE_SIZE);
    return {
      items: page.map(toAdminFeedbackListItem),
      nextCursor: rows.length > PAGE_SIZE ? encodeCursor(page.at(-1)!) : null,
    };
  }

  /** The menu badge: how many feedbacks are still RECEIVED. */
  async summary(): Promise<FeedbackSummary> {
    return { received: await this.prisma.studentFeedback.count({ where: { status: "RECEIVED" } }) };
  }

  async detail(id: string): Promise<AdminFeedback> {
    const row = await this.prisma.studentFeedback.findUnique({ where: { id }, select: ADMIN_FEEDBACK_SELECT });
    if (!row) throw notFound();
    return toAdminFeedback(row);
  }

  /** Applies an allowed transition (`feedback-state.ts`) with the server's time, its history row and its audit event. */
  async changeStatus(adminId: string, id: string, { status: to }: ChangeFeedbackStatusRequest, requestId: string | null): Promise<AdminFeedback> {
    const now = this.clock.now();
    await this.prisma.runInTransaction(async (tx) => {
      const locked = await tx.$queryRaw<{ status: AdminFeedback["status"] }[]>`
        SELECT status FROM student_feedbacks WHERE id = ${id}::uuid FOR UPDATE`;
      const from = locked[0]?.status;
      if (!from) throw notFound();
      if (!canTransition(from, to)) throw invalidStateTransition();
      await tx.studentFeedback.update({ where: { id }, data: { status: to, statusChangedAt: now } });
      await tx.studentFeedbackStatusChange.create({
        data: { feedbackId: id, fromStatus: from, toStatus: to, changedById: adminId, changedAt: now },
      });
      await this.audit.record(tx, {
        type: "student_feedback.status_changed",
        actorType: "USER",
        actorUserId: adminId,
        targetType: "STUDENT_FEEDBACK",
        targetId: id,
        requestId,
        metadata: { fromStatus: from, toStatus: to },
      });
    });
    return this.detail(id);
  }
}
