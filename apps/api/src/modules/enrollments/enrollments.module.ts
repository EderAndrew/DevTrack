import { Module } from "@nestjs/common";
import { ClassesModule } from "../classes/classes.module";

/** Enrollments (003 US4, US6): the teacher's student list and removal, and the student's own classes. */
@Module({
  imports: [ClassesModule],
})
export class EnrollmentsModule {}
