import { Module } from "@nestjs/common";
import { ClassContextPolicy } from "./class-context.policy";
import { ClassesController } from "./classes.controller";
import { ClassesService } from "./classes.service";

/** A teacher's classes (003 US1): creation, editing, lifecycle and the class context policy. */
@Module({
  controllers: [ClassesController],
  providers: [ClassContextPolicy, ClassesService],
  exports: [ClassContextPolicy, ClassesService],
})
export class ClassesModule {}
