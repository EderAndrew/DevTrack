import { Module } from "@nestjs/common";
import { StudentCalendarController } from "./student-calendar.controller";
import { StudentCalendarService } from "./student-calendar.service";

/**
 * The student's calendar of a disciplina da turma (031 US3, research CK6): its own read slice, apart from the teacher's
 * class plan, with a scoped query and an allowlist view.
 */
@Module({
  controllers: [StudentCalendarController],
  providers: [StudentCalendarService],
})
export class StudentCalendarModule {}
