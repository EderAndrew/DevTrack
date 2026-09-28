import { Module } from "@nestjs/common";
import { ExercisesController } from "./exercises.controller";
import { ExercisesService } from "./exercises.service";
import { ProgrammingLanguagesController } from "./programming-languages.controller";
import { ProgrammingLanguagesService } from "./programming-languages.service";

/**
 * The teacher's private exercise bank (010, research X1): exercises, their alternatives, the
 * programming-language catalog, the type registry (`types/`), the pure rules and the teacher and
 * student views. It never depends on the AI modules; the generation (`exercise-ai`) depends on it.
 */
@Module({
  controllers: [ExercisesController, ProgrammingLanguagesController],
  providers: [ExercisesService, ProgrammingLanguagesService],
  exports: [ExercisesService],
})
export class ExercisesModule {}
