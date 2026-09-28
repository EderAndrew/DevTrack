import { Module } from "@nestjs/common";

/**
 * The teacher's private exercise bank (010, research X1): exercises, their alternatives, the
 * programming-language catalog, the type registry (`types/`), the pure rules and the teacher and
 * student views. It never depends on the AI modules; the generation (`exercise-ai`) depends on it.
 * Controllers and services arrive with the user stories.
 */
@Module({})
export class ExercisesModule {}
