import { Module } from "@nestjs/common";
import { WorkTopics } from "./work-topics";

/**
 * The teacher's private work bank (011, research W1): works, their topics and questions, the
 * question-type registry (`types/`), the pure rules and grade values, the teacher and student
 * views and the state machine. Apart from the 010 exercise bank, and never dependent on the AI
 * modules; the generation (`work-ai`) depends on it.
 */
@Module({
  providers: [WorkTopics],
  exports: [WorkTopics],
})
export class WorksModule {}
