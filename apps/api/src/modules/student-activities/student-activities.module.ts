import { Module } from "@nestjs/common";
import { ActivitiesModule } from "../activities/activities.module";

/**
 * The student portal (012, research P1): dashboard, "Minhas atividades", the attempt with its
 * answers and the submission, from the session user's ACTIVE enrollments only (research P18). Its
 * responses come only from `activities/views/student-view.ts`. Routes arrive with US2–US4.
 */
@Module({ imports: [ActivitiesModule] })
export class StudentActivitiesModule {}
