import { Module } from "@nestjs/common";
import { SubjectsModule } from "../subjects/subjects.module";
import { ClassContextPolicy } from "./class-context.policy";
import { ClassesController } from "./classes.controller";
import { ClassesService } from "./classes.service";

/** A teacher's classes (003 US1): creation, editing (with the 004 offering fields), lifecycle and the class context policy. */
@Module({
  imports: [SubjectsModule],
  controllers: [ClassesController],
  providers: [ClassContextPolicy, ClassesService],
  exports: [ClassContextPolicy, ClassesService],
})
export class ClassesModule {}
