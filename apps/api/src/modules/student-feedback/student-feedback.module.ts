import { Module } from "@nestjs/common";
import { AdminFeedbackController } from "./admin-feedback.controller";
import { StudentFeedbackController } from "./student-feedback.controller";
import { StudentFeedbackService } from "./student-feedback.service";

/**
 * Student feedback to the platform ADMIN (020): the student's routes (send, own list) and the
 * ADMIN's (list, summary, detail, status change), with the pure `feedback-state` and `excerpt`.
 * It imports no AI, AI help, mail, grading, points, ranking, bank or activity code, and no audit or
 * log call carries the message or the origin path (FR-014, research J10, `feedback-boundary.spec.ts`).
 */
@Module({
  controllers: [StudentFeedbackController, AdminFeedbackController],
  providers: [StudentFeedbackService],
})
export class StudentFeedbackModule {}
