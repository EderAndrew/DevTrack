import { Module } from "@nestjs/common";
import { WorkReview } from "./work-review";
import { WorkTopics } from "./work-topics";
import { WorksController } from "./works.controller";
import { WorksService } from "./works.service";

/**
 * The teacher's private work bank (011, research W1): works, their topics and questions, the
 * question-type registry (`types/`), the pure rules and grade values, the teacher and student
 * views and the state machine. Apart from the 010 exercise bank, and never dependent on the AI
 * modules; the generation (`work-ai`) depends on it.
 */
@Module({
  controllers: [WorksController],
  providers: [WorksService, WorkTopics, WorkReview],
  exports: [WorksService, WorkTopics, WorkReview],
})
export class WorksModule {}
