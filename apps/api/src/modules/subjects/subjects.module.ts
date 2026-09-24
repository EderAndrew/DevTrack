import { Module } from "@nestjs/common";
import { SubjectContextPolicy } from "./subject-context.policy";

/** A teacher's subjects (004 US1) and the subject context policy. Routes arrive with US1. */
@Module({
  providers: [SubjectContextPolicy],
  exports: [SubjectContextPolicy],
})
export class SubjectsModule {}
