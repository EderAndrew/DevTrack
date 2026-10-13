import { Module } from "@nestjs/common";
import { ActivitiesModule } from "../activities/activities.module";
import { ClassesModule } from "../classes/classes.module";
import { ExamHoldsController } from "./exam-holds.controller";
import { ExamHoldsService } from "./exam-holds.service";
import { ExamMonitorController } from "./exam-monitor.controller";
import { ExamMonitorService } from "./exam-monitor.service";

/**
 * An exam in progress (018 research T1, T9, T12): the teacher's monitor and the three decisions on a
 * hold (confirm the cancellation, return, do not cancel). It writes grades only through
 * `activities/submission`, calls no AI or AI help and runs no code (`exams-boundary.spec.ts`); the
 * activity modules never import it. The pure `exam-status.ts` derives each student's situation, and
 * `views.ts` builds the hold the integrity review shows too.
 */
@Module({
  imports: [ActivitiesModule, ClassesModule],
  controllers: [ExamMonitorController, ExamHoldsController],
  providers: [ExamMonitorService, ExamHoldsService],
})
export class ExamSessionsModule {}
