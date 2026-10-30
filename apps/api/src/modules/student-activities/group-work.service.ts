import { Inject, Injectable } from "@nestjs/common";
import type { GroupCandidates } from "@repo/contracts";
import { CLOCK, type Clock } from "../../platform/clock/clock";
import { PrismaService } from "../../platform/database/prisma.service";
import { AppException, notFound } from "../../platform/http/errors";
import { AuditService } from "../audit/audit.service";
import { eligibleClassmates } from "./group-eligibility";
import { StudentActivityLoader } from "./student-activity-loader";

const CANDIDATES_ROUTE = "/me/activities/:activityId/group/candidates";

/**
 * The student's side of a group work (023 contracts/http-api.md, "Student: group routes"): the
 * classmates the caller may choose (US2). Every read starts from the session student's context, as the
 * 012 routes do (`StudentActivityLoader`); the candidate list is a read, not audited.
 */
@Injectable()
export class GroupWorkService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly loader: StudentActivityLoader,
    private readonly audit: AuditService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /**
   * FR-004, FR-005: the eligible classmates by name and the slots the caller may still fill — `groupSize
   * − 1` before the start, `groupSize − participants` for the leader of a group. 404 out of context or on a
   * work that isn't in group; `409 GROUP_ALREADY_JOINED` for a student who started alone or is a member; the
   * 012 START rule's 409 (`ACTIVITY_CLOSED`, `DEADLINE_PASSED`…) when a start would be refused now.
   */
  async candidates(studentUserId: string, activityId: string, requestId: string | null): Promise<GroupCandidates> {
    const now = this.clock.now();
    const context = await this.loader.groupContext(studentUserId, activityId, now);
    if (!context) {
      const reason = await this.loader.deniedReason(studentUserId, activityId, now);
      if (reason) {
        await this.audit.record(this.prisma, {
          type: "student_access.denied",
          actorType: "USER",
          actorUserId: studentUserId,
          targetType: "CLASS_ACTIVITY",
          targetId: activityId,
          requestId,
          metadata: { route: CANDIDATES_ROUTE, reason },
        });
      }
      throw notFound();
    }
    if (context.groupSize === null) throw notFound();
    let freeSlots = context.groupSize - 1;
    if (context.participation) {
      if (context.participation.leaderId !== studentUserId) throw new AppException("GROUP_ALREADY_JOINED");
      freeSlots = Math.max(0, context.groupSize - context.participation.participantCount);
    }
    // FR-005: no list on a work that no longer accepts a start (closed, deadline passed under REJECT…).
    if (context.startRefusal) throw new AppException(context.startRefusal);
    return { groupSize: context.groupSize, freeSlots, candidates: await eligibleClassmates(this.prisma, activityId, studentUserId) };
  }
}
