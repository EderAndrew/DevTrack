import { Module } from "@nestjs/common";
import { ClassesModule } from "../classes/classes.module";
import { CohortEnrollmentsController } from "./cohort-enrollments.controller";
import { DirectEnrollmentService } from "./direct-enrollment.service";
import { EnrollmentNoticeMailSubject } from "./enrollment-notice.mail-subject";
import { EnrollmentsController } from "./enrollments.controller";
import { EnrollmentsService } from "./enrollments.service";
import { MyClassesController } from "./my-classes.controller";
import { MyClassesService } from "./my-classes.service";

/**
 * Enrollments (003 US4, US6): the teacher's student list and removal, and the student's own classes; since 027 the
 * MANAGER's students of a turma, the lookup and the direct enrollment with its notice (US2, FR-034).
 */
@Module({
  imports: [ClassesModule],
  controllers: [EnrollmentsController, CohortEnrollmentsController, MyClassesController],
  providers: [EnrollmentsService, MyClassesService, DirectEnrollmentService, EnrollmentNoticeMailSubject],
})
export class EnrollmentsModule {}
