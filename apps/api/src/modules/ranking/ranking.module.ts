import { Module } from "@nestjs/common";

/**
 * The class ranking of practice points (013 research K11–K13): derived on every read from the
 * scoring results of `exercise_question_results` over the class's ACTIVE enrollments. It reads
 * neither bank nor AI; its routes (the student's and the teacher's) arrive with US4 and US5.
 */
@Module({})
export class RankingModule {}
