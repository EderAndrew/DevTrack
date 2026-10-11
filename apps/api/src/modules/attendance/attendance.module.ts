import { Module } from "@nestjs/common";
import { ClassesModule } from "../classes/classes.module";
import { StudentActivitiesModule } from "../student-activities/student-activities.module";
import { AttendanceController } from "./attendance.controller";
import { AttendanceService } from "./attendance.service";
import { MyPauseController } from "./my-pause.controller";
import { MyPauseService } from "./my-pause.service";
import { PausesController } from "./pauses.controller";
import { PausesService } from "./pauses.service";

/**
 * The attendance of a work and its room exits (016, research M1): the teacher's attendance and room
 * view, pausing a student and releasing the return, the student's declared exit and own pause, and
 * the pure room-status rule. `activities` and `student-activities` never import it: they read its
 * tables in their own scoped queries (M4, M6); `attendance` reads the student's context through the
 * `StudentActivityLoader`, as 015 does. The attendance routes arrived with US1, the declared exit and
 * the release with US3; the teacher's pause arrives with US5.
 */
@Module({
  imports: [ClassesModule, StudentActivitiesModule],
  controllers: [AttendanceController, MyPauseController, PausesController],
  providers: [AttendanceService, MyPauseService, PausesService],
})
export class AttendanceModule {}
