import { Module } from "@nestjs/common";
import { ClassesModule } from "../classes/classes.module";
import { SubjectsModule } from "../subjects/subjects.module";
import { ClassMeetingsController } from "./class-meetings.controller";
import { ClassMeetingsService } from "./class-meetings.service";
import { ClassPlansController } from "./class-plans.controller";
import { ClassPlansService } from "./class-plans.service";
import { TopicMutations } from "./topic-mutations";
import { TopicsService } from "./topics.service";

/** Class calendar (US4), plan and topics (US5–US7). */
@Module({
  imports: [ClassesModule, SubjectsModule],
  controllers: [ClassMeetingsController, ClassPlansController],
  providers: [ClassMeetingsService, ClassPlansService, TopicsService, TopicMutations],
})
export class ClassPlansModule {}
