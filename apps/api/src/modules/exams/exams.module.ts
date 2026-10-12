import { Module } from "@nestjs/common";

/**
 * The teacher's Banco de Provas (018 research T1, T2): a third private bank, apart from the exercise
 * (010) and work (011) banks. It mirrors `works` and imports only the work bank's pure parts
 * (`works/types`, `works/grading`, `works/grade`; `exams-boundary.spec.ts`), never AI code. The pure
 * `coverage.ts` serves the 012 scope check of an exam. The routes arrive with US1.
 */
@Module({})
export class ExamsModule {}
