import { Module } from "@nestjs/common";
import { SubjectContextPolicy } from "./subject-context.policy";
import { SubjectsController } from "./subjects.controller";
import { SubjectsService } from "./subjects.service";

/** A teacher's subjects (004 US1) and the subject context policy. */
@Module({
  controllers: [SubjectsController],
  providers: [SubjectContextPolicy, SubjectsService],
  exports: [SubjectContextPolicy, SubjectsService],
})
export class SubjectsModule {}
