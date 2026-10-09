import { Module } from "@nestjs/common";

/**
 * The attendance of a work and its room exits (016, research M1): the teacher's attendance and room
 * view, pausing a student and releasing the return, the student's declared exit and own pause, and
 * the pure room-status rule. `activities` and `student-activities` never import it: they read its
 * tables in their own scoped queries (M4, M6). The routes arrive with the stories (US1, US3, US5).
 */
@Module({})
export class AttendanceModule {}
