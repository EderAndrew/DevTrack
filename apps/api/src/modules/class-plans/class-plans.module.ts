import { Module } from "@nestjs/common";
import { ClassesModule } from "../classes/classes.module";
import { SubjectsModule } from "../subjects/subjects.module";
import { ClassMeetingsController } from "./class-meetings.controller";
import { ClassMeetingsService } from "./class-meetings.service";
import { TopicMutations } from "./topic-mutations";

/** Class calendar (US4), plan and topics (US5–US7). */
@Module({
  imports: [ClassesModule, SubjectsModule],
  controllers: [ClassMeetingsController],
  providers: [ClassMeetingsService, TopicMutations],
})
export class ClassPlansModule {}
