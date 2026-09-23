import { Module } from "@nestjs/common";
import { ClassesModule } from "../classes/classes.module";
import { EnrollmentsController } from "./enrollments.controller";
import { EnrollmentsService } from "./enrollments.service";
import { MyClassesController } from "./my-classes.controller";
import { MyClassesService } from "./my-classes.service";

/** Enrollments (003 US4, US6): the teacher's student list and removal, and the student's own classes. */
@Module({
  imports: [ClassesModule],
  controllers: [EnrollmentsController, MyClassesController],
  providers: [EnrollmentsService, MyClassesService],
})
export class EnrollmentsModule {}
