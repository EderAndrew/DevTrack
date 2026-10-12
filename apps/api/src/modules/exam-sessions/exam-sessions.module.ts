import { Module } from "@nestjs/common";

/**
 * An exam in progress (018 research T1, T9, T12): the teacher's monitor and the three decisions on a
 * hold (confirm the cancellation, return, do not cancel). It writes grades only through
 * `activities/submission`, calls no AI or AI help and runs no code (`exams-boundary.spec.ts`); the
 * activity modules never import it. The pure `exam-status.ts` derives each student's situation. The
 * routes arrive with US4 and US5.
 */
@Module({})
export class ExamSessionsModule {}
