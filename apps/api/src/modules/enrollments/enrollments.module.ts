import { Module } from "@nestjs/common";
import { ClassesModule } from "../classes/classes.module";
import { CohortEnrollmentRemovalService } from "./cohort-enrollment-removal.service";
import { CohortEnrollmentsController } from "./cohort-enrollments.controller";
import { DirectEnrollmentService } from "./direct-enrollment.service";
import { EnrollmentNoticeMailSubject } from "./enrollment-notice.mail-subject";
import { EnrollmentsController } from "./enrollments.controller";
import { EnrollmentsService } from "./enrollments.service";
import { MyClassesController } from "./my-classes.controller";
import { MyClassesService } from "./my-classes.service";

/**
 * Enrollments (003 US4, US6): the teacher's read-only student list and the student's own classes; since 027 the
 * MANAGER's students of a turma, the lookup and the direct enrollment with its notice (US2, FR-034) and the end of an
 * enrollment (US5, FR-014).
 */
@Module({
  imports: [ClassesModule],
  controllers: [EnrollmentsController, CohortEnrollmentsController, MyClassesController],
  providers: [EnrollmentsService, MyClassesService, DirectEnrollmentService, CohortEnrollmentRemovalService, EnrollmentNoticeMailSubject],
})
export class EnrollmentsModule {}
