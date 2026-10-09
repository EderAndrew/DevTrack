import { Module } from "@nestjs/common";
import { ClassesModule } from "../classes/classes.module";
import { AttendanceController } from "./attendance.controller";
import { AttendanceService } from "./attendance.service";

/**
 * The attendance of a work and its room exits (016, research M1): the teacher's attendance and room
 * view, pausing a student and releasing the return, the student's declared exit and own pause, and
 * the pure room-status rule. `activities` and `student-activities` never import it: they read its
 * tables in their own scoped queries (M4, M6). The attendance routes arrived with US1; the pauses
 * arrive with US3 and US5.
 */
@Module({
  imports: [ClassesModule],
  controllers: [AttendanceController],
  providers: [AttendanceService],
})
export class AttendanceModule {}
