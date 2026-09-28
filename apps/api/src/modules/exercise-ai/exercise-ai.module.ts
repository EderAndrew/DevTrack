import { Module } from "@nestjs/common";
import { AiModule } from "../ai/ai.module";
import { ExercisesModule } from "../exercises/exercises.module";
import { ExerciseBatchesController } from "./exercise-batches.controller";
import { ExerciseBatchesService } from "./exercise-batches.service";

/**
 * Exercise generation with AI (010, research X1): the batch, the `exercise-generator` definitions
 * (registered through `productionAiDefinitions`) and the materialization of its drafts. It depends
 * on the bank; the bank never depends on it, and the AI module never writes exercise data.
 */
@Module({
  imports: [AiModule, ExercisesModule],
  controllers: [ExerciseBatchesController],
  providers: [ExerciseBatchesService],
})
export class ExerciseAiModule {}
